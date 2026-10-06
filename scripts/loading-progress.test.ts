import test from 'node:test';import assert from 'node:assert/strict';import {LoadingDisplay,loadingProgress,modelLoaded,startLoadingProgress,stopLoadingProgress} from '../src/core/Loading';
test('loading percentage is monotonic and reaches 100 only when every startup stage completes',()=>{
 const bar={value:0},label={textContent:''};Object.defineProperty(globalThis,'document',{configurable:true,value:{getElementById:(id:string)=>id==='startup-bar'?bar:id==='startup-percent'?label:null}});
 loadingProgress('physics',1);assert.equal(bar.value,8);modelLoaded(0,{loaded:100,total:200} as ProgressEvent);const before=bar.value;modelLoaded(0,{loaded:25,total:200} as ProgressEvent);assert.ok(bar.value>=before);for(let i=0;i<4;i++)modelLoaded(i);
 for(const stage of ['world','terrain','vehicles'] as const)loadingProgress(stage,1);assert.equal(bar.value,92);loadingProgress('shaders',1);assert.equal(bar.value,100);assert.equal(label.textContent,'100%');
});

test('shader preparation keeps moving smoothly for five seconds without reporting completion',()=>{
 const display=new LoadingDisplay(0);display.report(92,0);
 let previous=0;const samples:number[]=[];
 for(let now=16;now<=5000;now+=16){const value=display.tick(now);assert.ok(value>previous);assert.ok(value<99);previous=value;samples.push(value);}
 assert.ok(samples[62]>92,'continues beyond 92% while shaders are pending');
 assert.ok(previous>95&&previous<98,`five-second display estimate: ${previous}`);
 const before=previous;display.report(60,5010);display.report(NaN,5011);assert.equal(display.confirmed,92);assert.ok(display.tick(5020)>=before);
 assert.ok(display.tick(120000)<100,'even a long wait cannot finish pending work');
 display.report(100,120001);assert.ok(display.tick(120100)<100);assert.equal(display.tick(120301),100);
});

test('display smoothing is stable at different refresh rates and survives a delayed frame',()=>{
 const values=[];
 for(const hz of [30,60,144]){
  const display=new LoadingDisplay(0);display.report(92,0);
  for(let n=1;n<=hz*5;n++)display.tick(n*1000/hz);
  values.push(display.value);
  const previous=display.value;assert.ok(display.tick(10000)>=previous);assert.ok(display.value<100);
 }
 assert.ok(Math.max(...values)-Math.min(...values)<.025,JSON.stringify(values));
});

test('startup owns one animation loop, paints fractional fill and cancels it on completion/removal/error',()=>{
 const oldDocument=globalThis.document,oldRAF=globalThis.requestAnimationFrame,oldCancel=globalThis.cancelAnimationFrame,oldPerformance=globalThis.performance;
 let clock=0,id=0;const frames=new Map<number,FrameRequestCallback>();
 const bar={value:0,isConnected:true},fill={style:{transform:''}},label={textContent:''};
 Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>clock}});
 Object.defineProperty(globalThis,'document',{configurable:true,value:{getElementById:(id:string)=>id==='startup-bar'?bar:id==='startup-fill'?fill:id==='startup-percent'?label:null}});
 globalThis.requestAnimationFrame=cb=>{frames.set(++id,cb);return id;};globalThis.cancelAnimationFrame=id=>{frames.delete(id);};
 const tick=(now:number)=>{clock=now;const callbacks=[...frames.values()];frames.clear();for(const cb of callbacks)cb(now);};
 try{
  startLoadingProgress();assert.equal(frames.size,1);assert.equal(bar.value,0);
  loadingProgress('physics',1);tick(16);const first=bar.value;assert.ok(first>0&&first<8);tick(32);assert.ok(bar.value>first);assert.match(fill.style.transform,/scaleX\(0\.\d+\)/);assert.equal(label.textContent,Math.floor(bar.value)+'%');
  for(const stage of ['physics','assets','world','terrain','vehicles','shaders'] as const)loadingProgress(stage,1);
  tick(400);assert.equal(bar.value,100);assert.equal(label.textContent,'100%');assert.equal(fill.style.transform,'scaleX(1.00000)');assert.equal(frames.size,0);
  startLoadingProgress();assert.equal(bar.value,0);assert.equal(frames.size,1);bar.isConnected=false;tick(500);assert.equal(frames.size,0);
  bar.isConnected=true;startLoadingProgress();startLoadingProgress();assert.equal(frames.size,1);stopLoadingProgress();assert.equal(frames.size,0);
 }finally{
  stopLoadingProgress();Object.defineProperty(globalThis,'document',{configurable:true,value:oldDocument});Object.defineProperty(globalThis,'performance',{configurable:true,value:oldPerformance});globalThis.requestAnimationFrame=oldRAF;globalThis.cancelAnimationFrame=oldCancel;
 }
});
