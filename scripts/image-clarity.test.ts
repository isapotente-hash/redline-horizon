import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {RenderSystem} from '../src/rendering/RenderSystem';
import {defaults,Settings} from '../src/core/SaveManager';

function fixture(quality:Settings['quality']='high',dpr=1,maxSamples=4){
  Object.defineProperties(globalThis,{devicePixelRatio:{configurable:true,value:dpr},innerWidth:{configurable:true,value:1280},innerHeight:{configurable:true,value:720},document:{configurable:true,value:{hidden:false}}});
  let ratio=1,direct=0,post=0,probe=0;
  const r=Object.assign(Object.create(RenderSystem.prototype),{
    settings:{...defaults,quality},camera:new T.PerspectiveCamera(),scene:new T.Scene(),
    sun:{shadow:{mapSize:new T.Vector2(),map:null}},clouds:{visible:true},
    renderer:{shadowMap:{enabled:true,autoUpdate:true},capabilities:{maxSamples},setPixelRatio:(n:number)=>ratio=n,getPixelRatio:()=>ratio,setSize(){},render:()=>direct++},
    ao:{enabled:true,setSize(){}},bloom:{enabled:true},
    grade:{uniforms:{texel:{value:new T.Vector2()},sharpness:{value:0}}},
    fxaa:{enabled:true,material:{uniforms:{resolution:{value:new T.Vector2()}}}},
    composer:{setPixelRatio(){},setSize(){},renderTarget1:{dispose(){}},renderTarget2:{dispose(){}},render:()=>post++},
    probe:{position:new T.Vector3(),update:()=>probe++},frame:0,
    pmrem:{fromCubemap:()=>({texture:new T.Texture()})},exposure:.95,night:0,
  }) as RenderSystem;
  r.applyQuality();return {r,ratio:()=>ratio,counts:()=>({direct,post,probe})};
}
function frames(r:RenderSystem,dt:number,seconds:number){for(let t=0;t<seconds;t+=dt)r.adaptResolution(dt,true);}

test('Low renders at screen resolution with no post-processing; device pixel density remains capped',()=>{
  const f=fixture('low',3);assert.equal(f.ratio(),1);f.r.render(new T.Object3D());assert.deepEqual(f.counts(),{direct:1,post:0,probe:0});
  for(const [quality,cap] of [['very-low',.5],['medium',1],['high',1.5],['ultra',2]] as const){const f=fixture(quality,3);assert.equal(f.ratio(),cap);}
});
test('hardware antialiasing replaces redundant FXAA and unsupported hardware retains a fallback',()=>{
  for(const quality of ['medium','high','ultra'] as const){const f=fixture(quality,1,4);assert.equal(f.r.fxaa!.enabled,false);assert.equal(f.r.composer!.renderTarget1.samples,quality==='medium'?2:4);}
  const f=fixture('medium',1,0);assert.equal(f.r.fxaa!.enabled,true);assert.equal(f.r.composer!.renderTarget1.samples,0);
});
test('sustained slow frames reduce costly effects and reflections before reducing resolution',()=>{
  const f=fixture('high',1.5);frames(f.r,1/30,2.1);assert.equal(f.ratio(),1.5);assert.equal(f.r.ao!.enabled,false);assert.equal(f.r.bloom!.enabled,false);
  f.r.render(new T.Object3D(),false,true);assert.equal(f.counts().probe,0);
  frames(f.r,1/30,90);assert.ok(f.ratio()>=1.05-1e-8);assert.ok(f.ratio()<1.5);assert.ok(f.r.grade!.uniforms.sharpness.value<=.22);
  assert.ok(Math.abs(f.r.grade!.uniforms.texel.value.x-1/(1280*f.ratio()))<1e-12);
});
test('resolution floors stay legible on ordinary screens while Very Low retains its small render budget',()=>{
  for(const quality of ['low','medium','high','ultra'] as const){const f=fixture(quality);frames(f.r,1/30,90);assert.ok(f.ratio()>=.85-1e-8,quality);}
  const f=fixture('very-low',3);frames(f.r,1/30,90);assert.ok(f.ratio()>=.425-1e-8);assert.ok(f.ratio()<=.5);assert.equal(f.r.renderer!.shadowMap.enabled,false);
});
test('recovery restores resolution before effects, waits for stable fast frames, and ignores loading/hidden/paused frames',()=>{
  const f=fixture('high');frames(f.r,1/30,20);assert.equal(f.r.ao!.enabled,false);const low=f.ratio();
  f.r.adaptResolution(2,true);f.r.adaptResolution(1/30,false);(globalThis as any).document.hidden=true;frames(f.r,1/30,10);assert.equal(f.ratio(),low);
  (globalThis as any).document.hidden=false;frames(f.r,1/60,10);assert.equal(f.ratio(),1);assert.equal(f.r.ao!.enabled,false);
  frames(f.r,1/60,10);assert.equal(f.r.ao!.enabled,true);assert.equal(f.r.bloom!.enabled,true);
});
test('disabling automatic scaling or changing presets restores full clarity and the selected effects immediately',()=>{
  const f=fixture('high',2);frames(f.r,1/30,20);assert.ok(f.ratio()<1.5);assert.equal(f.r.ao!.enabled,false);
  f.r.settings.adaptiveResolution=false;f.r.applyQuality();assert.equal(f.ratio(),1.5);assert.equal(f.r.ao!.enabled,true);frames(f.r,1/30,20);assert.equal(f.ratio(),1.5);
  f.r.settings.quality='low';f.r.applyQuality();assert.equal(f.ratio(),1);assert.equal(f.r.ao!.enabled,false);assert.equal(f.r.bloom!.enabled,false);
});
