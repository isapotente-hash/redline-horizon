import * as T from 'three';
import {Road, RoadNetwork,roadHeight} from './RoadNetwork';
import {TerrainSampler} from './TerrainSampler';

/** A shared, indexed sweep: visuals and physics use exactly the same boundary. */
export function sweep(road:Road,start:number,end:number,profile:readonly (readonly [number,number])[],closed=false){
  const vertices:number[]=[],indices:number[]=[];
  for(let i=start;i<=end;i++){const s=road.samples[i];for(const [offset,height] of profile)vertices.push(s.p.x+s.r.x*offset,roadHeight(s,offset)+height,s.p.z+s.r.z*offset);}
  const n=profile.length;
  for(let i=0;i<end-start;i++)for(let j=0;j<(closed?n:n-1);j++){const a=i*n+j,b=i*n+(j+1)%n;indices.push(a,a+n,b,b,a+n,b+n);}
  if(closed){for(let j=1;j<n-1;j++){indices.push(0,j,j+1);const a=(end-start)*n;indices.push(a,a+j+1,a+j);}}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
export function barrierGeometry(road:Road,start:number,end:number,side:number){
  const o=side*(road.width/2+1.65),a=o-.32,b=o+.32;
  // A buried base and smooth vertical faces keep the solid boundary predictable.
  // Stone relief belongs in the material, never in wheel-contact geometry.
  const profile:[[number,number],[number,number],[number,number],[number,number]]=[[a,-.12],[b,-.12],[b,1.0],[a,1.0]];
  const g=sweep(road,start,end,profile,true),uv:number[]=[];
  for(let i=start;i<=end;i++)for(const [,h] of profile)uv.push(road.samples[i].d/3.2,h*.9);
  g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.name='Continuous dry stone wall';return g;
}
export function tunnelGeometry(road:Road,start:number,end:number){
  // Outward-facing wall and arch cross section. The open ends have no blocking caps.
  const w=road.width/2+2.0,profile:[number,number][]=[[-w,0],[-w,4.3]];
  for(let i=1;i<=24;i++){const theta=Math.PI-i*Math.PI/24;profile.push([Math.cos(theta)*w,4.3+Math.sin(theta)*4.6]);}
  profile.push([w,0]);return sweep(road,start,end,profile);
}
export function supportGeometry(road:Road,terrain:TerrainSampler){
  const v:number[]=[],ix:number[]=[],n=road.samples.length,inner=road.width/2+2.3,verge=road.width/2+14;
  for(const a of road.samples){const bridge=structureRange(terrain.roads,road,a.d,"bridge"),outer=bridge?inner+.05:verge;for(const o of [-outer,-inner,inner,outer]){
    const x=a.p.x+a.r.x*o,z=a.p.z+a.r.z*o;
    const side=Math.sign(o),edge=roadHeight(a,side*inner);
    v.push(x,Math.abs(o)>inner&&!bridge?Math.min(edge-.05,terrain.groundHeight(x,z)):roadHeight(a,o),z);
  }
  }
  for(let i=0;i<n-1;i++)for(let k=0;k<3;k++){const a=i*4+k;ix.push(a,a+1,a+4,a+1,a+5,a+4);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.setIndex(ix);g.computeVertexNormals();return g;
}
export function structureRange(network:RoadNetwork,road:Road,d:number,kind?:'tunnel'|'bridge'){
  return network.structures.find(s=>s.road===road&&(!kind||kind===s.kind)&&d>=s.start&&d<=s.end);
}
