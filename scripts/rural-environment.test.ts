import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {asphaltMaterial,dryFieldTexture,dryStoneMaterial} from '../src/rendering/RuralMaterials';import {DryGrass} from '../src/world/DryGrass';
import {barrierGeometry} from '../src/world/CollisionGeometry';import {RoadNetwork,roadHeight} from '../src/world/RoadNetwork';import {TerrainSampler} from '../src/world/TerrainSampler';
const roads=new RoadNetwork();
test('asphalt is neutral grey with real aggregate relief; wall textures contain stone, crevices and upright coping',()=>{
 const road=asphaltMaterial(),stone=dryStoneMaterial(),field=dryFieldTexture();
 const pixels=road.map!.image.data as Uint8Array;let min=255,max=0;for(let i=0;i<pixels.length;i+=4){min=Math.min(min,pixels[i]);max=Math.max(max,pixels[i]);assert.ok(Math.abs(pixels[i]-pixels[i+1])<=1);}assert.ok(min>=55&&max-min>40);assert.notEqual(road.bumpMap,road.map);assert.equal(road.metalness,0);assert.ok(road.roughness>.9);
 const image=stone.map!.image,tones=new Set<number>();for(let i=0;i<image.data.length;i+=4)tones.add(image.data[i]);assert.ok(tones.size>80);assert.equal(image.width,512);assert.equal(image.height,256);assert.equal(stone.metalness,0);assert.ok(stone.bumpScale>.04);
 for(const t of [road.map,road.bumpMap,stone.map,stone.bumpMap,field]){assert.ok(t!.image.width<=512);assert.equal(t!.wrapS,T.RepeatWrapping);assert.ok(t!.generateMipmaps);t!.dispose();}road.dispose();stone.dispose();
});
test('dry stone walls follow grades continuously, keep clear of pavement and have no rugged collision spikes',()=>{
 for(const road of roads.roads)for(const side of [-1,1]){
  const g=barrierGeometry(road,0,road.samples.length-1,side),p=g.getAttribute('position'),uv=g.getAttribute('uv');assert.equal(p.count,uv.count);
  for(let i=0;i<p.count;i++){
   const a=road.samples[Math.floor(i/4)],offset=(p.getX(i)-a.p.x)*a.r.x+(p.getZ(i)-a.p.z)*a.r.z;
   assert.ok(Math.abs(offset)>road.width/2+1.3-.001);const h=p.getY(i)-roadHeight(a,offset);assert.ok(h>=-.121&&h<=1.001);assert.ok(Number.isFinite(uv.getX(i)));
  }
  const split=Math.min(80,road.samples.length-2),b=barrierGeometry(road,split,Math.min(split+80,road.samples.length-1),side),q=b.getAttribute('position');for(let j=0;j<4;j++)for(let axis=0;axis<3;axis++)assert.equal(p.getComponent(split*4+j,axis),q.getComponent(j,axis));b.dispose();g.dispose();
 }
});
test('shared grass blades are bounded, rooted outside all roads and culled by distance/quality',()=>{
 const grass=new DryGrass(),terrain=new TerrainSampler(roads);const a=terrain.geometry(-256,0,256,24),b=terrain.geometry(0,0,256,24);for(let j=0;j<=24;j++)assert.equal(a.getAttribute('uv').getX(j*25+24),b.getAttribute('uv').getX(j*25));a.dispose();b.dispose();assert.ok(grass.geometry.index!.count/3<=40);const mesh=grass.batch(4);grass.plant(mesh,0,10,0,0,1);mesh.computeBoundingSphere();assert.equal(grass.visible(mesh,new T.Vector3(0,10,2)),true);assert.equal(grass.visible(mesh,new T.Vector3(0,10,200)),false);
 const work=grass.field(-1,0,roads,terrain);let next=work.next();while(!next.done)next=work.next();const field=next.value,m=new T.Matrix4(),p=new T.Vector3();assert.ok(field.count<=640);
 for(let i=0;i<field.count;i++){field.getMatrixAt(i,m);p.setFromMatrixPosition(m);assert.ok(terrain.vegetationClear(p.x,p.z,.5));assert.ok(Math.abs(p.y-terrain.groundHeight(p.x,p.z)+.02)<.0001);}
 const total=field.count;grass.update({quality:'low'} as any);grass.visible(field,new T.Vector3());assert.equal(field.count,Math.floor(total*.4));grass.update({quality:'high'} as any);grass.visible(field,new T.Vector3());assert.equal(field.count,total);field.dispose();mesh.dispose();grass.geometry.dispose();grass.material.dispose();
});
