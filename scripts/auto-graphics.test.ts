import test from 'node:test';
import assert from 'node:assert/strict';
import {AutoGraphics,FramePacer,AUTO_GRAPHICS} from '../src/core/AutoGraphics';
import {SaveManager} from '../src/core/SaveManager';
import {SAVE_KEY} from '../src/core/SaveStorage';

function run(a:AutoGraphics,seconds:number,costs:number[],gpu=true){let elapsed=0,changes=0;while(elapsed<seconds){const cost=costs[a.level],frame=Math.max(1000/a.targetFps,cost);elapsed+=frame/1000;if(a.observe(frame,Math.min(cost,8),gpu?cost:null,true))changes++;}return changes;}
test('a strong device reaches Extra High at 60 FPS with maximum distances',()=>{
 const a=new AutoGraphics();run(a,100,[3,4,6,7,10]);assert.equal(a.level,4);assert.equal(a.targetFps,60);assert.equal(a.profile.label,'Extra High');assert.deepEqual(a.distances,{renderDistance:3000,simulationDistance:1000});
});
test('a weak device reduces GPU work then settles at 30 FPS without recurring failed upgrades',()=>{
 const a=new AutoGraphics();run(a,30,[24,42,55,80,120]);assert.equal(a.level,0);assert.equal(a.targetFps,30);assert.equal(run(a,180,[24,42,55,80,120]),0);assert.equal(a.targetFps,30);assert.equal(a.profile.pixelRatio,1);
});
test('thermal slowdown triggers a reduction, and cooling eventually restores quality and 60 FPS',()=>{
 const a=new AutoGraphics();run(a,100,[3,4,6,7,10]);run(a,45,[24,42,55,80,120]);assert.equal(a.level,0);assert.equal(a.targetFps,30);run(a,240,[3,4,6,7,10]);assert.equal(a.targetFps,60);assert.equal(a.level,4);
});
test('GPU-bound devices reduce quality even when JavaScript timings look fast',()=>{
 const a=new AutoGraphics();run(a,12,[24,42,55,80,120]);assert.ok(a.level<1);
});
test('menus, hidden tabs, loading and isolated long stalls do not downgrade a calibrated device',()=>{
 const a=new AutoGraphics();run(a,100,[3,4,6,7,10]);
 for(let n=0;n<60;n++){a.observe(100,90,100,false);a.observe(5000,200,200,true);}assert.equal(a.level,4);assert.equal(a.targetFps,60);
 run(a,4,[3,4,6,7,10]);assert.equal(a.level,4);
});
test('a failed upgrade is held back instead of switching graphics every few seconds',()=>{
 const a=new AutoGraphics();run(a,30,[4,5,32,70,90]);assert.equal(a.level,1);const changes=run(a,40,[4,5,32,70,90]);assert.equal(changes,0);assert.equal(a.level,1);
});
test('automatic graphics can use frame cadence when GPU timing is unsupported',()=>{
 const a=new AutoGraphics();let seconds=0;while(seconds<20){seconds+=.05;a.observe(50,8,null,true);}assert.equal(a.level,0);assert.equal(a.targetFps,30);
});
test('frame pacing targets 30/60 FPS across 60/90/120/144 Hz screens, without drift or catch-up bursts',()=>{
 for(const hz of [60,90,120,144])for(const fps of [30,60]){const p=new FramePacer();let count=0;for(let n=0;n<hz*10;n++)if(p.ready(n*1000/hz,fps))count++;assert.ok(Math.abs(count-fps*10)<=1,`${hz} Hz / ${fps} FPS: ${count}`);}
 const p=new FramePacer();assert.equal(p.ready(100,30),true);assert.equal(p.ready(101,30),false);assert.equal(p.ready(10000,30),true);assert.equal(p.ready(10001,30),false);p.reset();assert.equal(p.ready(10001,60),true);
});
test('Auto defaults on for old/new saves; an explicit manual opt-out survives saving',()=>{
 let data=JSON.stringify({coins:75400,settings:{quality:'ultra',renderDistance:2125,simulationDistance:725}});
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>key===SAVE_KEY?data:null,setItem:(key:string,v:string)=>{if(key===SAVE_KEY)data=v;}}});
 const save=new SaveManager();assert.equal(save.settings.autoGraphics,true);save.settings.autoGraphics=false;save.save();const again=new SaveManager();assert.equal(again.settings.autoGraphics,false);assert.equal(again.settings.renderDistance,2125);assert.equal(again.settings.simulationDistance,725);assert.equal(again.coins,75400);
});
test('every automatic tier retains full CSS resolution and valid ascending world budgets',()=>{
 let last=0;for(const p of AUTO_GRAPHICS){assert.ok(p.pixelRatio>=1);assert.ok(p.pixelRatio>=last);last=p.pixelRatio;}
});

test('persistent extremely slow rendering is reduced instead of being mistaken for isolated stalls',()=>{const a=new AutoGraphics();for(let n=0;n<40;n++)a.observe(900,100,600,true);assert.equal(a.level,0);assert.equal(a.targetFps,30);});
