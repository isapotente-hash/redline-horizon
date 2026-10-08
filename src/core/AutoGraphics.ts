import {GRAPHICS_PRESETS,GraphicsQuality} from './GraphicsPresets';

/** The canvas never drops below one rendered pixel per CSS pixel. */
export const AUTO_GRAPHICS = [
  {quality:'very-low',label:'Very Low',pixelRatio:1,shadow:0,samples:0,ao:false,bloom:false},
  {quality:'low',label:'Low',pixelRatio:1,shadow:1024,samples:2,ao:false,bloom:false},
  {quality:'medium',label:'Medium',pixelRatio:1.25,shadow:2048,samples:2,ao:false,bloom:true},
  {quality:'high',label:'High',pixelRatio:1.5,shadow:2048,samples:4,ao:true,bloom:true},
  {quality:'ultra',label:'Extra High',pixelRatio:2,shadow:4096,samples:4,ao:true,bloom:true},
] as const satisfies readonly {quality:GraphicsQuality;label:string;pixelRatio:number;shadow:number;samples:number;ao:boolean;bloom:boolean}[];

/** Real gameplay measurements, with fast reductions and cautious upgrades.
 * Pauses/loading/background intervals do not count as device performance.
 * Failed upgrades are held back for a minute instead of oscillating.
 */
export class AutoGraphics {
  level=0;
  targetFps:30|60=60;
  private elapsed=0;
  private longStalls=0;
  private settle=.4;
  private calibrating=true;
  private windowTime=0;
  private frameSum=0;
  private work=new Float32Array(240);
  private frames=new Float32Array(240);
  private count=0;
  private slow=0;
  private good=0;
  private fast=0;
  private upgradeAt=0;
  private targetUpgradeAt=0;
  get profile(){return AUTO_GRAPHICS[this.level];}
  get distances(){return GRAPHICS_PRESETS[this.profile.quality];}
  restart(){this.level=0;this.targetFps=60;this.elapsed=0;this.longStalls=0;this.settle=.4;this.calibrating=true;this.upgradeAt=0;this.targetUpgradeAt=0;this.clear();}
  private clear(){this.windowTime=0;this.frameSum=0;this.count=0;this.slow=0;this.good=0;this.fast=0;}
  suspend(){this.longStalls=0;this.clear();this.settle=Math.max(this.settle,.35);}
  private change(){this.clear();this.settle=.35;return true;}
  observe(frameMs:number,cpuMs:number,gpuMs:number|null,active:boolean){
    if(!active||!Number.isFinite(frameMs)||frameMs<=0){this.suspend();return false;}
    if(frameMs>500){
      const consecutive=++this.longStalls;
      if(consecutive<3){this.suspend();this.longStalls=consecutive;return false;}
      // Persistent sub-2 FPS rendering is overload, rather than an isolated pause.
      frameMs=500;
    }else this.longStalls=0;
    const seconds=frameMs/1000;this.elapsed+=seconds;
    if(this.settle>0){this.settle-=seconds;return false;}
    this.windowTime+=seconds;this.frameSum+=frameMs;
    const i=this.count%240;this.frames[i]=frameMs;this.work[i]=Math.max(0,Number.isFinite(cpuMs)?cpuMs:0,gpuMs!==null&&Number.isFinite(gpuMs)?gpuMs:0);this.count++;
    if(this.windowTime<.75)return false;
    const n=Math.min(this.count,240),work=Array.from(this.work.subarray(0,n)).sort((a,b)=>a-b),frames=Array.from(this.frames.subarray(0,n)).sort((a,b)=>a-b);
    const average=this.frameSum/this.count,p90=frames[Math.floor((n-1)*.9)],cost=work[Math.floor((n-1)*.8)],budget=1000/this.targetFps,window=this.windowTime;
    this.windowTime=0;this.frameSum=0;this.count=0;
    const overloaded=average>budget*1.15||p90>budget*1.8||cost>budget*.92;
    this.slow=overloaded?this.slow+window:0;
    this.good=!overloaded&&average<=budget*1.06&&cost<budget*.65?this.good+window:0;
    this.fast=this.targetFps===30&&!overloaded&&cost<11?this.fast+window:0;
    if(this.slow>=1.5||average>budget*1.45||cost>budget*1.1){
      this.calibrating=false;
      if(this.level>0){this.level--;this.upgradeAt=this.elapsed+90;return this.change();}
      if(this.targetFps===60){this.targetFps=30;this.targetUpgradeAt=this.elapsed+90;return this.change();}
      this.slow=0;
    }
    if(this.fast>=20&&this.elapsed>=this.targetUpgradeAt){this.targetFps=60;return this.change();}
    if(this.good>=(this.calibrating?1.5:12)&&this.level<AUTO_GRAPHICS.length-1&&this.elapsed>=this.upgradeAt){this.level++;if(this.level===AUTO_GRAPHICS.length-1)this.calibrating=false;return this.change();}
    return false;
  }
}

/** Pace to a target across 60/90/120/144 Hz displays, without busy waiting. */
export class FramePacer {
  private next=0;
  reset(){this.next=0;}
  ready(now:number,fps:number){
    const interval=1000/fps;
    if(this.next===0)this.next=now;
    if(now+.75<this.next)return false;
    this.next+=interval;
    if(this.next<now)this.next=now+interval;
    return true;
  }
}
