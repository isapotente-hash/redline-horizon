import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {PursuitRules} from '../src/police/PursuitRules';
import {SpeedZones} from '../src/police/SpeedZones';
import {PoliceManager} from '../src/police/PoliceManager';
import {RoadNetwork} from '../src/world/RoadNetwork';
import {TrafficManager} from '../src/vehicles/TrafficManager';
import {PhysicsWorld,VehiclePhysics,R} from '../src/physics/VehiclePhysics';
import {SaveManager,defaults} from '../src/core/SaveManager';
const stopped={throttle:0,brake:1,steer:0,handbrake:true,up:false,down:false};
function storage(){const data=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>data.get(k)||null,setItem:(k:string,v:string)=>data.set(k,v)}});}
test('posted zones match road sections; shoulders, air and unrestricted sections are exempt',()=>{
  const roads=new RoadNetwork(),zones=new SpeedZones(roads);
  for(const [d,limit] of [[120,80],[820,60],[1200,0],[1800,80],[3500,0]])assert.equal(zones.limitAt(roads.at(roads.main,d).p),limit);
  const city=roads.roads.find(r=>r.name==='NOVA CITY')!;
  assert.equal(zones.limitAt(roads.at(city,450).p),50);
  const a=roads.at(roads.main,120);assert.equal(zones.limitAt(a.p.clone().addScaledVector(a.r,40)),0);assert.equal(zones.limitAt(a.p.clone().add(new T.Vector3(0,10,0))),0);
});
test('speeding requires sustained excess; racing is exempt; escape and capture have clear timers',()=>{
  const r=new PursuitRules();assert.equal(r.tick(2,110,80,Infinity,true),undefined);assert.equal(r.active,false);
  r.tick(1,110,80,Infinity);r.tick(.1,80,80,Infinity);assert.equal(r.warning,0);
  assert.equal(r.tick(1.6,110,80,Infinity),'start');r.tick(2,0,0,6,false,true);assert.ok(r.active);r.tick(.1,20,0,6,false,true);assert.equal(r.capture,0);
  assert.equal(r.tick(3.1,0,0,6,false,true),'caught');r.finish(true);assert.equal(r.impound,5);assert.equal(r.active,false);
  r.tick(4,110,80,Infinity);assert.equal(r.active,false);r.tick(12,0,80,Infinity);
  r.tick(1.6,110,80,Infinity);r.tick(7,150,0,300);assert.ok(r.active);r.tick(.1,150,0,100);assert.equal(r.escape,0);
  assert.equal(r.tick(8.1,150,0,300),'escaped');assert.equal(r.impound,0);
});
test('fine persists, never overdraws coins, and preserves cars and upgrades',()=>{
  storage();const save=new SaveManager();save.coins=220;save.buyOrSelect('kestrel');save.buyUpgrade('engine-ecu');
  const owned=[...save.ownedCars],parts=[...save.ownedUpgrades.kestrel];
  save.coins=23;assert.equal(save.payFine(50),23);assert.equal(save.coins,0);assert.equal(save.payFine(50),0);
  const loaded=new SaveManager();assert.equal(loaded.coins,0);assert.deepEqual([...loaded.ownedCars],owned);assert.deepEqual(loaded.ownedUpgrades.kestrel,parts);
});
test('NPC contact stops pass-through and produces a physical wreck and crash burst',async()=>{
  const physics=await new PhysicsWorld().init(),roads=new RoadNetwork();physics.box(0,23.9,0,1000,.2,1000);
  const player=new VehiclePhysics(physics,roads,{...defaults}),traffic=new TrafficManager(roads,physics,1),npc=traffic.cars[0];
  npc.d=150;npc.lane=0;npc.direction=1;npc.speed=0;traffic.recover(npc);
  player.teleport(roads.main,125);const a=roads.at(roads.main,125);player.setPosition(a.p.x,a.p.y+.6,a.p.z,Math.atan2(-a.t.x,-a.t.z));
  for(let i=0;i<120;i++){player.preStep(stopped,1/120);physics.world.step();player.postStep(1/120);}
  player.body.setLinvel({x:a.t.x*28,y:0,z:a.t.z*28},true);
  let crashed=false;
  for(let i=0;i<240;i++){
    player.preStep({...stopped,brake:0,handbrake:false},1/120);
    if(!traffic.crashStep(npc,1/120,player.position))traffic.pose(npc,1/120);
    physics.world.step();player.postStep(1/120);traffic.collisions(player);crashed ||= npc.crashTime>0;
  }
  assert.ok(crashed);assert.equal(npc.body.bodyType(),R.RigidBodyType.Dynamic);assert.ok(player.speed<15);assert.ok(player.crashSerial>0);
  assert.ok(npc.root.position.distanceTo(roads.at(roads.main,150).p)>1,'NPC should react to impact');physics.world.free();
});
test('police cars physically close the gap and catch a stopped player, charging once',async()=>{
  storage();const physics=await new PhysicsWorld().init(),roads=new RoadNetwork();physics.box(0,23.9,0,1000,.2,1000);
  const save=new SaveManager();save.coins=90;
  const player=new VehiclePhysics(physics,roads,{...defaults}),police=new PoliceManager(roads,physics,save);
  const a=roads.at(roads.main,150);player.setPosition(a.p.x,24.6,a.p.z,Math.atan2(-a.t.x,-a.t.z));
  police.rules.active=true;police.start(player);
  const initial=police.units[0].car.position.distanceTo(player.position);let min=initial;
  for(let i=0;i<4800 && police.active;i++){
    police.preStep(1/120,player,false);player.preStep(stopped,1/120);physics.world.step();player.postStep(1/120);police.postStep(1/120);
    min=Math.min(min,police.units[0].car.position.distanceTo(player.position));
  }
  assert.ok(min<12,`police failed to approach: ${min} m from ${initial}`);
  assert.equal(police.active,false);assert.equal(save.coins,40);assert.ok(police.rules.impound>0);
  for(let i=0;i<240;i++)police.preStep(1/120,player,false);assert.equal(save.coins,40);
  physics.world.free();
});
