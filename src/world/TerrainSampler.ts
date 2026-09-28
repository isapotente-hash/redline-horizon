import * as T from "three";
import { RoadNetwork } from "./RoadNetwork";

type Point = { x: number; y: number; z: number };
type RoadFace = {
  points: [Point, Point, Point];
  minX: number; maxX: number; minZ: number; maxZ: number;
  slopeX: number; slopeZ: number; intercept: number;
};

/** Conservatively fits the entire terrain triangle below nearby road surfaces.
 * A grid vertex affects cells on both sides, so its support box includes all
 * adjacent cells. Identical world coordinates produce identical chunk seams.
 */
export class TerrainSampler {
  private faces = new Map<string, RoadFace[]>();
  private cache = new Map<string, number>();
  static readonly CLEARANCE = .45;
  static readonly CELL_SIZE = 256 / 24;
  constructor(public roads: RoadNetwork) {
    for (const road of roads.roads) {
      const width = road.width / 2 + 14.5;
      for (let i = 0; i < road.samples.length - 1; i++) {
        const a = road.samples[i], b = road.samples[i + 1];
        const edge = (s: typeof a, side: number): Point => ({
          x: s.p.x + s.r.x * width * side,
          y: s.p.y,
          z: s.p.z + s.r.z * width * side,
        });
        const al = edge(a, -1), ar = edge(a, 1), bl = edge(b, -1), br = edge(b, 1);
        this.addFace(al, ar, bl);
        this.addFace(ar, br, bl);
      }
    }
  }
  private addFace(a: Point, b: Point, c: Point) {
    const dx1 = b.x - a.x, dz1 = b.z - a.z, dy1 = b.y - a.y;
    const dx2 = c.x - a.x, dz2 = c.z - a.z, dy2 = c.y - a.y;
    const det = dx1 * dz2 - dx2 * dz1;
    if (Math.abs(det) < 1e-8) return;
    const slopeX = (dy1 * dz2 - dy2 * dz1) / det;
    const slopeZ = (dx1 * dy2 - dx2 * dy1) / det;
    const face: RoadFace = {
      points: [a, b, c], minX: Math.min(a.x,b.x,c.x), maxX: Math.max(a.x,b.x,c.x),
      minZ: Math.min(a.z,b.z,c.z), maxZ: Math.max(a.z,b.z,c.z),
      slopeX, slopeZ, intercept: a.y - slopeX * a.x - slopeZ * a.z,
    };
    for (let z = Math.floor(face.minZ / 100); z <= Math.floor(face.maxZ / 100); z++)
      for (let x = Math.floor(face.minX / 100); x <= Math.floor(face.maxX / 100); x++) {
        const key = `${x},${z}`, list = this.faces.get(key) || [];
        list.push(face); this.faces.set(key,list);
      }
  }
  private overlaps(face: RoadFace, x: number, z: number, radius: number) {
    if (face.maxX < x-radius || face.minX > x+radius || face.maxZ < z-radius || face.minZ > z+radius) return false;
    for (let i=0;i<3;i++) {
      const a=face.points[i], b=face.points[(i+1)%3];
      const nx=-(b.z-a.z), nz=b.x-a.x;
      const center=x*nx+z*nz, span=radius*(Math.abs(nx)+Math.abs(nz));
      const projections=face.points.map(p=>p.x*nx+p.z*nz);
      if (Math.max(...projections)<center-span || Math.min(...projections)>center+span) return false;
    }
    return true;
  }
  private forNearby(x: number,z: number,radius: number,visit:(face:RoadFace)=>void) {
    for(let gz=Math.floor((z-radius)/100);gz<=Math.floor((z+radius)/100);gz++)
      for(let gx=Math.floor((x-radius)/100);gx<=Math.floor((x+radius)/100);gx++)
        for(const f of this.faces.get(`${gx},${gz}`)||[]) if(this.overlaps(f,x,z,radius))visit(f);
  }
  height(x:number,z:number,cellSize:number) {
    const key=`${cellSize}:${x.toFixed(5)},${z.toFixed(5)}`;
    const cached=this.cache.get(key);if(cached!==undefined)return cached;
    let height=this.roads.height(x,z);
    this.forNearby(x,z,cellSize+1e-4,f=>{
      height=Math.min(height,f.slopeX*x+f.slopeZ*z+f.intercept-TerrainSampler.CLEARANCE);
    });
    if(this.cache.size>40000)this.cache.clear();
    this.cache.set(key,height);return height;
  }
  /** Matches the actual near-mesh triangles, keeping vegetation rooted. */
  groundHeight(x:number,z:number,step=TerrainSampler.CELL_SIZE) {
    const gx=Math.floor(x/step),gz=Math.floor(z/step),x0=gx*step,z0=gz*step;
    const u=(x-x0)/step,v=(z-z0)/step;
    const h00=this.height(x0,z0,step),h10=this.height(x0+step,z0,step);
    const h01=this.height(x0,z0+step,step),h11=this.height(x0+step,z0+step,step);
    return u+v<=1?h00*(1-u-v)+h10*u+h01*v:h11*(u+v-1)+h10*(1-v)+h01*(1-u);
  }
  vegetationClear(x:number,z:number,radius:number) {
    let clear=true;this.forNearby(x,z,radius+1.5,()=>{clear=false});return clear;
  }
  geometry(x0:number,z0:number,size:number,n:number,lower=0):T.BufferGeometry {
    const work=this.geometrySteps(x0,z0,size,n,lower);let next=work.next();while(!next.done)next=work.next();return next.value;
  }
  *geometrySteps(x0:number,z0:number,size:number,n:number,lower=0):Generator<void,T.BufferGeometry,void> {
    const position:number[]=[],color:number[]=[],indices:number[]=[],c=new T.Color();
    const step=size/n;
    for(let j=0;j<=n;j++){yield;for(let i=0;i<=n;i++) {
      const x=x0+i*step,z=z0+j*step,h=this.height(x,z,step)-lower;
      position.push(x,h,z);
      const road=this.roads.nearest(x,z),raw=this.roads.rawHeight(x,z);
      const rough=Math.abs(this.roads.rawHeight(x+4,z)-raw)+Math.abs(this.roads.rawHeight(x,z+4)-raw);
      const variation=.5+.5*Math.sin(x*.015+Math.sin(z*.032));
      c.set(h<2?'#b6b1a0':rough>4?'#827e71':h>180?'#758070':variation>.5?'#6b7951':'#87916b');
      if(road.distance<road.road.width/2+7)c.set('#98947d');
      const region=this.roads.region(x,z);
      if(region==='COPPER DUNES')c.set(variation>.5?'#c0a16c':'#ad8d58');
      else if(region==='DRY MESA')c.set(rough>3?'#ab7858':'#b69c74');
      else if(region==='SUMMIT PEAKS')c.set(h>365?'#c4c8c4':rough>3?'#888d88':'#7c8974');
      else if(region==='MORROW VALLEY')c.set(variation>.5?'#849559':'#647c48');
      else if(region==='CEDAR SUBURBS'||region==='ZENITH INDUSTRIAL')c.set('#898f79');
      c.multiplyScalar(.87+variation*.12);color.push(c.r,c.g,c.b);
    }
    }
    for(let j=0;j<n;j++)for(let i=0;i<n;i++) {const a=j*(n+1)+i;indices.push(a,a+n+1,a+1,a+1,a+n+1,a+n+2)}
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(position,3));
    geometry.setAttribute('color',new T.Float32BufferAttribute(color,3));
    geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
  }
}
