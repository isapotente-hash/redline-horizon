import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {PhysicsWorld,VehiclePhysics,R} from '../src/physics/VehiclePhysics';
import {RoadNetwork} from '../src/world/RoadNetwork';import {defaults} from '../src/core/SaveManager';
import {CARS} from '../src/vehicles/CarCatalog';import {OnFootPlayer} from '../src/player/OnFootPlayer';
import {CameraManager} from '../src/camera/CameraManager';import {AutopilotRoutes} from '../src/vehicles/AutopilotRoutes';
const stopped={throttle:0,brake:1,steer:0,handbrake:true,up:false,down:false};
const idle={...stopped,brake:0,handbrake:false};
async function fixture(){const physics=await new PhysicsWorld().init();physics.world.timestep=1/60;physics.box(0,-.1,0,200,.2,200);const roads=new RoadNetwork(),car=new VehiclePhysics(physics,roads,{...defaults});car.setPosition(0,.6,0,0);for(let i=0;i<90;i++){car.preStep(stopped,1/60);physics.world.step();car.postStep(1/60);}const foot=new OnFootPlayer(physics);return {physics,roads,car,foot};}
test('all vehicles exit onto solid ground, park without residual velocity and reuse the same capsule on re-entry',async()=>{
 const {physics,car,foot}=await fixture();const bodies=physics.world.bodies.len(),handle=foot.body.handle;
 for(const spec of CARS){car.spec=spec;car.setPosition(0,spec.kit==='pickup'?.7:.6,0,0);for(let i=0;i<90;i++){car.preStep(stopped,1/60);physics.world.step();car.postStep(1/60);}car.body.setLinvel({x:0,y:0,z:-50},true);car.speed=50;
  const parked=car.position.clone();assert.equal(foot.exit(car),true,spec.id);assert.equal(car.body.bodyType(),R.RigidBodyType.Fixed);assert.equal(car.body.linvel().z,0);assert.equal(car.speed,0);assert.ok(foot.position.y>.8&&foot.position.y<1);
  for(let i=0;i<120;i++){foot.preStep(idle,0,1/60);physics.world.step();foot.postStep();}
  assert.ok(foot.position.y>.8);assert.ok(car.position.distanceTo(parked)<1e-8);assert.equal(foot.enter(car),true,spec.id+' enter');assert.equal(car.body.bodyType(),R.RigidBodyType.Dynamic);assert.equal(foot.body.isEnabled(),false);assert.equal(foot.body.handle,handle);assert.equal(physics.world.bodies.len(),bodies);
 }
 physics.world.free();
});
test('blocked exits and airborne exits are rejected without stopping the car; re-entry has strict range and line of sight',async()=>{
 const {physics,car,foot}=await fixture();const wall1=physics.box(1.6,1,0,1,2,5),wall2=physics.box(-1.6,1,0,1,2,5);physics.world.step();car.speed=20;assert.equal(foot.exit(car),false);assert.equal(car.speed,20);assert.equal(car.body.bodyType(),R.RigidBodyType.Dynamic);
 physics.world.removeCollider(wall1,true);physics.world.removeCollider(wall2,true);physics.world.step();car.contacts=0;assert.equal(foot.exit(car),false);car.contacts=4;assert.equal(foot.exit(car),true);physics.world.step();
 foot.position.x=3;assert.equal(foot.enter(car),false);foot.position.x=1.6;assert.equal(foot.canEnter(car),true);
 physics.box(.9,1,0,.1,2,3);physics.world.step();assert.equal(foot.canEnter(car),false);foot.enter(car,true);physics.world.free();
});
test('walking uses collision sweeps, blocks at walls and does not fall off unloaded ground',async()=>{
 const {physics,car,foot}=await fixture();assert.ok(foot.exit(car));physics.world.step();const x=foot.position.x;physics.box(x,1,-3,4,2,.25);physics.world.step();
 for(let i=0;i<180;i++){foot.preStep({...idle,throttle:1},0,1/60);physics.world.step();foot.postStep();}
 assert.ok(foot.position.z> -2.75,'capsule must not cross wall');assert.ok(foot.position.z< -1.5,'walk must respond');assert.ok(foot.position.y>.8);
 const before=foot.position.clone();for(let i=0;i<60;i++){foot.preStep({...idle,steer:-1},0,1/60);physics.world.step();foot.postStep();}assert.ok(foot.position.x>before.x+3);
 // Missing support must not permit continued horizontal motion or a fall through the map.
 foot.body.setTranslation({x:99.5,y:.9,z:10},true);foot.body.setNextKinematicTranslation({x:99.5,y:.9,z:10});foot.position.set(99.5,.9,10);physics.world.step();
 for(let i=0;i<120;i++){foot.preStep({...idle,steer:-1},0,1/60);physics.world.step();foot.postStep();}
 assert.ok(foot.position.x<=100);assert.ok(foot.position.y>.7);physics.world.free();
});
test('tight chase places the chassis below screen centre; foot camera orbits without breaking translation sync',async()=>{
 const {physics,car,foot}=await fixture(),camera=new T.PerspectiveCamera(62,16/9,.1,1000),manager=new CameraManager(camera,{addEventListener:()=>{}} as any),visual=new T.Object3D();
 for(const spec of [CARS[0],CARS[3]]){car.spec=spec;car.teleportSerial++;visual.position.copy(car.position);visual.quaternion.copy(car.rotation);manager.update(0,car,visual,'drive',0,idle);camera.updateMatrixWorld();
  const point=visual.position.clone();point.y+=.3;point.project(camera);assert.ok(point.y<-.12&&point.y>-.8,`framing ${spec.id}: ${point.y}`);assert.ok(camera.position.distanceTo(visual.position)<6);
 }
 assert.ok(foot.exit(car));manager.startFoot(foot.root);manager.updateFoot(0,foot.root,car);const previous=camera.position.clone(),target=manager.target.clone();foot.root.position.z-=1;manager.updateFoot(1/60,foot.root,car);
 assert.ok(camera.position.clone().sub(previous).distanceTo(new T.Vector3(0,0,-1))<1e-7);assert.ok(manager.target.clone().sub(target).distanceTo(new T.Vector3(0,0,-1))<1e-7);manager.stopFoot();assert.equal(manager.mode,0);physics.world.free();
});
test('route window opens at four seconds before commit threshold, dismisses selection and expires without losing the route',()=>{
 const roads=new RoadNetwork(),road=roads.roads.find(r=>r.name==='NOVA CITY')!,routes=new AutopilotRoutes(roads);let c=routes.update(road,150,1,20,20,10)!;assert.ok(c);
 const threshold=50;routes.update(road,c.d-threshold-80.1,1,20,20,10);assert.equal(c.visible,false);
 routes.update(road,c.d-threshold-80,1,20,20,10);assert.equal(c.visible,true);assert.equal(c.expiresAt,14);
 assert.equal(routes.select(0),true);assert.equal(c.visible,false);assert.equal(c.dismissed,true);assert.equal(routes.choice,c);assert.equal(c.selected,0);
 routes.reset();c=routes.update(road,150,1,20,20,20)!;routes.update(road,c.d-threshold-80,1,20,20,20);assert.ok(c.visible);routes.update(road,c.d-threshold-79,1,20,20,24);assert.equal(c.visible,false);assert.equal(c.dismissed,true);
 routes.reset();c=routes.update(road,150,1,20,20,30)!;routes.update(road,c.d-threshold-80,1,20,0,30);assert.equal(c.visible,false,'not approaching');routes.update(road,c.d-49,1,20,20,31);assert.equal(c.visible,false);assert.equal(c.locked,true);
});

test('route HUD hides in the selection event and also clears itself at the deadline',async()=>{
 const {UI}=await import('../src/ui/UI');const boxes=new Map<string,any>();for(const id of ['route-choice','route-options','route-distance','route-hint'])boxes.set(id,{hidden:true,innerHTML:'',textContent:''});
 (globalThis as any).document={getElementById:(id:string)=>boxes.get(id)};
 const ui=Object.create(UI.prototype) as any;ui.save={settings:{autopilotMode:'full'}};
 const routes=new AutopilotRoutes(new RoadNetwork()),road=routes['roads'].roads.find(r=>r.name==='NOVA CITY')!;
 const choice=routes.update(road,150,1,20)!;choice.visible=true;choice.expiresAt=performance.now()/1000+4;
 ui.routeChoice(choice);assert.equal(boxes.get('route-choice').hidden,false);
 assert.ok(routes.select(0));ui.routeChoice(undefined);assert.equal(boxes.get('route-choice').hidden,true,'same event, without a render tick');
 choice.dismissed=false;choice.visible=true;choice.expiresAt=performance.now()/1000+.01;ui.routeChoice(choice);
 await new Promise(resolve=>setTimeout(resolve,25));assert.equal(boxes.get('route-choice').hidden,true);assert.equal(choice.visible,false);assert.equal(choice.dismissed,true);
});
