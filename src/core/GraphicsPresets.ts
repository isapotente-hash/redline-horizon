export type GraphicsQuality = 'very-low' | 'low' | 'medium' | 'high' | 'ultra';
/** Presets change world budgets only; resolution, materials and effects are shared. */
export const GRAPHICS_PRESETS = {
  'very-low': {renderDistance:100, simulationDistance:50},
  low: {renderDistance:500, simulationDistance:150},
  medium: {renderDistance:1000, simulationDistance:350},
  high: {renderDistance:1600, simulationDistance:600},
  ultra: {renderDistance:3000, simulationDistance:1000},
} satisfies Record<GraphicsQuality, {renderDistance:number; simulationDistance:number}>;
export function applyDistancePreset(settings:{quality:GraphicsQuality;renderDistance:number;simulationDistance:number}) {
  Object.assign(settings, GRAPHICS_PRESETS[settings.quality]);
}
