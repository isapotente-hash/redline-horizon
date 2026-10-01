import * as T from "three";
import { clamp, fbm, lerp, smooth, wrap } from "../core/math";
export type Sample = { p: T.Vector3; t: T.Vector3; r: T.Vector3; d: number; bank?:number;crossSlope?:number };
export const roadHeight=(s:Sample,offset=0)=>s.p.y+(Math.tan(s.bank||0)+(s.crossSlope||0))*offset;
export const surfaceBank=(s:Sample)=>Math.atan(Math.tan(s.bank||0)+(s.crossSlope||0));
export type Road = {
  name: string;
  curve: T.CatmullRomCurve3;
  length: number;
  width: number;
  closed: boolean;
  samples: Sample[];
};
export type RoadHit = {
  road: Road;
  sample: Sample;
  distance: number;
  offset: number;
  height: number;
};
export class RoadNetwork {
  roads: Road[] = [];
  grid = new Map<string, { road: Road; i: number }[]>();
  main: Road;
  readonly layoutVersion=2;
  bounds={minX:0,maxX:0,minZ:0,maxZ:0};
  structures:{road:Road;start:number;end:number;kind:"tunnel"|"bridge"}[]=[];
  junctions: {x:number;z:number;y:number;radius:number;parentRoad?:Road}[] = [];
  private ready = false;
  inJunction(x:number,z:number,margin=0) { return this.junctions.some(j=>Math.hypot(x-j.x,z-j.z)<j.radius+margin); }
  /** Find true XZ crossings and shared endpoints, then give all approaches a common flat core. */
  private joinRoads() {
    const add=(x:number,z:number,y:number,radius:number)=>{
      if(!this.junctions.some(j=>Math.hypot(x-j.x,z-j.z)<8))this.junctions.push({x,z,y,radius});
    };
    for(let ai=0;ai<this.roads.length;ai++)for(let bi=ai+1;bi<this.roads.length;bi++) {
      const ar=this.roads[ai],br=this.roads[bi];
      for(let i=0;i<ar.samples.length-1;i++) {
        const a=ar.samples[i].p,b=ar.samples[i+1].p,ux=b.x-a.x,uz=b.z-a.z;
        for(let k=0;k<br.samples.length-1;k++) {
          const c=br.samples[k].p,d=br.samples[k+1].p;
          if(Math.max(a.x,b.x)+30<Math.min(c.x,d.x)||Math.min(a.x,b.x)-30>Math.max(c.x,d.x)||Math.max(a.z,b.z)+30<Math.min(c.z,d.z)||Math.min(a.z,b.z)-30>Math.max(c.z,d.z))continue;
          const vx=d.x-c.x,vz=d.z-c.z,den=ux*vz-uz*vx;
          // A fork can overlap physically without its centerlines crossing.
          // Resolve the full paved corridor, including verge overlap, into one junction.
          const mx=(a.x+b.x)/2,mz=(a.z+b.z)/2,len=vx*vx+vz*vz;
          const projected=clamp(((mx-c.x)*vx+(mz-c.z)*vz)/len,0,1),gap=Math.hypot(mx-c.x-vx*projected,mz-c.z-vz*projected);
          if(gap<(ar.width+br.width)/2+14)add((mx+c.x+vx*projected)/2,(mz+c.z+vz*projected)/2,(ar.name==="NOVA CITY"||br.name==="NOVA CITY"?25:(a.y+b.y)/2),Math.max(ar.width,br.width)+26);
          if(Math.abs(den)<1e-8)continue;
          const t=((c.x-a.x)*vz-(c.z-a.z)*vx)/den,u=((c.x-a.x)*uz-(c.z-a.z)*ux)/den;
          if(t>=-.001&&t<=1.001&&u>=-.001&&u<=1.001) {
            const city=ar.name==="NOVA CITY"||br.name==="NOVA CITY";
            const sin=Math.abs(den)/Math.hypot(ux,uz)/Math.hypot(vx,vz);
            add(a.x+t*ux,a.z+t*uz,city?25:lerp(a.y,b.y,t),Math.min(70,Math.max(ar.width,br.width)/Math.max(.3,sin)+14));
          }
        }
      }
      // Catmull-Rom end/control points can fall a few centimetres from the sampled ribbon.
      for(const [source,target] of [[ar,br],[br,ar]])if(!source.closed)for(const e of [source.samples[0],source.samples.at(-1)!]) {
        for(let k=0;k<target.samples.length-1;k++) {
          const a=target.samples[k].p,b=target.samples[k+1].p,dx=b.x-a.x,dz=b.z-a.z;
          const t=clamp(((e.p.x-a.x)*dx+(e.p.z-a.z)*dz)/(dx*dx+dz*dz),0,1);
          if(Math.hypot(e.p.x-a.x-t*dx,e.p.z-a.z-t*dz)<1.5)add(e.p.x,e.p.z,source.name==="NOVA CITY"||target.name==="NOVA CITY"?25:lerp(a.y,b.y,t),40);
        }
      }
    }
    // Merge nearby cores so overlapping junctions never prescribe different heights.
    let merged=true;
    while(merged) {merged=false;outer:for(let i=0;i<this.junctions.length;i++)for(let k=i+1;k<this.junctions.length;k++) {
      const a=this.junctions[i],b=this.junctions[k],dist=Math.hypot(a.x-b.x,a.z-b.z);
      if(dist<a.radius+b.radius+12) {
        const radius=Math.max(a.radius,b.radius,(dist+a.radius+b.radius)/2),t=dist>0?(radius-a.radius)/dist:0;
        a.x=lerp(a.x,b.x,t);a.z=lerp(a.z,b.z,t);a.radius=radius;
        this.junctions.splice(k,1);merged=true;break outer;
      }
    }}
    for(const road of this.roads) {
      for(const sample of road.samples) {
        const distances=this.junctions.map(j=>({j,d:Math.hypot(sample.p.x-j.x,sample.p.z-j.z)}));
        const core=distances.find(({j,d})=>d<=j.radius+8);
        if(core)sample.p.y=core.j.y;
        else {
          let total=0,sum=0,edge=Infinity;
          for(const {j,d} of distances){const gap=d-j.radius-8;if(gap>=360)continue;const w=(1-smooth(0,360,gap))**2/Math.max(.01,gap*gap);total+=w;sum+=j.y*w;edge=Math.min(edge,gap);}
          if(total>0)sample.p.y=lerp(sample.p.y,sum/total,1-smooth(0,360,edge));
        }
      }
      const last=road.samples.length-1;
      for(let i=0;i<=last;i++) {
        const prev=road.samples[i===0?(road.closed?last-1:0):i-1].p;
        const next=road.samples[i===last?(road.closed?1:last):i+1].p;
        road.samples[i].t.copy(next).sub(prev).normalize();
        road.samples[i].r.set(-road.samples[i].t.z,0,road.samples[i].t.x).normalize();
      }
      let length=0;
      for(let i=0;i<=last;i++){if(i)length+=road.samples[i].p.distanceTo(road.samples[i-1].p);road.samples[i].d=length;}
      road.length=length;
    }
  }
  constructor() {
    this.main = this.add("HORIZON 01", 16, true, [
      [0, 24, 400],
      [0, 24, 0],
      [-28, 29, -320],
      [65, 38, -670],
      [65, 46, -1000],
      [-95, 66, -1340],
      [-190, 86, -1680],
      [-390, 126, -2020],
      [-750, 155, -2200],
      [-1120, 125, -2040],
      [-1480,172,-2720],[-1850,218,-3290],[-2300,265,-3620],
      [-2770,248,-3470],[-2910,220,-3860],[-3350,180,-4200],
      [-4000,100,-4320],[-4470,78,-3980],[-4800,67,-3350],
      [-4490,74,-2850],[-4810,82,-2430],[-5100,72,-1710],
      [-4780,51,-1020],[-4550,33,-250],[-4640,29,430],
      [-4240,25,1150],[-3600,28,1740],[-2900,30,2290],
      [-2230,29,2270],[-1700,26,1860],[-1450,25,1300],
      [-1240,25,795],[-800,24,300],
      [-390, 26, 570],
    ]);
    this.add("SILVER CANYON", 9, false, [
      [-1120, 125, -2040],
      [-1370, 155, -2370],
      [-1680, 195, -2640],
      [-2020, 223, -2520],
      [-2140, 236, -2100],
      [-2480, 205, -1790],
      [-2770, 176, -1640],
      [-2700, 137, -1190],
      [-2310, 90, -920],
      [-1930, 56, -1080],
      [-1590, 40, -1250],
    ]);
    this.add("MORROW VALLEY", 10, false, [
      [-1510, 28, -690],
      [-1900, 25, -540],
      [-2080, 25, 0],
      [-2030, 27, 620],
      [-1580, 29, 1090],
      [-1030, 26, 1290],
      [-550, 26, 1000],
      [-390, 26, 570],
    ]);
    for (let i = 0; i < 4; i++)
      this.add("NOVA CITY", 13, false, [
        [-1840, 25, 300 + i * 165],
        [-1240, 25, 300 + i * 165],
        [-640, 25, 300 + i * 165],
      ]);
    for (let i = 0; i < 5; i++)
      this.add("NOVA CITY", 13, false, [
        [-1780 + i * 250, 25, 190],
        [-1780 + i * 250, 25, 600],
        [-1780 + i * 250, 25, 940],
      ]);
    this.add("PORT ZENITH", 12, false, [
      [-640, 25, 630],
      [-390, 23, 850],
      [-65, 21, 1140],
      [170, 19, 1300],
      [220, 18, 1780],
      [-120, 22, 1830],
      [-550, 26, 1000],
    ]);
    // The original western road remains a connected scenic alternative.
    this.add("RIDGE CONNECTOR",12,false,[[-1120,125,-2040],[-1400,86,-1670],[-1590,40,-1250],[-1510,28,-690],[-1240,22,-200],[-800,24,300]]);
    const summit=this.add("SUMMIT PASS",10,false,[[-1850,218,-3290],[-1720,248,-3890],[-2080,306,-4380],[-2600,355,-4730],[-3000,370,-5090],[-3410,238,-4900],[-3700,171,-4690],[-4000,100,-4320]]);
    this.add("SUNSET EXPRESSWAY",24,false,[[-4470,78,-3980],[-4160,64,-2900],[-3700,36,-1500],[-3370,29,-200],[-2900,27,750],[-2600,28,1560],[-2230,29,2270]]);
    this.add("COPPER DUNES",12,false,[[-4800,67,-3350],[-5500,61,-3500],[-6200,48,-3100],[-6550,55,-2550],[-6200,67,-1970],[-5700,78,-2100],[-4810,82,-2430]]);
    this.add("CEDAR SUBURBS",12,false,[[-2030,27,620],[-2350,28,1150],[-2600,28,1560],[-2600,30,1990],[-2900,30,2290]]);
    const coast=this.add("SOUTH COAST",14,false,[[-550,26,1000],[-350,24,1960],[-500,28,2750],[-1060,39,3240],[-1780,34,3400],[-2260,28,2980],[-2230,29,2270]]);
    this.add("ZENITH INDUSTRIAL",14,false,[[-550,26,1000],[-900,25,1620],[-700,24,2150],[-350,24,1960]]);
    this.joinRoads();
    const established=[...this.roads];
    const bracken=this.add("BRACKEN LANE",7.8,false,[[-1900,25,-540],[-2220,33,-625],[-2490,48,-580],[-2730,66,-400],[-2780,80,-180],[-2570,53,35],[-2540,61,240],[-2310,40,465],[-2030,27,620]]);
    const switchbacks=this.add("HIGHLAND SWITCHBACKS",8.2,false,[[-2600,355,-4730],[-2510,381,-5050],[-2500,399,-5380],[-2620,405,-5500],[-2810,391,-5500],[-2880,386,-5410],[-2690,372,-5300],[-2690,360,-5200],[-2880,352,-5180],[-3060,327,-5260],[-3270,286,-5220],[-3410,238,-4900]]);
    this.structures=[{road:this.main,start:760,end:1000,kind:"tunnel"},{road:summit,start:1050,end:1390,kind:"tunnel"},{road:coast,start:1300,end:1660,kind:"bridge"}];

    this.ready = true;
    for(const road of this.roads)for(const a of road.samples){this.bounds.minX=Math.min(this.bounds.minX,a.p.x);this.bounds.maxX=Math.max(this.bounds.maxX,a.p.x);this.bounds.minZ=Math.min(this.bounds.minZ,a.p.z);this.bounds.maxZ=Math.max(this.bounds.maxZ,a.p.z);}

    for (const road of this.roads)
      for (let i = 0; i < road.samples.length - 1; i++) {
        const p = road.samples[i].p,
          k = this.key(p.x, p.z);
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k)!.push({ road, i });
      }
    // Attach added branches to the existing graded pavement. Do not re-flatten
    // established routes just because a new side road shares a control point.
    for(const road of [bracken,switchbacks]){
      const ends=[road.samples[0],road.samples.at(-1)!];
      for(const end of ends){
        let best:RoadHit|undefined;
        for(const parent of established){const hit=this.nearest(end.p.x,end.p.z,false,parent);if(!best||hit.distance<best.distance)best=hit;}
        if(!best||best.distance>4)throw new Error(`Disconnected scenic road: ${road.name}`);
        const parent=best.road;
        this.junctions.push({x:end.p.x,z:end.p.z,y:best.height,radius:30,parentRoad:parent});
        for(const sample of road.samples){
          const gap=sample.p.distanceTo(end.p);if(gap>220)continue;
          const h=this.nearest(sample.p.x,sample.p.z,true,parent);
          if(Number.isFinite(h.distance)){
            const blend=1-smooth(75,220,gap);sample.p.y=lerp(sample.p.y,h.height,blend);
            const t=h.sample.t,horizontal=t.x*t.x+t.z*t.z;
            sample.crossSlope=(t.x*sample.r.x+t.z*sample.r.z)*t.y/Math.max(.01,horizontal)*blend;
          }
        }
      }
      let length=0;
      for(let i=0;i<road.samples.length;i++){
        const s=road.samples[i],a=road.samples[Math.max(0,i-1)],b=road.samples[Math.min(road.samples.length-1,i+1)];
        s.t.copy(b.p).sub(a.p).normalize();s.r.set(-s.t.z,0,s.t.x).normalize();if(i)length+=s.p.distanceTo(road.samples[i-1].p);s.d=length;
      }
      road.length=length;
      for(let i=0;i<road.samples.length;i++){
        const a=road.samples[Math.max(0,i-2)],b=road.samples[Math.min(road.samples.length-1,i+2)],s=road.samples[i];
        const turn=Math.atan2(a.t.x*b.t.z-a.t.z*b.t.x,a.t.x*b.t.x+a.t.z*b.t.z),fade=smooth(0,120,s.d)*(1-smooth(road.length-120,road.length,s.d));
        s.bank=this.inJunction(s.p.x,s.p.z,45)?0:clamp(-turn*.45,-.055,.055)*fade;
      }
    }
  }
  key(x: number, z: number) {
    return `${Math.floor(x / 100)},${Math.floor(z / 100)}`;
  }
  add(name: string, width: number, closed: boolean, ps: number[][]) {
    const curve = new T.CatmullRomCurve3(
      ps.map((p) => new T.Vector3(...(p as [number, number, number]))),
      closed,
      "catmullrom",
      0.25,
    );
    curve.arcLengthDivisions = 4000;
    const length = curve.getLength(),
      road: Road = { name, width, closed, curve, length, samples: [] };
    const n = Math.ceil(length / 4);
    for (let i = 0; i <= n; i++)
      road.samples.push(this.at(road, (i / n) * length));
    this.roads.push(road);
    return road;
  }
  at(road: Road, d: number): Sample {
    if(this.ready) {
      const distance=road.closed?wrap(d,road.length):clamp(d,0,road.length),index=this.sampleIndex(road,distance),i=index,u=(distance-road.samples[i].d)/(road.samples[i+1].d-road.samples[i].d);
      const a=road.samples[i],b=road.samples[i+1],t=a.t.clone().lerp(b.t,u).normalize();
      return {p:a.p.clone().lerp(b.p,u),t,r:new T.Vector3(-t.z,0,t.x).normalize(),d:distance,bank:lerp(a.bank||0,b.bank||0,u),crossSlope:lerp(a.crossSlope||0,b.crossSlope||0,u)};
    }
    const u =
        (road.closed ? wrap(d, road.length) : clamp(d, 0, road.length)) /
        road.length,
      p = road.curve.getPointAt(u),
      t = road.curve.getTangentAt(u).normalize();
    return {
      p,
      t,
      r: new T.Vector3(-t.z, 0, t.x).normalize(),
      d: road.closed ? wrap(d, road.length) : clamp(d, 0, road.length),
    };
  }
  sampleIndex(road:Road,d:number){let lo=0,hi=road.samples.length-1;while(lo+1<hi){const m=(lo+hi)>>1;if(road.samples[m].d<=d)lo=m;else hi=m;}return lo;}
  nearest(x: number, z: number, wide = false, onlyRoad?:Road): RoadHit {
    // Search with scalars; materialize vectors only for the winning segment.
    let bestDistance = Infinity, bestRoad = this.main, bestIndex = 0, bestF = 0;
    const gx = Math.floor(x / 100), gz = Math.floor(z / 100), rad = wide ? 4 : 1;
    for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
      const cell = this.grid.get(`${gx + dx},${gz + dz}`);
      if (!cell) continue;
      for (const item of cell) {
        if (onlyRoad && item.road !== onlyRoad) continue;
        const a = item.road.samples[item.i], b = item.road.samples[item.i + 1];
        const vx = b.p.x - a.p.x, vz = b.p.z - a.p.z, length2 = vx * vx + vz * vz;
        if (length2 <= 1e-12) continue;
        const f = clamp(((x - a.p.x) * vx + (z - a.p.z) * vz) / length2, 0, 1);
        const ex = x - a.p.x - vx * f, ez = z - a.p.z - vz * f, distance2 = ex * ex + ez * ez;
        if (distance2 < bestDistance) { bestDistance = distance2; bestRoad = item.road; bestIndex = item.i; bestF = f; }
      }
    }
    if (!Number.isFinite(bestDistance)) return {road:this.main,sample:this.main.samples[0],distance:Infinity,offset:0,height:24};
    const a = bestRoad.samples[bestIndex], b = bestRoad.samples[bestIndex + 1];
    const p = a.p.clone().lerp(b.p, bestF), r = a.r.clone().lerp(b.r, bestF).normalize();
    const offset=(x-p.x)*r.x+(z-p.z)*r.z,bank=lerp(a.bank||0,b.bank||0,bestF),crossSlope=lerp(a.crossSlope||0,b.crossSlope||0,bestF);
    return {road:bestRoad, sample:{p, r, t:a.t.clone().lerp(b.t, bestF).normalize(),bank,crossSlope,
      d:lerp(a.d, b.d === 0 ? bestRoad.length : b.d, bestF)},
      distance:Math.sqrt(bestDistance), offset, height:p.y+(Math.tan(bank)+crossSlope)*offset};
  }
  rawHeight(x: number, z: number) {
    const coast = 150 + Math.sin(z * 0.0018) * 90,
      land =
        23 + fbm(x * 0.0014, z * 0.0014) * 50 + fbm(x * 0.015, z * 0.015) * 14,
      mountain =
        420 * Math.exp(-((x + 950) ** 2 / 740000 + (z + 2350) ** 2 / 460000)),
      canyon =
        230 * Math.exp(-((x + 2650) ** 2 / 550000 + (z + 2500) ** 2 / 420000));
    return lerp(
      -28,
      land + mountain + canyon + 400*Math.exp(-((x+2900)**2/1400000+(z+4850)**2/850000)),
      1 - smooth(coast - 180, coast + 95, x),
    );
  }
  height(x: number, z: number) {
    const h = this.rawHeight(x, z),
      n = this.nearest(x, z);
    const bridge=this.structures.find(s=>s.kind==='bridge'&&s.road===n.road);
    if(bridge&&n.distance<140){
      const amount=smooth(bridge.start-100,bridge.start+20,n.sample.d)*(1-smooth(bridge.end-20,bridge.end+100,n.sample.d))*(1-smooth(80,140,n.distance));
      if(amount>0)return lerp(h,n.height-32,amount);
    }
    return n.distance < 110
      ? lerp(
          n.height - 0.35,
          h,
          smooth(n.road.width / 2 + 15, n.road.width / 2 + 85, n.distance),
        )
      : h;
  }
  region(x: number, z: number) {
    if(x<-5250)return "COPPER DUNES";
    if(z<-3800&&x>-4100)return "SUMMIT PEAKS";
    if(x<-3950&&z<-1700)return "DRY MESA";
    if(z>2450)return "SOUTH COAST";
    if(z>1450&&z<2300&&x>-1100)return "ZENITH INDUSTRIAL";
    if(z>1000&&z<2400&&x>-2900&&x<-1800)return "CEDAR SUBURBS";
    if (z < -1900 && x < -1450) return "SILVER CANYON";
    if (z < -1350) return "REDWOOD RIDGE";
    if (z > 1050 && x > -650) return "PORT ZENITH";
    if (z > 190 && z < 960 && x < -600 && x > -1900) return "NOVA CITY";
    if (x < -1650 || z > 800) return "MORROW VALLEY";
    return "AZURE COAST";
  }
}
