import * as T from 'three';
import {cloudDensity} from './BakedAtmosphere';
export function cloudLayer() {
  const material=new T.ShaderMaterial({
    side:T.BackSide,transparent:true,depthWrite:false,
    uniforms:{density:{value:cloudDensity()},time:{value:0},coverage:{value:.52},night:{value:0},sunHeight:{value:.3}},
    vertexShader:`varying vec3 vCloudWorld;void main(){vec4 p=modelMatrix*vec4(position,1.);vCloudWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader:`uniform sampler2D density;uniform float time;uniform float coverage;uniform float night;uniform float sunHeight;varying vec3 vCloudWorld;
    void main(){vec3 ray=normalize(vCloudWorld-cameraPosition);if(ray.y<.035)discard;
    vec2 p=ray.xz/(ray.y+.25)*2.5+vec2(time*.003,time*.001);
    float n=texture2D(density,p*.16).r*.77+texture2D(density,p*.43+.31).r*.23;
    float cloud=smoothstep(coverage,coverage+.18,n)*smoothstep(.035,.19,ray.y);
    vec3 shade=mix(vec3(.48,.57,.67),vec3(1.25,1.22,1.17),smoothstep(coverage,coverage+.34,n));
    shade=mix(shade*vec3(1.13,.80,.65),shade,smoothstep(.08,.5,sunHeight));
    shade*=mix(1.,.07,night);
    gl_FragColor=vec4(shade,cloud*.86);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`
  });
  const mesh=new T.Mesh(new T.SphereGeometry(7500,32,16),material);mesh.name='Layered moving clouds';mesh.frustumCulled=false;return mesh;
}
