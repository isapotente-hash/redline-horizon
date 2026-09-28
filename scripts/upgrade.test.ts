import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {RoadNetwork} from '../src/world/RoadNetwork';
import {PhysicsWorld,VehiclePhysics} from '../src/physics/VehiclePhysics';
import {sceneryCollider} from '../src/world/SceneryCollider';
import {roadRibbon} from '../src/world/roadGeometry';
import {SaveManager,defaults} from '../src/core/SaveManager';
import {CoinManager} from '../src/world/CoinManager';
import {RaceManager} from '../src/racing/RaceManager';
import {CARS} from '../src/vehicles/CarCatalog';
const coast={throttle:0,brake:0,steer:0,handbrake:false,up:false,down:false};
function storage(){const data=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>data.get(k)||null,setItem:(k:string,v:string)=>data.set(k,v)}});return data;}
test('every road crossing has a common height and every road closes without a gap',()=>{
 const roads=new RoadNetwork();let crossings=0,maxGap=0;
 for(let ai=0;ai<roads.roads.length;ai++)for(let bi=ai+1;bi<roads.roads.length;bi++) {
 const ar=roads.roads[ai],br=roads.roads[bi];
 for(let i=0;i<ar.samples.length-1;i++)for(let k=0;k<br.samples.length-1;k++) {
 const a=ar.samples[i].p,b=ar.samples[i+1].p,c=br.samples[k].p,d=br.samples[k+1].p;
 if(Math.max(a.x,b.x)<Math.min(c.x,d.x)||Math.min(a.x,b.x)>Math.max(c.x,d.x)||Math.max(a.z,b.z)<Math.min(c.z,d.z)||Math.min(a.z,b.z)>Math.max(c.z,d.z))continue;
 const ux=b.x-a.x,uz=b.z-a.z,vx=d.x-c.x,vz=d.z-c.z,den=ux*vz-uz*vx;if(Math.abs(den)<1e-8)continue;
 const t=((c.x-a.x)*vz-(c.z-a.z)*vx)/den,u=((c.x-a.x)*uz-(c.z-a.z)*ux)/den;
 if(t<0||t>1||u<0||u>1)continue;
 const gap=Math.abs(T.MathUtils.lerp(a.y,b.y,t)-T.MathUtils.lerp(c.y,d.y,u));maxGap=Math.max(gap,maxGap);crossings++;
 assert.ok(gap<.015,`${ar.name}/${br.name}: ${gap}m vertical step`);
 assert.ok(roads.inJunction(a.x+t*ux,a.z+t*uz,24),'crossing must exclude rails');
 }}
 assert.ok(crossings>=20);
 for(const road of roads.roads){
 if(road.closed)assert.ok(road.samples[0].p.distanceTo(road.samples.at(-1)!.p)<1e-8);
 const g=roadRibbon(road,0,road.samples.length-1,-road.width/2,road.width/2),n=g.getAttribute('normal');
 for(let i=0;i<n.count;i++)assert.ok(n.getY(i)>.9,`${road.name}: inverted or steep road surface`);g.dispose();
 for(const sample of road.samples.slice(0,-1))assert.ok(roads.at(road,sample.d).p.distanceTo(sample.p)<1e-6,'navigation and physical road must agree');
 }
 console.log({crossings,maxGap,junctions:roads.junctions.length});
});
test('coins collect once, survive reload, and purchase/select only affordable owned cars',()=>{
 storage();const save=new SaveManager(),roads=new RoadNetwork(),coins=new CoinManager(roads,save),item=coins.items[0];
 const car={position:item.position.clone(),previousPosition:item.position.clone().add(new T.Vector3(0,0,2)),contacts:4} as VehiclePhysics;
 assert.ok(coins.items.length>250);assert.equal(coins.collect(car),5);assert.equal(coins.collect(car),0);
 assert.equal(save.buyOrSelect('apex'),'insufficient');assert.equal(save.selectedCar,'vanta');
 for(let i=0;i<23;i++)save.collectCoin(`test-${i}`);
 assert.equal(save.coins,120);assert.equal(save.buyOrSelect('kestrel'),'bought');assert.equal(save.coins,0);
 assert.equal(save.buyOrSelect('vanta'),'selected');assert.equal(save.buyOrSelect('kestrel'),'selected');assert.equal(save.coins,0);
 const restored=new SaveManager();assert.equal(restored.selectedCar,'kestrel');assert.ok(restored.ownedCars.has('kestrel'));
 const refreshed=new CoinManager(roads,restored);assert.equal(refreshed.items[0].active,false);assert.equal(refreshed.collect(car),0);
 assert.equal(save.buyOrSelect('unknown'),'invalid');
});
test('tree and rock colliders stop a speeding car and fire a single crash burst',async()=>{
 for(const kind of ['tree','rock'] as const){
 const p=await new PhysicsWorld().init(),roads=new RoadNetwork(),g=new T.IcosahedronGeometry(1,1);
 p.box(0,-.1,0,100,.2,100);
 const matrix=new T.Matrix4().compose(new T.Vector3(0,kind==='tree'?0:1,-14),new T.Quaternion(),new T.Vector3(2,2,2));
 const collider=sceneryCollider(p,{kind,matrix,height:8},g);assert.equal(collider.isSensor(),false);
 const car=new VehiclePhysics(p,roads,{...defaults});car.setPosition(0,.6,0,0);
 const step=()=>{car.preStep(coast,1/120);p.world.step();car.postStep(1/120)};
 for(let i=0;i<120;i++)step();car.body.setLinvel({x:0,y:0,z:-28},true);
 for(let i=0;i<180;i++)step();
 assert.ok(car.position.z>-15,`${kind}: passed through obstacle ${car.position.z}`);
 assert.equal(car.crashSerial,1,`${kind}: crash count ${car.crashSerial}`);
 p.world.free();g.dispose();
 }
});
test('hard ground landings explode; normal braking does not',async()=>{
 const p=await new PhysicsWorld().init(),roads=new RoadNetwork();p.box(0,-.1,0,1000,.2,1000);
 const car=new VehiclePhysics(p,roads,{...defaults});car.setPosition(0,15,0,0);
 for(let i=0;i<400;i++){car.preStep(coast,1/120);p.world.step();car.postStep(1/120);}
 assert.equal(car.crashSerial,1);assert.ok(car.contacts>=2);
 car.setPosition(0,.6,0,0);
 for(let i=0;i<120;i++){car.preStep(coast,1/120);p.world.step();car.postStep(1/120);}
 car.body.setLinvel({x:0,y:0,z:-30},true);
 for(let i=0;i<120;i++){car.preStep({...coast,brake:1},1/120);p.world.step();car.postStep(1/120);}
 assert.equal(car.crashSerial,1);p.world.free();
});
test('three-lap race requires all checkpoints on all laps; cancel removes opponents',async()=>{
 const p=await new PhysicsWorld().init(),roads=new RoadNetwork(),car=new VehiclePhysics(p,roads,{...defaults}),race=new RaceManager(roads,p);
 race.start(car,3);race.update(3.1,car);assert.equal(race.finish.visible,true);
 for(let i=0;i<race.count*3;i++){
  const at=race.gate.position;car.setPosition(at.x,at.y+.6,at.z,0);race.update(10,car);
  assert.equal(race.finished,i===race.count*3-1);
 }
 assert.equal(race.lap,3);race.cancel();assert.equal(race.active,false);assert.equal(race.finish.visible,false);
 for(const opponent of race.ai.cars)assert.ok(opponent.body.translation().y<-1900);
 p.world.free();
});
test('car catalog performance changes actual acceleration',async()=>{
 const speeds:number[]=[];
 for(const spec of [CARS[0],CARS[2]]){
 const p=await new PhysicsWorld().init(),roads=new RoadNetwork();p.box(0,-.1,0,1000,.2,1000);
 const car=new VehiclePhysics(p,roads,{...defaults});car.spec=spec;car.setPosition(0,.6,0,0);
 for(let i=0;i<600;i++){car.preStep({...coast,throttle:i<120?0:1},1/120);p.world.step();car.postStep(1/120);}
 speeds.push(car.speed);p.world.free();
 }
 assert.ok(speeds[1]>speeds[0]*1.1,`GT ${speeds[1]} vs standard ${speeds[0]}`);
});
