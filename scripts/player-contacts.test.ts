import test from 'node:test';import assert from 'node:assert/strict';
import {PhysicsWorld,VehiclePhysics,R} from '../src/physics/VehiclePhysics';
import {RoadNetwork} from '../src/world/RoadNetwork';import {defaults} from '../src/core/SaveManager';
import {PlayerContacts} from '../src/multiplayer/PlayerContacts';import {RemoteVehicle} from '../src/multiplayer/RemoteVehicle';import {Pose} from '../src/multiplayer/Protocol';
const pose=(seq:number,z=-12):Pose=>({t:'state',seq,car:'vanta',paint:'#b81120',active:true,p:[0,.6,z],q:[0,0,0,1],steer:0,spin:0,lean:0,pitch:0,brake:0,race:'',progress:0,finished:false,time:0});
async function rig(){const physics=await new PhysicsWorld().init();physics.box(0,-.1,0,200,.2,200);const car=new VehiclePhysics(physics,new RoadNetwork(),{...defaults});car.body.setTranslation({x:0,y:.6,z:0},true);car.body.setGravityScale(0,true);car.position.set(0,.6,0);const contacts=new PlayerContacts(physics,car),remote=new RemoteVehicle();return {physics,car,contacts,remote};}
test('solid multiplayer contact blocks a fast car; ghost mode passes through',async()=>{
 for(const solid of [true,false]){const {physics,car,contacts,remote}=await rig();try{
  car.body.setLinvel({x:0,y:0,z:-35},true);
  for(let i=0;i<100;i++){const now=1000+i*1000/120;remote.receive(pose(i),now);car.position.copy(car.body.translation());contacts.update(now,solid,[remote]);physics.world.step(undefined,contacts.hooks);}
  assert.ok(solid?car.body.translation().z>-9:car.body.translation().z<-20,`${solid}: ${car.body.translation().z}`);
 }finally{physics.world.free();}}
});
test('overlap activation waits for separation; stale and disconnected peers cannot become invisible walls',async()=>{
 const {physics,car,contacts,remote}=await rig();try{
  remote.receive(pose(1,0),1000);contacts.update(1000,true,[remote]);physics.world.step(undefined,contacts.hooks);assert.equal(car.body.translation().z,0);
  remote.receive(pose(2,-20),1100);contacts.update(1200,true,[remote]);
  const colliders:any[]=[];physics.world.forEachCollider(c=>{if(physics.peerColliderHandles.has(c.handle))colliders.push(c)});assert.equal(colliders.filter(c=>c.parent().isEnabled()).length,1);
  contacts.update(1900,true,[remote]);assert.equal(colliders.filter(c=>c.parent().isEnabled()).length,0);
  remote.receive(pose(3,-20),2000);contacts.update(2000,true,[remote]);assert.equal(colliders.filter(c=>c.parent().isEnabled()).length,1);
  remote.reset();contacts.update(2000,true,[remote]);assert.equal(colliders.filter(c=>c.parent().isEnabled()).length,0);
 }finally{physics.world.free();}
});
test('peer contact filters leave local traffic and environment physics independent',async()=>{
 const {physics,car,contacts}=await rig();try{
  assert.equal(contacts.hooks.filterContactPair(car.collider.handle,123),R.SolverFlags.COMPUTE_IMPULSE);
  assert.equal(contacts.hooks.filterContactPair(123,456),null);
 }finally{physics.world.free();}
});
