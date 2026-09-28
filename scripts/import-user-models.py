import bpy, math, json, numpy as np
from pathlib import Path
from mathutils import Matrix,Vector
import os
BASE=Path(os.environ.get('VEHICLE_MODEL_WORK','../model-work')).resolve(); OUT=Path(__file__).resolve().parents[1]/'assets/cars'
def mat(name,col,metal=.0,rough=.5):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*col,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 return m
def empty(name,parent=None):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.parent=parent;return o
def finish(kind,items,centers):
 bpy.ops.object.select_all(action='DESELECT')
 # Weld OBJ's expanded vertices before simplification; preserve UV seams through corner attributes.
 for o,part in items:
  bpy.context.view_layer.objects.active=o;o.select_set(True)
  weld=o.modifiers.new('Weld','WELD');weld.merge_threshold=.00003;bpy.ops.object.modifier_apply(modifier=weld.name)
  tris=sum(len(p.vertices)-2 for p in o.data.polygons)
  if tris>120:
   d=o.modifiers.new('Mobile LOD','DECIMATE');d.ratio=min(1,max(90/tris,(.14 if o.data.materials[0].name=='paint' else .065) if kind=='REVUELTO' else .19));bpy.ops.object.modifier_apply(modifier=d.name)
  for p in o.data.polygons:p.use_smooth=True
  normal=o.modifiers.new('Area weighted normals','WEIGHTED_NORMAL');normal.keep_sharp=True
  bpy.ops.object.modifier_apply(modifier=normal.name)
  o.select_set(False)
 root=empty(kind);body=empty('body',root)
 groups={'body':body}
 for part,c in centers.items():
  pivot=empty('steer_'+part,root);pivot.location=c;wheel=empty('wheel_'+part,pivot);groups[part]=wheel
 buckets={}
 for o,part in items:
  # All input objects have a single material; group them to keep draw calls low.
  key=(part,o.data.materials[0].name if len(o.data.materials) else 'none');buckets.setdefault(key,[]).append(o)
 for (part,_),objects in buckets.items():
  bpy.ops.object.select_all(action='DESELECT')
  for o in objects:o.select_set(True)
  bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object;o.name=part+'_'+o.data.materials[0].name;o.parent=groups[part]
  if part!='body':o.data.transform(Matrix.Translation(-Vector(centers[part])))
 # Keep all textures small and embedded.
 for im in bpy.data.images:
  if im.source=='FILE' and im.size[0]:
   s=min(1,512/max(im.size));im.scale(max(1,round(im.size[0]*s)),max(1,round(im.size[1]*s)));im.pack()
 bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
 for o in root.children_recursive:o.select_set(True)
 bpy.context.view_layer.objects.active=root
 bpy.ops.export_scene.gltf(filepath=str(OUT/(kind+'.glb')),export_format='GLB',use_selection=True,export_animations=False,export_skins=False,export_yup=True,export_image_format='AUTO',export_materials='EXPORT',export_extras=True)
 count=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in root.children_recursive if o.type=='MESH')
 print('RESULT',kind,'TRIANGLES',count,'MESHES',sum(o.type=='MESH' for o in root.children_recursive),'BYTES',(OUT/(kind+'.glb')).stat().st_size,flush=True)
 # Studio preview to inspect proportions, material assignment and orientation.
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.render.resolution_x=800;scene.render.resolution_y=600;scene.render.resolution_percentage=100
 scene.world=bpy.data.worlds.new('Studio');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.16,.19,.24,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
 for loc,power,size in [((4,2,6),1100,5),((-4,0,4),900,4),((0,-4,5),1400,3)]:
  light=bpy.data.lights.new('Softbox','AREA');light.energy=power;light.shape='DISK';light.size=size;ob=bpy.data.objects.new('Softbox',light);scene.collection.objects.link(ob);ob.location=loc;ob.rotation_euler=(Vector((0,0,.7))-ob.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object;floor.location.z=-.04;floor.data.materials.append(mat('floor',(.045,.052,.07),.1,.6))
 cam=bpy.data.cameras.new('Camera');ob=bpy.data.objects.new('Camera',cam);scene.collection.objects.link(ob);ob.location=(5,7,3.3) if kind=='REVUELTO' else (3.3,4,2.3);ob.rotation_euler=(Vector((0,0,.65))-ob.location).to_track_quat('-Z','Y').to_euler();cam.lens=52;scene.camera=ob;scene.render.filepath=str(BASE/(kind+'.png'));bpy.ops.render.render(write_still=True)

def lambo():
 bpy.ops.wm.open_mainfile(filepath=str(BASE/'lambo-import.blend'))
 originals=list(bpy.data.objects);deps=bpy.context.evaluated_depsgraph_get();info={i['name']:i for i in json.loads((BASE/'lambo-info.json').read_text())}
 paint=mat('paint',(.8,.28,.016),.68,.24);paint.node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value=1
 carbon=mat('carbon',(.019,.022,.027),.35,.4);rubber=mat('rubber',(.012,.014,.017),.05,.85);alloy=mat('alloy',(.32,.36,.40),.85,.27);glass=mat('glass',(.038,.062,.075),.35,.14);glass.node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value=1
 black=mat('interior',(.012,.014,.017),0,.65)
 items=[];centers={}
 # Wheelbase and tyre radii aligned to the existing sport-car chassis.
 scale=2.86/(1.3268+1.4519);mid=(1.3268-1.4519)/2
 transform=Matrix(((scale,0,0,0),(0,0,scale,-mid*scale),(0,-scale,0,.48),(0,0,0,1)))
 for o in originals:
  if o.type!='MESH' or o.name.startswith('Icosphere') or not o.data.materials:continue
  inf=info[o.name];part='body';path='/'.join(inf['path'])
  if 'wheel_lf.child' in path:part='FR' if '.001' in path else 'FL'
  elif 'wheel_lr.child' in path:part='RR' if '.001' in path else 'RL'
  ev=o.evaluated_get(deps);mesh=bpy.data.meshes.new_from_object(ev,preserve_all_data_layers=True,depsgraph=deps);mesh.transform(transform@ev.matrix_world)
  no=bpy.data.objects.new('opt_'+o.name,mesh);bpy.context.collection.objects.link(no)
  old=mesh.materials[0];name=old.name
  if name in ['cooler.003_3','cooler.003']:new=paint
  elif name=='cooler.003_0':new=glass
  elif name in ['cooler.003','cooler.003_1']:new=carbon
  elif name in ['cooler.003_49','cooler.003_50']:new=rubber
  elif part!='body':new=alloy if name not in ['cooler.003_48','cooler.003_52'] else rubber
  else:
   # Preserve badge, grille and engine textures; simplify normal/roughness layers.
   new=old
   if old.use_nodes:
    p=old.node_tree.nodes.get('Principled BSDF')
    if p:
     for socket in ['Normal','Roughness','Metallic']:
      for link in list(p.inputs[socket].links):old.node_tree.links.remove(link)
     p.inputs['Roughness'].default_value=.42;p.inputs['Metallic'].default_value=.3
     if not p.inputs['Base Color'].links:
      color=p.inputs['Base Color'].default_value
      new=alloy if max(color[:3])>.2 else black
  mesh.materials.clear();mesh.materials.append(new);items.append((no,part))
 # Derive radial center from aggregate wheel geometry; keep visual and physics pivots aligned.
 for part in ['FL','FR','RL','RR']:
  coords=np.array([v.co[:] for o,p in items if p==part for v in o.data.vertices]);lo=coords.min(0);hi=coords.max(0);center=(lo+hi)/2;rad=max(hi[1]-lo[1],hi[2]-lo[2])/2
  target=np.array([-.95 if part.endswith('L') else .95,1.43 if part.startswith('F') else -1.43,.365]);centers[part]=target.tolist()
  for o,p in items:
   if p==part:
    for v in o.data.vertices:v.co=Vector(((np.array(v.co)-center)*(.365/rad)+target).tolist())
 # Body bottom ~0, using source tyre ground as ground reference.
 for o,p in items:
  if p=='body':
   for v in o.data.vertices:v.co.z-=.48-(.365+.112*scale)
 for o in originals:bpy.data.objects.remove(o,do_unlink=True)
 finish('REVUELTO',items,centers)

def bike():
 bpy.ops.wm.read_factory_settings(use_empty=True)
 # Normalize the arbitrary OBJ export pose from its wheel axis.
 lines=(BASE/'bike/model.obj').read_text().splitlines();verts=[];groups={};group=''
 for line in lines:
  if line.startswith('v '):verts.append([float(x) for x in line.split()[1:4]])
  elif line.startswith('g ') or line.startswith('o '):group=line[2:];groups.setdefault(group,[])
  elif line.startswith('f '):groups.setdefault(group,[]).extend(int(x.split('/')[0])-1 for x in line.split()[1:])
 a=np.array(verts)
 def pts(key):return a[np.unique(next(v for k,v in groups.items() if key in k))]
 fp=pts('Circle012_Mishelin');rp=pts('Circle003_Mishelin');front=(fp.min(0)+fp.max(0))/2;rear=(rp.min(0)+rp.max(0))/2;forward=front-rear;length=np.linalg.norm(forward);forward/=length
 _,vec=np.linalg.eigh(np.cov(fp.T));right=vec[:,0]
 if np.dot(right,np.cross(forward,[0,1,0]))<0:right=-right
 up=np.cross(right,forward);up/=np.linalg.norm(up);right=np.cross(forward,up);basis=np.array([right,forward,up]);scale=1.74/length;mid=(front+rear)/2
 b=(a-mid)@basis.T*scale;b[:,2]+=.33
 vi=0;out=[]
 for line in lines:
  if line.startswith('v '):out.append('v '+' '.join('%.8f'%x for x in b[vi]));vi+=1
  elif line.startswith('vn '):out.append('vn '+' '.join('%.8f'%x for x in (basis@np.array([float(x) for x in line.split()[1:4]]))))
  else:out.append(line)
 (BASE/'bike/normalized.obj').write_text('\n'.join(out))
 bpy.ops.wm.obj_import(filepath=str(BASE/'bike/normalized.obj'),forward_axis='Y',up_axis='Z',use_split_objects=True,use_split_groups=True)
 items=[];centers={'FL':[0,.87,.33],'RL':[0,-.87,.33]}
 for o in list(bpy.data.objects):
  if o.type!='MESH':continue
  part='body'
  if any(n in o.name for n in ['Circle012','Circle014','Circle037','Cylinder024']):part='FL'
  if any(n in o.name for n in ['Circle003','Circle002','Circle001','Cylinder025']):part='RL'
  if part!='body':
   c=Vector(centers[part]);rad=max(((v.co-c).yz.length for v in o.data.vertices),default=.33)
   # Apply a common tyre-based scale to all concentric wheel pieces.
   tyre=fp if part=='FL' else rp;local=(tyre-(front if part=='FL' else rear))@basis.T*scale;radius=max(np.ptp(local[:,1]),np.ptp(local[:,2]))/2
   for v in o.data.vertices:v.co=c+(v.co-c)*(.33/radius)
  for m in o.data.materials:
   if not m or not m.use_nodes:continue
   p=m.node_tree.nodes.get('Principled BSDF')
   if 'Moto' in m.name:m.name='paint' if not bpy.data.materials.get('paint') else m.name;p.inputs['Metallic'].default_value=.5;p.inputs['Roughness'].default_value=.26;p.inputs['Coat Weight'].default_value=.8
   elif any(s in m.name for s in ['076','029','Mirorr']):p.inputs['Metallic'].default_value=.85;p.inputs['Roughness'].default_value=.26
   elif 'Mishelin' in m.name:p.inputs['Roughness'].default_value=.85;p.inputs['Metallic'].default_value=0
  items.append((o,part))
 finish('MOTORCYCLE',items,centers)
import sys
if '--all' in sys.argv:lambo();bike()
elif '--bike' in sys.argv:bike()
else:lambo()
