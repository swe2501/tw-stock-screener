"""Offline Blender preparation of an unrigged, textured character mesh.

blender -b -t 6 --python scripts/prepare_generated_companion.py --
  --input RAW.glb --output DIR --theme garden --persona neutral --stage 0
  [--landmarks profile.json] [--render]

No upload, model generation, production approval or paid request is performed.
Landmarks and deforming regions must be visually checked per anatomy/stage.
"""
import argparse
import bpy
import hashlib
import importlib.util
import json
import math
import numpy as np
import sys
from pathlib import Path
from mathutils import Matrix, Vector

def load_authoring():
 path=Path(__file__).with_name('create_blender_companion_cast.py')
 spec=importlib.util.spec_from_file_location('companion_authoring',path)
 module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 return module

def segment_distances(vertices,start,end):
 a=np.asarray(start,dtype=float);b=np.asarray(end,dtype=float);d=b-a
 t=np.clip(((vertices-a)@d)/max(1e-9,d@d),0,1)
 return np.linalg.norm(vertices-(a+t[:,None]*d),axis=1)

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--input',required=True);parser.add_argument('--output',required=True)
 parser.add_argument('--theme',required=True);parser.add_argument('--persona',default='neutral');parser.add_argument('--stage',type=int,default=0)
 parser.add_argument('--landmarks');parser.add_argument('--render',action='store_true');parser.add_argument('--triangles',type=int,default=38000)
 args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);raw=Path(args.input).resolve();out=Path(args.output).resolve()
 authoring=load_authoring()
 if args.theme not in authoring.THEMES or args.persona not in authoring.PERSONAS or args.stage not in range(5):raise ValueError('Invalid role/persona/stage')
 if not 5000<=args.triangles<=45000:raise ValueError('Triangle budget must reserve room for interaction tools')
 profile=json.loads(Path(args.landmarks).read_text(encoding='utf8')) if args.landmarks else {}
 c=authoring.Character(args.theme,args.persona,args.stage)
 existing=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(raw))
 imported=[o for o in bpy.data.objects if o not in existing];meshes=[o for o in imported if o.type=='MESH']
 if not meshes or any(o.type=='ARMATURE' for o in imported):raise ValueError('Expected raw unrigged mesh')
 for o in meshes:
  world=o.matrix_world.copy();o.parent=None;o.matrix_world=Matrix.Identity(4);o.data.transform(world)
 points=[v.co.copy() for o in meshes for v in o.data.vertices]
 lo=Vector(tuple(min(v[i] for v in points) for i in range(3)));hi=Vector(tuple(max(v[i] for v in points) for i in range(3)))
 height=hi.z-lo.z
 if not math.isfinite(height) or height<1e-5:raise ValueError('Invalid model bounds')
 center=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z));scale=2.4/height
 # Bake normalization once; preserve all UVs and generated PBR materials.
 for o in meshes:
  for v in o.data.vertices:v.co=(v.co-center)*scale
 imported_names=[o.name for o in imported]
 bpy.ops.object.select_all(action='DESELECT')
 for o in meshes:o.select_set(True)
 bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();body=bpy.context.object
 joined_name=body.name
 for name in imported_names:
  if name!=joined_name and name in bpy.data.objects:bpy.data.objects.remove(bpy.data.objects[name],do_unlink=True)
 body.name='Prepared generated '+args.theme
 # GLB seams can duplicate vertex positions for UV/material boundaries. Weld
 # positions while retaining per-corner UVs before reduction to avoid cracks.
 bpy.context.view_layer.objects.active=body;body.select_set(True)
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.remove_doubles(threshold=.00002);bpy.ops.object.mode_set(mode='OBJECT')
 body.data.calc_loop_triangles();original_triangles=len(body.data.loop_triangles)
 if original_triangles>args.triangles:
  decimate=body.modifiers.new('Retopology budget preserving UV appearance','DECIMATE');decimate.ratio=args.triangles/original_triangles;decimate.use_collapse_triangulate=True
  bpy.context.view_layer.objects.active=body;bpy.ops.object.modifier_apply(modifier=decimate.name)
 for p in body.data.polygons:p.use_smooth=True
 # Reposition rotation pivots independently from bone directions. +Y bone
 # axes keep local XYZ aligned with the authoring coordinate convention.
 origins={'body':(0,0,.80),'head':(0,0,1.76),'tail':(0,.20,.65)}
 origins.update(profile.get('boneOrigins',{}))
 bpy.ops.object.select_all(action='DESELECT');c.rig.select_set(True);bpy.context.view_layer.objects.active=c.rig;bpy.ops.object.mode_set(mode='EDIT')
 for name,origin in origins.items():
  if name not in c.rig.data.edit_bones:raise ValueError('Unknown bone '+name)
  bone=c.rig.data.edit_bones[name];bone.head=origin;bone.tail=Vector(origin)+Vector((0,.18,0))
 bpy.ops.object.mode_set(mode='OBJECT');c.rig.select_set(False)
 segments={
  'body':[(0,0,.46),(0,0,1.27)],'head':[(0,0,1.45),(0,0,2.14)],
  'arm-1':[(-.32,-.03,1.08),(-.34,-.21,.35)],'arm1':[(.32,-.03,1.08),(.34,-.21,.35)],
  'foot-1':[(-.23,.05,.38),(-.24,-.09,.11)],'foot1':[(.23,.05,.38),(.24,-.09,.11)],
  'tail':[(0,.25,.55),(.60,.35,.65)]}
 segments.update(profile.get('deformSegments',{}))
 names=list(segments);vertices=np.asarray([tuple(v.co) for v in body.data.vertices],dtype=float)
 distances=np.stack([segment_distances(vertices,*segments[name]) for name in names],axis=1)
 scores=(distances+.065)**-4
 # Anatomical priors keep the skull stable and avoid a hand pulling the torso.
 head_gate=1/(1+np.exp(-(vertices[:,2]-1.36)/.10))
 scores[:,names.index('head')]*=head_gate
 scores[:,names.index('body')]*=(1-.80*head_gate)
 for side in [-1,1]:
  for part in ['arm','foot']:
   name=part+str(side)
   if name in names:scores[:,names.index(name)]*=1/(1+np.exp(-(vertices[:,0]*side-.08)/.07))
 order=np.argsort(scores,axis=1)[:,-3:];weights=np.take_along_axis(scores,order,axis=1);weights/=np.maximum(weights.sum(axis=1,keepdims=True),1e-12)
 groups={name:body.vertex_groups.new(name=name) for name in names}
 for i in range(len(vertices)):
  for j in range(3):groups[names[order[i,j]]].add([i],float(weights[i,j]),'REPLACE')
 # Optional independent scenery/plant regions. These are explicit checked
 # landmarks, not an assumption that every generated fox has the same pose.
 for region in profile.get('rigidRegions',[]):
  name=region['bone'];minimum=np.asarray(region['min']);maximum=np.asarray(region['max'])
  if name not in c.rig.data.bones:raise ValueError('Unknown region bone')
  chosen=np.where(np.all((vertices>=minimum)&(vertices<=maximum),axis=1))[0].tolist()
  if not chosen:raise ValueError('Empty region '+name)
  for g in body.vertex_groups:g.remove(chosen)
  g=body.vertex_groups.get(name) or body.vertex_groups.new(name=name);g.add(chosen,1,'REPLACE')
 body.parent=c.rig;mod=body.modifiers.new('Anatomical skin','ARMATURE');mod.object=c.rig;mod.use_deform_preserve_volume=True;c.objects.append(body)
 def nearest(point):return tuple(vertices[np.argmin(np.sum((vertices-np.asarray(point))**2,axis=1))])
 c.head_top=tuple(profile.get('patAnchor',nearest((0,0,2.13))))
 c.mouth=tuple(profile.get('mouthAnchor',nearest((0,-.45,1.65))))
 c.paw=tuple(profile.get('greetingAnchor',nearest((.40,-.20,.55))))
 c.water_target=tuple(profile['waterAnchor']) if 'waterAnchor' in profile else None
 c.wings=list(profile.get('wingBones',[]))
 c.features=['Generated anatomical surface preserved','UV and PBR texture preservation','Custom region/pivot rig; requires visual motion review']
 # Resize only oversized embedded 3D textures. Do not replace the generated
 # mesh with the reference image or a front-facing image plane.
 for material in body.data.materials:
  if not material or not material.use_nodes:continue
  for node in material.node_tree.nodes:
   if node.type=='TEX_IMAGE' and node.image and max(node.image.size)>2048:
    image=node.image;ratio=2048/max(image.size);image.scale(max(1,round(image.size[0]*ratio)),max(1,round(image.size[1]*ratio)));image.pack()
 c.tools();c.animate();info=c.export(out,args.render)
 info.update({'status':'generated_rig_candidate_requires_anatomy_review','approved':False,'sourceSHA256':hashlib.sha256(raw.read_bytes()).hexdigest(),
  'sourceFile':raw.name,'sourceTriangles':original_triangles,'landmarkProfile':Path(args.landmarks).name if args.landmarks else None,
  'licenseVerifiedForProduction':False,'note':'Default pivots are a starting point; inspect all five gestures and fit anchors before use.'})
 report=out/args.theme/args.persona/(str(args.stage)+'.json');report.write_text(json.dumps(info,ensure_ascii=False,indent=2),encoding='utf8')
 print('GENERATED_RIG_CANDIDATE',json.dumps({key:info[key] for key in ['id','bytes','triangles','sourceTriangles','bones','status']}),flush=True)

if __name__=='__main__':main()
