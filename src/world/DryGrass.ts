import * as T from 'three';
import {rng} from '../core/math';
import type {Settings} from '../core/SaveManager';
import type {RoadNetwork} from './RoadNetwork';
import type {TerrainSampler} from './TerrainSampler';

/** Shared tapered blades: one instanced draw per local field/road sector, no alpha cards. */
export class DryGrass {
  readonly geometry:T.BufferGeometry;
  readonly material=new T.MeshStandardMaterial({name:'dry-golden-grass',vertexColors:true,roughness:1,side:T.DoubleSide});
  private readonly range={value:85};private density=1;
  private readonly dummy=new T.Object3D();
  constructor(){
    const positions:number[]=[],colors:number[]=[],indices:number[]=[],random=rng(2101),color=new T.Color();
    for(let b=0;b<7;b++){
      const angle=b*2.399,dx=Math.cos(angle),dz=Math.sin(angle),height=.36+random()*.38,width=.045+random()*.035,x=dx*random()*.19,z=dz*random()*.19,bend=.12+random()*.17,start=positions.length/3;
      color.set(b%3===0?'#887549':b%3===1?'#d8c38a':'#b6a267');
      for(let level=0;level<3;level++)for(const side of [-1,1]){
        const f=level/3,half=width*(1-f);positions.push(x+dx*bend*f*f-dz*half*side,height*f,z+dz*bend*f*f+dx*half*side);
        const shade=.67+f*.33;colors.push(color.r*shade,color.g*shade,color.b*shade);
      }
      positions.push(x+dx*bend,height,z+dz*bend);colors.push(color.r,color.g,color.b);
      indices.push(start,start+1,start+2,start+1,start+3,start+2,start+2,start+3,start+4,start+3,start+5,start+4,start+4,start+5,start+6);
    }
    this.geometry=new T.BufferGeometry();this.geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));this.geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));this.geometry.setIndex(indices);this.geometry.computeVertexNormals();
    this.material.customProgramCacheKey=()=> 'rural-grass-distance-v1';
    this.material.onBeforeCompile=shader=>{
      shader.uniforms.grassRange=this.range;
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float vGrassDistance;').replace('#include <project_vertex>','#include <project_vertex>\nvGrassDistance=length(mvPosition.xyz);');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float grassRange;varying float vGrassDistance;').replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
      float grassFade=1.-smoothstep(grassRange*.72,grassRange,vGrassDistance);
      float dither=fract(dot(gl_FragCoord.xy,vec2(.75487766,.56984029)));if(dither>grassFade)discard;`);
    };
  }
  update(settings:Settings){this.range.value={'very-low':0,low:45,medium:65,high:85,ultra:110}[settings.quality];this.density={'very-low':0,low:.4,medium:.65,high:1,ultra:1}[settings.quality];}
  batch(capacity:number){const mesh=new T.InstancedMesh(this.geometry,this.material,capacity);mesh.name='Dry field grass';mesh.count=0;mesh.receiveShadow=true;mesh.userData.grass=true;return mesh;}
  plant(mesh:T.InstancedMesh,x:number,y:number,z:number,yaw:number,scale:number){
    this.dummy.position.set(x,y-.02,z);this.dummy.rotation.set(0,yaw,0);this.dummy.scale.set(scale,.75+scale*.3,scale);this.dummy.updateMatrix();mesh.setMatrixAt(mesh.count++,this.dummy.matrix);
  }
  *field(x:number,z:number,roads:RoadNetwork,terrain:TerrainSampler){
    const mesh=this.batch(640),random=rng((x*7919)^(z*5741)^2922);
    for(let i=0;i<950;i++){
      if(i%20===0)yield;
      const px=(x+random())*256,pz=(z+random())*256;
      if(!terrain.vegetationClear(px,pz,.5))continue;
      const h=terrain.groundHeight(px,pz),region=roads.region(px,pz);
      if(h<3||h>320||['COPPER DUNES','DRY MESA','NOVA CITY','ZENITH INDUSTRIAL'].includes(region))continue;
      if(Math.abs(terrain.groundHeight(px+1,pz)-h)>1.1)continue;
      for(let tuft=0;tuft<4&&mesh.count<640;tuft++){
        const tx=px+(random()-.5)*1.4,tz=pz+(random()-.5)*1.4;
        if(!terrain.vegetationClear(tx,tz,.5))continue;
        const y=terrain.groundHeight(tx,tz);this.plant(mesh,tx,y,tz,random()*Math.PI*2,.7+random()*.9);
      }
      if(mesh.count===640)break;
    }
    mesh.computeBoundingSphere();mesh.userData.fieldCount=mesh.count;return mesh;
  }
  visible(mesh:T.InstancedMesh,p:T.Vector3){
    if(mesh.userData.fieldCount!==undefined)mesh.count=Math.floor(mesh.userData.fieldCount*this.density);
    if(this.density===0)return false;
    const b=mesh.boundingSphere;if(!b)return false;return b.center.distanceToSquared(p)<(this.range.value+b.radius)**2;
  }
}
