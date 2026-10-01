import * as T from 'three';

/** World-space detail stays continuous across terrain chunk boundaries. */
export function surfaceDetail<M extends T.MeshStandardMaterial>(material:M, kind:'ground'|'rock'|'bark',field?:T.Texture):M {
  material.customProgramCacheKey=()=>`coastal-detail-v2-${kind}-${!!field}`;
  material.onBeforeCompile=shader=>{
    if(field)shader.uniforms.detailFieldMap={value:field};
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
      varying vec3 vDetailWorld;
      varying vec3 vDetailLocal;
      float detailHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
      float detailNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(detailHash(i),detailHash(i+vec2(1,0)),f.x),mix(detailHash(i+vec2(0,1)),detailHash(i+vec2(1,1)),f.x),f.y);}`);
    const detail=kind==='ground'&&field ? `
      vec3 straw=texture2D(detailFieldMap,vDetailWorld.xz*.32).rgb;
      float fieldPatch=detailNoise(vDetailWorld.xz*.19);
      diffuseColor.rgb*=(.38+straw*.72)*(.69+fieldPatch*.49);`
      :kind==='ground' ? `
      float soil=detailNoise(vDetailWorld.xz*.7);
      float grain=detailNoise(vDetailWorld.xz*7.);
      float fleck=detailNoise(vDetailWorld.xz*26.);
      diffuseColor.rgb*=.72+soil*.30+grain*.18+fleck*.09;`
      :kind==='rock'?`
      float strata=sin(vDetailWorld.y*5.+detailNoise(vDetailWorld.xz*1.7)*4.);
      float rockGrain=detailNoise(vDetailWorld.xz*12.+vDetailWorld.y);
      diffuseColor.rgb*=.74+rockGrain*.28+strata*.10;`
      :`float angle=atan(vDetailLocal.z,vDetailLocal.x);
      float ridge=detailNoise(vec2(angle*21.,vDetailLocal.y*1.8));
      float crack=smoothstep(.36,.60,ridge);
      diffuseColor.rgb*=.53+crack*.52+detailNoise(vDetailLocal.xy*35.)*.13;`;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n'+detail);
  };
  return material;
}
