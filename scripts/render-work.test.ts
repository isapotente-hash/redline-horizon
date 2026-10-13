import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {batchStaticParts,freezeScenery} from '../src/rendering/StaticScene';
import {makeVehicle} from '../src/vehicles/VehicleModels';
import {CARS} from '../src/vehicles/CarCatalog';
import {Particles} from '../src/effects/Particles';
import {defaults} from '../src/core/SaveManager';
import {VehiclePhysics} from '../src/physics/VehiclePhysics';
import {RemoteVehicle} from '../src/multiplayer/RemoteVehicle';

function vertices(root:T.Object3D){
 root.updateMatrixWorld(true);const result:string[]=[];
 root.traverse(o=>{if(!(o instanceof T.Mesh))return;const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry,p=g.attributes.position,v=new T.Vector3();
  for(let n=0;n<p.count;n++){v.fromBufferAttribute(p,n).applyMatrix4(o.matrixWorld);result.push(v.toArray().map(x=>x.toFixed(4)).join(','));}
 });return result.sort();
}
test('static batches retain geometry, materials, transparency and independently animated pivots',()=>{
 const root=new T.Group(),wheel=new T.Group(),paint=new T.MeshStandardMaterial(),glass=new T.MeshStandardMaterial({transparent:true,opacity:.5});wheel.name='wheel_FL';root.add(wheel);
 for(const parent of [root,wheel])for(let n=0;n<5;n++){
  const mesh=new T.Mesh(new T.BoxGeometry(1,1,1),paint);mesh.position.set(n*2,.3,n);mesh.rotation.y=.3*n;mesh.castShadow=true;parent.add(mesh);
 }
 const window=new T.Mesh(new T.BoxGeometry(),glass),pivot=new T.Mesh(new T.BoxGeometry(),paint);pivot.name='steering_wheel';root.add(window,pivot);
 const before=vertices(root);batchStaticParts(root);assert.deepEqual(vertices(root),before);
 assert.equal(root.getObjectByName('wheel_FL'),wheel);assert.equal(root.getObjectByName('steering_wheel'),pivot);assert.equal(window.parent,root);
 assert.equal(wheel.children.length,1);assert.equal(root.children.length,4);assert.equal((wheel.children[0] as T.Mesh).material,paint);assert.equal(wheel.children[0].castShadow,true);
 wheel.rotation.x=.4;const moved=vertices(root);assert.notDeepEqual(moved,before);batchStaticParts(root);assert.deepEqual(vertices(root),moved);
});

test('frozen scenery keeps world placement and instance edits without per-frame transform math',()=>{
 const scene=new T.Scene(),root=new T.Group(),group=new T.Group(),mesh=new T.InstancedMesh(new T.BoxGeometry(),new T.MeshBasicMaterial(),2);
 root.position.set(20,3,-50);group.position.set(4,2,1);group.rotation.y=.4;scene.add(root);root.add(group);group.add(mesh);freezeScenery(root);
 const before=mesh.matrixWorld.clone();let updates=0;root.traverse(o=>{const original=o.updateMatrix;o.updateMatrix=()=>{updates++;original.call(o);};});
 for(let n=0;n<30;n++)scene.updateMatrixWorld(true);assert.equal(updates,0);assert.deepEqual(mesh.matrixWorld,before);
 const instance=new T.Matrix4().makeTranslation(8,0,0);mesh.setMatrixAt(0,instance);mesh.instanceMatrix.needsUpdate=true;scene.updateMatrixWorld(true);const actual=new T.Matrix4();mesh.getMatrixAt(0,actual);assert.deepEqual(actual,instance);
 const dynamic=new T.Object3D();scene.add(dynamic);dynamic.position.x=7;scene.updateMatrixWorld(true);assert.equal(dynamic.matrixWorld.elements[12],7);
});

test('procedural vehicle bodies are batched while wheels, riders and dormant headlights stay independent',()=>{
 for(const id of ['atlas','comet','pulse']){
  const car=makeVehicle(CARS.find(c=>c.id===id)!);let visibleLights=0;car.root.traverseVisible(o=>{if(o instanceof T.Light)visibleLights++;});assert.equal(visibleLights,0);
  const meshes:T.Mesh[]=[];car.body.traverseVisible(o=>{if(o instanceof T.Mesh)meshes.push(o);});assert.ok(meshes.length<20,`${id}: ${meshes.length} body draws`);
  for(const wheel of car.wheels)assert.ok(wheel.parent);if(car.occupant){car.occupant.visible=false;assert.ok(car.body.children.includes(car.occupant));}
  for(const light of car.lights){light.visible=true;light.intensity=70;}car.root.updateMatrixWorld(true);assert.ok(car.lights.every(l=>l.visible&&l.intensity===70));
 }
});

test('multiplayer vehicle models never add invisible headlight work to the scene',()=>{
 const remote=new RemoteVehicle();let seq=0;
 for(const spec of CARS){remote.receive({t:'state',seq:++seq,car:spec.id,paint:'#ffffff',active:true,occupied:true,p:[0,0,0],q:[0,0,0,1],steer:0,spin:0,lean:0,pitch:0,brake:0,race:'',progress:0,finished:false,time:0},1000+seq*50);remote.update(1000+seq*50,true,new T.Vector3());remote.root.traverseVisible(o=>{assert.ok(!(o instanceof T.Light),'remote zero-intensity lights stay out of rendering');});}
});

test('idle effects stop drawing and uploading; new particles appear immediately and expire cleanly',()=>{
 const effect=new Particles(),car={shiftSerial:0,boostSerial:0,speed:0,slip:0,surface:'ASPHALT',contacts:4,position:new T.Vector3()} as unknown as VehiclePhysics;
 const versions=()=>Object.values(effect.geometry.attributes).map(a=>(a as T.BufferAttribute).version);
 const initial=versions();for(let n=0;n<60;n++)effect.update(1/60,car,defaults,true);assert.deepEqual(versions(),initial);
 const points=effect.root.children.find(o=>o instanceof T.Points)!;assert.equal(points.visible,false);
 effect.emit(new T.Vector3(),new T.Color('red'),1);assert.equal(points.visible,true);assert.ok(effect.alphas[0]>0);effect.update(1/60,car,defaults,true);assert.notDeepEqual(versions(),initial);
 for(let n=0;n<120;n++)effect.update(1/60,car,defaults,true);assert.equal(points.visible,false);assert.equal(effect.alphas[0],0);const expired=versions();effect.update(1/60,car,defaults,true);assert.deepEqual(versions(),expired);
 effect.explode(new T.Vector3(10,2,5),1);effect.update(1/60,car,defaults,true);assert.equal(points.visible,true);assert.ok(effect.flash.intensity>0);
});
