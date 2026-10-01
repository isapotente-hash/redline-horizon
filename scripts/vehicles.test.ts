import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {RoadNetwork,roadHeight} from '../src/world/RoadNetwork';
import {roadRibbon} from '../src/world/roadGeometry';
import {PhysicsWorld,VehiclePhysics,R} from '../src/physics/VehiclePhysics';
import {CARS,isBike} from '../src/vehicles/CarCatalog';
import {makeVehicle} from '../src/vehicles/VehicleModels';
import {SaveManager,defaults} from '../src/core/SaveManager';
import {Autopilot} from '../src/vehicles/Autopilot';
const stopped={throttle:0,brake:1,steer:0,handbrake:true,up:false,down:false};
const drive={...stopped,throttle:1,brake:0,handbrake:false};
const roads=new RoadNetwork();
async function rig(id:string) {
 const p=await new PhysicsWorld().init();p.box(0,23.9,0,10000,.2,10000);
 const car=new VehiclePhysics(p,roads,{...defaults});car.spec=CARS.find(c=>c.id===id)!;car.setPosition(0,25,0,0);
 const step=(input=drive,n=1)=>{for(let i=0;i<n;i++){car.preStep(input,1/120);p.world.step();car.postStep(1/120);}};
 step(stopped,120);return {p,car,step};
}
test('both bikes accelerate faster and turn more sharply; pickup has a heavier, slower chassis',async()=>{
 const speeds:Record<string,number>={},turns:Record<string,number>={};
 for(const id of ['vanta','pulse','spectre','atlas','comet']) {
  const {p,car,step}=await rig(id);assert.equal(car.contacts,4);step(drive,720);speeds[id]=car.speed;
  car.setPosition(0,24.6,0,0);step(stopped,120);car.body.setLinvel({x:0,y:0,z:-15},true);
  step({...drive,throttle:.35,steer:.55},180);turns[id]=Math.abs(Math.atan2(-car.forward.x,-car.forward.z));
  assert.ok(car.position.y>24.3&&car.position.y<25.8,`${id}: stable grounded chassis`);p.world.free();
 }
 console.log({sixSecondSpeedsKmh:Object.fromEntries(Object.entries(speeds).map(([k,v])=>[k,v*3.6])),turns});
 assert.ok(speeds.pulse>speeds.vanta*1.1);assert.ok(speeds.spectre>speeds.pulse);assert.ok(speeds.atlas<speeds.vanta);assert.ok(turns.pulse>turns.vanta*1.2);assert.ok(turns.spectre>turns.vanta*1.2);
});
test('Ctrl wheelie lifts the front contacts; release, braking and reset return to two wheels',async()=>{
 const {p,car,step}=await rig('pulse');step({...drive,down:true},1);assert.ok(car.wheelie<.01,'no stationary wheelie');
 step(drive,400);step({...drive,throttle:.4,down:true},300);
 assert.ok(car.forward.y>.25,`front should lift, pitch=${car.forward.y}`);assert.equal(car.controller.wheelIsInContact(0),false);assert.equal(car.controller.wheelIsInContact(2),true);assert.equal(car.contacts,2);
 step({...drive,throttle:0},240);assert.ok(Math.abs(car.forward.y)<.08);assert.equal(car.contacts,4);assert.ok(car.wheelie<.01);
 step({...drive,down:true},240);step({...stopped,down:true},180);assert.ok(car.wheelie<.01);assert.equal(car.contacts,4);
 car.reset();assert.equal(car.wheelie,0);assert.equal(car.boostRemaining,0);
 car.spec=CARS[0];step(stopped,120);step({...drive,down:true},360);assert.equal(car.wheelie,0,'cars ignore Ctrl');assert.ok(Math.abs(car.collider.halfExtents().x-.88)<1e-6);p.world.free();
});
test('motorbike autopilot follows a curved road without leaving its paved width',async()=>{
 const p=await new PhysicsWorld().init();p.mesh(roadRibbon(roads.main,0,roads.main.samples.length-1,-10.3,10.3));
 const car=new VehiclePhysics(p,roads,{...defaults});car.spec=CARS.find(c=>c.id==='pulse')!;car.teleport(roads.main,120);
 for(let i=0;i<150;i++){car.preStep(stopped,1/120);p.world.step();car.postStep(1/120);}
 const pilot=new Autopilot(roads);pilot.toggle(car);let worst=0;
 for(let i=0;i<3000;i++){car.preStep(pilot.controls(car,78),1/120);p.world.step();car.postStep(1/120);worst=Math.max(worst,roads.nearest(car.position.x,car.position.z).distance);}
 assert.ok(car.distance>300);assert.ok(worst<8,`bike left road: ${worst}`);assert.ok(car.contacts>=2);p.world.free();
});
test('road shoulders provide upward solid support all the way past both guardrails',async()=>{
 const p=await new PhysicsWorld().init();let checks=0;
 for(const road of roads.roads) {
  const g=roadRibbon(road,0,road.samples.length-1,-road.width/2-2.3,road.width/2+2.3);p.mesh(g);g.dispose();
  const shoulder=roadRibbon(road,0,road.samples.length-1,-road.width/2,-road.width/2-2.3),normal=shoulder.getAttribute('normal');
  for(let i=0;i<normal.count;i++)assert.ok(normal.getY(i)>.9);shoulder.dispose();
 }
 p.world.step();
 for(const road of roads.roads)for(let i=1;i<road.samples.length-1;i+=7)for(const side of [-1,1])for(const width of [.02,.6,1.3,1.8,2.2]) {
  const a=road.samples[i],b=road.samples[i+1],point=a.p.clone().lerp(b.p,.5).addScaledVector(a.r.clone().lerp(b.r,.5),side*(road.width/2+width));
  point.y=T.MathUtils.lerp(roadHeight(a,side*(road.width/2+width)),roadHeight(b,side*(road.width/2+width)),.5);
  const hit=p.world.castRay(new R.Ray({x:point.x,y:point.y+2,z:point.z},{x:0,y:-1,z:0}),3,true);
  assert.ok(hit,`${road.name} shoulder missing at ${i}/${side}/${width}`);assert.ok(Math.abs(hit.timeOfImpact-2)<.025);checks++;
 }
 console.log({solidShoulderChecks:checks});p.world.free();
});
test('car straddling asphalt and shoulder keeps four-wheel contact and drives back out',async()=>{
 const p=await new PhysicsWorld().init();p.mesh(roadRibbon(roads.main,0,roads.main.samples.length-1,-10.3,10.3));
 const car=new VehiclePhysics(p,roads,{...defaults});car.teleport(roads.main,140,8.2);
 for(let i=0;i<150;i++){car.preStep(stopped,1/120);p.world.step();car.postStep(1/120);}
 assert.equal(car.contacts,4);assert.ok(car.position.y-roads.nearest(car.position.x,car.position.z).height>.4);
 for(let i=0;i<150;i++){car.preStep({...drive,steer:.45},1/120);p.world.step();car.postStep(1/120);}
 assert.ok(car.speed>4);assert.ok(roads.nearest(car.position.x,car.position.z).offset<7.5);assert.ok(car.position.y-roads.nearest(car.position.x,car.position.z).height>.35);p.world.free();
});
test('vehicle models have distinct silhouettes, two visible bike wheels and valid animation pivots',()=>{
 const sizes:Record<string,T.Vector3>={};
 for(const spec of CARS.slice(3)) {
  const visual=makeVehicle(spec);visual.root.updateMatrixWorld(true);sizes[spec.id]=new T.Box3().setFromObject(visual.root).getSize(new T.Vector3());
  assert.equal(visual.steers.length,4);assert.equal(visual.wheels.length,4);
  if(isBike(spec)){assert.equal(visual.steers.filter(w=>w.visible).length,2);assert.ok(sizes[spec.id].x<1.1);}
  visual.root.traverse(o=>{if(o instanceof T.Mesh){assert.ok([...o.geometry.getAttribute('position').array].every(Number.isFinite));}});
 }
 assert.ok(sizes.atlas.y>sizes.comet.y*1.3);assert.ok(sizes.atlas.z>sizes.comet.z);
});
test('free street bike is available on existing saves; new vehicle purchases and setup persist',()=>{
 const data=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>data.get(k)||null,setItem:(k:string,v:string)=>data.set(k,v)}});
 data.set('redline-horizon-v1',JSON.stringify({coins:300,ownedCars:['vanta'],selectedCar:'vanta'}));
 const save=new SaveManager();assert.ok(save.ownedCars.has('pulse'));assert.equal(save.buyOrSelect('pulse'),'selected');assert.equal(save.coins,300);
 assert.equal(save.buyOrSelect('spectre'),'bought');assert.equal(save.buyUpgrade('engine-ecu'),'bought');
 const loaded=new SaveManager();assert.equal(loaded.selectedCar,'spectre');assert.equal(loaded.coins,20);assert.equal(loaded.loadout.engine,'engine-ecu');assert.ok(loaded.ownedCars.has('pulse'));
});
