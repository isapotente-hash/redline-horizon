import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {AUTO_GRAPHICS} from '../src/core/AutoGraphics';
import {RenderSystem} from '../src/rendering/RenderSystem';
import {defaults,Settings} from '../src/core/SaveManager';

function fixture(quality:Settings['quality']='high',dpr=1,maxSamples=4){
  Object.defineProperties(globalThis,{devicePixelRatio:{configurable:true,value:dpr},innerWidth:{configurable:true,value:1280},innerHeight:{configurable:true,value:720},document:{configurable:true,value:{hidden:false}}});
  let ratio=1,direct=0,post=0,probe=0,resize=0;
  const r=Object.assign(Object.create(RenderSystem.prototype),{
    settings:{...defaults,quality,autoGraphics:false},automaticLevel:null,camera:new T.PerspectiveCamera(),scene:new T.Scene(),
    sun:{shadow:{mapSize:new T.Vector2(),map:null}},clouds:{visible:true},
    renderer:{info:{reset(){}},shadowMap:{enabled:true,autoUpdate:true},capabilities:{maxSamples},setPixelRatio:(n:number)=>{ratio=n;resize++;},getPixelRatio:()=>ratio,setSize(){},render:()=>direct++},
    ao:{enabled:true,setSize(){}},bloom:{enabled:true},
    grade:{uniforms:{texel:{value:new T.Vector2()},sharpness:{value:0}}},
    fxaa:{enabled:true,material:{uniforms:{resolution:{value:new T.Vector2()}}}},
    composer:{setPixelRatio(){},setSize(){},renderTarget1:{dispose(){}},renderTarget2:{dispose(){}},render:()=>post++},
    probe:{position:new T.Vector3(),update:()=>probe++},frame:0,
    pmrem:{fromCubemap:()=>({texture:new T.Texture()})},exposure:.95,night:0,
  }) as RenderSystem;
  r.applyQuality();return {r,ratio:()=>ratio,counts:()=>({direct,post,probe}),resizes:()=>resize};
}
function frames(r:RenderSystem,dt:number,seconds:number){for(let t=0;t<seconds;t+=dt)r.adaptResolution(dt,true);}

test('manual presets reduce GPU work while preserving at least CSS resolution',()=>{
  for(const p of AUTO_GRAPHICS){const f=fixture(p.quality,3);assert.equal(f.ratio(),p.pixelRatio);assert.equal(f.r.sun.shadow.mapSize.x,Math.max(512,p.shadow));assert.equal(f.r.renderer!.shadowMap.enabled,p.shadow>0);assert.equal(f.r.ao!.enabled,p.ao);assert.equal(f.r.bloom!.enabled,p.bloom);f.r.render(new T.Object3D());assert.deepEqual(f.counts(),{direct:0,post:1,probe:0});}
});
test('postprocessing uses one antialiasing method with FXAA fallback',()=>{
  for(const p of AUTO_GRAPHICS){const f=fixture(p.quality,1,4);assert.equal(f.r.fxaa!.enabled,p.samples===0);assert.equal(f.r.composer!.renderTarget1.samples,p.samples);}
  assert.equal(fixture('medium',1,0).r.fxaa!.enabled,true);
});
test('manual rendering is stable across frame timing changes',()=>{
  for(const quality of ['very-low','ultra'] as const){const f=fixture(quality,2),initial=f.resizes();for(const dt of [1/30,1/60,.4,1.2])frames(f.r,dt,15);for(let n=0;n<10;n++)f.r.render(new T.Object3D(),false,true);assert.equal(f.resizes(),initial);assert.equal(f.ratio(),quality==='ultra'?2:1);assert.equal(f.counts().probe,0);}
});

test('automatic tiers keep a sharp resolution floor, trim expensive effects and restore manual rendering',()=>{
 const f=fixture('ultra',3);const initial=f.resizes();
 f.r.setAutomaticLevel(1);assert.equal(f.ratio(),1);assert.equal(f.r.sun.shadow.mapSize.x,1024);assert.equal(f.r.ao!.enabled,false);assert.equal(f.r.bloom!.enabled,false);assert.equal(f.r.composer!.renderTarget1.samples,2);
 const changed=f.resizes();assert.ok(changed>initial);f.r.setAutomaticLevel(1);assert.equal(f.resizes(),changed);
 f.r.setAutomaticLevel(0);assert.equal(f.ratio(),1);assert.equal(f.r.renderer!.shadowMap.enabled,false);assert.equal(f.r.fxaa!.enabled,true);
 f.r.setAutomaticLevel(4);assert.equal(f.ratio(),2);assert.equal(f.r.sun.shadow.mapSize.x,4096);assert.equal(f.r.ao!.enabled,true);assert.equal(f.r.bloom!.enabled,true);
 f.r.setAutomaticLevel(null);assert.equal(f.ratio(),2);assert.equal(f.r.grade!.uniforms.sharpness.value,.18);assert.equal(f.r.renderer!.shadowMap.enabled,true);
});
