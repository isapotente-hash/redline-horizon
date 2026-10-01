import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {RoadNetwork,roadHeight,surfaceBank} from '../src/world/RoadNetwork';
import {World} from '../src/world/World';
import {TerrainSampler} from '../src/world/TerrainSampler';
import {PhysicsWorld,VehiclePhysics,R} from '../src/physics/VehiclePhysics';
import {CARS} from '../src/vehicles/CarCatalog';
import {defaults} from '../src/core/SaveManager';
import {TrafficManager} from '../src/vehicles/TrafficManager';
import {Autopilot} from '../src/vehicles/Autopilot';
import {REGION_LABELS} from '../src/world/RegionalScenery';
const STEP=1/Number(process.env.PHYSICS_TEST_HZ||120);
const stopped={throttle:0,brake:1,steer:0,handbrake:true,up:false,down:false};
const coast={...stopped,brake:0,handbrake:false};
const context=new Proxy({createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),measureText:()=>({width:10})},{get:(obj,key)=>key in obj?(obj as any)[key]:()=>{}});
(globalThis as any).document={createElement:()=>({width:512,height:512,getContext:()=>context})};
const roads=new RoadNetwork();
let physics:PhysicsWorld,world:World;
const ready=(async()=>{physics=await new PhysicsWorld().init();physics.world.timestep=STEP;world=await new World(roads,physics,{...defaults,quality:'low'}).init();physics.world.step();})();

test('expanded roads are connected, span a larger world and cover distinct regions',()=>{
 assert.ok(roads.main.length>19000&&roads.main.length<21000);
 assert.ok(roads.roads.reduce((n,r)=>n+r.length,0)>60000);
 assert.ok(roads.bounds.maxX-roads.bounds.minX>6500);assert.ok(roads.bounds.maxZ-roads.bounds.minZ>8000);
 const seen=new Set<string>();for(const r of roads.roads)for(const a of r.samples)seen.add(roads.region(a.p.x,a.p.z));
 for(const name of ['SUMMIT PEAKS','COPPER DUNES','CEDAR SUBURBS','ZENITH INDUSTRIAL','SOUTH COAST','REDWOOD RIDGE','NOVA CITY'])assert.ok(seen.has(name),name);
 const reachable=new Set([roads.main]);let changed=true;
 while(changed){changed=false;for(const road of roads.roads)if(!reachable.has(road))for(const a of road.samples){if([...reachable].some(target=>roads.nearest(a.p.x,a.p.z,false,target).distance<5)){reachable.add(road);changed=true;break;}}}
 assert.equal(reachable.size,roads.roads.length);assert.ok(REGION_LABELS.length>=10);
});

test('actual world collision: every driving lane is clear across every road, including tunnels and forks',async()=>{
 await ready;let checked=0;
 const shape=new R.Cuboid(.92,.2,2.1),up=new T.Vector3(),right=new T.Vector3(),q=new T.Quaternion(),basis=new T.Matrix4();
 for(const road of roads.roads)for(let d=6;d<road.length-6;d+=8)for(const lane of [-.3,0,.3]){
   const a=roads.at(road,d),p=a.p.clone().addScaledVector(a.r,lane*road.width);p.y=roadHeight(a,lane*road.width)+.65;
   right.set(-a.t.z,0,a.t.x).normalize();up.crossVectors(right,a.t).normalize();q.setFromRotationMatrix(basis.makeBasis(right,up,a.t.clone().negate()));q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),surfaceBank(a)));
   let hit=false;physics.world.intersectionsWithShape(p,q,shape,()=>{hit=true;return false});
   assert.equal(hit,false,`${road.name} at ${d}m, lane ${lane}: obstructing collider`);checked++;
 }
 console.log({clearLaneSweeps:checked,circuitMeters:roads.main.length,totalRoadMeters:roads.roads.reduce((n,r)=>n+r.length,0)});
});

test('both tunnels retain solid side walls and roofs without a cap across either opening',async()=>{
 await ready;
 for(const tunnel of roads.structures.filter(s=>s.kind==='tunnel')){
  const a=roads.at(tunnel.road,(tunnel.start+tunnel.end)/2),p=a.p.clone();p.y+=2;
  for(const side of [-1,1]){const hit=physics.world.castRay(new R.Ray(p,a.r.clone().multiplyScalar(side)),tunnel.road.width,true);assert.ok(hit);assert.ok(hit.timeOfImpact>tunnel.road.width/2+.8);}
  const roof=physics.world.castRay(new R.Ray(p,{x:0,y:1,z:0}),10,true);assert.ok(roof);assert.ok(roof.timeOfImpact>5&&roof.timeOfImpact<8);
 }
});

test('all eight vehicle types drive through the coastal tunnel in both directions without a launch or obstruction',async()=>{
 await ready;const car=new VehiclePhysics(physics,roads,{...defaults});let traversals=0,maxUp=0;
 for(const spec of CARS)for(const direction of [-1,1]){
  car.spec=spec;const a=roads.at(roads.main,direction>0?700:1060),p=a.p.clone().addScaledVector(a.r,direction*4);
  car.setPosition(p.x,p.y+.8,p.z,Math.atan2(-a.t.x*direction,-a.t.z*direction));
  for(let i=0;i<120;i++){car.preStep(stopped,STEP);physics.world.step();car.postStep(STEP);}
  const pilot=new Autopilot(roads);pilot.toggle(car);
  let completed=false;
  for(let i=0;i<3000;i++){
   car.preStep(pilot.controls(car,90,'full',coast,{},STEP),STEP);physics.world.step();car.postStep(STEP);
   const hit=roads.nearest(car.position.x,car.position.z,false,roads.main);maxUp=Math.max(maxUp,car.body.linvel().y);
   assert.ok(car.body.linvel().y<10,`${spec.id}: launch`);assert.ok(car.position.y>hit.height+.2,`${spec.id}: fell through road`);
   if(direction>0?hit.sample.d>1040:hit.sample.d<720){completed=true;break;}
  }
  assert.ok(completed,`${spec.id}/${direction}: tunnel blocked`);traversals++;
 }
 physics.world.removeVehicleController(car.controller);physics.world.removeRigidBody(car.body);console.log({tunnelTraversals:traversals,maxUpwardSpeed:maxUp});
});

test('grazing both road barriers at speed does not create a vertical catapult; hard impacts remain solid',async()=>{
 await ready;const car=new VehiclePhysics(physics,roads,{...defaults});let highest=0,impact=false;
 for(const spec of [CARS[0],CARS[3],CARS[5]])for(const side of [-1,1]){
  car.spec=spec;const a=roads.at(roads.main,340),p=a.p.clone().addScaledVector(a.r,side*(roads.main.width/2+.15));
  car.setPosition(p.x,p.y+.85,p.z,Math.atan2(-a.t.x,-a.t.z));
  for(let i=0;i<120;i++){car.preStep(stopped,STEP);physics.world.step();car.postStep(STEP);}
  const velocity=a.t.clone().multiplyScalar(38).addScaledVector(a.r,side*9);car.body.setLinvel(velocity,true);
  for(let i=0;i<240;i++){car.preStep(coast,STEP);physics.world.step();car.postStep(STEP);highest=Math.max(highest,car.body.linvel().y);assert.ok(car.body.linvel().y<12,`${spec.id}: edge launched vehicle`);assert.ok(car.speed<50);impact ||= car.crashSerial>0;}
 }
 assert.ok(impact,'solid impacts should still trigger crash effects');physics.world.removeVehicleController(car.controller);physics.world.removeRigidBody(car.body);console.log({edgeMaxUpwardSpeed:highest});
});

test('NPC headings, lane positions and collider poses follow their assigned road, including grades and crash recovery',async()=>{
 await ready;const traffic=new TrafficManager(roads,physics,1),c=traffic.cars[0];
 let checks=0;
 for(const road of roads.roads)for(const direction of [-1,1])for(let d=40;d<road.length-40;d+=151){
  c.road=road;c.d=d;c.direction=direction;c.lane=direction*road.width*.25;traffic.pose(c,0);const position=c.root.position.clone(),q=c.root.quaternion.clone();
  c.d+=direction*.1;traffic.pose(c,.01);const movement=c.root.position.clone().sub(position).normalize(),heading=new T.Vector3(0,0,-1).applyQuaternion(q);
  assert.ok(heading.dot(movement)>.998,`${road.name} NPC diagonal at ${d}`);assert.ok(Math.abs(c.lane)+c.halfWidth<road.width/2);checks++;
 }
 c.root.rotation.set(.8,.5,.6);c.road=roads.main;c.d=120;traffic.recover(c);physics.world.step();
 assert.ok(Math.abs(c.root.rotation.z)<.04,'crash tilt must not survive recovery');assert.ok(Math.hypot(c.body.linvel().x,c.body.linvel().y,c.body.linvel().z)<.1,'spawn must not generate a kinematic velocity spike');
 c.road=roads.roads.find(r=>r.name==='RIDGE CONNECTOR')!;c.direction=1;c.d=c.road.length-20;c.lane=3;traffic.recover(c);c.speed=10;
 const original=c.road;
 for(let i=0;i<1800;i++){traffic.update(STEP,c.root.position.clone().add(new T.Vector3(0,0,100)),'low');physics.world.step();}
 assert.notEqual(c.road,original,'NPC must follow a connected road through the junction');console.log({npcPoseChecks:checks});
 physics.world.removeRigidBody(c.body);
});

test('streamed scenery and terrain stay bounded after crossing distant regions',async()=>{
 await ready;const sectors=world.roadSectors.map(s=>s.group);const geometries=sectors.map(s=>s.children.map((o:any)=>o.geometry));
 for(const road of [roads.main,...roads.roads.filter(r=>['COPPER DUNES','SUMMIT PASS','CEDAR SUBURBS','SOUTH COAST'].includes(r.name))]){
  const p=roads.at(road,600).p;await world.prime(p);world.update(p);
  assert.ok(world.chunks.size<45,`unbounded near chunks ${world.chunks.size}`);assert.ok(world.farTiles.size<70);
  for(const c of world.chunks.values())for(const o of c.obstacles){const p=new T.Vector3().setFromMatrixPosition(o.matrix);assert.ok(world.terrainSampler.vegetationClear(p.x,p.z,.2),'solid scenery inside road corridor');}
 }
 assert.deepEqual(world.roadSectors.map(s=>s.group),sectors,'track pool identities stay stable');assert.deepEqual(sectors.map(s=>s.children.map((o:any)=>o.geometry)),geometries,'no track geometry allocations while travelling');
 console.log({residentChunks:world.chunks.size,farTiles:world.farTiles.size,colliders:physics.world.colliders.len()});
});

test('mountain tunnel can be driven on its grade by a car, a motorcycle and a pickup',async()=>{
 await ready;const road=roads.roads.find(r=>r.name==='SUMMIT PASS')!,car=new VehiclePhysics(physics,roads,{...defaults});
 for(const spec of [CARS[0],CARS[3],CARS[5]]){
  car.spec=spec;car.teleport(road,1000);for(let i=0;i<120;i++){car.preStep(stopped,STEP);physics.world.step();car.postStep(STEP);}
  const pilot=new Autopilot(roads);pilot.toggle(car);let finished=false;
  for(let i=0;i<4500;i++){car.preStep(pilot.controls(car,72,'full',coast,{},STEP),STEP);physics.world.step();car.postStep(STEP);const near=roads.nearest(car.position.x,car.position.z,true,road);assert.ok(car.position.y>near.height+.18);if(near.sample.d>1440){finished=true;break;}}
  assert.ok(finished,`${spec.id} blocked in mountain tunnel`);
 }
 physics.world.removeVehicleController(car.controller);physics.world.removeRigidBody(car.body);
});

test('relocating to steep road sections aligns each vehicle with the road instead of embedding its nose',async()=>{
 await ready;const road=roads.roads.find(r=>r.name==='SUMMIT PASS')!,car=new VehiclePhysics(physics,roads,{...defaults});
 for(const spec of CARS){car.spec=spec;car.teleport(road,2800);const surface=roads.at(road,2800);assert.ok(car.forward.dot(surface.t)>.9999);for(let i=0;i<120;i++){car.preStep(stopped,STEP);physics.world.step();car.postStep(STEP);}assert.ok(car.contacts>=2);assert.ok(Math.abs(car.body.linvel().y)<1.5);}
 physics.world.removeVehicleController(car.controller);physics.world.removeRigidBody(car.body);
});

test('hidden race opponents have no live colliders before a race starts',async()=>{
 await ready;const {RaceManager}=await import('../src/racing/RaceManager');const race=new RaceManager(roads,physics);
 assert.ok(!race.ai.root.visible);assert.ok(race.ai.cars.every(c=>!c.body.isEnabled()),'hidden AI must not obstruct the tunnel or any road');
 for(const c of race.ai.cars)physics.world.removeRigidBody(c.body);
});

test('the entire expanded circuit is driveable in real vehicle physics without resets or checkpoint shortcuts',async()=>{
 await ready;const car=new VehiclePhysics(physics,roads,{...defaults}),pilot=new Autopilot(roads);car.teleport(roads.main,120);
 for(let i=0;i<120;i++){car.preStep(stopped,STEP);physics.world.step();car.postStep(STEP);}pilot.toggle(car);
 let travel=0,last=120,worstOffset=0,highestUp=0,steps=0;
 for(;steps<180000&&travel<roads.main.length;steps++){
  car.preStep(pilot.controls(car,90,'full',coast,{},STEP),STEP);physics.world.step();car.postStep(STEP);
  const n=roads.nearest(car.position.x,car.position.z,false,roads.main);let delta=n.sample.d-last;if(delta<-roads.main.length/2)delta+=roads.main.length;if(delta>roads.main.length/2)delta-=roads.main.length;travel+=delta;last=n.sample.d;
  worstOffset=Math.max(worstOffset,Math.abs(n.offset));highestUp=Math.max(highestUp,car.body.linvel().y);
  assert.ok(Number.isFinite(n.distance)&&n.distance<roads.main.width/2-.3,`left route at ${last.toFixed(1)}m`);
  assert.ok(car.position.y>n.height+.18,`fell through road at ${last.toFixed(1)}m`);
 }
 assert.ok(travel>=roads.main.length,`stuck after ${travel.toFixed(0)}m`);console.log({physicalLapMeters:travel,simulationSeconds:steps*STEP,worstOffset,highestUp});
 physics.world.removeVehicleController(car.controller);physics.world.removeRigidBody(car.body);
});

test('on-foot exits and walking remain supported on the real coastal tunnel road and its shoulders',async()=>{
 await ready;const {OnFootPlayer}=await import('../src/player/OnFootPlayer');
 const car=new VehiclePhysics(physics,roads,{...defaults}),foot=new OnFootPlayer(physics);car.teleport(roads.main,850,3);
 for(let i=0;i<120;i++){car.preStep(stopped,STEP);physics.world.step();car.postStep(STEP);}
 assert.ok(foot.exit(car),'safe tunnel exit');const origin=foot.position.clone(),yaw=Math.atan2(-car.forward.x,-car.forward.z);
 for(let i=0;i<300;i++){foot.preStep({...coast,throttle:1},yaw,STEP);physics.world.step();foot.postStep();const hit=roads.nearest(foot.position.x,foot.position.z);assert.ok(foot.position.y>hit.height+.7,'capsule fell through tunnel road');}
 assert.ok(foot.position.distanceTo(origin)>5);assert.equal(foot.enter(car),false,'cannot re-enter at distance');foot.enter(car,true);
 physics.world.removeCharacterController(foot.controller);physics.world.removeRigidBody(foot.body);physics.world.removeVehicleController(car.controller);physics.world.removeRigidBody(car.body);
});

test('both new scenic routes are driveable through their banks, hairpins and graded attachments',async()=>{
 await ready;const car=new VehiclePhysics(physics,roads,{...defaults});
 try{
  for(const name of ['BRACKEN LANE','HIGHLAND SWITCHBACKS']){
   const road=roads.roads.find(r=>r.name===name)!;car.teleport(road,90,road.width*.23);await world.prime(car.position);
   for(let i=0;i<100;i++){car.preStep(stopped,STEP);physics.world.step();car.postStep(STEP);}
   const pilot=new Autopilot(roads);pilot.toggle(car);let completed=false,maxUp=0;
   for(let i=0;i<60000;i++){
    car.preStep(pilot.controls(car,90,'full',coast,{routeChoices:false},STEP),STEP);physics.world.step();car.postStep(STEP);
    const hit=roads.nearest(car.position.x,car.position.z,false,road);maxUp=Math.max(maxUp,car.body.linvel().y);
    assert.ok(Math.abs(hit.offset)<road.width/2+.2,`${name}: left paved corridor at ${hit.sample.d}/${hit.offset}`);
    assert.ok(car.position.y>hit.height+.18,`${name}: chassis fell under pavement`);assert.ok(car.body.linvel().y<10,`${name}: launch`);
    if(hit.sample.d>road.length-70){completed=true;break;}
    if(i%240===0){world.update(car.position,true);await new Promise(resolve=>setTimeout(resolve,0));}
   }
   assert.ok(completed,`${name}: did not complete`);console.log({route:name,maxUp});
  }
 }finally{physics.world.removeVehicleController(car.controller);physics.world.removeRigidBody(car.body);}
});
