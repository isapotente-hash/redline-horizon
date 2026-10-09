import * as T from 'three';
import {DrawnTrack,buildDrawnRoad,TRACK_ORIGIN,TRACK_SIZE,TRACK_HEIGHT} from '../racing/DrawnTrack';
import {Road,RoadNetwork} from './RoadNetwork';
import {PhysicsWorld} from '../physics/VehiclePhysics';
import {roadRibbon} from './roadGeometry';
import {asphaltMaterial} from '../rendering/RuralMaterials';

/** Isolated flat arena: a handful of draws/colliders, independent of world streaming. */
export class DrawnTrackWorld{
  readonly root=new T.Group();
  road:Road;
  private colliders:ReturnType<PhysicsWorld["box"]>[]=[];
  constructor(public track:DrawnTrack,private roads:RoadNetwork,private physics:PhysicsWorld){
    this.road=buildDrawnRoad(track);this.root.name='Drawn track arena';
    const size=TRACK_SIZE+300;
    const ground=new T.Mesh(new T.PlaneGeometry(size,size),new T.MeshStandardMaterial({color:'#a89a6b',roughness:1}));
    ground.rotation.x=-Math.PI/2;ground.position.set(TRACK_ORIGIN,TRACK_HEIGHT-.16,TRACK_ORIGIN);ground.receiveShadow=true;this.root.add(ground);
    this.colliders.push(physics.box(TRACK_ORIGIN,TRACK_HEIGHT-.26,TRACK_ORIGIN,size,.2,size));
    const end=this.road.samples.length-1,half=this.road.width/2;
    const ribbon=roadRibbon(this.road,0,end,-half,half);
    const road=new T.Mesh(ribbon,asphaltMaterial());road.receiveShadow=true;this.root.add(road);this.colliders.push(physics.mesh(ribbon));
    const lineMat=new T.MeshStandardMaterial({color:'#f1efdc',roughness:.9});
    for(const side of [-1,1]){const line=new T.Mesh(roadRibbon(this.road,0,end,side*(half-.16)-.08,side*(half-.16)+.08,.012),lineMat);this.root.add(line);}
    const curbMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:.9});
    for(const side of [-1,1]){
      const curb=roadRibbon(this.road,0,end,side*half,side*(half+.65),.018).toNonIndexed();
      const colors=new Float32Array(curb.getAttribute('position').count*3),color=new T.Color();
      for(let i=0;i<colors.length/3;i++){color.set(Math.floor(i/12)%2?'#e8e6d6':'#be3c35');colors.set([color.r,color.g,color.b],i*3);}
      curb.setAttribute('color',new T.BufferAttribute(colors,3));this.root.add(new T.Mesh(curb,curbMaterial));
    }
    this.roads.setDrawnRoad(this.road);
  }
  dispose(){
    this.roads.setDrawnRoad(undefined);
    for(const collider of this.colliders)this.physics.world.removeCollider(collider,true);
    const materials=new Set<T.Material>();
    this.root.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
    for(const m of materials)m.dispose();this.root.removeFromParent();
  }
}
