"""Optimize the supplied GLB without changing its mesh topology or skin weights.
Usage: python scripts/optimize-racer.py source.glb assets/characters/RACER.glb
"""
import json,struct,io,sys
from pathlib import Path
from PIL import Image
source=Path(sys.argv[1]).read_bytes();size=struct.unpack_from('<I',source,12)[0]
j=json.loads(source[20:20+size]);binary=source[28+size:]
j['animations']=[a for a in j.get('animations',[]) if a.get('name') in ['Idle','Walking']]
# Remove the Sketchfab presentation tilt/offset, preserving source mesh/skin coordinates.
for n in j['nodes']:
 if n.get('name')=='Sketchfab_model':n['translation']=[0,0,0];n['rotation']=[0,0,0,1]
 if n.get('name','').endswith('.fbx'):n['rotation']=[0,0,0,1]
# Keep the authored walking animation in place; Rapier owns world movement.
chunks={i:binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']] for i,v in enumerate(j['bufferViews'])}
for a in j['animations']:
 for channel in a['channels']:
  if channel['target'].get('node')==24 and channel['target']['path']=='translation':
   acc=j['accessors'][a['samplers'][channel['sampler']]['output']];view=acc['bufferView'];data=bytearray(chunks[view]);base=acc.get('byteOffset',0);stride=j['bufferViews'][view].get('byteStride',12);x,y,z=struct.unpack_from('<fff',data,base)
   for i in range(acc['count']):
    off=base+i*stride;struct.pack_into('<f',data,off,x);struct.pack_into('<f',data,off+8,z)
   chunks[view]=bytes(data)
for im in j['images']:
 image=Image.open(io.BytesIO(chunks[im['bufferView']])).convert('RGB');name=im.get('name','')
 limit=1024 if 'Base_color' in name and 'Eyes' not in name else 512 if 'Normal' in name else 256
 image.thumbnail((limit,limit),Image.Resampling.LANCZOS);out=io.BytesIO();image.save(out,format='JPEG',quality=90 if 'Normal' in name else 88,optimize=True)
 chunks[im['bufferView']]=out.getvalue();im['mimeType']='image/jpeg';im['name']=name.rsplit('.',1)[0]+'.jpg'
for m in j['materials']:
 p=m.get('pbrMetallicRoughness',{})
 if m.get('name')=='M_Clothes':p['roughnessFactor']=.78
 if m.get('name')=='M_Helmet':p['roughnessFactor']=.38;p['metallicFactor']=.15
used=set()
for m in j['meshes']:
 for p in m['primitives']:
  used.update(p['attributes'].values());used.add(p['indices'])
for s in j['skins']:used.add(s['inverseBindMatrices'])
for a in j['animations']:
 for s in a['samplers']:used.update([s['input'],s['output']])
accessor_map={old:new for new,old in enumerate(sorted(used))}
j['accessors']=[j['accessors'][old] for old in sorted(used)]
for m in j['meshes']:
 for p in m['primitives']:
  p['attributes']={k:accessor_map[v] for k,v in p['attributes'].items()};p['indices']=accessor_map[p['indices']]
for s in j['skins']:s['inverseBindMatrices']=accessor_map[s['inverseBindMatrices']]
for a in j['animations']:
 for s in a['samplers']:s['input']=accessor_map[s['input']];s['output']=accessor_map[s['output']]
# Repack each used accessor, not just its containing view: the source animation
# buffer view also contains all 16 unused clips.
new_bin=bytearray();new_views=[]
def append(data,target=None):
 while len(new_bin)%4:new_bin.append(0)
 index=len(new_views);v={'buffer':0,'byteOffset':len(new_bin),'byteLength':len(data)}
 if target:v['target']=target
 new_views.append(v);new_bin.extend(data);return index
sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};counts={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
for a in j['accessors']:
 assert 'sparse' not in a
 view=a['bufferView'];v=j['bufferViews'][view];width=sizes[a['componentType']]*counts[a['type']];stride=v.get('byteStride',width);base=a.get('byteOffset',0)
 data=b''.join(chunks[view][base+i*stride:base+i*stride+width] for i in range(a['count']))
 a['bufferView']=append(data,v.get('target'));a.pop('byteOffset',None)
for im in j['images']:im['bufferView']=append(chunks[im['bufferView']])
j['bufferViews']=new_views;j['buffers']=[{'byteLength':len(new_bin)}];j['asset']['generator']='Redline Horizon texture and animation optimization; original authored mesh/rig retained'
meta=json.dumps(j,separators=(',',':')).encode();meta+=b' '*(-len(meta)%4);new_bin.extend(b'\0'*(-len(new_bin)%4))
result=struct.pack('<III',0x46546c67,2,28+len(meta)+len(new_bin))+struct.pack('<II',len(meta),0x4e4f534a)+meta+struct.pack('<II',len(new_bin),0x004e4942)+new_bin
Path(sys.argv[2]).write_bytes(result);print({'sourceBytes':len(source),'optimizedBytes':len(result),'animations':[a['name'] for a in j['animations']]})
