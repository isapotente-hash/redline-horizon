import * as T from 'three';
import { RoadNetwork, Road } from '../world/RoadNetwork';
import {drawSpeedSign,roadSignStyle,SpeedSignStyle} from './SpeedSigns';

export class SpeedZones {
  zones: {road: Road; start: number; end: number; limit: number}[] = [];
  root = new T.Group();
  signStyle:SpeedSignStyle='circle';
  constructor(public roads: RoadNetwork) {
    for (const road of roads.roads) {
      if (road === roads.main) {
        this.zones.push({road,start:0,end:740,limit:80},{road,start:740,end:1040,limit:60}, {road,start:1500,end:3200,limit:80});
      } else {
        const limit = road.name === 'NOVA CITY' ? 50 : road.name === 'PORT ZENITH' ? 60 : road.name === 'SILVER CANYON' ? 80 : 0;
        if (limit) this.zones.push({road,start:0,end:road.length,limit});
      }
    }
  }
  limitAt(position: T.Vector3) {
    const hit = this.roads.nearest(position.x,position.z);
    this.signStyle=roadSignStyle(hit.road.name);
    if (hit.distance > hit.road.width/2+2 || Math.abs(position.y-hit.height)>5) return 0;
    return this.zones.find(z=>z.road===hit.road && hit.sample.d>=z.start && hit.sample.d<z.end)?.limit || 0;
  }
  buildSigns() {
    const materials = new Map<string,T.MeshBasicMaterial>();
    const material = (limit:number,style:SpeedSignStyle='circle') => {
      const key=style+limit;if (materials.has(key)) return materials.get(key)!;
      const canvas=document.createElement('canvas');drawSpeedSign(canvas,limit,style);
      const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;
      const mat=new T.MeshBasicMaterial({map:texture,transparent:true,side:T.DoubleSide});materials.set(key,mat);return mat;
    };
    const pole=new T.MeshStandardMaterial({color:0x79858b,metalness:.65,roughness:.4});
    const postGeometry=new T.CylinderGeometry(.065,.065,3,8),circleGeometry=new T.CircleGeometry(.72,48),rectGeometry=new T.PlaneGeometry(1.08,1.44);
    for(const zone of this.zones) {
      const style=roadSignStyle(zone.road.name);
      const points=[zone.start+8,zone.end-8];
      for(let d=zone.start+220;d<zone.end-100;d+=300)points.push(d);
      for(const d of points)for(const direction of [-1,1]) {
        const a=this.roads.at(zone.road,d),group=new T.Group();
        group.position.copy(a.p).addScaledVector(a.r,direction*(zone.road.width/2+2));
        group.rotation.y=Math.atan2(-a.t.x*direction,-a.t.z*direction);
        const post=new T.Mesh(postGeometry,pole);post.position.y=1.5;group.add(post);
        const sign=new T.Mesh(style==='circle'?circleGeometry:rectGeometry,material(zone.limit,style));sign.position.set(0,2.85,.08);group.add(sign);this.root.add(group);
      }
      // End signs mark the unrestricted side of each bounded zone.
      for(const direction of [-1,1]) {
        const d=direction>0?zone.end+4:zone.start-4;
        if(!zone.road.closed && (d<0||d>zone.road.length))continue;
        if(this.zones.some(z=>z.road===zone.road&&d>=z.start&&d<z.end))continue;
        const a=this.roads.at(zone.road,d),g=new T.Group();g.position.copy(a.p).addScaledVector(a.r,direction*(zone.road.width/2+2));g.rotation.y=Math.atan2(-a.t.x*direction,-a.t.z*direction);
        const post=new T.Mesh(postGeometry,pole);post.position.y=1.5;g.add(post);
        const disc=new T.Mesh(circleGeometry,material(0));disc.position.set(0,2.85,.08);g.add(disc);this.root.add(g);
      }
    }
  }
}
