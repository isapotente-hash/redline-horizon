import {Road, RoadNetwork} from '../world/RoadNetwork';
import {wrap} from '../core/math';
export type RouteExit={road:Road;d:number;direction:number;angle:number;label:string};
export type RouteChoice={id:string;road:Road;d:number;distance:number;options:RouteExit[];selected:number;locked:boolean;visible:boolean;dismissed:boolean;expiresAt:number};
type Link={road:Road;d:number;other:Road;otherD:number};
/** Topology comes from actual ribbon crossings, not the much larger terrain blending zones. */
export class AutopilotRoutes {
  private links=new Map<Road,Link[]>();
  choice?:RouteChoice;
  private passed=new Map<string,number>();
  constructor(private roads:RoadNetwork){
    const add=(a:Road,ad:number,b:Road,bd:number)=>{
      for(const [road,d,other,otherD] of [[a,ad,b,bd],[b,bd,a,ad]] as [Road,number,Road,number][]){
        const list=this.links.get(road)||[];
        if(!list.some(l=>l.other===other&&Math.abs(l.d-d)<12))list.push({road,d,other,otherD});
        this.links.set(road,list);
      }
    };
    const indices=new Map(roads.roads.map((r,i)=>[r,i]));
    for(const road of roads.roads)for(let i=0;i<road.samples.length-1;i++){
      const a=road.samples[i],b=road.samples[i+1],ux=b.p.x-a.p.x,uz=b.p.z-a.p.z,gx=Math.floor(a.p.x/100),gz=Math.floor(a.p.z/100);
      for(let x=gx-1;x<=gx+1;x++)for(let z=gz-1;z<=gz+1;z++)for(const item of roads.grid.get(`${x},${z}`)||[]){
        if(indices.get(item.road)!<=indices.get(road)!)continue;
        const c=item.road.samples[item.i],d=item.road.samples[item.i+1],vx=d.p.x-c.p.x,vz=d.p.z-c.p.z,den=ux*vz-uz*vx;
        if(Math.abs(den)<1e-7)continue;
        const t=((c.p.x-a.p.x)*vz-(c.p.z-a.p.z)*vx)/den,u=((c.p.x-a.p.x)*uz-(c.p.z-a.p.z)*ux)/den;
        if(t<0||t>1||u<0||u>1||Math.abs(a.p.y+(b.p.y-a.p.y)*t-c.p.y-(d.p.y-c.p.y)*u)>1.5)continue;
        add(road,a.d+(b.d-a.d)*t,item.road,c.d+(d.d-c.d)*u);
      }
    }
    for(const road of roads.roads)if(!road.closed)for(const end of [road.samples[0],road.samples.at(-1)!])for(const other of roads.roads){
      if(other===road)continue;const hit=roads.nearest(end.p.x,end.p.z,false,other);
      if(hit.distance<3&&Math.abs(hit.height-end.p.y)<1.5)add(road,end.d,other,hit.sample.d);
    }
    for(const list of this.links.values())list.sort((a,b)=>a.d-b.d);
  }
  reset(){this.choice=undefined;this.passed.clear();}
  select(index:number){const c=this.choice;if(!c||c.locked||c.dismissed||!Number.isInteger(index)||!c.options[index])return false;c.selected=index;c.locked=true;c.visible=false;c.dismissed=true;return true;}
  consume(){if(this.choice){this.passed.set(this.choice.id,this.choice.d);this.choice=undefined;}}
  private window(c:RouteChoice,speed:number,closingSpeed:number,now:number){
    const threshold=Math.max(50,speed*2.5);
    if(c.distance<=threshold||c.locked){c.locked=true;c.visible=false;c.dismissed=true;return;}
    if(c.visible&&now>=c.expiresAt){c.visible=false;c.dismissed=true;return;}
    const eta=closingSpeed>.1?(c.distance-threshold)/closingSpeed:Infinity;
    if(!c.dismissed&&!c.visible&&eta<=4&&eta>0){c.visible=true;c.expiresAt=now+4;}
  }
  update(road:Road,d:number,direction:number,speed:number,closingSpeed=speed,now=performance.now()/1000){
    const gap=(target:number)=>road.closed?wrap((target-d)*direction+road.length/2,road.length)-road.length/2:(target-d)*direction;
    for(const [key,at] of this.passed)if(!key.startsWith(`${this.roads.roads.indexOf(road)}:`)||Math.abs(gap(at))>450)this.passed.delete(key);
    if(this.choice){
      const c=this.choice;c.distance=gap(c.d);
      if(c.road!==road||c.distance < -28){this.consume();}else{this.window(c,speed,closingSpeed,now);return c;}
    }
    const lead=Math.max(180,speed*8+speed*speed/7),list=this.links.get(road)||[];
    let closest:Link|undefined,dist=Infinity;
    for(const link of list){const g=gap(link.d),id=`${this.roads.roads.indexOf(road)}:${Math.round(link.d/12)}:${direction}`;if(g>60&&g<lead&&g<dist&&!this.passed.has(id)){closest=link;dist=g;}}
    if(!closest)return;
    const a=this.roads.at(road,closest.d),heading=a.t.clone().multiplyScalar(direction),options:RouteExit[]=[];
    const exit=(next:Road,at:number,dir:number)=>{
      if(!next.closed&&(dir>0?next.length-at:at)<35)return;
      const h=this.roads.at(next,at+dir*25).t.multiplyScalar(dir),angle=Math.atan2(heading.z*h.x-heading.x*h.z,heading.x*h.x+heading.z*h.z);
      if(Math.abs(angle)>2.35||options.some(o=>o.road===next&&o.direction===dir))return;
      options.push({road:next,d:at,direction:dir,angle,label:Math.abs(angle)<.28?'Straight':angle>0?'Left':'Right'});
    };
    exit(road,closest.d,direction);
    for(const link of list)if(Math.abs(link.d-closest.d)<12)for(const dir of [-1,1])exit(link.other,link.otherD,dir);
    if(options.length<2)return;
    options.sort((a,b)=>b.angle-a.angle);
    if(options.length===2&&options.every(o=>o.label==='Straight')&&options[0].angle-options[1].angle>.04){options[0].label='Left';options[1].label='Right';}
    let selected=options.findIndex(o=>o.road===road&&o.direction===direction);
    if(selected<0)selected=options.reduce((best,o,i)=>Math.abs(o.angle)<Math.abs(options[best].angle)?i:best,0);
    this.choice={id:`${this.roads.roads.indexOf(road)}:${Math.round(closest.d/12)}:${direction}`,road,d:closest.d,distance:dist,options,selected,locked:false,visible:false,dismissed:false,expiresAt:0};
    this.window(this.choice,speed,closingSpeed,now);
    return this.choice;
  }
}
