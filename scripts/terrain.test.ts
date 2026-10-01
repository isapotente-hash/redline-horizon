import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {RoadNetwork,roadHeight} from '../src/world/RoadNetwork';
import {TerrainSampler} from '../src/world/TerrainSampler';
import {makeTreeVariants} from '../src/world/TreeModel';

function meshHeight(g:T.BufferGeometry,x:number,z:number,x0:number,z0:number,size:number,n:number){
 const step=size/n,fx=(x-x0)/step,fz=(z-z0)/step,i=Math.min(n-1,Math.max(0,Math.floor(fx))),j=Math.min(n-1,Math.max(0,Math.floor(fz))),u=fx-i,v=fz-j;
 const p=g.getAttribute('position'),a=j*(n+1)+i,h00=p.getY(a),h10=p.getY(a+1),h01=p.getY(a+n+1),h11=p.getY(a+n+2);
 return u+v<=1?h00*(1-u-v)+h10*u+h01*v:h11*(u+v-1)+h10*(1-v)+h01*(1-u);
}
test('near and distant terrain stay beneath all roads, edges and shoulders',()=>{
 const roads=new RoadNetwork(),sampler=new TerrainSampler(roads),farTiles=new Map<string,T.BufferGeometry>(),chunks=new Map<string,T.BufferGeometry>();
 let checks=0,minGap=Infinity;
 for(const road of roads.roads)for(let i=0;i<road.samples.length-1;i+=2){
  const a=road.samples[i],b=road.samples[i+1];
  for(const f of [.2,.8])for(const lane of [-1,-.5,0,.5,1]){
   const offset=(road.width/2+1.6)*lane,x=T.MathUtils.lerp(a.p.x+a.r.x*offset,b.p.x+b.r.x*offset,f),z=T.MathUtils.lerp(a.p.z+a.r.z*offset,b.p.z+b.r.z*offset,f),height=T.MathUtils.lerp(roadHeight(a,offset),roadHeight(b,offset),f);
   const cx=Math.floor(x/256),cz=Math.floor(z/256),key=`${cx},${cz}`;
   if(!chunks.has(key))chunks.set(key,sampler.geometry(cx*256,cz*256,256,24));
   const fx=Math.floor(x/1024)*1024,fz=Math.floor(z/1024)*1024,fkey=`${fx},${fz}`;
   if(!farTiles.has(fkey))farTiles.set(fkey,sampler.geometry(fx,fz,1024,16,2));
   const near=meshHeight(chunks.get(key)!,x,z,cx*256,cz*256,256,24),distant=meshHeight(farTiles.get(fkey)!,x,z,fx,fz,1024,16),gap=height-Math.max(near,distant);
   assert.ok(gap>.20,`${road.name} at ${x.toFixed(1)},${z.toFixed(1)} covered by terrain: gap=${gap}`);
   if(lane===0)assert.equal(sampler.vegetationClear(x,z,6),false);
   minGap=Math.min(minGap,gap);checks++;
  }
 }
 console.log(JSON.stringify({terrainRoadChecks:checks,minimumGapMeters:minGap,terrainChunks:chunks.size}));
 for(const g of chunks.values())g.dispose();for(const g of farTiles.values())g.dispose();
});
test('neighboring terrain chunks share the same boundary heights',()=>{
 const sampler=new TerrainSampler(new RoadNetwork()),a=sampler.geometry(-256,-1024,256,24),b=sampler.geometry(0,-1024,256,24);
 for(let j=0;j<=24;j++)assert.ok(Math.abs(a.getAttribute('position').getY(j*25+24)-b.getAttribute('position').getY(j*25))<1e-5);
 a.dispose();b.dispose();
});
test('tree variants contain detailed branches, colored foliage and lighter distant meshes',()=>{
 for(const tree of makeTreeVariants()){
  assert.ok(tree.near.height>7&&tree.near.height<14);
  assert.ok(tree.near.radius>2&&tree.near.radius<7.5);
  assert.ok(tree.near.foliage.getAttribute('position').count>tree.far.foliage.getAttribute('position').count*4);
  for(const level of [tree.near,tree.far])for(const g of [level.wood,level.foliage]){assert.equal(g.getAttribute('position').count,g.getAttribute('color').count);assert.ok([...g.getAttribute('position').array].every(Number.isFinite));g.dispose()}
 }
});
