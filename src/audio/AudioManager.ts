import { VehiclePhysics } from "../physics/VehiclePhysics";
import { Settings } from "../core/SaveManager";
import {RacingSoundtrack} from './RacingSoundtrack';
export class AudioManager {
  private soundtrack?:RacingSoundtrack;
  private musicEnabled=true;private musicVolume=.4;private musicPlaying=false;
  music(enabled:boolean,volume:number,playing:boolean){this.musicEnabled=enabled;this.musicVolume=volume;this.musicPlaying=playing;this.soundtrack?.configure(enabled,volume,playing);}
  context: AudioContext | null = null;
  master?: GainNode;
  engine?: GainNode;
  filter?: BiquadFilterNode;
  oscillators: OscillatorNode[] = [];
  wind?: GainNode;
  skid?: GainNode;
  rain?: GainNode;
  delayGain?: GainNode;
  hornGain?: GainNode;
  lastImpact = 0;
  private readonly ratios=[.5,1,1.005,2];
  private readonly transients:{osc:OscillatorNode;gain:GainNode;pan:StereoPannerNode}[]=[];private transientIndex=0;
  private lastShift=-1;private lastThrottle=0;private lastPop=0;
  private crashNoise?:GainNode;private crashPan?:StereoPannerNode;private scrapeNoise?:GainNode;private scrapePan?:StereoPannerNode;
  private tyreNoise?:GainNode;private rumble?:GainNode;private skidOsc?:OscillatorNode;
  sirenGain?:GainNode;
  sirenOsc?:OscillatorNode;
  start() {
    if (this.context) {
      void this.context.resume();
      return;
    }
    const a = (this.context = new AudioContext());
    this.master = a.createGain();
    this.master.gain.value = 0;
    const compressor = a.createDynamicsCompressor();
    compressor.threshold.value = -10;
    compressor.ratio.value = 4;
    this.master.connect(compressor);
    compressor.connect(a.destination);
    this.engine = a.createGain();
    this.engine.gain.value = 0.1;
    this.filter = a.createBiquadFilter();
    this.filter.type = "lowpass";
    this.engine.connect(this.filter);
    this.filter.connect(this.master);
    const delay = a.createDelay(0.5);
    delay.delayTime.value = 0.13;
    this.delayGain = a.createGain();
    this.delayGain.gain.value = 0;
    this.filter.connect(delay);
    delay.connect(this.delayGain);
    this.delayGain.connect(this.master);
    const real = new Float32Array(24),
      imag = new Float32Array(24);
    for (let i = 1; i < 24; i++)
      imag[i] = (1 / Math.pow(i, 1.1)) * (i % 2 ? 0.8 : 1);
    const wave = a.createPeriodicWave(real, imag);
    for (const ratio of this.ratios) {
      const o = a.createOscillator();
      o.setPeriodicWave(wave);
      o.frequency.value = 30 * ratio;
      const g = a.createGain();
      g.gain.value = ratio === 0.5 ? 0.45 : 0.18;
      o.connect(g);
      g.connect(this.engine);
      o.start();
      this.oscillators.push(o);
    }
    const buffer = a.createBuffer(1, a.sampleRate * 2, a.sampleRate),
      data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i++) {
      brown = (brown + (Math.random() * 2 - 1) * 0.03) / 1.03;
      data[i] = brown * 5;
    }
    const noise = (freq: number,pan?:StereoPannerNode) => {
      const src = a.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const filter = a.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = freq;
      const gain = a.createGain();
      gain.gain.value = 0;
      src.connect(filter);
      filter.connect(gain);
      if(pan){gain.connect(pan);pan.connect(this.master!);}else gain.connect(this.master!);
      src.start();
      return gain;
    };
    this.wind = noise(1500);
    this.rain = noise(4200);this.tyreNoise=noise(3600);this.rumble=noise(180);
    this.crashPan=a.createStereoPanner();this.crashNoise=noise(2800,this.crashPan);this.scrapePan=a.createStereoPanner();this.scrapeNoise=noise(1800,this.scrapePan);
    for(let i=0;i<8;i++){const osc=a.createOscillator(),gain=a.createGain(),pan=a.createStereoPanner();osc.type="triangle";gain.gain.value=0;osc.connect(gain);gain.connect(pan);pan.connect(this.master);osc.start();this.transients.push({osc,gain,pan});}
    const sk = this.skidOsc = a.createOscillator();
    sk.type = "triangle";
    sk.frequency.value = 780;
    this.skid = a.createGain();
    this.skid.gain.value = 0;
    sk.connect(this.skid);
    this.skid.connect(this.master);
    sk.start();
    this.sirenGain=a.createGain();this.sirenGain.gain.value=0;this.sirenGain.connect(this.master);
    this.sirenOsc=a.createOscillator();this.sirenOsc.type='triangle';this.sirenOsc.connect(this.sirenGain);this.sirenOsc.start();
    this.hornGain = a.createGain();
    this.hornGain.gain.value = 0;
    this.hornGain.connect(this.master);
    for (const f of [330, 415]) {
      const h = a.createOscillator();
      h.type = "sawtooth";
      h.frequency.value = f;
      h.connect(this.hornGain);
      h.start();
    }
    this.soundtrack=new RacingSoundtrack(a,compressor);
    this.soundtrack.configure(this.musicEnabled,this.musicVolume,this.musicPlaying);
  }
  siren(active:boolean,distance:number) {
    if(!this.context||!this.sirenGain||!this.sirenOsc)return;
    const t=this.context.currentTime;
    this.sirenGain.gain.setTargetAtTime(active?.13*Math.max(.1,1-Math.min(300,distance)/300):0,t,.1);
    this.sirenOsc.frequency.setTargetAtTime(730+Math.sin(t*6)*270,t,.025);
  }
  private pulse(frequency:number,duration:number,volume:number,pan=0){
    const a=this.context;if(!a||!this.transients.length)return;
    const slot=this.transients[this.transientIndex++%this.transients.length],t=a.currentTime;
    slot.pan.pan.setValueAtTime(Math.max(-.8,Math.min(.8,pan)),t);slot.osc.frequency.cancelScheduledValues(t);slot.osc.frequency.setValueAtTime(frequency,t);slot.osc.frequency.exponentialRampToValueAtTime(Math.max(25,frequency*.45),t+duration);
    slot.gain.gain.cancelScheduledValues(t);slot.gain.gain.setValueAtTime(.0001,t);slot.gain.gain.linearRampToValueAtTime(volume,t+.006);slot.gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
  }
  tone(frequency:number,duration:number,volume:number,delay=0) {
    const a=this.context;if(!a||!this.master)return;
    const t=a.currentTime+delay,o=a.createOscillator(),g=a.createGain();
    o.type="sine";o.frequency.setValueAtTime(frequency,t);
    g.gain.setValueAtTime(.001,t);g.gain.linearRampToValueAtTime(volume,t+.008);g.gain.exponentialRampToValueAtTime(.001,t+duration);
    o.connect(g);g.connect(this.master);o.start(t);o.stop(t+duration+.01);
    o.onended=()=>{o.disconnect();g.disconnect()};
  }
  click(volume:number) {this.start();this.master!.gain.setValueAtTime(volume*.7,this.context!.currentTime);this.tone(640,.06,.16);}
  coin() {this.tone(1046,.13,.24);this.tone(1568,.2,.16,.075);}
  explosion(severity:number,pan=0) {
    const a=this.context;if(!a||!this.crashNoise)return;const t=a.currentTime;this.lastImpact=t;this.crashPan!.pan.setValueAtTime(Math.max(-.8,Math.min(.8,pan)),t);const g=this.crashNoise.gain;g.cancelScheduledValues(t);g.setValueAtTime(Math.max(.001,severity*.55),t);g.exponentialRampToValueAtTime(.001,t+.65);this.pulse(48,.5,severity*.5,pan);
  }
  update(
    car: VehiclePhysics,
    s: Settings,
    active: boolean,
    horn: boolean,
    tunnel: boolean,
  ) {
    const a = this.context;
    if (!a) return;
    const t = a.currentTime;
    this.master!.gain.setTargetAtTime(s.volume * (active ? 1 : 0.22), t, 0.08);
    this.scrapePan!.pan.setTargetAtTime(car.impactSide*.75,t,.06);this.scrapeNoise!.gain.setTargetAtTime(active?car.scrape*.10:0,t,.04);
    const voice=car.traits,tone=voice.timbre;
    for(let i=0;i<this.ratios.length;i++)this.oscillators[i].frequency.setTargetAtTime(car.rpm/60*voice.firing*this.ratios[i],t,.035);
    const gearChanged=this.lastShift>=0&&this.lastShift!==car.shiftSerial;
    if(active&&car.speed>4&&gearChanged)this.pulse(110*tone,.10,.07);
    if(active&&car.rpm>3800&&car.speed>8&&this.lastThrottle>.5&&car.throttle<.15&&t-this.lastPop>.55){this.lastPop=t;this.pulse(68*tone,.13,.09);}
    this.lastShift=car.shiftSerial;this.lastThrottle=car.throttle;
    this.engine!.gain.setTargetAtTime((.023+car.throttle*.09)*(car.shiftTimer>0?.48:1)*(1.08-tone*.12),t,.04);
    this.filter!.frequency.setTargetAtTime((320+car.rpm*.17+car.throttle*1250)*tone,t,.05);
    const slip=car.contacts>=(car.bike?2:3)?Math.min(.065,Math.max(0,Math.abs(car.slip)-.13)*car.speed*.006):0;
    this.tyreNoise!.gain.setTargetAtTime(slip*(car.surface==='ASPHALT'?1:.55),t,.04);
    this.skidOsc!.frequency.setTargetAtTime(480+Math.min(480,car.speed*3+Math.abs(car.slip)*300),t,.08);
    this.rumble!.gain.setTargetAtTime(active&&car.contacts>0&&(car.surface==='GRASS'||car.surface==='GRAVEL')?Math.min(.08,car.speed*.0015):0,t,.08);
    this.wind!.gain.setTargetAtTime(
      Math.min(0.17, car.speed * car.speed * 0.000026),
      t,
      0.15,
    );
    this.skid!.gain.setTargetAtTime(
      car.contacts > 2
        ? Math.min(
            0.065,
            Math.max(0, Math.abs(car.slip) - 0.16) * car.speed * 0.009,
          )
        : 0,
      t,
      0.05,
    );
    this.rain!.gain.setTargetAtTime(s.weather === "rain" ? .04+.10*s.rainIntensity : 0, t, 0.3);
    this.delayGain!.gain.setTargetAtTime(tunnel ? 0.5 : 0, t, 0.15);
    this.hornGain!.gain.setTargetAtTime(horn ? 0.075 : 0, t, 0.015);
    if (active && car.impact > 0.45 && t - this.lastImpact > 0.5) {
      this.lastImpact = t;
      this.pulse(100,.25,car.impact*.4,car.impactSide);
    }
  }
}
