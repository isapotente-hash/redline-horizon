import {AUTO_GRAPHICS} from './AutoGraphics';
import {GRAPHICS_PRESETS} from './GraphicsPresets';
import type {Settings} from './SaveManager';

/** Menu rendering is cheap without changing the player's saved driving preferences. */
export function graphicsPresentation(settings:Settings,autoLevel:number,worldActive:boolean){
  const level=worldActive?(settings.autoGraphics?autoLevel:null):0;
  if(level===null)return {level,quality:settings.quality,renderDistance:settings.renderDistance,simulationDistance:settings.simulationDistance};
  const quality=AUTO_GRAPHICS[level].quality;
  return {level,quality,...GRAPHICS_PRESETS[quality]};
}
