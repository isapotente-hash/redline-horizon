import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {SaveManager,defaults} from '../src/core/SaveManager';
import {PursuitRules} from '../src/police/PursuitRules';
import {PhysicsWorld,VehiclePhysics} from '../src/physics/VehiclePhysics';
import {RoadNetwork} from '../src/world/RoadNetwork';
import {World} from '../src/world/World';
import {TrafficManager} from '../src/vehicles/TrafficManager';
import {PoliceManager} from '../src/police/PoliceManager';
import {InputManager} from '../src/input/InputManager';
import {autopilotOverride} from '../src/vehicles/Autopilot';
function storage(value:any){let stored=JSON.stringify(value);Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>stored,setItem:(_:string,v:string)=>stored=v}});}
test('distance settings migrate, clamp invalid values and persist independently of graphics quality',()=>{
 storage({settings:{quality:'low'}});const save=new SaveManager();assert.equal(save.settings.renderDistance,1600);assert.equal(save.settings.simulationDistance,600);
 save.settings.renderDistance=2300;save.settings.simulationDistance=350;save.save();const again=new SaveManager();assert.equal(again.settings.renderDistance,2300);assert.equal(again.settings.simulationDistance,350);
 storage({settings:{renderDistance:99999,simulationDistance:-4}});const invalid=new SaveManager();assert.equal(invalid.settings.renderDistance,3000);assert.equal(invalid.settings.simulationDistance,250);
});
test('camera keys cannot override any assistance mode; manual driving keys remain independent',()=>{
 (globalThis as any).addEventListener=()=>{};Object.defineProperty(globalThis,'navigator',{configurable:true,value:{getGamepads:()=>[]}});
 const input=new InputManager();for(const key of ['KeyI','KeyJ','KeyO'])input.keys.add(key);
 const manual=input.read(.2),camera=input.readCamera();assert.equal(manual.throttle,0);assert.equal(manual.steer,0);assert.equal(camera.throttle,1);assert.equal(camera.steer,1);assert.equal(camera.up,true);
 for(const mode of ['full','steering','speed'] as const)assert.equal(autopilotOverride(mode,manual),false);
 input.keys.add('KeyW');input.keys.add('KeyD');assert.equal(input.read(.2).throttle,1);assert.ok(input.read(.2).steer<-.2);
});
test('enforcement permits 20 km/h excess and triggers only sustained speed beyond that threshold',()=>{
 for(const limit of [50,60,80]){const r=new PursuitRules();assert.equal(r.tick(10,limit+20,limit,Infinity),undefined);assert.equal(r.warning,0);assert.equal(r.tick(1,limit+21,limit,Infinity),undefined);assert.equal(r.tick(.51,limit+21,limit,Infinity),'start');}
});
const context=new Proxy({createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),measureText:()=>({width:10})},{get:(o,k)=>k in o?(o as any)[k]:()=>{}});
test('render focus can leave the car without moving simulation; both distance sliders change live residency',async()=>{
 (globalThis as any).document={createElement:()=>({getContext:()=>context})};
 const physics=await new PhysicsWorld().init(),roads=new RoadNetwork(),settings={...defaults,quality:'low' as const,renderDistance:500,simulationDistance:250},world=await new World(roads,physics,settings).init(),p=roads.at(roads.main,150).p;
 await world.prime(p);const near=()=>[...world.chunks.values()].filter(c=>!!c.collider).length;const initial=near();
 settings.simulationDistance=1000;await world.prime(p);assert.ok(near()>initial);const wide=near();
 const view=p.clone().add(new T.Vector3(-2500,0,0));world.update(p,true,view);assert.ok(near()>=initial);assert.ok([...world.chunks.values()].some(c=>c.collider&&Math.hypot(c.x*256-p.x,c.z*256-p.z)<450));
 settings.simulationDistance=250;world.update(p,true,view);assert.ok(near()<wide);
 settings.renderDistance=3000;world.update(p,false,p);const high=world.roadSectors.filter(s=>s.group.visible).length;settings.renderDistance=500;world.update(p,false,p);assert.ok(world.roadSectors.filter(s=>s.group.visible).length<high);
 physics.world.free();
});
test('off-screen traffic still ticks and collides, with no distant-body teleport impulse',async()=>{
 const physics=await new PhysicsWorld().init(),roads=new RoadNetwork(),traffic=new TrafficManager(roads,physics,2),p=roads.at(roads.main,200).p,c=traffic.cars[0];c.d=220;c.lane=-3;c.speed=12;traffic.recover(c);const before=c.d;
 traffic.update(1/120,p,'low',250,500,p.clone().add(new T.Vector3(4000,0,0)));assert.equal(c.root.visible,false);assert.equal(c.body.isEnabled(),true);assert.notEqual(c.d,before);
 c.d=4000;traffic.recover(c);traffic.update(1/120,p,'low',250,500,p);physics.world.step();assert.ok(c.body.isEnabled());assert.ok(c.root.position.distanceTo(p)<250);assert.ok(Math.hypot(c.body.linvel().x,c.body.linvel().z)<100);
 physics.world.free();
});
test('pursuit cars gain acceleration and brake/steer for a blocked lane',async()=>{
 storage({});const physics=await new PhysicsWorld().init(),roads=new RoadNetwork();physics.box(0,23.9,0,1000,.2,1000);const player=new VehiclePhysics(physics,roads,{...defaults}),police=new PoliceManager(roads,physics,new SaveManager());player.teleport(roads.main,320);police.rules.active=true;police.start(player);
 const u=police.units[0];assert.ok(u.car.spec.power>player.spec.power*1.5);assert.ok(u.car.spec.topSpeed*3.6>300);
 const h=roads.nearest(u.car.position.x,u.car.position.z);u.car.body.setLinvel({x:h.sample.t.x*25,y:0,z:h.sample.t.z*25},true);u.car.postStep(1/120);
 police.plan(u,player,[]);const clear={...u.input};
 const wall=roads.at(h.road,h.sample.d+12).p;physics.box(wall.x,wall.y+1,wall.z,4,2,4);physics.world.step();police.plan(u,player,[{road:h.road,d:h.sample.d+12,lane:h.offset,speed:0,direction:1}]);
 assert.ok(u.input.brake>clear.brake||Math.abs(u.input.steer)>Math.abs(clear.steer)+.01,'must respond to blocked lane');physics.world.free();
});
test('police close on a moving car through real road bends and grades',async()=>{
 const {TerrainSampler}=await import('../src/world/TerrainSampler');const {supportGeometry}=await import('../src/world/CollisionGeometry');const {Autopilot}=await import('../src/vehicles/Autopilot');
 storage({});const physics=await new PhysicsWorld().init(),roads=new RoadNetwork(),geometry=supportGeometry(roads.main,new TerrainSampler(roads));physics.mesh(geometry);geometry.dispose();
 const player=new VehiclePhysics(physics,roads,{...defaults}),police=new PoliceManager(roads,physics,new SaveManager()),pilot=new Autopilot(roads);player.teleport(roads.main,480,3);pilot.toggle(player);police.rules.active=true;police.start(player);let nearest=Infinity,offset=0;
 for(let i=0;i<5400;i++){
   police.preStep(1/120,player,false);player.preStep(pilot.controls(player,120),1/120);physics.world.step();player.postStep(1/120);police.postStep(1/120);
   if(i>240)for(const u of police.units){nearest=Math.min(nearest,u.car.position.distanceTo(player.position));const h=roads.nearest(u.car.position.x,u.car.position.z,false,roads.main);offset=Math.max(offset,Math.abs(h.offset));assert.ok(u.car.position.y>h.height-.5,'pursuit car left road support');}
 }
 console.log({pursuitClosestMeters:nearest,pursuitWorstOffset:offset});assert.ok(nearest<30);assert.ok(offset<9);physics.world.free();
});
