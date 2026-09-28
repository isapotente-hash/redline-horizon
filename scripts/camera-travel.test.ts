import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {CameraManager} from '../src/camera/CameraManager';
import {PhysicsWorld,VehiclePhysics} from '../src/physics/VehiclePhysics';
import {RoadNetwork} from '../src/world/RoadNetwork';import {defaults} from '../src/core/SaveManager';
const stopped={throttle:0,brake:1,steer:0,handbrake:true,up:false,down:false};
test('fast travel snaps the camera to the destination while ordinary driving retains smoothing',async()=>{
 const physics=await new PhysicsWorld().init(),roads=new RoadNetwork(),car=new VehiclePhysics(physics,roads,{...defaults}),camera=new T.PerspectiveCamera(),manager=new CameraManager(camera,{addEventListener:()=>{}} as any),visual=new T.Object3D();
 visual.position.copy(car.position);visual.quaternion.copy(car.rotation);manager.update(.016,car,visual,'drive',0,stopped);
 car.teleport(roads.roads.find(r=>r.name==='COPPER DUNES')!,600);visual.position.copy(car.position);visual.quaternion.copy(car.rotation);manager.update(.016,car,visual,'drive',1,stopped);
 assert.ok(camera.position.distanceTo(car.position)<15,'camera must not fly across kilometres of unloaded terrain');
 const before=camera.position.clone();visual.position.x+=1;manager.update(.016,car,visual,'drive',2,stopped);assert.ok(camera.position.distanceTo(before)<.5,'normal camera motion must remain damped');physics.world.free();
});
