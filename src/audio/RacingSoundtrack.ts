import {SOUNDTRACK} from './SoundtrackScore';
type Voice={source:AudioBufferSourceNode;gain:GainNode};
/** Two pre-rendered tracks at most. No note scheduling or synthesis in the game loop. */
export class RacingSoundtrack {
  private worker:Worker|null=null;
  private pending=new Set<number>();
  private buffers=new Map<number,AudioBuffer>();
  private voices:Voice[]=[];
  private mix:GainNode;
  private timer:ReturnType<typeof setInterval>|null=null;
  private playing=false;
  private failed=false;
  private index=0;
  private offset=0;
  private startedAt=0;
  constructor(private context:AudioContext,output:AudioNode){this.mix=context.createGain();this.mix.gain.value=0;this.mix.connect(output);}
  configure(enabled:boolean,volume:number,playing:boolean){
    this.mix.gain.setTargetAtTime(Math.max(0,Math.min(1,volume))*.55,this.context.currentTime,.12);
    const run=enabled&&playing&&volume>0;
    if(!run){this.pause();if(!enabled){this.worker?.terminate();this.worker=null;this.pending.clear();this.buffers.clear();this.failed=false;}return;}
    if(this.failed)return;
    this.playing=true;
    if(!this.worker){
      try{
        this.worker=new Worker(new URL('./SoundtrackWorker.ts',import.meta.url),{type:'module'});
        this.worker.onmessage=event=>{
          const {index,left,right,sampleRate}=event.data as {index:number;left:Float32Array<ArrayBuffer>;right:Float32Array<ArrayBuffer>;sampleRate:number};
          this.pending.delete(index);
          const buffer=this.context.createBuffer(2,left.length,sampleRate);buffer.copyToChannel(left,0);buffer.copyToChannel(right,1);this.buffers.set(index,buffer);
          if(this.playing&&!this.voices.length)this.begin(this.index,false);
        };
        this.worker.onerror=()=>{this.failed=true;this.pause();this.worker?.terminate();this.worker=null;this.pending.clear();};
      }catch{this.failed=true;return;}
    }
    if(!this.voices.length){if(this.buffers.has(this.index))this.begin(this.index,false);else this.request(this.index);}
    if(!this.timer)this.timer=setInterval(()=>this.advance(),500);
  }
  private request(index:number){if(this.buffers.has(index)||this.pending.has(index)||!this.worker)return;this.pending.add(index);this.worker.postMessage(index);}
  private begin(index:number,crossfade:boolean){
    const buffer=this.buffers.get(index);if(!buffer||!this.playing)return;
    const now=this.context.currentTime,fade=crossfade?1.75:.12;
    for(const old of this.voices){old.gain.gain.cancelScheduledValues(now);old.gain.gain.setValueAtTime(old.gain.gain.value,now);old.gain.gain.linearRampToValueAtTime(0,now+fade);old.source.stop(now+fade+.02);}
    const source=this.context.createBufferSource(),gain=this.context.createGain(),voice={source,gain};
    source.buffer=buffer;source.loop=true;gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(1,now+fade);source.connect(gain);gain.connect(this.mix);
    this.voices.push(voice);source.onended=()=>{source.disconnect();gain.disconnect();this.voices=this.voices.filter(v=>v!==voice);};
    if(crossfade)this.offset=0;
    this.index=index;this.offset%=buffer.duration;this.startedAt=now-this.offset;source.start(now,this.offset);
    for(const key of this.buffers.keys())if(key!==index&&key!==(index+1)%SOUNDTRACK.length)this.buffers.delete(key);
    this.request((index+1)%SOUNDTRACK.length);
  }
  private advance(){
    if(!this.playing||!this.voices.length||this.context.state!=='running')return;
    const buffer=this.buffers.get(this.index),next=(this.index+1)%SOUNDTRACK.length;
    if(buffer&&this.context.currentTime-this.startedAt>=buffer.duration-1.75&&this.buffers.has(next))this.begin(next,true);
  }
  private pause(){
    if(this.playing){const buffer=this.buffers.get(this.index);if(buffer)this.offset=(this.context.currentTime-this.startedAt)%buffer.duration;}
    this.playing=false;if(this.timer){clearInterval(this.timer);this.timer=null;}
    const now=this.context.currentTime;
    for(const voice of this.voices){voice.gain.gain.cancelScheduledValues(now);voice.gain.gain.setValueAtTime(voice.gain.gain.value,now);voice.gain.gain.linearRampToValueAtTime(0,now+.12);try{voice.source.stop(now+.14);}catch{ /* Already stopped during a track crossfade. */ }}
    this.voices=[];
  }
}
