import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {RoadNetwork,roadHeight} from '../src/world/RoadNetwork';import {roadRibbon} from '../src/world/roadGeometry';import {TerrainSampler} from '../src/world/TerrainSampler';import {supportGeometry} from '../src/world/CollisionGeometry';
import {PhysicsWorld,VehiclePhysics,R} from '../src/physics/VehiclePhysics';import {CARS} from '../src/vehicles/CarCatalog';import {performanceEstimate,traitsFor} from '../src/vehicles/VehicleTraits';import {BASE_TUNE} from '../src/vehicles/UpgradeCatalog';
import {defaults,SaveManager} from '../src/core/SaveManager';import {recoverVehicle} from '../src/vehicles/Recovery';import {RaceManager} from '../src/racing/RaceManager';import {PRACTICE_SECTIONS,RACE_ROUTES,routeRoad} from '../src/racing/RouteCatalog';import {PoliceManager} from '../src/police/PoliceManager';import {PursuitRules} from '../src/police/PursuitRules';import {TrafficManager} from '../src/vehicles/TrafficManager';
const roads=new RoadNetwork(),stopped={throttle:0,brake:1,steer:0,handbrake:true,up:false,down:false},step=1/120;
function storage(){const map=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>map.get(k)||null,setItem:(k:string,v:string)=>map.set(k,v)}});return map;}
test('scenic routes are narrow, graded and gently banked without changing established route geometry',()=>{
 for(const name of ['BRACKEN LANE','HIGHLAND SWITCHBACKS']){
  const road=roads.roads.find(r=>r.name===name)!;assert.ok(road.length>1700&&road.width<9);assert.ok(road.samples.some(s=>Math.abs(s.bank||0)>.02));assert.ok(road.samples.every(s=>Math.abs(s.bank||0)<=.055));
  const terrain=new TerrainSampler(roads),support=supportGeometry(road,terrain),p=support.getAttribute('position');
  for(let i=0;i<road.samples.length;i+=10)for(const [v,offset] of [[1,-road.width/2-2.3],[2,road.width/2+2.3]])assert.ok(Math.abs(p.getY(i*4+v)-roadHeight(road.samples[i],offset))<.0001);
  for(const junction of roads.junctions.filter(j=>j.parentRoad))assert.ok(roads.nearest(junction.x,junction.z,true,junction.parentRoad).distance<4);
  const g=roadRibbon(road,0,road.samples.length-1,-road.width/2,road.width/2);for(const y of g.getAttribute('normal').array.filter((_:number,i:number)=>i%3===1))assert.ok(y>.9);g.dispose();support.dispose();
 }
 for(const p of PRACTICE_SECTIONS)assert.ok(p.distance<routeRoad(roads,p.route).length-20);
 assert.ok(roads.main.length>19000&&roads.main.length<21000);
});
test('traffic follows banked lane height and roll instead of hovering or cutting diagonally',async()=>{
 const physics=await new PhysicsWorld().init(),traffic=new TrafficManager(roads,physics,1),c=traffic.cars[0],road=routeRoad(roads,'bracken');
 try{c.road=road;c.d=road.samples.find(s=>Math.abs(s.bank||0)>.03)!.d;c.lane=road.width*.24;c.direction=1;traffic.pose(c,step);const a=roads.at(road,c.d);assert.ok(Math.abs(c.root.position.y-roadHeight(a,c.lane))<.001);const up=new T.Vector3(0,1,0).applyQuaternion(c.root.quaternion);assert.ok(up.y>.95);assert.ok(Math.abs(up.dot(a.r))>.015);}finally{physics.world.free();}
});
test('banked road physics supports cars and bikes, with no violent vertical launch',async()=>{
 const physics=await new PhysicsWorld().init(),road=routeRoad(roads,'bracken'),terrain=new TerrainSampler(roads),support=supportGeometry(road,terrain);physics.mesh(support);support.dispose();
 const car=new VehiclePhysics(physics,roads,{...defaults});physics.world.step();
 try{for(const id of ['vanta','pulse']){car.spec=CARS.find(c=>c.id===id)!;const sample=road.samples.find(s=>Math.abs(s.bank||0)>.03)!;car.teleport(road,sample.d,road.width*.23);let maxUp=0;for(let i=0;i<360;i++){car.preStep(stopped,step);physics.world.step();car.postStep(step);maxUp=Math.max(maxUp,car.body.linvel().y);}assert.ok(car.contacts>=2,id);assert.ok(maxUp<2,`${id}: ${maxUp}`);assert.ok(car.position.y>roads.nearest(car.position.x,car.position.z,false,road).height+.2);}}finally{physics.world.free();}
});
test('recovery avoids occupied spawn points and leaves the car untouched when every candidate is blocked',async()=>{
 const physics=await new PhysicsWorld().init(),car=new VehiclePhysics(physics,roads,{...defaults}),a=roads.at(roads.main,140);car.teleport(roads.main,140);
 try{physics.box(a.p.x+a.r.x*5.5,a.p.y+.6,a.p.z+a.r.z*5.5,4,3,8);physics.world.step();assert.equal(recoverVehicle(car,roads.main,140),true);assert.ok(Math.abs(roads.nearest(car.position.x,car.position.z).offset-5.5)>1);const serial=car.teleportSerial;physics.box(a.p.x,a.p.y+1,a.p.z,200,8,200);physics.world.step();assert.equal(recoverVehicle(car,roads.main,140),false);assert.equal(car.teleportSerial,serial);}finally{physics.world.free();}
});
test('sprint races have sequential gates, one finish, ordered standings and cannot skip the route',async()=>{
 const physics=await new PhysicsWorld().init(),car=new VehiclePhysics(physics,roads,{...defaults}),race=new RaceManager(roads,physics);
 try{race.start(car,3,true,'coast');assert.equal(race.laps,1);assert.equal(race.route.closed,false);race.configurePlayers([0,1,2],0);race.countdown=0;race.elapsed=100;
  car.position.copy(race.finish.position);race.update(step,car);assert.equal(race.finished,false);assert.equal(race.checkpoint,0);
  for(let i=0;i<race.count;i++){car.position.copy(race.gate.position);race.update(step,car);}assert.ok(race.finished);assert.equal(race.lapSerial,0,'sprints never enter circuit lap leaderboard');assert.equal(race.claimReward(),0);race.updateOpponent(1,race.totalLength,true,95);race.updateOpponent(2,100,false,0);assert.deepEqual(race.standings.map(p=>p.slot),[1,0,2]);assert.equal(race.position,2);
 }finally{physics.world.free();}
});
test('vehicle identity changes actual braking and drivetrain, with useful garage estimates',async()=>{
 const physics=await new PhysicsWorld().init();physics.box(0,23.9,0,1200,.2,1200);const car=new VehiclePhysics(physics,roads,{...defaults});const distances:number[]=[];
 try{for(const id of ['vanta','apex']){car.spec=CARS.find(c=>c.id===id)!;car.teleport(roads.main,140,0);for(let i=0;i<150;i++){car.preStep(stopped,step);physics.world.step();car.postStep(step);}const start=car.position.clone();car.body.setLinvel({x:0,y:0,z:-27.7778},true);for(let i=0;i<700;i++){car.preStep({...stopped,handbrake:false},step);physics.world.step();car.postStep(step);if(car.speed<.5)break;}distances.push(start.distanceTo(car.position));}
  assert.ok(distances[1]<distances[0]*.96,JSON.stringify(distances));assert.equal(traitsFor(CARS[1]).drive,'AWD');assert.equal(traitsFor(CARS[0]).drive,'RWD');const stock=performanceEstimate(CARS[0],BASE_TUNE),upgrade=performanceEstimate(CARS[0],{...BASE_TUNE,enginePower:1.3,brakeForce:1.28});assert.ok(upgrade.acceleration<=stock.acceleration&&upgrade.braking<stock.braking);
 }finally{physics.world.free();}
});
test('police stages escalate; occlusion permits escape, but close officers and crashes do not bypass arrest conditions',async()=>{
 const rules=new PursuitRules();rules.active=true;rules.tick(26,140,0,100,false,false,true);assert.equal(rules.stage,2);rules.tick(40,140,0,100,false,false,true);assert.equal(rules.stage,3);rules.tick(7,0,0,100,false,false,false);assert.ok(rules.active);rules.tick(.1,0,0,10,false,false,false);assert.equal(rules.escape,0);assert.equal(rules.tick(8.1,140,0,100,false,false,false),'escaped');assert.equal(rules.impound,0);
 storage();const physics=await new PhysicsWorld().init(),save=new SaveManager(),car=new VehiclePhysics(physics,roads,{...defaults}),police=new PoliceManager(roads,physics,save);car.teleport(roads.main,240,0);police.rules.active=true;police.start(car);
 try{for(let i=0;i<2;i++)police.units[i].car.teleport(roads.main,120-i*10,0);const a=roads.at(roads.main,180);physics.box(a.p.x,a.p.y+3,a.p.z,30,6,3);physics.world.step();police.preStep(.1,car,false);assert.equal(police.seen,false);assert.equal(police.physicallyIntercepts(car),false);car.crashSerial++;assert.equal(police.caught(car),false);assert.equal(save.coins,0);assert.ok(police.rules.escape>0);}finally{physics.world.free();}
});
test('sprint best times and camera comfort persist without overwriting existing circuit progress',()=>{
 const map=storage(),save=new SaveManager();save.coins=99;save.best=200;save.bestByLaps[1]=200;save.settings.cameraMotion=.2;save.recordRoute('coast',140);save.recordRoute('coast',155);const loaded=new SaveManager();assert.equal(loaded.routeBests.coast,140);assert.equal(loaded.best,200);assert.equal(loaded.coins,99);assert.equal(loaded.settings.cameraMotion,.2);assert.ok(map.size>=1);
});
