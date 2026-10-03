import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {InputManager} from '../src/input/InputManager';
import {WalkingTouchControls} from '../src/input/WalkingTouchControls';
import {CameraManager} from '../src/camera/CameraManager';

function input() {
  (globalThis as any).addEventListener=()=>{};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{getGamepads:()=>[]}});
  return new InputManager();
}
class Surface extends EventTarget {
  style={transform:''};captures=new Set<number>();locks=0;
  setPointerCapture(id:number){this.captures.add(id);}
  hasPointerCapture(id:number){return this.captures.has(id);}
  releasePointerCapture(id:number){this.captures.delete(id);}
  requestPointerLock(){this.locks++;return Promise.resolve();}
  getBoundingClientRect(){return {left:0,top:0,width:128,height:128};}
}
function pointer(surface:Surface,name:string,id:number,x:number,y:number,type='touch',extra={}){
  const e=new Event(name,{cancelable:true});Object.assign(e,{pointerId:id,clientX:x,clientY:y,pointerType:type,button:0,movementX:0,movementY:0,...extra});surface.dispatchEvent(e);
}
test('walking uses immediate camera-relative axes, cancels opposite keys and normalizes diagonals; vehicle controls retain damping and bindings',()=>{
  const i=input();i.keys.add('KeyW');i.keys.add('KeyD');i.keys.add('Space');
  const driving=i.read(.1);assert.equal(driving.throttle,1);assert.equal(driving.handbrake,true);assert.ok(driving.steer<0&&driving.steer>-1);
  i.touch.add('KeyS');i.setMovementMode(false);assert.equal(i.touch.size,0);
  let walk=i.readFoot();assert.ok(Math.abs(Math.hypot(walk.forward,walk.right)-1)<1e-10);assert.ok(walk.right>0&&walk.forward>0);
  assert.equal(i.read(.1).throttle,0);assert.equal(i.read(.1).handbrake,false);
  i.keys.add('KeyS');i.keys.add('KeyA');assert.deepEqual(i.readFoot(),{forward:0,right:0});
  i.clear();i.keys.add('ArrowLeft');assert.deepEqual(i.readFoot(),{forward:0,right:-1});
  i.touch.add('KeyW');i.keys.clear();assert.deepEqual(i.readFoot(),{forward:0,right:0},'vehicle touch keys cannot walk');
  i.setFootMovement(.4,.3);assert.deepEqual(i.readFoot(),{forward:.4,right:.3});
  i.setMovementMode(true);assert.deepEqual(i.readFoot(),{forward:0,right:0});assert.equal(i.read(.1).throttle,0);
  i.keys.add('ArrowUp');assert.equal(i.read(.1).throttle,1);
});
test('two mobile fingers walk in any direction and look independently; release, cancellation and lost capture reset the correct gesture',()=>{
  const i=input();i.setMovementMode(false);const joystick=new Surface(),thumb=new Surface(),look=new Surface(),doc=new EventTarget();
  (globalThis as any).document=doc;const rotations:number[][]=[];
  const controls=new WalkingTouchControls(joystick as any,thumb as any,look as any,i,(x,y)=>rotations.push([x,y]));controls.setEnabled(true);
  pointer(joystick,'pointerdown',1,64,64);assert.deepEqual(i.readFoot(),{forward:0,right:0});
  pointer(joystick,'pointermove',1,120,8);const walk=i.readFoot();assert.ok(walk.forward>.7&&walk.right>.7);assert.ok(Math.hypot(walk.forward,walk.right)<=1.000001);
  pointer(look,'pointerdown',2,200,100);pointer(look,'pointermove',2,230,120);assert.deepEqual(rotations,[[30,20]]);assert.deepEqual(i.readFoot(),walk);
  pointer(joystick,'pointermove',2,0,0);assert.deepEqual(i.readFoot(),walk,'look finger cannot steal movement');
  pointer(look,'pointercancel',2,230,120);pointer(look,'pointermove',2,240,130);assert.equal(rotations.length,1);assert.deepEqual(i.readFoot(),walk);
  for(const release of ['pointerup','pointercancel','lostpointercapture']){
    pointer(joystick,'pointerdown',1,64,10);pointer(joystick,release,1,64,10);assert.deepEqual(i.readFoot(),{forward:0,right:0});assert.equal(thumb.style.transform,'');
  }
  controls.dispose();
});
test('mobile gestures are disabled in driving/menus, ignore mouse input and reset on pause, blur and visibility loss',()=>{
  const events=new EventTarget();(globalThis as any).addEventListener=events.addEventListener.bind(events);
  const i=new InputManager();i.setMovementMode(false);const joystick=new Surface(),thumb=new Surface(),look=new Surface(),doc=new EventTarget() as EventTarget&{hidden:boolean};doc.hidden=false;(globalThis as any).document=doc;
  const controls=new WalkingTouchControls(joystick as any,thumb as any,look as any,i,()=>assert.fail('inactive look'));
  pointer(joystick,'pointerdown',1,120,64);assert.equal(i.readFoot().right,0);
  controls.setEnabled(true);pointer(joystick,'pointerdown',1,120,64,'mouse');assert.equal(i.readFoot().right,0);
  for(const stop of [()=>controls.setEnabled(false),()=>events.dispatchEvent(new Event('blur')),()=>{doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));}]){
    controls.setEnabled(true);pointer(joystick,'pointerdown',1,120,64);assert.equal(i.readFoot().right,1);stop();assert.equal(i.readFoot().right,0);assert.equal(thumb.style.transform,'');
  }
  controls.setEnabled(false);i.setMovementMode(true);pointer(joystick,'pointerdown',1,120,64);assert.equal(i.read(.1).throttle,0);controls.dispose();
});
test('desktop foot mouse look captures on click, continues after release and stops on pause/entry; mobile canvas leaves look to its right-side zone',()=>{
  const canvas=new Surface(),camera=new T.PerspectiveCamera(),rig=new CameraManager(camera,canvas as any),visual=new T.Object3D();
  const doc={pointerLockElement:null as any,exitPointerLock:()=>{doc.pointerLockElement=null;}};(globalThis as any).document=doc;
  rig.startFoot(visual);pointer(canvas,'pointerdown',1,100,100,'mouse');assert.equal(canvas.locks,1);doc.pointerLockElement=canvas;
  pointer(canvas,'pointerup',1,100,100,'mouse');const yaw=rig.orbitYaw;
  pointer(canvas,'pointermove',1,100,100,'mouse',{movementX:30,movementY:20});assert.ok(Math.abs(rig.orbitYaw-yaw+.18)<1e-8);
  canvas.setPointerCapture=()=>assert.fail('pointer capture must not be requested while mouse is locked');
  pointer(canvas,'pointerdown',1,100,100,'mouse');
  rig.setFootInputEnabled(false);assert.equal(doc.pointerLockElement,null);const paused=rig.orbitYaw;rig.lookFoot(100,100);assert.equal(rig.orbitYaw,paused);
  rig.setFootInputEnabled(true);rig.lookFoot(0,10000);assert.equal(rig.orbitPitch,1.35);rig.stopFoot();rig.lookFoot(100,100);assert.equal(rig.orbitYaw,paused);rig.dispose();
  const mobile=new CameraManager(camera,canvas as any,true);mobile.startFoot(visual);const before=mobile.orbitYaw;
  pointer(canvas,'pointerdown',2,100,100);pointer(canvas,'pointermove',2,200,200);assert.equal(mobile.orbitYaw,before);mobile.lookFoot(20,0);assert.notEqual(mobile.orbitYaw,before);mobile.dispose();
});
