import {AUTO_GRAPHICS} from './AutoGraphics';
import {GRAPHICS_PRESETS} from './GraphicsPresets';
import type {Settings} from './SaveManager';

/** Menu rendering is cheap without changing the player's saved driving preferences. */
export function graphicsPresentation(settings:Settings,autoLevel:number,worldActive:boolean,mobile=false){
  const level=worldActive?(settings.autoGraphics?Math.min(autoLevel,mobile?2:4):null):0;
  if(level===null)return {level,quality:settings.quality,renderDistance:settings.renderDistance,simulationDistance:settings.simulationDistance};
  const quality=AUTO_GRAPHICS[level].quality;
  const distances=GRAPHICS_PRESETS[quality];
  return {level,quality,...distances,...(mobile&&settings.autoGraphics?{renderDistance:Math.min(650,distances.renderDistance),simulationDistance:Math.min(250,distances.simulationDistance)}:{})};
}
