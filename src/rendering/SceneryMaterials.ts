import * as T from 'three';
import {rng} from '../core/math';

type Finish='brick'|'plaster'|'metal'|'glass';
const maps=new Map<Finish,T.DataTexture>();

/** One shared, mipmapped surface per finish; no downloaded assets or frame work. */
function facadeTexture(kind:Finish){
  const cached=maps.get(kind);if(cached)return cached;
  const size=256,data=new Uint8Array(size*size*4),random=rng(1567+['brick','plaster','metal','glass'].indexOf(kind)*391);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=(y*size+x)*4,grain=(random()-.5)*.10;let tone=1,reflection=0;
    if(kind==='brick'){
      const row=Math.floor(y/64),joint=y%64<4||(x+(row%2)*64)%128<4;
      tone=joint?.53:.81+grain+Math.sin(Math.floor((x+(row%2)*64)/128)*13+row*7)*.09;
    }else if(kind==='glass'){
      const edge=x<7||x>248||y<9||y>246;
      const blind=Math.floor(y/17)%2===0?.03:0;
      tone=edge?1.18:.48+grain*.2+blind+y/size*.17;reflection=edge?0:1;
    }else if(kind==='metal')tone=.80+grain*.25+Math.cos(x/size*Math.PI*32)*.11;
    else tone=.87+grain+Math.sin(x/size*Math.PI*6)*Math.cos(y/size*Math.PI*8)*.035;
    const v=Math.round(Math.max(0,Math.min(1,tone))*255);
    data[i]=v;data[i+1]=v;data[i+2]=kind==='glass'?Math.min(255,v+12):v;data[i+3]=Math.round(reflection*255);
  }
  const texture=new T.DataTexture(data,size,size);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;maps.set(kind,texture);return texture;
}

/** World coordinates survive merged city meshes and differently scaled instances. */
export function sceneryFinish<M extends T.MeshStandardMaterial>(material:M,kind:Finish):M{
  const texture=facadeTexture(kind);
  material.customProgramCacheKey=()=>`scenery-finish-v1-${kind}`;
  material.onBeforeCompile=shader=>{
    shader.uniforms.scenerySurface={value:texture};
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 sceneryWorld;varying vec3 sceneryNormal;');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec4 sceneryPoint=vec4(transformed,1.);vec3 sceneryN=normal;
      #ifdef USE_INSTANCING
        sceneryPoint=instanceMatrix*sceneryPoint;sceneryN=mat3(instanceMatrix)*sceneryN;
      #endif
      sceneryWorld=(modelMatrix*sceneryPoint).xyz;sceneryNormal=normalize(mat3(modelMatrix)*sceneryN);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D scenerySurface;varying vec3 sceneryWorld;varying vec3 sceneryNormal;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec3 sceneryFace=abs(sceneryNormal);
      float sceneryHorizontal=sceneryFace.x>sceneryFace.z?sceneryWorld.z:sceneryWorld.x;
      vec2 sceneryUV=sceneryFace.y>.8?sceneryWorld.xz:vec2(sceneryHorizontal,sceneryWorld.y);
      vec4 sceneryTexel=texture2D(scenerySurface,sceneryUV/${kind==='glass'?'vec2(2.8,3.6)':kind==='brick'?'vec2(1.2,.8)':kind==='metal'?'vec2(2.,4.)':'vec2(3.,3.)'});
      diffuseColor.rgb*=sceneryTexel.rgb;`);
    if(kind==='glass')shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(.58,roughnessFactor,sceneryTexel.a);');
  };
  return material;
}
