import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
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

test('every manual preset uses the same sharp display-density image, full effects and shadow quality',()=>{
  for(const quality of ['very-low','low','medium','high','ultra'] as const){
    const f=fixture(quality,3);assert.equal(f.ratio(),2);assert.equal(f.r.sun.shadow.mapSize.x,4096);
    assert.equal(f.r.renderer!.shadowMap.enabled,true);assert.equal(f.r.clouds.visible,true);
    assert.equal(f.r.ao!.enabled,true);assert.equal(f.r.bloom!.enabled,true);
    f.r.render(new T.Object3D());assert.deepEqual(f.counts(),{direct:0,post:1,probe:0});
    assert.equal(f.r.grade!.uniforms.sharpness.value,.18);
  }
  assert.equal(fixture('very-low',1).ratio(),1);
});
test('all modes use hardware antialiasing without redundant FXAA, with fallback on unsupported hardware',()=>{
  for(const quality of ['very-low','low','medium','high','ultra'] as const){const f=fixture(quality,1,4);assert.equal(f.r.fxaa!.enabled,false);assert.equal(f.r.composer!.renderTarget1.samples,4);}
  const f=fixture('medium',1,0);assert.equal(f.r.fxaa!.enabled,true);assert.equal(f.r.composer!.renderTarget1.samples,0);
});
test('long slow/fast periods and stalls cannot downgrade visuals, resize buffers or introduce reflection spikes',()=>{
  for(const quality of ['very-low','ultra'] as const){
    const f=fixture(quality,2),initial=f.resizes();
    for(const dt of [1/30,1/60,.4,1.2])frames(f.r,dt,15);
    for(let n=0;n<600;n++)f.r.render(new T.Object3D(),false,true);
    assert.equal(f.resizes(),initial);assert.equal(f.ratio(),2);assert.equal(f.r.ao!.enabled,true);assert.equal(f.r.bloom!.enabled,true);assert.equal(f.counts().probe,0);
    assert.equal(f.r.grade!.uniforms.texel.value.x,1/2560);
  }
});


test('automatic tiers keep a sharp resolution floor, trim expensive effects and restore manual rendering',()=>{
 const f=fixture('ultra',3);const initial=f.resizes();
 f.r.setAutomaticLevel(1);assert.equal(f.ratio(),1);assert.equal(f.r.sun.shadow.mapSize.x,1024);assert.equal(f.r.ao!.enabled,false);assert.equal(f.r.bloom!.enabled,false);assert.equal(f.r.composer!.renderTarget1.samples,2);
 const changed=f.resizes();assert.ok(changed>initial);f.r.setAutomaticLevel(1);assert.equal(f.resizes(),changed);
 f.r.setAutomaticLevel(0);assert.equal(f.ratio(),1);assert.equal(f.r.renderer!.shadowMap.enabled,false);assert.equal(f.r.fxaa!.enabled,true);
 f.r.setAutomaticLevel(4);assert.equal(f.ratio(),2);assert.equal(f.r.sun.shadow.mapSize.x,4096);assert.equal(f.r.ao!.enabled,true);assert.equal(f.r.bloom!.enabled,true);
 f.r.setAutomaticLevel(null);assert.equal(f.ratio(),2);assert.equal(f.r.grade!.uniforms.sharpness.value,.18);assert.equal(f.r.renderer!.shadowMap.enabled,true);
});
