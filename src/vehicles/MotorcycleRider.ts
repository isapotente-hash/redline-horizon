import * as T from 'three';
/** Contact points measured from the supplied motorcycle, in its body coordinates. */
export const RIDER_FIT={seat:[0,.83,.49],hip:[0,.94,.49],grip:[.555,1.303,.005],peg:[.305,.17,-.23]} as const;
export function addMotorcycleRider(body:T.Group) {
  const rider=new T.Group();rider.name='motorcycle-rider';body.add(rider);
  const jacket=new T.MeshStandardMaterial({color:0x26343f,roughness:.83}),pants=new T.MeshStandardMaterial({color:0x151e27,roughness:.89});
  const black=new T.MeshStandardMaterial({color:0x11161c,roughness:.64}),shell=new T.MeshPhysicalMaterial({color:0xe5e9eb,metalness:.12,roughness:.3,clearcoat:.8});
  const visor=new T.MeshPhysicalMaterial({color:0x101e2c,roughness:.13,metalness:.65,clearcoat:1});
  const mesh=(name:string,g:T.BufferGeometry,m:T.Material,p:readonly number[],scale?:number[])=>{const o=new T.Mesh(g,m);o.name=name;o.position.set(p[0],p[1],p[2]);if(scale)o.scale.set(...scale as [number,number,number]);o.castShadow=o.receiveShadow=true;rider.add(o);return o;};
  const oval=(name:string,p:readonly number[],s:number[],m:T.Material)=>mesh(name,new T.SphereGeometry(1,16,12),m,p,s);
  const limb=(name:string,a:number[],b:number[],r1:number,r2:number,m:T.Material)=>{const start=new T.Vector3(...a),delta=new T.Vector3(...b).sub(start);const o=mesh(name,new T.CylinderGeometry(r2,r1,delta.length(),12),m,start.addScaledVector(delta,.5).toArray());o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());};
  // The pelvis rests on the leather saddle; a slightly forward torso suits the raised cruiser bars.
  oval('rider-pelvis',RIDER_FIT.hip,[.195,.115,.19],pants);
  const torso=mesh('rider-jacket',new T.CapsuleGeometry(.18,.25,5,16),jacket,[0,1.18,.40],[1.16,1,.73]);torso.rotation.x=-.20;
  oval('rider-collar',[0,1.427,.35],[.10,.065,.10],black);
  oval('rider-helmet',[0,1.624,.32],[.174,.204,.188],shell);
  // Front-facing curved visor, with a distinct chin guard and lower helmet seal.
  mesh('rider-visor',new T.SphereGeometry(1,24,12,Math.PI*1.14,Math.PI*.72,Math.PI*.31,Math.PI*.34),visor,[0,1.624,.32],[.177,.207,.193]);
  oval('rider-chin-guard',[0,1.513,.208],[.125,.066,.087],shell);
  for(const side of [-1,1]) {
    const shoulder=[side*.19,1.362,.36],elbow=[side*.365,1.166,.245],hand=[side*RIDER_FIT.grip[0],RIDER_FIT.grip[1],RIDER_FIT.grip[2]];
    oval('rider-shoulder',shoulder,[.09,.1,.095],jacket);limb('rider-upper-arm',shoulder,elbow,.083,.067,jacket);oval('rider-elbow',elbow,[.07,.073,.07],jacket);limb('rider-forearm',elbow,hand,.064,.045,jacket);
    const glove=oval('rider-glove',hand,[.066,.052,.061],black);glove.rotation.z=side*.16;
    const hip=[side*.15,.93,.49],knee=[side*.30,.585,.025],ankle=[side*.305,.27,-.19];
    limb('rider-thigh',hip,knee,.106,.085,pants);oval('rider-knee',knee,[.09,.093,.09],pants);limb('rider-shin',knee,ankle,.077,.056,pants);
    oval('rider-boot',[side*RIDER_FIT.peg[0],.225,-.25],[.072,.063,.157],black);
  }
  return rider;
}
