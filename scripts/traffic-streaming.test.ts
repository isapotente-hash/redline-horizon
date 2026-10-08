import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {TrafficManager} from '../src/vehicles/TrafficManager';import {trafficRange} from '../src/vehicles/TrafficRange';
import {RoadNetwork} from '../src/world/RoadNetwork';import {PhysicsWorld} from '../src/physics/VehiclePhysics';
const roads=new RoadNetwork();
test('traffic warning range grows with speed independently of 10 metre scenery budgets',()=>{
 for(const speed of [0,30,60,100,150]){const r=trafficRange(speed,10,10);assert.ok(r.visible>=(speed+40)*6);assert.ok(r.spawn>r.visible);assert.ok(r.retain>r.spawn);}
 assert.ok(trafficRange(100,10,10).visible>trafficRange(30,1000,500).visible);
});
test('high-speed traffic never appears near the driver; enabling and recycling set physical pose before contact',async()=>{
 const physics=await new PhysicsWorld().init(),traffic=new TrafficManager(roads,physics,12),player=new T.Vector3();let activations=0,recycles=0;
 try{
  assert.ok(traffic.cars.every(c=>!c.body.isEnabled()&&!c.root.visible));
  for(let frame=0;frame<1500;frame++){
   const speed=frame<300?35:100,point=roads.at(roads.main,150+frame*2);player.copy(point.p).addScaledVector(point.r,2);
   const before=traffic.cars.map(c=>({active:c.body.isEnabled(),position:c.root.position.clone()}));
   traffic.update(1/60,player,'very-low',10,10,player,speed);
   for(let i=0;i<traffic.cars.length;i++){
    const c=traffic.cars[i];if(!c.body.isEnabled())continue;
    const moved=c.root.position.distanceTo(before[i].position),created=!before[i].active||moved>5;
    if(created){activations++;if(before[i].active)recycles++;assert.ok(c.root.position.distanceTo(player)>trafficRange(speed,10,10).spawn-2,'unsafe spawn');assert.equal(c.root.visible,false,'spawn must be beyond visibility');const b=c.body.translation();assert.ok(Math.hypot(b.x-c.root.position.x,b.z-c.root.position.z)<1);}
    else assert.ok(moved<1,'resident car teleported');
    if(c.root.position.distanceTo(player)<200)assert.equal(c.root.visible,true,'nearby collision must be visible');
   }
   physics.world.step();
  }
  assert.ok(activations>=12);assert.ok(recycles>0);console.log({trafficActivations:activations,safeRecycles:recycles});
 }finally{physics.world.free();}
});
test('nearby traffic survives graphics budget changes and keeps its collider active',async()=>{
 const physics=await new PhysicsWorld().init(),traffic=new TrafficManager(roads,physics,1),c=traffic.cars[0],player=roads.at(roads.main,150).p.clone();
 try{c.d=200;c.lane=2;traffic.recover(c);c.body.setEnabled(true);c.root.visible=true;const original=c.root.position.clone();
  for(let i=0;i<120;i++){traffic.update(1/60,player,'very-low',i%2?10:1000,i%2?10:3000,player,80);physics.world.step();assert.ok(c.body.isEnabled());assert.ok(c.root.visible);assert.ok(c.root.position.distanceTo(original)<80);}
 }finally{physics.world.free();}
});
test('road ends cannot clamp respawns into the driver; inactive cars remain hidden and cannot collide',async()=>{
 const physics=await new PhysicsWorld().init(),traffic=new TrafficManager(roads,physics,8),road=roads.roads.find(r=>!r.closed)!,player=roads.at(road,road.length-10).p.clone();
 try{traffic.update(1/60,player,'very-low',10,10,player,120);for(const c of traffic.cars)if(c.body.isEnabled())assert.ok(c.root.position.distanceTo(player)>trafficRange(120,10,10).spawn-2);
  traffic.active=false;traffic.update(1/60,player,'very-low',10,10,player,120);assert.ok(traffic.cars.every(c=>!c.body.isEnabled()&&!c.root.visible));
 }finally{physics.world.free();}
});
test('wrecks never snap back into visible moving traffic after the crash timer expires',async()=>{
 const physics=await new PhysicsWorld().init(),traffic=new TrafficManager(roads,physics,1),c=traffic.cars[0],player=roads.at(roads.main,150).p.clone();
 try{c.d=200;traffic.recover(c);c.body.setEnabled(true);c.crashTime=.01;const original=c.root.position.clone();for(let i=0;i<120;i++)traffic.update(1/60,player,'very-low',10,10,player,60);assert.ok(c.crashTime>0);assert.ok(c.root.position.distanceTo(original)<.01);assert.equal(c.root.visible,true);}
 finally{physics.world.free();}
});
test('explicit race-grid recovery restores both visibility and physical collision',async()=>{
 const physics=await new PhysicsWorld().init(),traffic=new TrafficManager(roads,physics,1),c=traffic.cars[0];
 try{assert.equal(c.root.visible,false);traffic.recover(c);assert.equal(c.body.isEnabled(),true);assert.equal(c.root.visible,true);}
 finally{physics.world.free();}
});
