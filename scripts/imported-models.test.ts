import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CARS} from '../src/vehicles/CarCatalog';
import {SaveManager} from '../src/core/SaveManager';
for(const [name,limit,parts] of [['REVUELTO',80000,['FL','FR','RL','RR']],['MOTORCYCLE',30000,['FL','RL']]] as const) {
 test(`${name}: optimized embedded model has bounded geometry and separate animated wheels`,()=>{
  const bytes=readFileSync(new URL(`../assets/cars/${name}.glb`,import.meta.url));assert.equal(bytes.toString('utf8',0,4),'glTF');assert.equal(bytes.readUInt32LE(8),bytes.length);
  const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
  assert.ok(gltf.nodes.some((n:any)=>n.name==='body'));
  for(const p of parts){assert.ok(gltf.nodes.some((n:any)=>n.name===`wheel_${p}`));assert.ok(gltf.nodes.some((n:any)=>n.name===`steer_${p}`));}
  let triangles=0;
  for(const mesh of gltf.meshes)for(const p of mesh.primitives){const position=gltf.accessors[p.attributes.POSITION];assert.ok(position.min.every(Number.isFinite)&&position.max.every(Number.isFinite));triangles+=gltf.accessors[p.indices].count/3;}
  assert.ok(triangles>10000&&triangles<limit,`${triangles} triangles`);assert.ok(bytes.length<5_000_000);
  for(const image of gltf.images||[])assert.equal(image.uri,undefined,'textures must be embedded');
 });
}
test('Lamborghini is immediately available on existing saves',()=>{
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>JSON.stringify({ownedCars:['vanta'],selectedCar:'vanta',coins:23}),setItem:()=>{}}});
 const save=new SaveManager();assert.ok(CARS.some(c=>c.id==='revuelto'));assert.ok(save.ownedCars.has('revuelto'));assert.equal(save.buyOrSelect('revuelto'),'selected');assert.equal(save.coins,23);
});

import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createImportedVehicle} from '../src/vehicles/ImportedVehicles';
for(const [name,id] of [['REVUELTO','revuelto'],['MOTORCYCLE','pulse']])test(`${name}: actual model clones expose all traffic animation pivots`,async()=>{
 const bytes=readFileSync(new URL(`../assets/cars/${name}.glb`,import.meta.url));const oldLength=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.toString('utf8',20,20+oldLength));
 // CPU geometry/pivot test: omit textures so no browser image decoder is required.
 for(const mesh of gltf.meshes)for(const primitive of mesh.primitives)delete primitive.material;
 delete gltf.materials;delete gltf.textures;delete gltf.images;
 const json=Buffer.from(JSON.stringify(gltf)),padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);
 const binary=bytes.subarray(20+oldLength),buffer=Buffer.alloc(20+padded.length+binary.length);bytes.subarray(0,20).copy(buffer);buffer.writeUInt32LE(buffer.length,8);buffer.writeUInt32LE(padded.length,12);padded.copy(buffer,20);binary.copy(buffer,20+padded.length);
 const model=await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'');
 const spec=CARS.find(c=>c.id===id)!,visual=createImportedVehicle(model.scene,spec),clone=visual.root.clone(true);
 for(const suffix of ['FL','FR','RL','RR']){const wheel=clone.getObjectByName('wheel_'+suffix);assert.ok(wheel,`${id} traffic ${suffix}`);wheel.rotation.x+=.1;assert.ok(clone.getObjectByName('steer_'+suffix));}
 const second=createImportedVehicle(model.scene,spec);assert.notEqual(visual.paint,second.paint);assert.equal(visual.steers.filter(s=>s.visible).length,id==='pulse'?2:4);
 const size=new T.Box3().setFromObject(visual.root).getSize(new T.Vector3());assert.ok(size.y>1&&size.y<3);assert.ok(size.z>2&&size.z<6);assert.ok(size.x<(id==='pulse'?1.6:3));
});
