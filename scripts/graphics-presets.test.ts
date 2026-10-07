import test from 'node:test';
import assert from 'node:assert/strict';
import {GRAPHICS_PRESETS,applyDistancePreset} from '../src/core/GraphicsPresets';
import {SaveManager,defaults} from '../src/core/SaveManager';
import {SAVE_KEY} from '../src/core/SaveStorage';
import {World} from '../src/world/World';
function storage(settings:Record<string,unknown>){let data=JSON.stringify({layoutVersion:2,coins:1250,settings});Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>key===SAVE_KEY?data:null,setItem:(key:string,value:string)=>{if(key===SAVE_KEY)data=value;}}});}
test('preset changes alter only distances, keep custom world/vehicle preferences and reach maximum/minimum budgets',()=>{
 let previousRender=0,previousSim=0;
 for(const quality of ['very-low','low','medium','high','ultra'] as const){
  const settings={...defaults,quality,weather:'rain' as const,hour:12,automatic:false};
  const before={...settings};applyDistancePreset(settings);
  assert.deepEqual({...settings,renderDistance:before.renderDistance,simulationDistance:before.simulationDistance},before);
  assert.ok(settings.renderDistance>previousRender);assert.ok(settings.simulationDistance>previousSim);
  previousRender=settings.renderDistance;previousSim=settings.simulationDistance;
 }
 assert.deepEqual(GRAPHICS_PRESETS['very-low'],{renderDistance:10,simulationDistance:10});
 assert.deepEqual(GRAPHICS_PRESETS.ultra,{renderDistance:3000,simulationDistance:1000});
});
test('legacy preset-only saves get their distance budget; explicit custom distances survive reload',()=>{
 for(const quality of ['very-low','low','medium','high','ultra'] as const){
  storage({quality});const save=new SaveManager();assert.equal(save.settings.renderDistance,GRAPHICS_PRESETS[quality].renderDistance);assert.equal(save.settings.simulationDistance,GRAPHICS_PRESETS[quality].simulationDistance);assert.equal(save.coins,1250);
  save.settings.renderDistance=525;save.settings.simulationDistance=275;save.save();const again=new SaveManager();assert.equal(again.settings.renderDistance,525);assert.equal(again.settings.simulationDistance,275);
 }
});
test('route chooser and automatic visual downgrades stay removed; braking assistance migrates off once and explicit opt-in persists',()=>{
 storage({autopilotRoutes:true,adaptiveResolution:true,cornerGuide:'markers'});const save=new SaveManager();assert.equal(save.settings.autopilotRoutes,false);assert.equal(save.settings.adaptiveResolution,false);assert.equal(save.settings.cornerGuide,'off');
 save.settings.cornerGuide='markers';save.save();const again=new SaveManager();assert.equal(again.settings.cornerGuide,'markers');assert.equal(again.settings.settingsVersion,2);
});
test('world residency at matching distances is independent of the graphics preset name',()=>{
 const world=Object.create(World.prototype) as World;
 for(const renderDistance of [10,100,500,1600,3000])for(const simulationDistance of [10,50,1000]){
  const radii=[];for(const quality of ['very-low','low','medium','high','ultra'] as const){world.settings={...defaults,quality,renderDistance,simulationDistance};radii.push([world.visualRadius,world.residentRadius]);}
  assert.ok(radii.every(r=>r[0]===radii[0][0]&&r[1]===radii[0][1]));
 }
});
