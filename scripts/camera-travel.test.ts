import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {CameraManager} from '../src/camera/CameraManager';
import {PhysicsWorld,VehiclePhysics} from '../src/physics/VehiclePhysics';
import {RoadNetwork} from '../src/world/RoadNetwork';import {defaults} from '../src/core/SaveManager';
const stopped={throttle:0,brake:1,steer:0,handbrake:true,up:false,down:false};
test('fast travel snaps to destination; translation stays synchronized while turn offsets ease',async()=>{
 const physics=await new PhysicsWorld().init(),roads=new RoadNetwork(),car=new VehiclePhysics(physics,roads,{...defaults}),camera=new T.PerspectiveCamera(),manager=new CameraManager(camera,{addEventListener:()=>{}} as any),visual=new T.Object3D();
 visual.position.copy(car.position);visual.quaternion.copy(car.rotation);manager.update(.016,car,visual,'drive',0,stopped);
 car.teleport(roads.roads.find(r=>r.name==='COPPER DUNES')!,600);visual.position.copy(car.position);visual.quaternion.copy(car.rotation);manager.update(.016,car,visual,'drive',1,stopped);
 assert.ok(camera.position.distanceTo(car.position)<15,'camera must not fly across kilometres of unloaded terrain');
 const before=camera.position.clone();visual.position.x+=1;manager.update(.016,car,visual,'drive',2,stopped);
 assert.ok(camera.position.clone().sub(before).distanceTo(new T.Vector3(1,0,0))<1e-8,'camera must share the interpolated translation');
 const turnStart=camera.position.clone();visual.rotateY(.3);manager.update(.016,car,visual,'drive',3,stopped);
 const ideal=visual.position.clone().addScaledVector(new T.Vector3(0,0,-1).applyQuaternion(visual.quaternion),-7.3);ideal.y+=2.45;
 assert.ok(camera.position.distanceTo(turnStart)>.001,'camera should respond to the turn');
 assert.ok(camera.position.distanceTo(turnStart)<ideal.distanceTo(turnStart)*.5,'turn offset must remain damped');
 manager.dispose();physics.world.free();
});
