/** Traffic safety is independent of the scenery budget. Speeds are metres/second. */
export function trafficRange(speed:number,simulationDistance:number,renderDistance:number) {
  const v=Math.max(0,Number.isFinite(speed)?speed:0);
  // Six seconds at closing speed, plus braking room for a boosted vehicle.
  const safety=Math.max(240,(v+40)*6+v*v/12);
  const visible=Math.max(renderDistance,safety);
  return {visible,retain:Math.max(simulationDistance,visible)+240,spawn:visible+100};
}
