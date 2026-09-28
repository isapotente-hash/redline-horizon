import test from 'node:test';
import assert from 'node:assert/strict';
import {RoadNetwork} from '../src/world/RoadNetwork';
import {roadRibbon} from '../src/world/roadGeometry';
import {PhysicsWorld,VehiclePhysics} from '../src/physics/VehiclePhysics';
import {Autopilot} from '../src/vehicles/Autopilot';
import {navigate} from '../src/vehicles/AutopilotNavigation';
import {SaveManager,defaults} from '../src/core/SaveManager';
import {CoinManager} from '../src/world/CoinManager';
import {BoostManager} from '../src/world/BoostManager';
import {CARS} from '../src/vehicles/CarCatalog';
const roads=new RoadNetwork(),road=roads.main;
const coast={throttle:0,brake:0,steer:0,handbrake:false,up:false,down:false};
test('navigation chooses reachable active coins and skips collected, blocked and unsafe last-second pickups',()=>{
 const coin={road,d:165,offset:0,active:true};
 const go=(coins:any[],cars:any[]=[])=>navigate(road,120,1,20,3.68,3.68,{coins,cars});
 assert.equal(go([coin]).target,'coin');assert.equal(go([coin]).lane,0);
 assert.equal(go([{...coin,active:false}]).target,undefined);
 assert.equal(go([{...coin,road:roads.roads[1]}]).target,undefined);
 assert.equal(go([{...coin,d:124}]).target,undefined);
 assert.equal(go([coin],[{d:165,lane:0,speed:0,direction:1}]).target,undefined);
 assert.equal(navigate(road,200,-1,20,-3.68,-3.68,{coins:[coin]}).target,'coin');
 assert.equal(navigate(road,road.length-30,1,15,3.68,3.68,{coins:[{...coin,d:12}]}).target,'coin');
 assert.equal(navigate(road,120,1,20,3.68,3.68,{coins:[{...coin,d:145}],cars:[{d:145,lane:0,speed:20,direction:-1}]}).target,undefined);
});
test('car and bike autopilot collect coins in actual physics, avoid a blocked pickup and remain on the road',async()=>{
 for(const id of ['vanta','pulse']){
  const physics=await new PhysicsWorld().init(),geometry=roadRibbon(road,0,road.samples.length-1,-8,8);physics.mesh(geometry);
  const car=new VehiclePhysics(physics,roads,{...defaults}),pilot=new Autopilot(roads),save=new SaveManager(),coins=new CoinManager(roads,save),boosts=new BoostManager(roads);
  save.collectedCoins.clear();coins.items.forEach(c=>c.active=true);car.spec=CARS.find(c=>c.id===id)!;car.teleport(road,120);
  const obstacle={road,d:285,lane:0,speed:0,direction:1},p=roads.at(road,obstacle.d);
  physics.box(p.p.x,p.p.y+.55,p.p.z,2,1.1,4.6,Math.atan2(-p.t.x,-p.t.z));
  try{
   for(let i=0;i<180;i++){car.preStep({...coast,brake:1,handbrake:true},1/120);physics.world.step();car.postStep(1/120);}
   pilot.toggle(car);let count=0,clearance=Infinity,maxOffset=0;
   for(let i=0;i<38*120;i++){
    car.preStep(pilot.controls(car,100,'full',coast,{coins:coins.items,orbs:boosts.pickups,cars:[obstacle]}),1/120);physics.world.step();car.postStep(1/120);
    count+=coins.collect(car)/5;boosts.update(1/120,car);
    clearance=Math.min(clearance,Math.hypot(car.position.x-p.p.x,car.position.z-p.p.z));
    maxOffset=Math.max(maxOffset,roads.nearest(car.position.x,car.position.z,true).distance);
   }
   console.log({vehicle:id,collectedCoins:count,clearance,maxOffset,distance:car.distance});
   assert.ok(count>=5,`${id} collected ${count}`);assert.ok(clearance>2.7,`${id} clearance ${clearance}`);assert.ok(maxOffset<7.2);assert.ok(car.distance>500);
  }finally{physics.world.free();geometry.dispose();}
 }
});
test('autopilot brakes before a lower posted limit, scales corner speed for wet grip and preserves manual pedals',async()=>{
 const physics=await new PhysicsWorld().init(),car=new VehiclePhysics(physics,roads,{...defaults}),pilot=new Autopilot(roads);
 try{
  car.teleport(road,120);pilot.toggle(car);car.speed=35;
  const limit={road,start:175,end:400,limit:50};
  const slowed=pilot.controls(car,180,'full',coast,{limits:[limit]});assert.ok(slowed.brake>.1);assert.equal(slowed.throttle,0);
  let bend=0,curvature=0;
  for(let d=0;d<road.length;d+=20){const k=roads.at(road,d).t.angleTo(roads.at(road,d+18).t);if(k>curvature){curvature=k;bend=d;}}
  car.teleport(road,bend);pilot.disable();pilot.toggle(car);
  const dry=(pilot as any).cornerSpeed(car,bend,180,{});car.settings.weather='rain';
  const wet=(pilot as any).cornerSpeed(car,bend,180,{});assert.ok(wet<dry*.9,`dry ${dry}, wet ${wet}`);
  const manual={...coast,throttle:.7,brake:.2};const steering=pilot.controls(car,180,'steering',manual,{coins:[{road,d:bend+40,offset:0,active:true}]});assert.equal(steering.throttle,.7);assert.equal(steering.brake,.2);
  const speedOnly=pilot.controls(car,90,'speed',{...coast,steer:.6},{coins:[{road,d:bend+40,offset:0,active:true}]});assert.equal(speedOnly.steer,.6);assert.equal(pilot.target,undefined);
 }finally{physics.world.free();}
});
