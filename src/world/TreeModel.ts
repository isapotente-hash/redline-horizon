import * as T from "three";
import {mergeGeometries} from "three/addons/utils/BufferGeometryUtils.js";
import {surfaceDetail} from "../rendering/SurfaceMaterials";
import {rng} from "../core/math";

export type TreeGeometry={wood:T.BufferGeometry;foliage:T.BufferGeometry;radius:number;height:number};
export type TreeVariant={name:string;near:TreeGeometry;light:TreeGeometry;far:TreeGeometry};
export const treeWoodMaterial=()=>surfaceDetail(new T.MeshStandardMaterial({name:'weathered_bark',vertexColors:true,roughness:.96}),'bark');
export const treeFoliageMaterial=()=>new T.MeshStandardMaterial({name:'coastal_foliage',vertexColors:true,roughness:.82,side:T.DoubleSide});

/** Individual tapered needle sprays give crowns porous, irregular silhouettes. */
function needleSpray(seed:number,broadleaf=false,light=false) {
  const r=rng(seed), vertices:number[]=[];
  const triangle=(a:T.Vector3,b:T.Vector3,c:T.Vector3)=>vertices.push(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z);
  for(let f=0;f<(light?4:7);f++) {
    const angle=f/(light?4:7)*Math.PI*2+r()*.5;
    const axis=new T.Vector3(Math.cos(angle), (r()-.3)*.7, Math.sin(angle)).normalize();
    const side=new T.Vector3(-axis.z,0,axis.x).normalize();
    const origin=new T.Vector3((r()-.5)*.4,(r()-.5)*.7,(r()-.5)*.4);
    for(let j=0;j<(light?3:5);j++)for(const sign of [-1,1]){
      const t=j/(light?3:5), base=origin.clone().addScaledVector(axis,t*.85);
      const length=(.32+ r()*.17)*(1-t*.45);
      const tip=base.clone().addScaledVector(axis,.20).addScaledVector(side,sign*length);
      tip.y+=.08+ r()*.11;
      const mid=base.clone().lerp(tip,.48),width=(broadleaf?.21:.10)*(light?1.45:1)*(1-t*.3);
      const left=mid.clone().addScaledVector(axis,width),right=mid.clone().addScaledVector(axis,-width);
      // A folded centre ridge gives broad leaves a natural highlight. Each leaf
      // retains the same two triangles and remains opaque (no alpha overdraw).
      if(broadleaf){left.y-=.06;right.y-=.08;tip.y+=.04;}
      triangle(base,left,tip);triangle(base,tip,right);
    }
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.computeVertexNormals();return g;
}

/** Shared, metre-scale tree meshes. Every crown has multiple offset sprays;
 * branches connect to them, rather than hiding a single stretched sphere. */
function buildTree(kind:number,low:boolean,light=false):TreeGeometry {
  const random=rng(701+kind*977),wood:T.BufferGeometry[]=[],leaves:T.BufferGeometry[]=[];
  const trunkHeight=[8.8,11.2,7.8][kind],spread=[3.2,2.35,3.6][kind];
  const leanX=(random()-.5)*.7,leanZ=(random()-.5)*.55;
  const trunkPoint=(t:number)=>new T.Vector3(leanX*t*t+.12*Math.sin(t*4),trunkHeight*t,leanZ*t*t);
  function tint(g:T.BufferGeometry,base:string,foliage=false){
    const p=g.getAttribute('position'),normal=g.getAttribute('normal'),colors=new Float32Array(p.count*3),c=new T.Color(base);
    for(let i=0;i<p.count;i++){
      const grain=Math.sin(p.getX(i)*39+p.getZ(i)*47+p.getY(i)*1.4);
      const outer=Math.min(1,Math.hypot(p.getX(i)-leanX,p.getZ(i)-leanZ)/spread);
      const canopyShade=.65+outer*.35;
      const factor=foliage?canopyShade*(.78+.20*(normal.getY(i)*.5+.5)+(.5+.5*Math.sin(p.getX(i)*31+p.getY(i)*13+p.getZ(i)*19))*.11):.74+.21*(grain*.5+.5);
      colors.set([c.r*factor,c.g*factor,c.b*factor],i*3);
    }
    g.setAttribute('color',new T.BufferAttribute(colors,3));g.deleteAttribute('uv');return g;
  }
  function branch(points:T.Vector3[],r0:number,r1:number,segments:number){
    const curve=new T.CatmullRomCurve3(points),radial=low||light?6:12,frames=curve.computeFrenetFrames(segments,false);
    const positions:number[]=[],indices:number[]=[];
    for(let j=0;j<=segments;j++) {const t=j/segments,p=curve.getPointAt(t),radius=r0+(r1-r0)*t;
      for(let i=0;i<radial;i++){const a=i/radial*Math.PI*2,r=radius*(1+.12*Math.sin(i*2.4+j*.65));const v=p.clone().addScaledVector(frames.normals[j],Math.cos(a)*r).addScaledVector(frames.binormals[j],Math.sin(a)*r);positions.push(v.x,v.y,v.z)}
    }
    for(let j=0;j<segments;j++)for(let i=0;i<radial;i++){const a=j*radial+i,b=j*radial+(i+1)%radial;indices.push(a,b,a+radial,b,b+radial,a+radial)}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();wood.push(tint(g.toNonIndexed(),'#80735a'));g.dispose();
  }
  branch([trunkPoint(0),trunkPoint(.3),trunkPoint(.65),trunkPoint(1)],.32,.045,low||light?5:16);
  if(!low&&!light)for(let i=0;i<5;i++){const a=i/5*Math.PI*2;branch([new T.Vector3(Math.cos(a)*.64,.025,Math.sin(a)*.64),trunkPoint(.08),trunkPoint(.19)],.10,.055,3)}
  const tiers=kind===1?5:3;
  for(let level=0;level<tiers;level++){
    const t=kind===1?.34+level*.115:.48+level*.16;
    const branchCount=kind===1?4:5;
    for(let j=0;j<branchCount;j++){
      const angle=j/branchCount*Math.PI*2+level*1.3+(random()-.5)*.55;
      const length=spread*(kind===1?1-level*.14:1-level*.15)*(.8+random()*.25);
      const start=trunkPoint(t),end=start.clone().add(new T.Vector3(Math.cos(angle)*length,.55+random()*.5,Math.sin(angle)*length));
      const midpoint=start.clone().lerp(end,.5);midpoint.y-=.27;
      branch([start,midpoint,end],.085*(1-level*.1),.02,low||light?2:5);
      const sprays=3;
      for(let k=0;k<sprays;k++){
        const center=end.clone();
        if(k>0){const turn=angle+(k===1?-.65:.7),reach=.55+random()*.48;center.add(new T.Vector3(Math.cos(turn)*reach,.18+random()*.35,Math.sin(turn)*reach));if(!low&&!light)branch([end.clone().lerp(start,.24),center],.026,.008,2)}
        const g=low?new T.IcosahedronGeometry(1,0):needleSpray(3200+kind*997+level*127+j*17+k,kind===2,light),p=g.getAttribute('position');
        const sx=(kind===1?.96:1.15)*(.83+random()*.23),sy=kind===1?.54:kind===2?.86:.74,sz=sx*.84;
        for(let v=0;v<p.count;v++){const x=p.getX(v),y=p.getY(v),z=p.getZ(v),lobe=1+.14*Math.sin(x*9.7+z*7.4+y*12.1+level);p.setXYZ(v,center.x+x*sx*lobe,center.y+y*sy*lobe,center.z+z*sz*lobe)}
        g.computeVertexNormals();if(!low||k===0)leaves.push(tint(g,['#647e42','#48683e','#6a8048'][(level+j+kind)%3],true));else g.dispose();
      }
    }
  }
  // A small irregular leader closes the top silhouette without a cone cap.
  const top=low?new T.IcosahedronGeometry(1,0):needleSpray(911+kind,kind===2,light);top.scale(kind===1?.68:1.1,.86,kind===1?.64:1.0);top.translate(leanX,trunkHeight-.15,leanZ);leaves.push(tint(top,'#718b4c',true));
  const merge=(list:T.BufferGeometry[])=>{const g=mergeGeometries(list,false)!;list.forEach(x=>x.dispose());g.computeBoundingBox();g.computeBoundingSphere();return g};
  const bark=merge(wood),foliage=merge(leaves),bounds=foliage.boundingBox!;
  const positions=foliage.getAttribute('position');
  let radius=0;for(let i=0;i<positions.count;i++)radius=Math.max(radius,Math.hypot(positions.getX(i),positions.getZ(i)));
  return{wood:bark,foliage,radius,height:Math.max(trunkHeight,bounds.max.y)};
}
export function makeTreeVariants():TreeVariant[]{return ['Coastal Pine','Ridge Cedar','Windshaped Oak'].map((name,i)=>({name,near:buildTree(i,false),light:buildTree(i,false,true),far:buildTree(i,true)}))}
export function treeAssetScene(){const root=new T.Group();root.name='Coastal_Trees';const variants=makeTreeVariants(),bark=treeWoodMaterial(),foliage=treeFoliageMaterial();for(let i=0;i<variants.length;i++){const v=variants[i],tree=new T.Group();tree.name=v.name.replaceAll(' ','_');tree.position.x=i*10;const stem=new T.Mesh(v.near.wood,bark),crown=new T.Mesh(v.near.foliage,foliage);stem.name='Branching_trunk';crown.name='Layered_foliage';tree.add(stem,crown);root.add(tree)}return root}
