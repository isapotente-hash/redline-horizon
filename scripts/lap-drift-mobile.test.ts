import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {SaveManager,defaults} from '../src/core/SaveManager';import {SAVE_KEY} from '../src/core/SaveStorage';
import {isMobileDevice,DeviceInfo} from '../src/input/DevicePolicy';import {DriftSystem} from '../src/vehicles/DriftSystem';
import {SlipstreamSystem} from '../src/vehicles/SlipstreamSystem';import {PhysicsWorld,VehiclePhysics} from '../src/physics/VehiclePhysics';
import {RoadNetwork} from '../src/world/RoadNetwork';import {RaceManager} from '../src/racing/RaceManager';
function storage(seed:Record<string,string>={}){const data=new Map(Object.entries(seed));Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{get length(){return data.size},key:(i:number)=>[...data.keys()][i]??null,getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)}});return data;}
test('personal laps save immediately, retain fastest 20 and reject invalid records without losing progression',()=>{
 const data=storage();let save=new SaveManager();save.coins=842;save.settings.units='mph';
 for(let i=0;i<30;i++)assert.ok(save.recordLap(130-i,'vanta',i%3+1,i%2===0,i%3===0));
 save=new SaveManager();assert.equal(save.coins,842);assert.equal(save.settings.units,'mph');assert.equal(save.lapRecords.length,20);assert.equal(save.lapRecords[0].time,101);assert.equal(save.lapRecords[19].time,120);assert.equal(save.lapRecords[0].multiplayer,false);
 for(const value of [NaN,Infinity,0,-1,21601])assert.equal(save.recordLap(value,'vanta',1),false);
 assert.equal(save.recordLap(100,'unknown',1),false);assert.equal(save.recordLap(100,'vanta',0),false);
 const state=JSON.parse(data.get(SAVE_KEY)!);state.lapRecords.push({time:1,carId:'<script>',date:NaN},{time:'2',carId:'vanta'},{time:3,carId:'vanta',date:-1,lap:9,assisted:'yes'});data.set(SAVE_KEY,JSON.stringify(state));
 save=new SaveManager();assert.equal(save.lapRecords[0].time,3);assert.equal(save.lapRecords[0].lap,1);assert.equal(save.lapRecords[0].assisted,false);assert.equal(save.lapRecords[0].date,0);assert.equal(save.coins,842);
});
test('only a current-layout one-lap legacy best is migrated; old short-track or three-lap totals are not fabricated as laps',()=>{
 storage({'redline-horizon-v1':JSON.stringify({layoutVersion:2,best:1500,bestByLaps:{3:4200},coins:80})});let save=new SaveManager();assert.equal(save.lapRecords.length,1);assert.equal(save.lapRecords[0].time,1500);assert.equal(save.lapRecords[0].imported,true);assert.equal(new SaveManager().lapRecords.length,1);
 storage({[SAVE_KEY]:JSON.stringify({best:500,bestByLaps:{3:1600}})});save=new SaveManager();assert.equal(save.lapRecords.length,0);assert.equal((save.legacyRecords['original-circuit'] as any).best,500);
});
test('device policy recognizes phones/tablets and protects touch laptops and resized desktops',()=>{
 const base:DeviceInfo={userAgent:'',platform:'',maxTouchPoints:5,touchSupported:true,coarse:true};
 for(const [userAgent,platform] of [['Android Tablet','Linux arm'],['iPhone','iPhone'],['iPad','iPad'],['Macintosh AppleWebKit','MacIntel']])assert.equal(isMobileDevice({...base,userAgent,platform}),true);
 for(const [userAgent,platform] of [['Windows NT 10.0','Win32'],['X11; Linux x86_64','Linux x86_64'],['CrOS','Linux'],['Macintosh','MacIntel']])assert.equal(isMobileDevice({...base,userAgent,platform,coarse:false,mobileHint:true}),false);
 assert.equal(isMobileDevice({...base,userAgent:'Windows NT 10.0',coarse:true,mobileHint:true}),false);
 assert.equal(isMobileDevice({...base,userAgent:'Android',maxTouchPoints:0}),false);
 assert.equal(isMobileDevice({...base,userAgent:'Android',touchSupported:false}),false);
});
const driftCar={speed:25,signedSpeed:25,slip:.3,contacts:4,surface:'ASPHALT',crashSerial:0};
function charge(d:DriftSystem,c={...driftCar}){for(let i=0;i<90;i++)assert.equal(d.update(1/60,c,true,.6),false);assert.equal(d.charge,1);return c;}
test('a sustained grounded handbrake turn rewards exactly once after a controlled exit',()=>{
 const d=new DriftSystem(),c=charge(d);assert.ok(d.active);assert.equal(d.rewardSerial,0);c.slip=.05;let rewards=0;for(let i=0;i<60;i++)rewards+=Number(d.update(1/60,c,false,0));assert.equal(rewards,1);assert.equal(d.rewardSerial,1);assert.equal(d.active,false);
 const short=new DriftSystem();for(let i=0;i<15;i++)short.update(1/60,driftCar,true,.6);for(let i=0;i<60;i++)assert.equal(short.update(1/60,{...driftCar,slip:0},false,0),false);
});
test('drift meter cancels safely on spin, airborne, crash, grass and sustained straight handbraking',()=>{
 for(const changed of [{slip:1.1},{contacts:0},{crashSerial:1},{surface:'GRASS'},{signedSpeed:-20},{crashCooldown:1}]){const d=new DriftSystem(),c=charge(d);Object.assign(c,changed);assert.equal(d.update(1/60,c,false,0),false);assert.equal(d.charge,0);assert.equal(d.active,false);}
 const d=new DriftSystem();charge(d);for(let i=0;i<20;i++)d.update(1/60,{...driftCar,slip:0},true,0);assert.equal(d.active,false);
});
const controls={throttle:1,brake:0,steer:0,handbrake:false,up:false,down:false};
test('slipstream requires a close, aligned, unobstructed, fresh vehicle and clears for brakes/handbrake',async()=>{
 const p=await new PhysicsWorld().init(),roads=new RoadNetwork(),car=new VehiclePhysics(p,roads,{...defaults});car.setPosition(0,1,0,0);car.speed=25;car.signedSpeed=25;car.contacts=4;car.surface='ASPHALT';
 const draft=new SlipstreamSystem(),peer={root:new T.Object3D(),speed:25,receivedAt:1000,latest:{active:true}};peer.root.position.set(0,1,-18);
 const update=(n=100)=>{for(let i=0;i<n;i++)draft.update(1/60,car,controls,[],[peer as any],1000)};
 try{update();assert.ok(car.slipstreamStrength>.5);draft.reset();peer.root.position.x=5;update();assert.equal(car.slipstreamStrength,0);
 peer.root.position.x=0;peer.root.rotation.y=Math.PI;update();assert.equal(car.slipstreamStrength,0);peer.root.rotation.y=0;peer.receivedAt=0;update();assert.equal(car.slipstreamStrength,0);peer.receivedAt=1000;
 const wall=p.box(0,1,-9,8,5,1);p.world.step();update();assert.equal(car.slipstreamStrength,0);p.world.removeCollider(wall,true);p.world.step();update();assert.ok(car.slipstreamStrength>.5);
 draft.update(1/60,car,{...controls,handbrake:true},[],[peer as any],1000);assert.equal(car.slipstreamStrength,0);update();draft.update(1/60,car,{...controls,brake:1},[],[peer as any],1000);assert.equal(car.slipstreamStrength,0);
 }finally{p.world.free();}
});
test('three-lap races emit individual sequential lap times without duplicating finished records',async()=>{
 const p=await new PhysicsWorld().init(),roads=new RoadNetwork(),car=new VehiclePhysics(p,roads,{...defaults}),race=new RaceManager(roads,p);race.start(car,3,true);race.countdown=0;const times:number[]=[];
 try{for(let i=0;i<race.count*3;i++){race.elapsed=(i+1)*10;const g=race.gate.position;car.setPosition(g.x,g.y+.6,g.z,0);race.assistUsed=times.length===1;const serial=race.lapSerial;race.update(1/60,car);if(race.lapSerial!==serial){times.push(race.lastLapTime);assert.equal(race.lastLapNumber,times.length);assert.equal(race.lastLapAssisted,times.length===2);}}
 assert.equal(times.length,3);assert.deepEqual(times,[race.count*10,race.count*10,race.count*10]);assert.equal(race.finished,true);const serial=race.lapSerial;race.update(1,car);assert.equal(race.lapSerial,serial);race.start(car,1,true);assert.equal(race.lapSerial,serial);assert.equal(race.lastLapTime,0);
 }finally{p.world.free();}
});
test('real Rapier sustained slide remains controllable, earns a temporary nitro and keeps orb boosts separate',async()=>{
 const roads=new RoadNetwork(),p=await new PhysicsWorld().init();p.world.timestep=1/60;const a=roads.at(roads.main,120);p.box(a.p.x,a.p.y-.1,a.p.z,1000,.2,1000);const car=new VehiclePhysics(p,roads,{...defaults});car.teleport(roads.main,120,0);
 // An isolated broad paved test surface: test tyre forces, not circuit navigation.
 const nearest=roads.nearest.bind(roads);roads.nearest=((x:number,z:number)=>{const n=nearest(x,z);return {...n,distance:0,road:{...n.road,width:200}};}) as typeof roads.nearest;
 const step=(input=controls)=>{car.preStep(input,1/60);p.world.step();car.postStep(1/60)};
 try{for(let i=0;i<90;i++)step({...controls,throttle:0,brake:1});car.body.setLinvel({x:car.forward.x*32,y:0,z:car.forward.z*32},true);let slip=0;
 for(let i=0;i<110;i++){step({...controls,handbrake:true,steer:.5});slip=Math.max(slip,Math.abs(car.slip));}
 assert.equal(car.drift.charge,1);assert.ok(slip>.2&&slip<.8,`controlled physical slip ${slip}`);
 for(let i=0;i<120&&car.drift.rewardSerial===0;i++)step({...controls,steer:car.slip>.1?-.25:car.slip<-.1?.25:0});
 assert.equal(car.drift.rewardSerial,1);assert.ok(car.nitroRemaining>2);assert.equal(car.boosting,true);assert.equal(car.boostRemaining,0);
 car.activateBoost();for(let i=0;i<150;i++)step();assert.equal(car.nitroRemaining,0);assert.ok(car.boostRemaining>2);assert.equal(car.boosting,true);for(let i=0;i<180;i++)step();assert.equal(car.boosting,false);assert.equal(car.drift.rewardSerial,1);
 }finally{p.world.free();}
});
test('a high-speed wall scrape produces bounded feedback while floor contact does not',async()=>{
 const p=await new PhysicsWorld().init(),roads=new RoadNetwork(),car=new VehiclePhysics(p,roads,{...defaults});p.world.timestep=1/60;p.box(0,-.1,0,1000,.2,1000);car.setPosition(0,.6,0,0);
 const step=()=>{car.preStep({...controls,throttle:0},1/60);p.world.step();car.postStep(1/60)};
 try{for(let i=0;i<60;i++)step();car.body.setLinvel({x:0,y:0,z:-30},true);for(let i=0;i<10;i++)step();assert.equal(car.scrape,0,'road support must not be mistaken for a wall');
 const wall=p.box(1.4,1.5,car.position.z,1,3,300);car.body.setLinvel({x:3,y:0,z:-30},true);let scrape=0;for(let i=0;i<45;i++){step();scrape=Math.max(scrape,car.scrape);}assert.ok(scrape>.2&&scrape<=1,`actual wall feedback ${scrape}`);
 p.world.removeCollider(wall,true);for(let i=0;i<90;i++)step();assert.ok(car.scrape<.001,'scrape feedback decays after clearance');
 }finally{p.world.free();}
});
