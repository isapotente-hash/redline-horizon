import * as T from 'three';
import {rng} from '../core/math';

let sharedSurface:T.DataTexture|undefined;
function bakedSurface(){
  if(sharedSurface)return sharedSurface;
  const size=256,pixels=new Uint8Array(size*size*4),random=rng(5831);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=(y*size+x)*4,u=x/size*Math.PI*2,v=y/size*Math.PI*2;
    pixels[i]=Math.round(92+random()*110);
    pixels[i+1]=Math.round(128+Math.sin(u*3+Math.sin(v*2))*52+Math.cos(v*5-u)*21);
    const ridge=Math.sin(u*32+Math.sin(v*3)*.8)+Math.sin(u*61-v*2)*.34;
    pixels[i+2]=Math.round(128+ridge*73);pixels[i+3]=255;
  }
  const t=new T.DataTexture(pixels,size,size);t.wrapS=t.wrapT=T.RepeatWrapping;t.magFilter=T.LinearFilter;t.minFilter=T.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;sharedSurface=t;return t;
}

/** World-space detail stays continuous across terrain chunk boundaries. */
export function surfaceDetail<M extends T.MeshStandardMaterial>(material:M, kind:'ground'|'rock'|'bark',field?:T.Texture):M {
  const surface=kind==='ground'?undefined:bakedSurface();
  material.customProgramCacheKey=()=>`coastal-detail-v4-${kind}-${!!field}`;
  material.onBeforeCompile=shader=>{
    if(field)shader.uniforms.detailFieldMap={value:field};
    if(surface)shader.uniforms.detailSurfaceMap={value:surface};
    shader.vertexShader=shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDetailWorld;\nvarying vec3 vDetailLocal;');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vDetailLocal=transformed;
      vec4 detailPosition=vec4(transformed,1.0);
      #ifdef USE_INSTANCING
        detailPosition=instanceMatrix*detailPosition;
      #endif
      vDetailWorld=(modelMatrix*detailPosition).xyz;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      ${field?'uniform sampler2D detailFieldMap;':''}
      ${surface?'uniform sampler2D detailSurfaceMap;':''}
      varying vec3 vDetailWorld;
      varying vec3 vDetailLocal;
      float detailHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
      float detailNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(detailHash(i),detailHash(i+vec2(1,0)),f.x),mix(detailHash(i+vec2(0,1)),detailHash(i+vec2(1,1)),f.x),f.y);}`);
    const detail=kind==='ground'&&field ? `
      float straw=texture2D(detailFieldMap,vDetailWorld.xz*.32).r;
      vec2 fieldVariation=texture2D(detailFieldMap,vDetailWorld.xz*.012).gb;
      diffuseColor.rgb*=(.48+straw*.65)*(.68+fieldVariation.x*.55);
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.86,.83,.72),smoothstep(.58,.78,fieldVariation.y)*.35);`
      :kind==='ground' ? `
      float soil=detailNoise(vDetailWorld.xz*.7);
      float grain=detailNoise(vDetailWorld.xz*7.);
      float fleck=detailNoise(vDetailWorld.xz*26.);
      diffuseColor.rgb*=.72+soil*.30+grain*.18+fleck*.09;`
      :kind==='rock'?`
      vec2 stoneDetail=texture2D(detailSurfaceMap,vDetailWorld.xz*.65+vDetailWorld.y*.13).rg;
      float strata=sin(vDetailWorld.y*5.+stoneDetail.y*4.);
      diffuseColor.rgb*=.72+stoneDetail.x*.30+strata*.10;`
      :`float angle=atan(vDetailLocal.z,vDetailLocal.x);
      vec3 barkDetail=texture2D(detailSurfaceMap,vec2(angle/6.2831853,vDetailLocal.y*.28)).rgb;
      float crack=smoothstep(.27,.65,barkDetail.b);
      diffuseColor.rgb*=.49+crack*.55+barkDetail.r*.13;`;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n'+detail);
  };
  return material;
}
