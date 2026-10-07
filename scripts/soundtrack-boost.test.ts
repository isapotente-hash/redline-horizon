import test from 'node:test';
import assert from 'node:assert/strict';
import {SOUNDTRACK,renderSoundtrack} from '../src/audio/SoundtrackScore';
import {RacingSoundtrack} from '../src/audio/RacingSoundtrack';
import {boostPresentation} from '../src/ui/BoostSignal';
import {SaveManager} from '../src/core/SaveManager';
import {SAVE_KEY} from '../src/core/SaveStorage';

test('original racing tracks produce distinct, deterministic stereo music with bounded levels and seamless tails',()=>{
 const fingerprints=[];
 for(let index=0;index<SOUNDTRACK.length;index++){
  const data=renderSoundtrack(index,8000,2);assert.ok(Math.abs(data.duration-8*60/SOUNDTRACK[index].bpm)<.001);
  let energy=0,stereo=0,peak=0;for(let n=0;n<data.left.length;n++){assert.ok(Number.isFinite(data.left[n])&&Number.isFinite(data.right[n]));energy+=data.left[n]**2;stereo+=Math.abs(data.left[n]-data.right[n]);peak=Math.max(peak,Math.abs(data.left[n]),Math.abs(data.right[n]));}
  assert.ok(Math.sqrt(energy/data.left.length)>.07);assert.ok(peak<.89&&peak>.2);assert.ok(stereo>1);
  assert.ok(Math.abs(data.left[0]-data.left.at(-1)!)<.12);fingerprints.push(data.left.slice(100,120).join(','));assert.deepEqual(data.left,renderSoundtrack(index,8000,2).left);
 }
 assert.equal(new Set(fingerprints).size,3);
});
test('music defaults on for new/legacy saves, and the off toggle survives reload without changing volume',()=>{
 let data=JSON.stringify({settings:{volume:.27}});
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>k===SAVE_KEY?data:null,setItem:(k:string,v:string)=>{if(k===SAVE_KEY)data=v;}}});
 const save=new SaveManager();assert.equal(save.settings.music,true);save.settings.music=false;save.save();const again=new SaveManager();assert.equal(again.settings.music,false);assert.equal(again.settings.volume,.27);
 data=JSON.stringify({settings:{music:'false'}});assert.equal(new SaveManager().settings.music,true);
});
test('music generation is lazy, playback does not duplicate, track changes crossfade, and pause/off release active audio',()=>{
 const workers:any[]=[],sources:any[]=[],gains:any[]=[];let tick:(()=>void)|null=null;
 const originalWorker=globalThis.Worker,originalInterval=globalThis.setInterval,originalClear=globalThis.clearInterval;
 class FakeWorker{terminated=false;requested:number[]=[];onmessage:any;onerror:any;constructor(){workers.push(this);}postMessage(i:number){this.requested.push(i);}terminate(){this.terminated=true;}deliver(index:number){const left=new Float32Array(2000),right=new Float32Array(2000);this.onmessage({data:{index,left,right,sampleRate:1000}});}}
 (globalThis as any).Worker=FakeWorker;(globalThis as any).setInterval=(fn:()=>void)=>{tick=fn;return 1;};(globalThis as any).clearInterval=()=>{tick=null;};
 const param=()=>({value:1,setTargetAtTime(v:number){this.value=v;},setValueAtTime(v:number){this.value=v;},linearRampToValueAtTime(v:number){this.value=v;},cancelScheduledValues(){}});
 const context:any={currentTime:0,state:'running',createGain(){const g={gain:param(),connect(){},disconnect(){}};gains.push(g);return g;},createBuffer(_channels:number,length:number,rate:number){return {duration:length/rate,copyToChannel(){}};},createBufferSource(){const s={buffer:null,loop:false,startArgs:[] as number[],stops:[] as number[],onended:null,connect(){},disconnect(){},start(...args:number[]){this.startArgs=args;},stop(t:number){this.stops.push(t);}};sources.push(s);return s;}};
 try{
  const music=new RacingSoundtrack(context,{} as AudioNode);music.configure(true,.4,false);assert.equal(workers.length,0);
  music.configure(true,.4,true);assert.deepEqual(workers[0].requested,[0]);workers[0].deliver(0);assert.equal(sources.length,1);assert.equal(sources[0].loop,true);assert.deepEqual(workers[0].requested,[0,1]);
  music.configure(true,.4,true);assert.equal(sources.length,1);workers[0].deliver(1);context.currentTime=1;(tick as unknown as ()=>void)();assert.equal(sources.length,2);assert.ok(sources[0].stops[0]>context.currentTime);assert.deepEqual(workers[0].requested,[0,1,2]);
  context.currentTime=1.2;music.configure(true,.4,false);assert.equal(tick,null);assert.ok(sources[1].stops.length);music.configure(true,.4,true);assert.equal(sources.length,3);assert.ok(Math.abs(sources[2].startArgs[1]-.2)<.001);
  music.configure(false,.4,true);assert.equal(workers[0].terminated,true);assert.equal(tick,null);assert.equal((music as any).buffers.size,0);music.configure(true,0,true);assert.equal(workers.length,1);
  music.configure(true,.4,true);assert.equal(workers.length,2);workers[1].onerror();assert.equal(tick,null);assert.equal(workers[1].terminated,true);
 }finally{globalThis.Worker=originalWorker;globalThis.setInterval=originalInterval;globalThis.clearInterval=originalClear;}
});
test('boost feedback tracks orb and nitro lifetimes, replenishment, unlimited boost and invalid readings',()=>{
 const base={boostRemaining:0,nitroRemaining:0,boostSerial:0,infiniteBoost:false};assert.equal(boostPresentation(base).phase,'idle');
 assert.deepEqual(boostPresentation({...base,boostRemaining:5}),{phase:'boost',remaining:5,progress:1,title:'BOOST',hint:'FULL THROTTLE',timer:'5.0s'});
 assert.equal(boostPresentation({...base,boostRemaining:2.5}).progress,.5);
 const both=boostPresentation({...base,boostRemaining:4,nitroRemaining:1.1});assert.equal(both.title,'NITRO');assert.equal(both.progress,.5);assert.equal(both.hint,'DRIFT POWER');
 assert.equal(boostPresentation({...base,boostRemaining:4}).title,'BOOST');assert.equal(boostPresentation({...base,boostRemaining:5,infiniteBoost:true}).timer,'∞');
 assert.equal(boostPresentation({...base,boostRemaining:NaN,nitroRemaining:-2}).phase,'idle');assert.equal(boostPresentation({...base,boostRemaining:999}).progress,1);
});
