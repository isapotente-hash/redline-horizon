import test from 'node:test';import assert from 'node:assert/strict';
import {RoadNetwork} from '../src/world/RoadNetwork';import {TerrainSampler} from '../src/world/TerrainSampler';import {supportGeometry} from '../src/world/CollisionGeometry';
import {PhysicsWorld,VehiclePhysics} from '../src/physics/VehiclePhysics';import {Autopilot} from '../src/vehicles/Autopilot';import {AutopilotDrift} from '../src/vehicles/AutopilotDrift';import {defaults,SaveManager} from '../src/core/SaveManager';import {PoliceManager} from '../src/police/PoliceManager';import {CARS} from '../src/vehicles/CarCatalog';
const coast={throttle:0,brake:0,steer:0,handbrake:false,up:false,down:false},stop={...coast,brake:1,handbrake:true},roads=new RoadNetwork();
async function setup(all=false){const physics=await new PhysicsWorld().init(),terrain=new TerrainSampler(roads);for(const road of all?roads.roads:[roads.main]){const g=supportGeometry(road,terrain);physics.mesh(g);g.dispose();}return physics;}
test('full autopilot initiates bounded physical slides and recovers through left and right bends',async()=>{
 const physics=await setup(),car=new VehiclePhysics(physics,roads,{...defaults});let drifts=0,pulses=0,slip=0,worst=0;
 for(const [start,direction] of [[2820,1],[9300,1],[5500,-1]]){
  car.teleport(roads.main,start,3*direction);if(direction<0){const a=roads.at(roads.main,start);car.setPosition(car.position.x,car.position.y,car.position.z,Math.atan2(a.t.x,a.t.z),-Math.asin(a.t.y));}
  for(let i=0;i<120;i++){car.preStep(stop,1/120);physics.world.step();car.postStep(1/120);}const pilot=new Autopilot(roads);pilot.toggle(car);
  for(let i=0;i<3000;i++){const controls=pilot.controls(car,140);pulses+=Number(controls.handbrake);car.preStep(controls,1/120);physics.world.step();car.postStep(1/120);if(pilot.drift.phase!=='grip')slip=Math.max(slip,Math.abs(car.slip));const h=roads.nearest(car.position.x,car.position.z,false,roads.main);worst=Math.max(worst,Math.abs(h.offset));assert.ok(car.position.y>h.height-.2,'stay on road');}
  drifts+=pilot.drift.initiations;assert.ok(pilot.enabled);
 }console.log({drifts,handbrakeTicks:pulses,maxDriftSlip:slip,worstOffset:worst});assert.ok(drifts>=2);assert.ok(pulses>0&&pulses<200);assert.ok(slip>.025&&slip<.5);assert.ok(worst<7.4);physics.world.free();
});
test('drift safety preserves partial controls and excludes rain, bikes, traffic and air',async()=>{
 const physics=await new PhysicsWorld().init(),car=new VehiclePhysics(physics,roads,{...defaults}),drift=new AutopilotDrift();car.speed=22;car.contacts=4;car.surface='ASPHALT';car.crashCooldown=0;
 for(const variant of ['rain','bike','traffic','airborne','steering']){car.spec=CARS[0];car.settings.weather='clear';car.contacts=4;drift.reset();const c={curvature:.01,offset:2,width:16,clear:true,full:true},input={...coast,throttle:.7};if(variant==='rain')car.settings.weather='rain';if(variant==='bike')car.spec=CARS.find(c=>c.id==='pulse')!;if(variant==='traffic')c.clear=false;if(variant==='airborne')car.contacts=0;if(variant==='steering')c.full=false;drift.update(car,input,c,1/120);assert.equal(drift.phase,'grip');assert.equal(input.handbrake,false);assert.equal(input.throttle,.7);}physics.world.free();
});
test('autopilot physically connects road ends without teleporting or disabling',async()=>{
 const physics=await setup(true),car=new VehiclePhysics(physics,roads,{...defaults});let crossings=0;
 for(const name of ['SILVER CANYON','CEDAR SUBURBS','SUMMIT PASS']){const road=roads.roads.find(r=>r.name===name)!;car.teleport(road,road.length-100,road.width*.23);for(let i=0;i<120;i++){car.preStep(stop,1/120);physics.world.step();car.postStep(1/120);}const serial=car.teleportSerial,pilot=new Autopilot(roads);pilot.toggle(car);for(let i=0;i<3600;i++){car.preStep(pilot.controls(car,70),1/120);physics.world.step();car.postStep(1/120);if((pilot as any).road!==road){crossings++;break;}}assert.ok(pilot.enabled,name+' disabled');assert.equal(car.teleportSerial,serial);assert.notEqual((pilot as any).road,road,name+' failed to connect');assert.ok(roads.nearest(car.position.x,car.position.z,true).distance<8);}console.log({connectedRoadTransitions:crossings});physics.world.free();
});
test('crashes and resets never charge; distant, disabled and obstructed officers cannot arrest',async()=>{
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null,setItem:()=>{}}});const physics=await setup(),save=new SaveManager(),car=new VehiclePhysics(physics,roads,{...defaults}),police=new PoliceManager(roads,physics,save);save.coins=150;car.teleport(roads.main,200);
 car.speed=60;car.contacts=4;car.crashCooldown=2;police.preStep(2,car,false);assert.equal(police.active,false);assert.equal(save.coins,150);
 police.rules.active=true;police.start(car);car.speed=0;car.crashSerial++;assert.equal(police.caught(car),false);car.reset();police.recovered();assert.equal(save.coins,150);assert.equal(police.active,true);
 const officer=police.units[0].car;officer.setPosition(car.position.x+6,car.position.y,car.position.z,0);police.rules.capture=3;officer.body.setEnabled(false);assert.equal(police.caught(car),false);officer.body.setEnabled(true);
 const wall=physics.box(car.position.x+3,car.position.y,car.position.z,1,5,12);physics.world.step();assert.equal(police.physicallyIntercepts(car),false);assert.equal(police.caught(car),false);assert.equal(save.coins,150);
 physics.world.removeCollider(wall,true);physics.world.step();assert.equal(police.physicallyIntercepts(car),true);assert.equal(police.caught(car),true);assert.equal(save.coins,100);assert.equal(police.caught(car),false);assert.equal(save.coins,100);physics.world.free();
});
