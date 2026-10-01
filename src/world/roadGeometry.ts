import * as T from "three";
import { Road,roadHeight } from "./RoadNetwork";
export function roadRibbon(
  road: Road,
  start: number,
  end: number,
  left: number,
  right: number,
  raise = 0,
  skip?: (x:number,z:number)=>boolean,
) {
  if(left>right)[left,right]=[right,left];
  const v: number[] = [],
    uv: number[] = [],
    ix: number[] = [];
  for (let i = start; i <= end; i++) {
    const s = road.samples[i];
    for (const o of [left, right]) {
      v.push(s.p.x + s.r.x * o, roadHeight(s,o) + raise, s.p.z + s.r.z * o);
      uv.push((o - left) / 6, s.d / 8);
    }
  }
  for (let i = 0; i < end - start; i++) {
    const a=road.samples[start+i].p,b=road.samples[start+i+1].p;
    if(skip?.((a.x+b.x)/2,(a.z+b.z)/2))continue;
    const k = i * 2;
    ix.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(v, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(ix);
  g.computeVertexNormals();
  return g;
}
