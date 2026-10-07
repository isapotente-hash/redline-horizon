import {AUTO_GRAPHICS} from "../core/AutoGraphics";
import {GpuTimer} from "./GpuTimer";
import * as T from "three";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { cloudLayer } from "./CloudLayer";
import { Sky } from "three/addons/objects/Sky.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import { Settings } from "../core/SaveManager";
import { clamp, lerp } from "../core/math";
export class RenderSystem {
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(62, 1, 0.1, 16000);
  renderer: T.WebGLRenderer | null = null;
  composer?: EffectComposer;
  bloom?: UnrealBloomPass;
  ao?: SSAOPass;
  clouds = cloudLayer();
  pmrem?: T.PMREMGenerator;
  fxaa?: ShaderPass;
  grade?: ShaderPass;
  sky = new Sky();
  sun = new T.DirectionalLight("#ffe2c1", 3.2);
  hemi = new T.HemisphereLight("#b9d5e5", "#676045", 1.75);
  sunDirection = new T.Vector3();
  water: T.Mesh;
  studio = new T.Group();
  night = 0;
  exposure = 0.95;
  resolutionScale=1;
  private automaticLevel:number|null=null;
  gpuTimer?:GpuTimer;
  get gpuMs(){return this.gpuTimer?.milliseconds??null;}
  private applyEffects(){
    if(this.renderer)this.renderer.shadowMap.autoUpdate=true;
    if(this.ao)this.ao.enabled=this.automaticLevel===null||AUTO_GRAPHICS[this.automaticLevel].ao;
    if(this.bloom)this.bloom.enabled=this.automaticLevel===null||AUTO_GRAPHICS[this.automaticLevel].bloom;
  }
  private updateClarity(){
    if(!this.renderer||!this.grade)return;
    const ratio=this.renderer.getPixelRatio();
    this.grade.uniforms.texel.value.set(1/(innerWidth*ratio),1/(innerHeight*ratio));
    this.grade.uniforms.sharpness.value=.18;
  }
  // Compatibility hook: image buffers and effects never change with frame timing.
  adaptResolution(_dt:number,_driving:boolean){}
  env?: T.WebGLRenderTarget;
  constructor(
    public canvas: HTMLCanvasElement,
    public settings: Settings,
    public uiCheck = false,
  ) {
    this.scene.background = new T.Color("#b2c7d3");
    this.scene.fog = new T.FogExp2("#b2c7d3", 0.00023);
    this.sky.scale.setScalar(10000);
    this.scene.add(this.sky, this.clouds, this.sun, this.sun.target, this.hemi, this.studio);
    this.sun.castShadow = true;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 600;
    Object.assign(this.sun.shadow.camera, {
      left: -95,
      right: 95,
      top: 95,
      bottom: -95,
    });
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.normalBias = 0.06;
    this.sun.shadow.radius = 2;
    const u = this.sky.material.uniforms;
    u.turbidity.value = 3;
    u.rayleigh.value = 2.1;
    u.mieCoefficient.value = 0.0035;
    u.mieDirectionalG.value = 0.82;
    const waterMaterial = new T.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        sun: { value: new T.Vector3(0, 1, 0) },
        night: { value: 0 },
        fogColor: { value: new T.Color("#b2c7d3") },
      },
      vertexShader: `varying vec3 vWorld;void main(){vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
      fragmentShader: `uniform float time;uniform vec3 sun;uniform float night;uniform vec3 fogColor;varying vec3 vWorld;void main(){vec2 p=vWorld.xz;float w=sin(p.x*.055+time*.6)+sin(p.y*.091-time*.5)+sin((p.x+p.y)*.18+time*.9)*.23;vec3 n=normalize(vec3(cos(p.x*.055+time*.6)*.10,1.,cos(p.y*.091-time*.5)*.10));vec3 v=normalize(cameraPosition-vWorld);float fres=pow(1.-max(dot(n,v),0.),4.);vec3 deep=mix(vec3(.026,.14,.19),vec3(.015,.029,.054),night);vec3 col=mix(deep,fogColor*.70,fres);float glint=pow(max(dot(reflect(-sun,n),v),0.),180.);col+=vec3(1.,.78,.51)*glint*(1.-night)*1.4;col+=w*.007;float ripple=sin(p.x*.7+time*1.8)*sin(p.y*.43-time*1.1);col+=pow(max(dot(reflect(-sun,normalize(n+vec3(ripple*.025,0.,ripple*.04))),v),0.),75.)*vec3(.6,.72,.8)*(1.-night)*.22;float coast=p.x-(150.+sin(p.y*.0018)*90.);float foam=(1.-smoothstep(0.,18.,abs(coast+sin(p.y*.12-time)*2.)))*smoothstep(.15,.85,sin(p.y*.7+time)*.5+.5);col=mix(col,vec3(.65,.79,.77)*(1.-night*.85),foam*.3);float fog=1.-exp(-length(cameraPosition-vWorld)*.00024);gl_FragColor=vec4(mix(col,fogColor,fog),1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`,
    });
    this.water = new T.Mesh(new T.PlaneGeometry(40000, 40000), waterMaterial);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = -0.25;
    this.scene.add(this.water);
    const floor = new T.Mesh(
      new T.CylinderGeometry(12, 12, 0.08, 80),
      new T.MeshPhysicalMaterial({
        color: "#30343a",
        roughness: 0.3,
        metalness: 0.3,
      }),
    );
    floor.position.y = -0.61;
    floor.receiveShadow = true;
    this.studio.add(floor);
    for (const side of [-1, 1]) {
      const panel = new T.Mesh(
        new T.BoxGeometry(0.04, 3.0, 8),
        new T.MeshBasicMaterial({ color: "#e8edf3" }),
      );
      panel.position.set(side * 7, 3, 0);
      panel.rotation.z = side * 0.3;
      this.studio.add(panel);
      const light = new T.PointLight("#e5eeff", 110, 18, 2);
      light.position.set(side * 4, 3, 0);
      this.studio.add(light);
    }
    this.studio.visible = false;
    if (!uiCheck) {
      this.renderer = new T.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false,
      });
      this.renderer.info.autoReset=false;
      this.gpuTimer=new GpuTimer(this.renderer.getContext() as WebGL2RenderingContext);
      this.renderer.outputColorSpace = T.SRGBColorSpace;
      this.renderer.toneMapping = T.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = this.exposure;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = T.PCFSoftShadowMap;
      this.pmrem = new T.PMREMGenerator(this.renderer);
      const target=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,samples:Math.min(4,this.renderer.capabilities.maxSamples)});
      this.composer = new EffectComposer(this.renderer,target);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.ao = new SSAOPass(this.scene,this.camera,1,1,12);
      this.ao.ssaoMaterial.uniforms.cameraProjectionMatrix.value=this.camera.projectionMatrix;
      this.ao.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value=this.camera.projectionMatrixInverse;
      this.ao.kernelRadius=4;
      this.ao.minDistance=.0002;
      this.ao.maxDistance=.015;
      this.composer.addPass(this.ao);
      this.bloom = new UnrealBloomPass(new T.Vector2(1, 1), 0.08, 0.35, 1.7);
      this.composer.addPass(this.bloom);
      this.grade=new ShaderPass({uniforms:{tDiffuse:{value:null},texel:{value:new T.Vector2()},sharpness:{value:.12}},
        vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader:`uniform sampler2D tDiffuse;uniform vec2 texel;uniform float sharpness;varying vec2 vUv;
        void main(){
          vec4 c=texture2D(tDiffuse,vUv);
          vec3 n=texture2D(tDiffuse,vUv+vec2(0.,texel.y)).rgb,s=texture2D(tDiffuse,vUv-vec2(0.,texel.y)).rgb;
          vec3 e=texture2D(tDiffuse,vUv+vec2(texel.x,0.)).rgb,w=texture2D(tDiffuse,vUv-vec2(texel.x,0.)).rgb;
          vec3 lo=min(c.rgb,min(min(n,s),min(e,w))),hi=max(c.rgb,max(max(n,s),max(e,w)));
          c.rgb=clamp(c.rgb+(c.rgb-(n+s+e+w)*.25)*sharpness,lo,hi);
          float l=dot(c.rgb,vec3(.2126,.7152,.0722));c.rgb=mix(vec3(l),c.rgb,1.055);
          vec2 p=vUv-.5;c.rgb*=1.-dot(p,p)*.12;gl_FragColor=vec4(max(c.rgb,vec3(0.)),c.a);
        }`
      });
      this.composer.addPass(this.grade);
      this.composer.addPass(new OutputPass());
      this.fxaa = new ShaderPass(FXAAShader);
      this.composer.addPass(this.fxaa);
    }
    if(settings.autoGraphics)this.automaticLevel=1;
    this.applyQuality();
    this.updateAtmosphere(0, new T.Vector3());
    this.resize();
    addEventListener("resize", () => this.resize());
  }
  setAutomaticLevel(level:number|null){
    if(level===this.automaticLevel)return;
    this.automaticLevel=level;this.gpuTimer?.reset();this.applyQuality();
  }
  applyQuality() {
    if (!this.renderer) return;
    const profile=this.automaticLevel===null?null:AUTO_GRAPHICS[this.automaticLevel];
    const size=Math.min(profile?Math.max(512,profile.shadow):4096,this.renderer.capabilities.maxTextureSize||4096);
    if(this.sun.shadow.mapSize.x!==size){
      this.sun.shadow.mapSize.set(size,size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map=null;
    }
    this.renderer.shadowMap.enabled=!profile||profile.shadow>0;
    this.clouds.visible=true;
    // Auto can trim supersampling, but never renders below CSS resolution.
    this.renderer.setPixelRatio(Math.max(1,Math.min(devicePixelRatio,profile?.pixelRatio??2)));
    this.resolutionScale=1;
    this.applyEffects();
    if(this.composer){
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      const samples=Math.min(profile?.samples??4,this.renderer.capabilities.maxSamples);
      for(const target of [this.composer.renderTarget1,this.composer.renderTarget2]){
        if(target.samples!==samples){target.samples=samples;target.dispose();}
      }
      if(this.fxaa)this.fxaa.enabled=samples===0;
    }
    this.resize();
  }
  resize() {
    const w = innerWidth,
      h = innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer?.setSize(w, h, false);
    this.composer?.setSize(w, h);
    if (this.fxaa && this.renderer) {
      const p = this.renderer.getPixelRatio();
      this.fxaa.material.uniforms.resolution.value.set(
        1 / (w * p),
        1 / (h * p),
      );
    }
    this.updateClarity();
  }
  updateAtmosphere(t: number, p: T.Vector3) {
    const h = this.settings.hour,
      e = Math.sin(((h - 6) / 12) * Math.PI);
    this.night = 1 - clamp((e + 0.07) / 0.24, 0, 1);
    this.sunDirection.set(0.62, e * 0.95, -0.48).normalize();
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDirection);
    this.sky.visible = this.night < 0.98;
    this.sky.material.uniforms.turbidity.value =
      this.settings.weather === "clear" ? 3 : 10;
    const cloudy = this.settings.weather === "clear" ? 1 : 0.43;
    this.sun.intensity = Math.max(0, e * 1.4) * 3.2 * cloudy;
    this.sun.color.set(e < 0.35 ? "#ffc48e" : "#fff1dc");
    this.hemi.intensity =
      lerp(1.75, 0.16, this.night) *
      (this.settings.weather === "fog" ? 0.7 : 1);
    const texel=190/this.sun.shadow.mapSize.x;
    this.sun.target.position.set(Math.round(p.x/texel)*texel,p.y,Math.round(p.z/texel)*texel);
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDirection,240);
    this.clouds.position.copy(p);
    const clouds=this.clouds.material.uniforms;
    clouds.time.value=t;clouds.night.value=this.night;clouds.sunHeight.value=e;
    clouds.coverage.value=this.settings.weather==="clear"?.54:.36;
    this.scene.environmentIntensity=lerp(.78,.1,this.night);
    const fog = this.scene.fog as T.FogExp2;
    fog.density = {
      clear: 0.0001,
      cloudy: 0.00065,
      rain: 0.0006+this.settings.rainIntensity*.0009,
      fog: 0.0028,
    }[this.settings.weather];
    fog.color.set(
      this.night > 0.7
        ? "#111b2b"
        : this.settings.weather === "clear"
          ? "#b2c7d3"
          : "#9baab2",
    );
    (this.scene.background as T.Color).copy(fog.color);
    const u = (this.water.material as T.ShaderMaterial).uniforms;
    u.time.value = t;
    u.sun.value.copy(this.sunDirection);
    u.night.value = this.night;
    u.fogColor.value.copy(fog.color);
  }
  environment() {
    if (!this.renderer) return;
    const scene = new T.Scene();
    scene.add(this.sky.clone());
    this.env?.dispose();
    this.env = this.pmrem!.fromScene(scene, 0.03, 0.1, 15000);
    this.scene.environment = this.env.texture;
    this.scene.environmentIntensity = 0.65;

  }
  render(_hero: T.Object3D, _garage = false, _stationary = false) {
    if (!this.renderer) return;
    this.renderer.toneMappingExposure = this.exposure;
    this.renderer.info.reset();
    this.gpuTimer?.begin();
    try{this.composer!.render();}finally{this.gpuTimer?.end();}
  }
  capture() {
    return this.canvas.toDataURL("image/png");
  }
}
