import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {DrawnTrack,TrackPoint,makeDrawnTrack,validDrawnTrack,buildDrawnRoad,trackId,TrackStore} from '../src/racing/DrawnTrack';
import {DrawnTrackWorld} from '../src/world/DrawnTrackWorld';
import {RoadNetwork} from '../src/world/RoadNetwork';
import {PhysicsWorld,VehiclePhysics} from '../src/physics/VehiclePhysics';
import {RaceManager} from '../src/racing/RaceManager';
import {defaults} from '../src/core/SaveManager';
import {renderBudget,treeBudget} from '../src/rendering/RenderBudget';
import {makeTreeVariants} from '../src/world/TreeModel';
import {validRaceSettings,defaultRaceSettings} from '../src/multiplayer/LobbySettings';
import {AutoGraphics} from '../src/core/AutoGraphics';
const points=():TrackPoint[]=>Array.from({length:24},(_,i)=>{const a=i/24*Math.PI*2;return [.5+Math.sin(a)*.3,.5+Math.cos(a)*.34];});
const course=()=>makeDrawnTrack(points(),'My circuit',14);

test('drawn circuit smoothing is deterministic, closed and has a usable road surface',()=>{
 const t=course(),a=buildDrawnRoad(t),b=buildDrawnRoad(structuredClone(t));assert.equal(trackId(t),trackId(structuredClone(t)));assert.ok(a.length>3500&&a.length<4500);assert.deepEqual(a.samples,b.samples);assert.ok(a.samples[0].p.distanceTo(a.samples.at(-1)!.p)<.001);assert.ok(a.samples[0].t.dot(a.samples.at(-1)!.t)>.999);assert.ok(a.samples.every(s=>Math.abs(s.t.dot(s.r))<1e-7&&s.p.y===24.55));
});
test('track input rejects crossings, nonfinite coordinates, undersized loops and excessive points',()=>{
 const t=course();for(const change of [{points:[[.2,.2],[.8,.8],[.2,.8],[.8,.2]]},{points:points().map(()=>[NaN,.5])},{points:Array.from({length:100},()=>[.5,.5])},{width:9},{name:'<script>'},{version:2},{points:points().map(([x,y])=>[.5+(x-.5)*.01,.5+(y-.5)*.01])}])assert.equal(validDrawnTrack({...t,...change}),false);
 assert.throws(()=>makeDrawnTrack([[.1,.1],[.2,.2]],'Bad'));
 assert.throws(()=>buildDrawnRoad({...t,width:Infinity}));
});
test('a dense finger stroke can close slightly past its start and survive save/play unchanged',()=>{
 for(const n of [120,200,500]){
  const raw:TrackPoint[]=Array.from({length:n+Math.floor(n*.035)},(_,i)=>{const a=i/n*Math.PI*2;return [.5+Math.sin(a)*.3,.5+Math.cos(a)*.31];});
  const t=makeDrawnTrack(raw,'Finger circuit');assert.ok(validDrawnTrack(t));assert.ok(t.points.length<=96);assert.ok(buildDrawnRoad(t).length>3500);
  for(let i=0;i<5;i++){const played=makeDrawnTrack(t.points,t.name,t.width);assert.deepEqual(played,t);assert.equal(trackId(played),trackId(t));}
 }
});
test('closing tolerance does not accept a figure eight or an extra partial lap',()=>{
 const crossed:TrackPoint[]=Array.from({length:201},(_,i)=>{const a=i/200*Math.PI*2;return [.5+Math.sin(a)*.32,.5+Math.sin(2*a)*.3];});
 assert.throws(()=>makeDrawnTrack(crossed),/crossing|overlap/);
 const overrun:TrackPoint[]=Array.from({length:231},(_,i)=>{const a=i/200*Math.PI*2;return [.5+Math.sin(a)*.3,.5+Math.cos(a)*.31];});
 assert.throws(()=>makeDrawnTrack(overrun),/crossing|overlap/);
 assert.throws(()=>makeDrawnTrack([...points(),[NaN,.5]]),/inside/);
});
test('storage failure rolls back track edits and records while the in-memory course can still race',()=>{
 let data='';Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>data,setItem:(_k:string,v:string)=>data=v}});
 const store=new TrackStore(),t=course();store.save(t);
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>data,setItem:()=>{throw new Error('Quota exceeded');}}});
 assert.throws(()=>store.save({...t,name:'Unstored edit'}));assert.equal(store.tracks[0].name,t.name);
 assert.throws(()=>store.remove(trackId(t)));assert.equal(store.tracks.length,1);
 assert.throws(()=>store.record(t,80,'dry'));assert.equal(store.best(t,'dry'),0);
 assert.ok(buildDrawnRoad(makeDrawnTrack(store.tracks[0].points)).length>3500);
});
test('drawn track saving, deletion, lap counts and wet/dry records remain separate and survive reload',()=>{
 let data='';Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>data,setItem:(_k:string,v:string)=>data=v}});
 const store=new TrackStore(),t=course();store.save(t);store.save({...t,name:'Renamed'});assert.equal(store.tracks.length,1);store.record(t,80,'dry');store.record(t,90,'dry');store.record(t,240,'dry',3);store.record(t,95,'wet');const again=new TrackStore();assert.equal(again.best(t,'dry'),80);assert.equal(again.best(t,'dry',3),240);assert.equal(again.best(t,'wet'),95);again.remove(trackId(t));assert.equal(new TrackStore().tracks.length,0);
});
test('custom multiplayer settings require a valid bounded track, and allow three laps',()=>{
 const settings={...defaultRaceSettings(),route:'custom',track:course(),laps:3};assert.ok(validRaceSettings(settings));for(const change of [{track:undefined},{track:{...course(),points:[[Infinity,0]]}},{route:'horizon'}])assert.equal(validRaceSettings({...settings,...change}),false);
});
test('mobile budgets avoid supersampling, MSAA and AO; light trees reduce geometry by over half',()=>{
 for(const quality of ['very-low','low','medium','high','ultra'] as const){const budget=renderBudget(quality,null,true);assert.equal(budget.pixelRatio,1);assert.equal(budget.samples,0);assert.equal(budget.ao,false);assert.ok(budget.shadow<=1024);assert.ok(treeBudget(quality,true).nearDistance<=55);}
 const triangleCount=(g:T.BufferGeometry)=>(g.index?.count??g.getAttribute('position').count)/3;
 for(const tree of makeTreeVariants()){assert.ok(triangleCount(tree.light.foliage)+triangleCount(tree.light.wood)<(triangleCount(tree.near.foliage)+triangleCount(tree.near.wood))*.5);assert.ok(tree.light.radius>1);}
 const auto=new AutoGraphics(2);for(let n=0;n<10000;n++)auto.observe(1000/60,3,3,true);assert.equal(auto.level,2);
});
test('custom solo race has no AI, completes ordered checkpoints, recovers on its road and cleans up colliders/grid',async()=>{
 const roads=new RoadNetwork(),physics=await new PhysicsWorld().init(),collidersBefore=physics.world.colliders.len(),roadCount=roads.roads.length;
 const arena=new DrawnTrackWorld(course(),roads,physics),vehicle=new VehiclePhysics(physics,roads,{...defaults}),race=new RaceManager(roads,physics);
 try{
  const hit=roads.nearest(arena.road.samples[10].p.x,arena.road.samples[10].p.z);assert.equal(hit.road,arena.road);assert.ok(hit.distance<.01);
  race.start(vehicle,3,false,'custom',true);assert.equal(race.playerCount,1);assert.ok(race.ai.cars.every(c=>!c.body.isEnabled()));assert.equal(race.ai.active,false);race.countdown=0;
  vehicle.teleport(arena.road,race.startDistance+race.totalLength*.5);race.update(.016,vehicle);assert.equal(race.checkpoint,0,'shortcut cannot skip the next gate');
  while(race.active){vehicle.teleport(arena.road,race.routeDistance((race.checkpoint+1)*race.totalLength/race.count));race.update(.2,vehicle);}
  assert.ok(race.finished);assert.equal(race.position,1);assert.equal(race.checkpoint,race.count*3);assert.equal(race.claimReward(),0);assert.ok(race.recover(vehicle));assert.ok(vehicle.position.x>15000);
  race.cancel();arena.dispose();assert.equal(roads.roads.length,roadCount);assert.equal(roads.drawnRoad,undefined);assert.ok(![...roads.grid.values()].some(items=>items.some(i=>i.road===arena.road)));assert.equal(physics.world.colliders.len(),collidersBefore+vehicle.body.numColliders()+race.ai.cars.reduce((n,c)=>n+c.body.numColliders(),0));
 }finally{physics.world.free();}
});
