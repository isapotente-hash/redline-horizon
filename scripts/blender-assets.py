"""Blender 4.5 asset source pipeline. No external textures or plug-ins required."""
import bpy, math, sys, argparse
from pathlib import Path
from mathutils import Vector

parser=argparse.ArgumentParser()
parser.add_argument('--project',default='.')
parser.add_argument('--render-preview',action='store_true')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
root=Path(args.project).resolve()
for p in ['blender/vehicles','blender/environment','blender/roads','blender/props','assets/previews','assets/environment','assets/roads','assets/props']:(root/p).mkdir(parents=True,exist_ok=True)

def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system='METRIC'
    bpy.context.scene.unit_settings.scale_length=1

def material(name,color,metal=0,rough=.5):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    return m

def box(name,p,scale,mat,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.name=name;o.dimensions=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if mat:o.data.materials.append(mat)
    if bevel:
        mod=o.modifiers.new('Manufactured edges','BEVEL');mod.width=bevel;mod.segments=3
        o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return o

def cylinder(name,p,radius,depth,mat,vertices=20):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=p);o=bpy.context.object;o.name=name;o.data.materials.append(mat);return o

def save(path,glb=None):
    if glb:
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.export_scene.gltf(filepath=str(root/glb),export_format='GLB',use_selection=True,export_apply=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(root/path),compress=True)

def stage():
    floor=material('Studio floor',(.065,.075,.088),.25,.28)
    box('Studio floor · exclude from game export',(0,0,-.055),(200,200,.10),floor)
    world=bpy.data.worlds.new('Soft studio atmosphere');bpy.context.scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.28,.34,.43,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45
    for name,pos,power,size in [('Key softbox',(2,3,7),1900,6),('Long rim',(-4,-1,5),1500,5),('Front fill',(1,7,3),1100,4)]:
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='RECTANGLE';data.size=size;data.size_y=size*.5;o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,.4))-o.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new('Asset preview camera');camera=bpy.data.objects.new('Asset preview camera',data);bpy.context.collection.objects.link(camera);camera.location=(5.5,7.4,3.25);camera.rotation_euler=(Vector((0,0,.60))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=55;bpy.context.scene.camera=camera
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.resolution_x=1280;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'

clear()
bpy.ops.import_scene.gltf(filepath=str(root/'assets/cars/VANTA_R1.glb'))
for o in bpy.data.objects:
    if o.type=='MESH':
        for face in o.data.polygons:face.use_smooth=True
bpy.context.scene['coordinates']='Blender +Z up, +Y forward. glTF +Y up, -Z forward. Metres.'
bpy.context.scene['runtime_pivots']='steer_FL / FR / RL / RR for steering and suspension; wheel_FL / FR / RL / RR rotate local X.'
save('blender/vehicles/VANTA_R1.blend','assets/cars/VANTA_R1.glb')
stage()
bpy.ops.wm.save_as_mainfile(filepath=str(root/'blender/vehicles/VANTA_R1.blend'),compress=True)
if args.render_preview:
    bpy.context.scene.render.filepath=str(root/'assets/previews/VANTA_R1-Asset-Preview.png');bpy.ops.render.render(write_still=True)

clear()
bpy.ops.import_scene.gltf(filepath=str(root/'assets/cars/traffic_sport.glb'))
bpy.context.scene['notes']='Lightweight original traffic coupe. Runtime paint and scale variants share geometry.'
save('blender/vehicles/Traffic_Coupe.blend','assets/cars/traffic_sport.glb')

clear()
asphalt=material('Dry asphalt',(.13,.15,.17),.05,.87);concrete=material('Cast concrete',(.45,.46,.43),0,.85);steel=material('Galvanized steel',(.48,.52,.54),.75,.31);line=material('Reflective lane paint',(.9,.88,.73),0,.72)
box('Highway 16 metre carriageway',(0,0,-.075),(16,120,.15),asphalt)
for side in [-1,1]:
    box('Concrete shoulder',(side*8.85,0,-.085),(1.7,120,.13),concrete)
    box('Edge line',(side*7.55,0,.005),(.13,120,.012),line)
    box('Guard rail',(side*9.45,0,.84),(.11,120,.34),steel,.025)
    for y in range(-60,61,3):box('Guard rail post',(side*9.45,y,.43),(.12,.14,.86),steel)
    for y in range(-56,60,18):box('Dashed lane marking',(side*4,y,.007),(.12,4.3,.014),line)
bpy.context.scene['notes']='Editable straight road section. World route and grades are defined in src/world/RoadNetwork.ts.'
save('blender/roads/Coastal_Highway.blend','assets/roads/Coastal_Highway.glb')

clear()
glass=material('Blue city glazing',(.18,.27,.32),.55,.24);stone=material('Warm concrete',(.51,.52,.49),0,.83);trim=material('Facade bands',(.38,.43,.45),.3,.45)
for i,h in enumerate([24,48,76,108,38,65]):
    x=(i%3)*45;y=(i//3)*58
    box('Nova tower %02d'%i,(x,y,h/2),(29,34,h),glass,.12)
    box('Roof coping',(x,y,h),(30,35,1.2),stone,.08)
    for z in range(4,h,4):box('Floor band',(x,y,z),(29.1,34.1,.42),trim)
    box('Lobby',(x,y-18,2.5),(24,4,5),stone)
bpy.context.scene['notes']='Original modular city source set. Runtime city uses procedural instances with collisions.'
save('blender/environment/Nova_City_Modules.blend','assets/environment/Nova_City_Modules.glb')

clear()
steel=material('Roadside steel',(.43,.47,.48),.7,.36);rock=material('Coastal stone',(.39,.40,.34),0,.95);green=material('Cypress green',(.15,.23,.11),0,.95);bark=material('Cypress bark',(.19,.14,.1),0,.97);sign=material('Highway green',(.05,.16,.14),.1,.63)
box('Guard rail beam',(0,0,.84),(.11,12,.34),steel,.03)
for y in range(-6,7,3):box('Guard rail post',(0,y,.43),(.12,.14,.86),steel)
cylinder('Road sign post',(5,0,2.25),.08,4.5,steel)
box('Road sign face',(5,0,4.25),(6,.08,2.5),sign,.06)
for i in range(3):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=(10+i*4,0,.5));o=bpy.context.object;o.name='Coastal rock %02d'%i;o.scale=(1.8,1.3,1+i*.4);o.data.materials.append(rock)
for i in range(3):
    x=10+i*5;y=7;size=2+i*.5;cylinder('Cypress trunk',(x,y,1.5),.22,3,bark,8)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=(x,y,3.8));o=bpy.context.object;o.name='Cypress crown';o.scale=(size,size,size*1.8);o.data.materials.append(green)
bpy.context.scene['notes']='Original editable roadside kit. All assets use metre scale and physically based materials.'
save('blender/props/Coastal_Props.blend','assets/props/Coastal_Props.glb')
print('BLENDER ASSETS COMPLETE')
