import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {CameraManager} from '../src/camera/CameraManager';
import {PhysicsClock} from '../src/core/PhysicsClock';
import {PhysicsWorld,VehiclePhysics,R} from '../src/physics/VehiclePhysics';
import {InputManager} from '../src/input/InputManager';
const input={throttle:0,brake:0,steer:0,handbrake:false,up:false,down:false};
class Canvas extends EventTarget{setPointerCapture(){} }
function fixture(){
 const canvas=new Canvas(),camera=new T.PerspectiveCamera(62,1,.1,1000),rig=new CameraManager(camera,canvas as any),visual=new T.Object3D();
 const car={teleportSerial:0,speed:35,bike:false,spec:{kit:'road'},body:{},physics:{world:{castRay:()=>null}},get position(){throw new Error('Camera read a raw physics position');},get rotation(){throw new Error('Camera read a raw physics rotation');}} as unknown as VehiclePhysics;
 return {canvas,camera,rig,visual,car};
}
test('chase camera and aim stay locked to interpolated translation at 30/60/144 Hz, jittered frames and CPU stalls',()=>{
 for(const cadence of [[1/30],[1/60],[1/144],[.008,.023,.013,.028,.007],[.016,.016,.2,.008]]){
  const {rig,camera,visual,car}=fixture(),clock=new PhysicsClock();let previous=0,current=0,now=0;
  rig.update(0,car,visual,'drive',0,input);const offset=camera.position.clone().sub(visual.position),aim=rig.target.clone().sub(visual.position);
  for(let i=0;i<1200;i++){
   const dt=cadence[i%cadence.length];now+=dt;clock.begin(dt,0);
   while(clock.take(i%7===0&&clock.accumulator<clock.step?7:0)){previous=current;current-=35*clock.step;}
   visual.position.z=T.MathUtils.lerp(previous,current,clock.alpha);
   rig.update(Math.min(dt,1/15),car,visual,'drive',now,input);
   assert.ok(camera.position.clone().sub(visual.position).distanceTo(offset)<1e-8,`relative camera oscillation at frame ${i}`);
   assert.ok(rig.target.clone().sub(visual.position).distanceTo(aim)<1e-8);
  }
  rig.dispose();
 }
});
test('clock preserves fractional render phase when dropping overdue ticks and stays bounded',()=>{
 const clock=new PhysicsClock();clock.begin(clock.step*.4,0);assert.equal(clock.take(0),false);
 clock.begin(clock.step*8.2,0);assert.equal(clock.take(0),true);assert.equal(clock.take(7),false);
 assert.ok(Math.abs(clock.alpha-.6)<1e-10);assert.ok(clock.accumulator<clock.step);
});
test('turning eases the chase offset; teleport, menu exit and mode switches reset history',()=>{
 const {rig,camera,visual,car}=fixture();rig.update(0,car,visual,'drive',0,input);
 const before=camera.position.clone();visual.rotation.y=Math.PI/2;rig.update(1/60,car,visual,'drive',0,input);
 assert.ok(camera.position.distanceTo(before)>.01);assert.ok(camera.position.distanceTo(before)<2,'turn must ease');
 visual.position.set(1000,20,400);car.teleportSerial++;rig.update(1/60,car,visual,'drive',0,input);assert.ok(camera.position.distanceTo(visual.position)<12);
 rig.update(1/60,car,visual,'menu',0,input);rig.update(1/60,car,visual,'drive',0,input);assert.ok(camera.position.x>visual.position.x,'reset to correct trailing side');
 rig.setMode(6);const direction=camera.getWorldDirection(new T.Vector3());rig.update(0,car,visual,'drive',0,input);assert.ok(camera.getWorldDirection(new T.Vector3()).dot(direction)>.999999,'free camera should preserve heading');
 const free=camera.position.clone();visual.position.x+=100;rig.update(1/60,car,visual,'drive',0,input);assert.ok(camera.position.distanceTo(free)<1e-8,'free camera must stay decoupled');
 rig.setMode(0);rig.update(1/60,car,visual,'drive',0,input);assert.ok(camera.position.distanceTo(visual.position)<12);rig.dispose();
});
test('static camera obstruction is solid; moving NPCs and sensors do not pump follow distance',async()=>{
 const physics=await new PhysicsWorld().init(),f=fixture();(f.car as any).physics=physics;(f.car as any).body=undefined;
 const wall=physics.box(0,2,4,10,5,.5);physics.world.step();f.rig.update(0,f.car,f.visual,'drive',0,input);assert.ok(f.camera.position.z<3.75);
 physics.world.removeCollider(wall,true);
 const body=physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0,2,4));physics.world.createCollider(R.ColliderDesc.cuboid(5,2.5,.25),body);physics.world.step();
 f.car.teleportSerial++;f.rig.update(0,f.car,f.visual,'drive',0,input);assert.ok(f.camera.position.z>7);
 f.rig.dispose();physics.world.free();
});
test('cancelled pointer capture stops dragging and dispose removes camera listeners',()=>{
 const {rig,canvas}=fixture();rig.setMode(5);const pointer=(name:string,x:number)=>{const e=new Event(name);Object.assign(e,{clientX:x,clientY:0,pointerId:1});canvas.dispatchEvent(e);};
 pointer('pointerdown',0);pointer('pointermove',20);assert.ok(rig.drag);pointer('pointercancel',20);const yaw=rig.orbitYaw;pointer('pointermove',40);assert.equal(rig.orbitYaw,yaw);
 rig.dispose();pointer('pointerdown',0);assert.equal(rig.drag,false);
});
test('disconnecting and reconnecting a held gamepad button generates a new action edge',()=>{
 (globalThis as any).addEventListener=()=>{};let pads:any[]=[];Object.defineProperty(globalThis,'navigator',{configurable:true,value:{getGamepads:()=>pads}});
 const controls=new InputManager();const pad={connected:true,id:'test',axes:[0],buttons:Array.from({length:10},(_,i)=>({pressed:i===3,value:i===3?1:0}))};
 pads=[pad];controls.read(1/60);assert.equal(controls.take('KeyC'),true);pads=[];controls.read(1/60);pads=[pad];controls.read(1/60);assert.equal(controls.take('KeyC'),true);
});
