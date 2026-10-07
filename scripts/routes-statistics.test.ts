import test from 'node:test';import assert from 'node:assert/strict';
import {RoadNetwork} from '../src/world/RoadNetwork';import {AutopilotRoutes} from '../src/vehicles/AutopilotRoutes';import {Autopilot} from '../src/vehicles/Autopilot';import {SaveManager,defaults} from '../src/core/SaveManager';import {PhysicsWorld,VehiclePhysics} from '../src/physics/VehiclePhysics';import {TerrainSampler} from '../src/world/TerrainSampler';import {supportGeometry} from '../src/world/CollisionGeometry';
const roads=new RoadNetwork(),city=roads.roads.find(r=>r.name==='NOVA CITY')!,manual={throttle:0,brake:0,steer:0,handbrake:false,up:false,down:false};
test('route choices anticipate city junctions, label both directions and lock before arrival',()=>{
 const routes=new AutopilotRoutes(roads),c=routes.update(city,150,1,20)!;assert.ok(c);assert.ok(c.distance>100);assert.deepEqual(c.options.map(o=>o.label),['Left','Straight','Right']);assert.equal(c.options[c.selected].road,city);assert.equal(routes.select(0),true);routes.update(city,c.d-40,1,20);assert.ok(c.locked);assert.equal(routes.select(2),false);routes.consume();assert.equal(routes.update(city,c.d-35,1,20),undefined);
 routes.reset();const fast=routes.update(roads.main,2764,1,50);assert.ok(fast);assert.ok(fast.distance>500);routes.reset();assert.equal(routes.update(roads.main,2764,1,10),undefined);
});
test('statistics survive reload, old saves migrate and invalid readings are ignored',()=>{
 let stored=JSON.stringify({layoutVersion:2,coins:325,distance:12345,best:1600,settings:{},ownedCars:['vanta','sprint']});Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>stored,setItem:(_k:string,v:string)=>stored=v}});
 const save=new SaveManager();assert.equal(save.coins,325);assert.equal(save.distance,12345);assert.equal(save.statistics.drivingSeconds,0);assert.equal(save.settings.autopilotRoutes,false);save.recordDriving(.05,120,true);save.recordDriving(.05,500,false);save.recordDriving(NaN,NaN,true);save.statistics.racesCompleted++;save.settings.autopilotRoutes=false;save.save();const loaded=new SaveManager();assert.equal(loaded.statistics.topSpeedKmh,120);assert.equal(loaded.statistics.drivingSeconds,.1);assert.equal(loaded.statistics.racesCompleted,1);assert.equal(loaded.settings.autopilotRoutes,false);assert.equal(loaded.best,1600);
});
test('selected left and right turns physically follow city junctions without teleporting',async()=>{
 const physics=await new PhysicsWorld().init(),terrain=new TerrainSampler(roads);for(const r of roads.roads){const g=supportGeometry(r,terrain);physics.mesh(g);g.dispose();}
 const car=new VehiclePhysics(physics,roads,{...defaults});
 for(const scenario of [{road:city,start:150,label:'Left',name:''},{road:city,start:150,label:'Right',name:''},{road:roads.main,start:4660,label:'fork',name:'SUMMIT PASS'}]){
  const {road,start,label,name}=scenario;car.teleport(road,start,road.width*.23);for(let i=0;i<120;i++){car.preStep({...manual,brake:1,handbrake:true},1/120);physics.world.step();car.postStep(1/120);}
  const serial=car.teleportSerial,pilot=new Autopilot(roads);pilot.toggle(car);pilot.controls(car,85);const choice=pilot.routes.choice!;assert.ok(choice);const index=choice.options.findIndex(o=>name?o.road.name===name:o.label===label),target=choice.options[index].road;assert.ok(pilot.routes.select(index));let worst=0,switched=false;
  for(let i=0;i<5500;i++){car.preStep(pilot.controls(car,85),1/120);physics.world.step();car.postStep(1/120);const hit=roads.nearest(car.position.x,car.position.z,true);worst=Math.max(worst,hit.distance);assert.ok(car.position.y>hit.height-.5);if((pilot as any).road===target&&!((pilot as any).connector)){switched=true;break;}}
  console.log({turn:label,switched,worst,speed:car.speed,position:car.position});assert.ok(switched,label+' turn failed');assert.equal(car.teleportSerial,serial);assert.ok(worst<road.width/2-.7);assert.ok(pilot.enabled);
 }
 physics.world.free();
});
test('speed-only and race restrictions suppress choices; steering-only preserves pedals',async()=>{
 const physics=await new PhysicsWorld().init(),car=new VehiclePhysics(physics,roads,{...defaults});car.teleport(city,150);const pilot=new Autopilot(roads);pilot.toggle(car);const pedals={...manual,throttle:.65,brake:.1};let c=pilot.controls(car,90,'steering',pedals);assert.ok(pilot.routes.choice);assert.equal(c.throttle,.65);assert.equal(c.brake,.1);pilot.controls(car,90,'speed');assert.equal(pilot.routes.choice,undefined);pilot.controls(car,90,'full',manual,{routeChoices:false});assert.equal(pilot.routes.choice,undefined);pilot.controls(car,90);assert.ok(pilot.routes.choice);pilot.disable();assert.equal(pilot.routes.choice,undefined);physics.world.free();
});
