import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {RenderSystem} from '../src/rendering/RenderSystem';
import {defaults,Settings} from '../src/core/SaveManager';

function fixture(quality:Settings['quality']='high',dpr=1,maxSamples=4){
  Object.defineProperties(globalThis,{devicePixelRatio:{configurable:true,value:dpr},innerWidth:{configurable:true,value:1280},innerHeight:{configurable:true,value:720},document:{configurable:true,value:{hidden:false}}});
  let ratio=1,direct=0,post=0,probe=0,resize=0;
  const r=Object.assign(Object.create(RenderSystem.prototype),{
    settings:{...defaults,quality},camera:new T.PerspectiveCamera(),scene:new T.Scene(),
    sun:{shadow:{mapSize:new T.Vector2(),map:null}},clouds:{visible:true},
    renderer:{shadowMap:{enabled:true,autoUpdate:true},capabilities:{maxSamples},setPixelRatio:(n:number)=>{ratio=n;resize++;},getPixelRatio:()=>ratio,setSize(){},render:()=>direct++},
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

test('Low renders at screen resolution with no post-processing; device pixel density remains capped',()=>{
  const f=fixture('low',3);assert.equal(f.ratio(),1);f.r.render(new T.Object3D());assert.deepEqual(f.counts(),{direct:1,post:0,probe:0});
  for(const [quality,cap] of [['very-low',.5],['medium',1.25],['high',2],['ultra',2]] as const){const f=fixture(quality,3);assert.equal(f.ratio(),cap);}
});
test('hardware antialiasing replaces redundant FXAA and unsupported hardware retains a fallback',()=>{
  for(const quality of ['medium','high','ultra'] as const){const f=fixture(quality,1,4);assert.equal(f.r.fxaa!.enabled,false);assert.equal(f.r.composer!.renderTarget1.samples,quality==='medium'?2:4);}
  const f=fixture('medium',1,0);assert.equal(f.r.fxaa!.enabled,true);assert.equal(f.r.composer!.renderTarget1.samples,0);
});
test('sustained slow frames reduce effects while image size remains fixed; no gameplay buffer reallocations occur',()=>{
  const f=fixture('high',3),initial=f.resizes();frames(f.r,1/30,90);
  assert.equal(f.ratio(),2);assert.equal(f.r.ao!.enabled,false);assert.equal(f.r.bloom!.enabled,false);assert.equal(f.resizes(),initial);
  f.r.render(new T.Object3D(),false,true);assert.equal(f.counts().probe,0);
  assert.equal(f.r.grade!.uniforms.texel.value.x,1/2560);
});
test('alternating slow/fast periods cannot oscillate effects, resize buffers or introduce periodic reflections',()=>{
  const f=fixture('high',2),initial=f.resizes();frames(f.r,1/30,8);
  for(let n=0;n<6;n++){frames(f.r,1/60,12);frames(f.r,1/30,8);for(let frame=0;frame<600;frame++)f.r.render(new T.Object3D(),false,true);}
  assert.equal(f.resizes(),initial);assert.equal(f.ratio(),2);assert.equal(f.r.ao!.enabled,false);assert.equal(f.counts().probe,0);
  // Shadow updates are a bounded alternation, rather than changing shader variants/maps.
  f.r.render(new T.Object3D());const first=f.r.renderer!.shadowMap.needsUpdate;f.r.render(new T.Object3D());assert.notEqual(f.r.renderer!.shadowMap.needsUpdate,first);
});
test('Very Low retains its small budget; paused, hidden and loading frames cannot downgrade effects',()=>{
  const f=fixture('very-low',3);frames(f.r,1/30,90);assert.equal(f.ratio(),.5);assert.equal(f.r.renderer!.shadowMap.enabled,false);
  const g=fixture('high');g.r.adaptResolution(2,true);g.r.adaptResolution(1/30,false);(globalThis as any).document.hidden=true;frames(g.r,1/30,90);assert.equal(g.r.ao!.enabled,true);
});
test('manual preset/scaling changes restore the selected effects and never change resolution during play',()=>{
  const f=fixture('high',3);frames(f.r,1/30,20);assert.equal(f.ratio(),2);assert.equal(f.r.ao!.enabled,false);
  f.r.settings.adaptiveResolution=false;f.r.applyQuality();assert.equal(f.ratio(),2);assert.equal(f.r.ao!.enabled,true);frames(f.r,1/30,20);assert.equal(f.r.ao!.enabled,true);
  f.r.settings.quality='low';f.r.applyQuality();assert.equal(f.ratio(),1);assert.equal(f.r.ao!.enabled,false);assert.equal(f.r.bloom!.enabled,false);
});
test('sustained frames slower than 250 ms still activate the cheaper path without a buffer resize',()=>{
  for(const dt of [.4,1.2]){const f=fixture('high',2),initial=f.resizes();f.r.adaptResolution(dt,true);f.r.adaptResolution(dt,true);assert.equal(f.r.ao!.enabled,true);f.r.adaptResolution(dt,true);assert.equal(f.r.ao!.enabled,false);assert.equal(f.ratio(),2);assert.equal(f.resizes(),initial);}
});
