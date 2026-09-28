import { VehiclePhysics } from "../physics/VehiclePhysics";
import { Settings } from "../core/SaveManager";
export class AudioManager {
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
    for (const ratio of [0.5, 1, 1.005, 2]) {
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
    const noise = (freq: number) => {
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
      gain.connect(this.master!);
      src.start();
      return gain;
    };
    this.wind = noise(1500);
    this.rain = noise(4200);
    const sk = a.createOscillator();
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
  }
  siren(active:boolean,distance:number) {
    if(!this.context||!this.sirenGain||!this.sirenOsc)return;
    const t=this.context.currentTime;
    this.sirenGain.gain.setTargetAtTime(active?.13*Math.max(.1,1-Math.min(300,distance)/300):0,t,.1);
    this.sirenOsc.frequency.setTargetAtTime(730+Math.sin(t*6)*270,t,.025);
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
  explosion(severity:number) {
    const a=this.context;if(!a||!this.master)return;
    const t=a.currentTime;this.lastImpact=t;
    const buffer=a.createBuffer(1,a.sampleRate*.7,a.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/data.length*4);
    const src=a.createBufferSource(),filter=a.createBiquadFilter(),gain=a.createGain();
    src.buffer=buffer;filter.type="lowpass";filter.frequency.setValueAtTime(2800,t);filter.frequency.exponentialRampToValueAtTime(100,t+.65);
    gain.gain.setValueAtTime(severity*.8,t);gain.gain.exponentialRampToValueAtTime(.001,t+.7);
    src.connect(filter);filter.connect(gain);gain.connect(this.master);src.start();
    src.onended=()=>{src.disconnect();filter.disconnect();gain.disconnect()};this.tone(48,.5,severity*.6);
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
    [0.5, 1, 1.005, 2].forEach((ratio, i) =>
      this.oscillators[i].frequency.setTargetAtTime(
        (car.rpm / 60) * 2 * ratio,
        t,
        0.035,
      ),
    );
    this.engine!.gain.setTargetAtTime(0.025 + car.throttle * 0.07, t, 0.04);
    this.filter!.frequency.setTargetAtTime(
      380 + car.rpm * 0.19 + car.throttle * 1000,
      t,
      0.06,
    );
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
    this.rain!.gain.setTargetAtTime(s.weather === "rain" ? 0.14 : 0, t, 0.3);
    this.delayGain!.gain.setTargetAtTime(tunnel ? 0.5 : 0, t, 0.15);
    this.hornGain!.gain.setTargetAtTime(horn ? 0.075 : 0, t, 0.015);
    if (active && car.impact > 0.45 && t - this.lastImpact > 0.5) {
      this.lastImpact = t;
      const o = a.createOscillator(),
        g = a.createGain();
      o.frequency.setValueAtTime(100, t);
      o.frequency.exponentialRampToValueAtTime(28, t + 0.22);
      g.gain.setValueAtTime(car.impact * 0.4, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g);
      g.connect(this.master!);
      o.start();
      o.stop(t + 0.26);
    }
  }
}
