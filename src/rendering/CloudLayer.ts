import * as T from 'three';
export function cloudLayer() {
  const material=new T.ShaderMaterial({
    side:T.BackSide,transparent:true,depthWrite:false,
    uniforms:{time:{value:0},coverage:{value:.52},night:{value:0},sunHeight:{value:.3}},
    vertexShader:`varying vec3 vCloudWorld;void main(){vec4 p=modelMatrix*vec4(position,1.);vCloudWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader:`uniform float time;uniform float coverage;uniform float night;uniform float sunHeight;varying vec3 vCloudWorld;
    float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
    float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
    void main(){vec3 ray=normalize(vCloudWorld-cameraPosition);if(ray.y<.035)discard;
    vec2 p=ray.xz/(ray.y+.25)*2.5+vec2(time*.003,time*.001);
    float n=noise2(p)*.57+noise2(p*2.03)*.28+noise2(p*4.11)*.15;
    float cloud=smoothstep(coverage,coverage+.18,n)*smoothstep(.035,.19,ray.y);
    vec3 shade=mix(vec3(.42,.51,.60),vec3(1.,.97,.91),smoothstep(coverage,coverage+.34,n));
    shade=mix(shade*vec3(1.13,.80,.65),shade,smoothstep(.08,.5,sunHeight));
    shade*=mix(1.,.07,night);
    gl_FragColor=vec4(shade,cloud*.86);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`
  });
  const mesh=new T.Mesh(new T.SphereGeometry(7500,32,16),material);mesh.name='Layered moving clouds';mesh.frustumCulled=false;return mesh;
}
