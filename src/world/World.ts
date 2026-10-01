import {wallOpening} from "./RoadLandmarks";
import {asphaltMaterial,dryFieldTexture,dryStoneMaterial} from '../rendering/RuralMaterials';
import {DryGrass} from './DryGrass';
import {RegionalScenery} from "./RegionalScenery";
import {yieldLoading} from "../core/Loading";
import {barrierGeometry,tunnelGeometry,supportGeometry,structureRange} from "./CollisionGeometry";
import {SceneryObstacle,sceneryCollider} from "./SceneryCollider";
import * as T from "three";
import {surfaceDetail} from "../rendering/SurfaceMaterials";
import {TerrainSampler} from "./TerrainSampler";
import {makeTreeVariants,treeWoodMaterial,treeFoliageMaterial} from "./TreeModel";
import { roadRibbon } from "./roadGeometry";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoadNetwork, Road, Sample,roadHeight } from "./RoadNetwork";
import { PhysicsWorld, R } from "../physics/VehiclePhysics";
import { rng, smooth, lerp, fbm } from "../core/math";
import { Settings } from "../core/SaveManager";
type Chunk = {
  group: T.Group;
  geometry: T.BufferGeometry;
  collider?: ReturnType<PhysicsWorld["mesh"]>;
  x: number;
  z: number;
  treeBatches: {foliage:T.InstancedMesh;wood:T.InstancedMesh;variant:number;nearFoliage:T.InstancedMesh;nearWood:T.InstancedMesh;transforms:T.Matrix4[];colors:T.Color[]}[];
  treeLod:number;
  grass:T.InstancedMesh;
  obstacles:SceneryObstacle[];
  obstacleColliders:ReturnType<typeof sceneryCollider>[];
};
export class World {
  root = new T.Group();
  roadsGroup = new T.Group();
  chunks = new Map<string, Chunk>();
  asphalt: T.MeshPhysicalMaterial;
  readonly dryGrass=new DryGrass();
  readonly stoneMaterial=dryStoneMaterial();
  vergeMaterial:T.MeshStandardMaterial;
  private readonly grassSectors:T.InstancedMesh[]=[];
  terrainMaterial = new T.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
  });
  guardMaterial = new T.MeshStandardMaterial({
    color: "#a2a6a4",
    metalness: 0.7,
    roughness: 0.34,
  });
  terrainSampler: TerrainSampler;
  regional:RegionalScenery;
  treeVariants = makeTreeVariants();
  rockGeo: T.BufferGeometry;
  treeMaterial = treeFoliageMaterial();
  rockMaterial = new T.MeshStandardMaterial({
    color: "#777c71",
    roughness: 0.95,
  });
  trunkMaterial = treeWoodMaterial();
  dummy = new T.Object3D();
  basis=new T.Matrix4();up=new T.Vector3();lodTick=0;
  wet = 0;
  city = new T.Group();
  /** Persistent road-sector pool: built once; gameplay only toggles visibility. */
  roadSectors:{group:T.Object3D;center:T.Vector3;radius:number}[]=[];
  farTiles=new Map<string,T.Mesh>();
  private streaming?:Promise<void>;
  private streamFailures=0;
  private nextStreamAt=0;
  private lastUpdate=-Infinity;
  private updateSettings='';
  private lastLod=new T.Vector3(Infinity,Infinity,Infinity);
  private cityCenter=new T.Vector3(-1300,25,700);
  private async buildChunkAsync(x:number,z:number){
    const work=this.chunkSteps(x,z);let next=work.next(),deadline=performance.now()+3;
    while(!next.done){if(performance.now()>=deadline){await yieldLoading();deadline=performance.now()+3;}next=work.next();}
  }
  private queueChunk(x:number,z:number){
    if(this.streaming||performance.now()<this.nextStreamAt)return;
    this.streaming=new Promise<void>((resolve,reject)=>setTimeout(()=>this.buildChunkAsync(x,z).then(resolve,reject),0)).finally(()=>{this.streaming=undefined;});
    // Startup/fast-travel awaits failures; driving keeps the last valid world and retries later.
    void this.streaming.then(()=>{this.streamFailures=0;this.nextStreamAt=0;},error=>{
      this.streamFailures++;
      this.nextStreamAt=performance.now()+Math.min(30000,1000*2**Math.min(5,this.streamFailures-1));
      if(this.streamFailures===1)console.error('Terrain streaming failed; retrying with backoff',error);
    });
  }
  constructor(
    public network: RoadNetwork,
    public physics: PhysicsWorld,
    public settings: Settings,
  ) {
    this.terrainSampler = new TerrainSampler(network);
    this.regional=new RegionalScenery(network,this.terrainSampler);
    const field=dryFieldTexture();
    surfaceDetail(this.terrainMaterial,"ground",field);this.terrainMaterial.bumpMap=field;this.terrainMaterial.bumpScale=.065;
    surfaceDetail(this.rockMaterial,"rock");
    this.vergeMaterial=surfaceDetail(new T.MeshStandardMaterial({name:'dry-grass-verge',color:'#bfa263',roughness:1,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2}),"ground",field);
    surfaceDetail(this.regional.materials.field,"ground",field);this.regional.materials.field.bumpMap=field;this.regional.materials.field.bumpScale=.065;
    this.asphalt=asphaltMaterial();this.dryGrass.update(settings);
    const random=rng(344);
    this.root.add(this.roadsGroup, this.city);
    this.rockGeo = new T.IcosahedronGeometry(1, 2);
    const ra = this.rockGeo.getAttribute("position");
    for (let i = 0; i < ra.count; i++) {
      const f = 0.7 + random() * 0.6;
      ra.setXYZ(i, ra.getX(i) * f, ra.getY(i) * f, ra.getZ(i) * f);
    }
    this.rockGeo.computeVertexNormals();
  }
  async init(progress:(fraction:number)=>void=()=>{}){
    const total=this.network.roads.reduce((sum,road)=>sum+Math.ceil((road.samples.length-1)/80)+1,0)+this.network.structures.length;let done=0;
    for(const _ of this.buildRoads()){progress(Math.min(.94,++done/total*.94));await yieldLoading();}
    this.buildCity();await yieldLoading();this.batchCity();await yieldLoading();this.buildSigns();progress(1);
    return this;
  }
  get visualRadius(){return Math.max(2,Math.min(6,Math.ceil(({low:2,medium:3,high:3,ultra:4}[this.settings.quality])*this.settings.renderDistance/1600)));}
  get residentRadius(){return Math.max(this.visualRadius,Math.ceil(this.settings.simulationDistance/256));}
  async prime(p:T.Vector3){
    await this.streaming;
    const radius=this.residentRadius,cx=Math.floor(p.x/256),cz=Math.floor(p.z/256);
    const tasks:{x:number;z:number;d:number}[]=[];
    for(let z=cz-radius;z<=cz+radius;z++)for(let x=cx-radius;x<=cx+radius;x++){const d=Math.hypot(x-cx,z-cz);if(d<=radius+.2&&!this.chunks.has(`${x},${z}`))tasks.push({x,z,d});}
    tasks.sort((a,b)=>a.d-b.d);
    for(const a of tasks){await this.buildChunkAsync(a.x,a.z);await yieldLoading();}
    for(let i=0;i<45;i++){if(!this.buildFarTerrain(p))break;await yieldLoading();}
    this.update(p,true);

  }
  mesh(g: T.BufferGeometry, m: T.Material, parent = this.roadsGroup) {
    const o = new T.Mesh(g, m);
    o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  *buildRoads() {
    const concrete = new T.MeshStandardMaterial({
        color: "#8f8b80",
        roughness: 0.9,
      }),
      white = new T.MeshStandardMaterial({ name:"solid-white-road-markings",color: "#f0f0e7", roughness: 0.85,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-20 });
    for (const road of this.network.roads) {
      const n = road.samples.length - 1;
      const pavement=this.asphalt.clone();
      // Deterministic depth bias resolves coplanar intersection surfaces without physical steps.
      pavement.polygonOffset=true;pavement.polygonOffsetFactor=-1;pavement.polygonOffsetUnits=-1-this.network.roads.indexOf(road);
      const junction=(x:number,z:number)=>{
        if(!this.network.inJunction(x,z))return false;
        for(const other of this.network.roads)if(other!==road&&this.network.nearest(x,z,false,other).distance<other.width/2+.5)return true;
        return false;
      };
      // One connected support mesh per road; sector boundaries are rendering-only.
      const support=supportGeometry(road,this.terrainSampler);this.physics.mesh(support);support.dispose();
      for (let i = 0; i < n; i += 80) {
        const sector=new T.Group();this.roadsGroup.add(sector);
        const oldGroup=this.roadsGroup;this.roadsGroup=sector;
        const end = Math.min(n, i + 80),
          g = roadRibbon(road, i, end, -road.width / 2, road.width / 2);
        this.mesh(g, pavement);
        for(const side of [-1,1]){
          const verge=roadRibbon(road,i,end,side*(road.width/2+2.3),side*(road.width/2+14)),positions=verge.getAttribute('position');
          for(let v=0;v<positions.count;v++){
            const sample=road.samples[i+Math.floor(v/2)],x=positions.getX(v),z=positions.getZ(v),offset=Math.hypot(x-sample.p.x,z-sample.p.z);
            if(offset>road.width/2+3){
              if(structureRange(this.network,road,sample.d,'bridge'))positions.setXYZ(v,sample.p.x+sample.r.x*side*(road.width/2+2.35),sample.p.y,sample.p.z+sample.r.z*side*(road.width/2+2.35));
              else positions.setY(v,Math.min(roadHeight(sample,side*(road.width/2+2.3))-.05,this.terrainSampler.groundHeight(x,z)));
            }
          }
          verge.computeVertexNormals();this.mesh(verge,this.vergeMaterial);
        }
        for (const s of [-1, 1]) {
          this.mesh(
            roadRibbon(
              road,
              i,
              end,
              s * (road.width / 2),
              s * (road.width / 2 + .45),
              0,
            ),
            concrete,
          ).material.side = T.DoubleSide;
          this.mesh(
            roadRibbon(
              road,
              i,
              end,
              s * (road.width / 2 - 0.48),
              s * (road.width / 2 - 0.35),
              0.016,
              junction,
            ),
            white,
          ).material.side = T.DoubleSide;
        }
        for(const side of [-1,1])this.mesh(roadRibbon(road,i,end,side*(road.width/2+.45),side*(road.width/2+2.3)),this.vergeMaterial);
        const centerLine=this.mesh(roadRibbon(road,i,end,-.085,.085,.018,junction),white);
        centerLine.name='Single solid white centre line';
        const grass=this.dryGrass.batch((end-i+1)*6),random=rng(i*917+this.network.roads.indexOf(road)*1177);
        for(let sample=i;sample<end;sample+=2){
          const a=road.samples[sample];
          if(this.network.inJunction(a.p.x,a.p.z,8)||structureRange(this.network,road,a.d))continue;
          for(const side of [-1,1])for(let tuft=0;tuft<3;tuft++){
            const p=a.p.clone().addScaledVector(a.t,(tuft-1)*1.35).addScaledVector(a.r,side*(road.width/2+.91));
            const grade=roadHeight(a,side*(road.width/2+.91))+a.t.y*(tuft-1)*1.35;
            // Check other crossing roads as well as the local pavement edge.
            const hit=this.network.nearest(p.x,p.z);
            if(hit.distance<hit.road.width/2+.55)continue;
            this.dryGrass.plant(grass,p.x,grade,p.z,random()*6.28,.65+random()*.3);
          }
          // Root extra field tufts on the actual shoulder ribbon beyond the wall.
          // Its cross-section is linear between the road grade and outer terrain edge.
          for(const side of [-1,1]){
            const outer=a.p.clone().addScaledVector(a.r,side*(road.width/2+14));
            const innerHeight=roadHeight(a,side*(road.width/2+2.3)),edgeHeight=Math.min(innerHeight-.05,this.terrainSampler.groundHeight(outer.x,outer.z));
            for(const offset of [2.9,4.4,6.4]){
              const p=a.p.clone().addScaledVector(a.r,side*(road.width/2+offset)),hit=this.network.nearest(p.x,p.z);
              if(hit.distance<hit.road.width/2+.55)continue;
              const height=lerp(innerHeight,edgeHeight,(offset-2.3)/11.7);
              this.dryGrass.plant(grass,p.x,height,p.z,random()*6.28,.8+random()*.5);
            }
          }
        }
        grass.computeBoundingSphere();sector.add(grass);this.grassSectors.push(grass);
        const center=road.samples[Math.floor((i+end)/2)].p.clone();
        this.roadSectors.push({group:sector,center,radius:road.samples[end].d-road.samples[i].d});
        this.roadsGroup=oldGroup;yield;
      }
      // Continuous grade-following dry stone walls; junctions and tunnel portals stay open.
      if(road===this.network.main||["SILVER CANYON","SUMMIT PASS","SUNSET EXPRESSWAY","SOUTH COAST","BRACKEN LANE","HIGHLAND SWITCHBACKS"].includes(road.name)){
        let first=-1;
        const flush=(end:number)=>{if(first<0||end<=first){first=-1;return;}for(const side of [-1,1]){
          const geometry=barrierGeometry(road,first,end,side),mesh=this.mesh(geometry,this.stoneMaterial);
          mesh.name='Roadside dry stone wall';mesh.castShadow=true;this.physics.mesh(geometry);const center=road.samples[Math.floor((first+end)/2)].p.clone();
          this.roadSectors.push({group:mesh,center,radius:(road.samples[end].d-road.samples[first].d)/2+20});
        }first=-1;};
        for(let i=0;i<n;i++){
          const a=road.samples[i],b=road.samples[i+1],middle=a.p.clone().lerp(b.p,.5),region=this.network.region(a.p.x,a.p.z);
          const omit=wallOpening(road,a.d)||this.network.inJunction(middle.x,middle.z,26)||!!structureRange(this.network,road,a.d,'tunnel')||['NOVA CITY','CEDAR SUBURBS','ZENITH INDUSTRIAL'].includes(region);
          if(omit)flush(i);else{if(first<0)first=i;if(i-first>=80){flush(i);first=i;}}
        }flush(n);
      }
      yield;
    }
    const tunnelMat=new T.MeshStandardMaterial({color:'#82857f',roughness:.88,side:T.DoubleSide});
    const lamp=new T.MeshStandardMaterial({color:'#ffe0ad',emissive:'#ffd394',emissiveIntensity:2});
    for(const structure of this.network.structures){
      const {road,start,end,kind}=structure;
      const from=this.network.sampleIndex(road,start),to=this.network.sampleIndex(road,end)+1;
      if(kind==='tunnel'){
        const geometry=tunnelGeometry(road,from,to),mesh=this.mesh(geometry,tunnelMat);mesh.castShadow=true;mesh.name='Tunnel walls and roof';
        this.physics.mesh(geometry);
        for(let d=start+6;d<end;d+=24){const a=this.network.at(road,d);for(const side of [-1,1]){
          const strip=new T.Mesh(new T.BoxGeometry(.18,.08,3),lamp);strip.position.copy(a.p).addScaledVector(a.r,side*4.8);strip.position.y+=7.5;strip.rotation.y=Math.atan2(a.t.x,a.t.z);this.roadsGroup.add(strip);
        }}
      }else{
        // Visible support piers sit beyond the driving deck, with matching solid collision.
        for(let d=start;d<end;d+=60){const a=this.network.at(road,d);for(const side of [-1,1]){
          const p=a.p.clone().addScaledVector(a.r,side*(road.width/2+1.6));
          const height=35,geometry=new T.BoxGeometry(.85,height,2),pier=new T.Mesh(geometry,tunnelMat);
          pier.position.copy(p);pier.position.y-=height/2+.3;pier.rotation.y=Math.atan2(a.t.x,a.t.z);this.roadsGroup.add(pier);
          this.physics.box(p.x,p.y-height/2-.3,p.z,.85,height,2,pier.rotation.y);
        }}
        const deck=roadRibbon(road,from,to,-road.width/2-2.3,road.width/2+2.3,-.25);this.mesh(deck,tunnelMat);
      }
      yield;
    }
  }
  terrain(x0:number,z0:number,size:number,n:number,lower=0){return this.terrainSampler.geometry(x0,z0,size,n,lower)}
  buildFarTerrain(p:T.Vector3) {
    const size=1024,cx=Math.floor(p.x/size),cz=Math.floor(p.z/size),radius=Math.ceil(this.settings.renderDistance/1024)+1;
    let nearest:{x:number;z:number;d:number}|undefined;
    for(let z=cz-radius;z<=cz+radius;z++)for(let x=cx-radius;x<=cx+radius;x++){
      const d=Math.hypot(x-cx,z-cz);if(d>radius+.2||this.farTiles.has(`${x},${z}`))continue;
      if(!nearest||d<nearest.d)nearest={x,z,d};
    }
    if(nearest){const {x,z}=nearest,g=this.terrain(x*size,z*size,size,16,2),mesh=this.mesh(g,this.terrainMaterial,this.root);this.farTiles.set(`${x},${z}`,mesh);}
    for(const [key,mesh] of this.farTiles){const [x,z]=key.split(',').map(Number);if(Math.hypot(x-cx,z-cz)>radius+1.5){this.root.remove(mesh);mesh.geometry.dispose();this.farTiles.delete(key);}}
    return !!nearest;
  }
  createChunk(x:number,z:number):Chunk {
    const work=this.chunkSteps(x,z);let next=work.next();while(!next.done)next=work.next();return next.value;
  }
  private *chunkSteps(x:number,z:number):Generator<void,Chunk,void> {
    const grass=yield* this.dryGrass.field(x,z,this.network,this.terrainSampler);
    const group=new T.Group(),g=yield* this.terrainSampler.geometrySteps(x*256,z*256,256,24);
    this.mesh(g,this.terrainMaterial,group);group.add(grass);
    const r=rng((x*73856093)^(z*19349663));
    const treeBatches=this.treeVariants.map((variant,i)=>({variant:i,foliage:new T.InstancedMesh(variant.far.foliage,this.treeMaterial,96),wood:new T.InstancedMesh(variant.far.wood,this.trunkMaterial,96),nearFoliage:new T.InstancedMesh(variant.near.foliage,this.treeMaterial,96),nearWood:new T.InstancedMesh(variant.near.wood,this.trunkMaterial,96),transforms:[] as T.Matrix4[],colors:[] as T.Color[]}));
    const obstacles:SceneryObstacle[]=[];
    const counts=[0,0,0],rocks=new T.InstancedMesh(this.rockGeo,this.rockMaterial,32);let nt=0,nr=0;
    for(let i=0;i<150;i++) {
      if(i%10===0)yield;
      const px=(x+r())*256,pz=(z+r())*256,city=px>-1900&&px<-580&&pz>170&&pz<1010;
      if(city)continue;
      const region=this.network.region(px,pz),dry=region==='COPPER DUNES'||region==='DRY MESA',alpine=region==='SUMMIT PEAKS',dense=region==='REDWOOD RIDGE';
      const isRock=i%(dry||alpine?2:6)===0,index=Math.floor(r()*3),size=.78+r()*.55;
      const radius=isRock?5.5:Math.max(this.treeVariants[index].near.radius,this.treeVariants[index].far.radius)*size;
      if(!this.terrainSampler.vegetationClear(px,pz,radius))continue;
      const h=this.terrainSampler.groundHeight(px,pz);
      if(h<3)continue;
      if(isRock&&nr<32){
        this.dummy.position.set(px,h-.1,pz);this.dummy.scale.set(1.5+r()*4,1+r()*4,1.5+r()*4);this.dummy.rotation.set(r(),r()*6,r()*.5);this.dummy.updateMatrix();rocks.setMatrixAt(nr,this.dummy.matrix);rocks.setColorAt(nr++,new T.Color(dry?'#dfb387':alpine?'#c7c9c5':'#ffffff'));obstacles.push({kind:"rock",matrix:this.dummy.matrix.clone()});
      }else if(!dry && nt<(dense?96:alpine?12:region==="CEDAR SUBURBS"?18:region==="MORROW VALLEY"?20:36)&&h<320){
        const slope=Math.abs(this.terrainSampler.groundHeight(px+2,pz)-h)+Math.abs(this.terrainSampler.groundHeight(px,pz+2)-h);
        if(slope>3.5)continue;
        const batch=treeBatches[index],n=counts[index]++;
        this.dummy.position.set(px,h-.06,pz);this.dummy.scale.setScalar(size);this.dummy.rotation.set(0,r()*Math.PI*2,0);this.dummy.updateMatrix();
        obstacles.push({kind:"tree",matrix:this.dummy.matrix.clone(),height:[8.8,11.2,7.8][index]});
        batch.foliage.setMatrixAt(n,this.dummy.matrix);batch.wood.setMatrixAt(n,this.dummy.matrix);
        const color=new T.Color().setRGB(.83+r()*.17,.88+r()*.12,.79+r()*.19);batch.foliage.setColorAt(n,color);batch.transforms.push(this.dummy.matrix.clone());batch.colors.push(color);nt++;
      }
    }
    treeBatches.forEach((b,i)=>{b.foliage.count=b.wood.count=counts[i];b.nearFoliage.count=b.nearWood.count=0;b.nearFoliage.visible=b.nearWood.visible=false;for(const mesh of [b.foliage,b.wood,b.nearFoliage,b.nearWood])mesh.castShadow=mesh.receiveShadow=true;group.add(b.foliage,b.wood,b.nearFoliage,b.nearWood)});
    rocks.count=nr;rocks.castShadow=rocks.receiveShadow=true;group.add(rocks,yield* this.regional.buildSteps(x,z,obstacles));this.root.add(group);
    const chunk:Chunk={group,geometry:g,x,z,treeBatches,treeLod:1,grass,obstacles,obstacleColliders:[]};this.chunks.set(`${x},${z}`,chunk);return chunk;
  }
  update(p: T.Vector3, force = false, view=p) {
    const now=performance.now(),settingsKey=`${this.settings.quality}:${this.settings.renderDistance}:${this.settings.simulationDistance}`;
    const changed=settingsKey!==this.updateSettings;
    if(!force&&!changed&&now-this.lastUpdate<100)return;
    this.lastUpdate=now;this.updateSettings=settingsKey;
    this.dryGrass.update(this.settings);
    const updateLod=force||changed||this.lastLod.distanceToSquared(p)>64;
    const cx = Math.floor(p.x / 256),
      cz = Math.floor(p.z / 256),
      radius = this.residentRadius,
      vx=Math.floor(view.x/256),vz=Math.floor(view.z/256),
      needed: { x: number; z: number; d: number }[] = [];
    for (let z = cz - radius; z <= cz + radius; z++)
      for (let x = cx - radius; x <= cx + radius; x++) {
        const d = Math.hypot(x - cx, z - cz);
        if (d <= radius + 0.2 && !this.chunks.has(`${x},${z}`))
          needed.push({ x, z, d });
      }
    if(vx!==cx||vz!==cz)for(let z=vz-this.visualRadius;z<=vz+this.visualRadius;z++)for(let x=vx-this.visualRadius;x<=vx+this.visualRadius;x++){const d=Math.hypot(x-vx,z-vz);if(d<=this.visualRadius+.2&&!this.chunks.has(`${x},${z}`)&&!needed.some(a=>a.x===x&&a.z===z))needed.push({x,z,d:d+radius});}
    needed.sort((a, b) => a.d - b.d);
    if(force){for(const a of needed.slice(0,30))this.createChunk(a.x,a.z);}
    else if(needed.length)this.queueChunk(needed[0].x,needed[0].z);
    for (const [key, c] of this.chunks) {
      const d = Math.hypot(c.x - cx, c.z - cz);
      if(updateLod){
        const nearDistance={low:0,medium:60,high:95,ultra:140}[this.settings.quality];
        for(const batch of c.treeBatches){let near=0,far=0;
          for(let i=0;i<batch.transforms.length;i++){const m=batch.transforms[i],e=m.elements,isNear=(e[12]-p.x)**2+(e[14]-p.z)**2<nearDistance**2,index=isNear?near++:far++;
            const foliage=isNear?batch.nearFoliage:batch.foliage,wood=isNear?batch.nearWood:batch.wood;
            foliage.setMatrixAt(index,m);wood.setMatrixAt(index,m);foliage.setColorAt(index,batch.colors[i]);
          }
          batch.nearFoliage.count=batch.nearWood.count=near;batch.foliage.count=batch.wood.count=far;
          for(const mesh of [batch.foliage,batch.wood,batch.nearFoliage,batch.nearWood]){mesh.visible=mesh.count>0;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.boundingSphere=null;}
        }
      }
      c.grass.visible=this.dryGrass.visible(c.grass,view);
      c.group.visible=Math.hypot(c.x-vx,c.z-vz)<=this.visualRadius+.7;
      if (d <= this.settings.simulationDistance/256 && !c.collider) {
        c.collider = this.physics.mesh(c.geometry);
        c.obstacleColliders=c.obstacles.map(o=>sceneryCollider(this.physics,o,this.rockGeo));
      }
      if (d > this.settings.simulationDistance/256+.5 && c.collider) {
        this.physics.world.removeCollider(c.collider, true);
        c.collider = undefined;
        for(const o of c.obstacleColliders)this.physics.world.removeCollider(o,true);
        c.obstacleColliders=[];
      }
      if (d > radius + 1.7 && Math.hypot(c.x-vx,c.z-vz)>this.visualRadius+1.7) {
        if (c.collider) this.physics.world.removeCollider(c.collider, true);
        for(const collider of c.obstacleColliders)this.physics.world.removeCollider(collider,true);
        this.root.remove(c.group);
        c.geometry.dispose();
        c.group.traverse(o=>{if(o instanceof T.InstancedMesh)o.dispose();else if(o instanceof T.Mesh&&o.userData.streamGeometry)o.geometry.dispose()});
        this.chunks.delete(key);
      }
    }
    if(updateLod)this.lastLod.copy(p);
    this.lodTick++;
    if(needed.length===0)this.buildFarTerrain(view);
    const range=this.settings.renderDistance;
    for(const sector of this.roadSectors)sector.group.visible=sector.center.distanceToSquared(view)<(range+sector.radius)**2;
    for(const grass of this.grassSectors)grass.visible=this.dryGrass.visible(grass,view);
    this.city.visible=view.distanceToSquared(this.cityCenter)<(range+1300)**2;
    const wet = this.settings.weather === "rain" ? 1 : 0;
    if (wet !== this.wet) {
      this.wet = wet;
      this.asphalt.roughness = lerp(0.94, 0.28, wet);
      this.asphalt.clearcoat = wet * 0.85;
      this.asphalt.color.set(wet ? "#979995" : "#c1beb7");
      this.roadsGroup.traverse(o=>{if(o instanceof T.Mesh&&o.material instanceof T.MeshPhysicalMaterial){o.material.roughness=this.asphalt.roughness;o.material.clearcoat=this.asphalt.clearcoat;o.material.color.copy(this.asphalt.color)}});
    }
  }
  buildCity() {
    const random = rng(23),
      glass = new T.MeshStandardMaterial({
        color: "#596b77",
        metalness: 0.55,
        roughness: 0.23,
      }),
      concrete = new T.MeshStandardMaterial({
        color: "#b1afa4",
        roughness: 0.9,
      }),
      windows = new T.MeshStandardMaterial({
        color: "#a3c0c6",
        metalness: 0.5,
        roughness: 0.27,
      });
    const buildings: T.Mesh[] = [];
    for (let z = 240; z < 920; z += 74)
      for (let x = -1770; x < -640; x += 83) {
        if (this.network.nearest(x, z).distance < 34) continue;
        const h = 14 + random() ** 2 * 110,
          w = 28 + random() * 24,
          d = 28 + random() * 23,
          base = this.network.height(x, z);
        if(!this.terrainSampler.vegetationClear(x,z,Math.hypot(w,d)/2+2))continue;
        const b = new T.Mesh(
          new T.BoxGeometry(w, h, d),
          random() > 0.35 ? glass : concrete,
        );
        b.position.set(x, base + h / 2, z);
        b.castShadow = b.receiveShadow = true;
        this.city.add(b);
        buildings.push(b);
        this.physics.box(x, base + h / 2, z, w, h, d);
        const roof = new T.Mesh(new T.BoxGeometry(w + 1, 1.2, d + 1), concrete);
        roof.position.set(x, base + h, z);
        this.city.add(roof);
        const count = Math.floor(h / 4);
        const strips = new T.InstancedMesh(
          new T.BoxGeometry(w + 0.03, 0.45, d + 0.03),
          windows,
          count,
        );
        for (let i = 0; i < count; i++) {
          this.dummy.position.set(x, base + 3 + i * 4, z);
          this.dummy.rotation.set(0, 0, 0);
          this.dummy.scale.set(1, 1, 1);
          this.dummy.updateMatrix();
          strips.setMatrixAt(i, this.dummy.matrix);
        }
        this.city.add(strips);
      }
    const colors = ["#853830", "#294b63", "#62746b", "#be9e60"];
    for (let i = 0; i < 38; i++) {
      const x = 260 + (i % 8) * 17,
        z = 1350 + Math.floor(i / 8) * 35,
        h = this.network.height(x, z),
        m = new T.MeshStandardMaterial({
          color: colors[i % 4],
          roughness: 0.75,
          metalness: 0.22,
        }),
        b = new T.Mesh(new T.BoxGeometry(12, 3, 2.5), m);
      b.position.set(x, h + 1.5, z);
      b.castShadow = b.receiveShadow = true;
      this.city.add(b);
      this.physics.box(x, h + 1.5, z, 12, 3, 2.5);
    }
    for (let i = 0; i < 3; i++) {
      const x = -2200 - i * 130,
        z = 380 + i * 230,
        h = this.network.height(x, z),
        mat = new T.MeshStandardMaterial({ color: "#dbdcd6", roughness: 0.58 });
      const tower = new T.Mesh(new T.CylinderGeometry(1.4, 2.5, 65, 10), mat);
      tower.position.set(x, h + 32.5, z);
      this.city.add(tower);
      for (let j = 0; j < 3; j++) {
        const blade = new T.Mesh(new T.BoxGeometry(2.3, 29, 0.3), mat);
        blade.position.set(
          x + Math.sin(j * 2.094) * 15,
          h + 65 + Math.cos(j * 2.094) * 15,
          z - 2,
        );
        blade.rotation.z = -j * 2.094;
        this.city.add(blade);
      }
    }
  }
  batchCity() {
    const groups = new Map<T.Material, T.BufferGeometry[]>();
    this.city.updateMatrixWorld(true);
    const matrix = new T.Matrix4();
    for (const child of [...this.city.children]) {
      if (!(child instanceof T.Mesh) || Array.isArray(child.material)) continue;
      const items = groups.get(child.material) || [];
      const count = child instanceof T.InstancedMesh ? child.count : 1;
      for (let i = 0; i < count; i++) {
        const g = child.geometry.index
          ? child.geometry.toNonIndexed()
          : child.geometry.clone();
        if (child instanceof T.InstancedMesh) {
          child.getMatrixAt(i, matrix);
          matrix.premultiply(child.matrix);
        } else matrix.copy(child.matrix);
        g.applyMatrix4(matrix);
        items.push(g);
      }
      groups.set(child.material, items);
      this.city.remove(child);
      child.geometry.dispose();
    }
    for (const [mat, gs] of groups) {
      const g = mergeGeometries(gs, false);
      if (g) {
        const mesh = new T.Mesh(g, mat);
        mesh.castShadow = mesh.receiveShadow = true;
        this.city.add(mesh);
      }
      gs.forEach((g) => g.dispose());
    }
  }
  buildSigns() {
    const labels = [
      ["AZURE COAST", "HORIZON 01", 260],
      ["TUNNEL", "LIGHTS ON", 690],
      ["REDWOOD RIDGE", "NOVA CITY  4 km", 1750],
      ["SILVER CANYON", "KEEP RIGHT", 3800],
    ];
    for (const [top, bottom, d] of labels) {
      const s = this.network.at(this.network.main, d as number),
        canvas = document.createElement("canvas");
      canvas.width = 768;
      canvas.height = 320;
      const c = canvas.getContext("2d")!;
      c.fillStyle = "#233f3e";
      c.fillRect(0, 0, 768, 320);
      c.strokeStyle = "#d3dacc";
      c.lineWidth = 10;
      c.strokeRect(12, 12, 744, 296);
      c.fillStyle = "#f0f0df";
      c.font = "bold 58px Arial";
      c.fillText(top as string, 45, 123);
      c.font = "34px Arial";
      c.fillText(bottom as string, 45, 230);
      const tex = new T.CanvasTexture(canvas);
      tex.colorSpace = T.SRGBColorSpace;
      const sign = new T.Mesh(
        new T.PlaneGeometry(6, 2.5),
        new T.MeshStandardMaterial({
          map: tex,
          roughness: 0.7,
          side: T.DoubleSide,
        }),
      );
      sign.position.copy(s.p).addScaledVector(s.r, 14);
      sign.position.y += 4.5;
      sign.rotation.y = Math.atan2(-s.t.x, -s.t.z);
      this.roadsGroup.add(sign);
      for (const side of [-1, 1]) {
        const post = new T.Mesh(
          new T.CylinderGeometry(0.08, 0.08, 5, 8),
          this.guardMaterial,
        );
        post.position.copy(sign.position).addScaledVector(s.r, side * 2.3);
        post.position.y -= 2;
        this.roadsGroup.add(post);
      }
    }
  }
}
