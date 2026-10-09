import {AUTO_GRAPHICS} from '../core/AutoGraphics';
import {GraphicsQuality} from '../core/GraphicsPresets';

/** Manual presets must control GPU work as well as scenery distances. */
export function renderBudget(quality:GraphicsQuality,automaticLevel:number|null,mobile=false){
  const profile=AUTO_GRAPHICS[automaticLevel??Math.max(0,AUTO_GRAPHICS.findIndex(p=>p.quality===quality))];
  return {...profile,pixelRatio:mobile?1:profile.pixelRatio,samples:mobile?0:profile.samples,
    shadow:mobile?Math.min(1024,profile.shadow):profile.shadow,ao:!mobile&&profile.ao,
    bloom:profile.bloom&&(!mobile||profile.quality==='high'||profile.quality==='ultra')};
}

export function treeBudget(quality:GraphicsQuality,mobile=false){
  const light=mobile||quality==='very-low'||quality==='low';
  return {light,nearDistance:mobile?55:light?70:140};
}
