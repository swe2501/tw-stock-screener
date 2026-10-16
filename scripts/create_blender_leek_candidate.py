"""Original Blender-authored scallion candidate. Not production-approved art.
Run: blender -b -t 6 --python scripts/create_blender_leek_candidate.py -- <output-dir>
All mesh, vertex colors, rig and clips are authored here; no paid service.
"""
import bpy, math, random, sys, json
from pathlib import Path
from mathutils import Vector
random.seed(19)
out=Path(sys.argv[sys.argv.index('--')+1]);out.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=32
scene.cycles.use_denoising=True;scene.render.resolution_x=720;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.world.color=(.17,.20,.23);scene.view_settings.view_transform='AgX'
materials={}
def mat(name,color,rough=.4,metal=0,vertex=False):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 if name=='Porcelain skin':p.inputs['Subsurface Weight'].default_value=.09;p.inputs['Subsurface Radius'].default_value=(.7,.4,.15)
 if name=='Glossy espresso':p.inputs['Coat Weight'].default_value=.55;p.inputs['Coat Roughness'].default_value=.1
 if vertex:
  a=m.node_tree.nodes.new('ShaderNodeVertexColor');a.layer_name='Color';m.node_tree.links.new(a.outputs['Color'],p.inputs['Base Color'])
 materials[name]=m;return m
skin=mat('Porcelain skin',(1,.92,.73),.37,vertex=True)
leafmat=mat('Living leaf',(.25,.50,.03),.36,vertex=True)
rootmat=mat('Golden roots',(.56,.36,.11),.5)
eye=mat('Glossy espresso',(.028,.008,.005),.12)
iris=mat('Warm amber',(.23,.063,.013),.23)
white=mat('Eye reflection',(1,.98,.88),.16)
mouthmat=mat('Smile',(.12,.013,.023),.42)
pink=mat('Petal pink',(.94,.25,.31),.43,vertex=True)
jade=mat('Jade watering can',(.035,.27,.22),.29,.35)
gold=mat('Soft gold',(.78,.43,.10),.28,.68)
water=mat('Water crystal',(.20,.68,.91),.18,.15)
rigdata=bpy.data.armatures.new('Scallion gesture rig');rig=bpy.data.objects.new('SCALLION_RIG',rigdata);scene.collection.objects.link(rig);bpy.context.view_layer.objects.active=rig;rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
def bone(name,head,tail,parent=None):
 b=rigdata.edit_bones.new(name);b.head=head;b.tail=tail
 if parent:b.parent=rigdata.edit_bones[parent]
 return b
bone('body',(0,0,.25),(0,0,1.15));bone('leaf_c',(0,0,1.22),(0,0,2.8),'body');bone('leaf_l',(-.08,0,1.2),(-.8,0,2.5),'body');bone('leaf_r',(.08,0,1.2),(.8,0,2.5),'body')
for side in [-1,1]:bone('eye_'+str(side),(side*.255,-.37,.89),(side*.255,-.37,1.1),'body')
for name,pos in [('can',(.95,-.1,1.85)),('sun',(-.85,.1,2.5)),('heart',(.82,0,1.55)),('note',(-.85,0,1.65)),('water',(.35,-.1,1.4))]:bone(name,pos,(pos[0],pos[1],pos[2]+.35))
bpy.ops.object.mode_set(mode='OBJECT');rig.select_set(False)
meshes=[]
def finish(obj,name,material,b='body',colors=None):
 obj.name=name;obj.data.materials.append(material)
 for p in obj.data.polygons:p.use_smooth=True
 if colors:
  attr=obj.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
  for i,c in enumerate(colors):attr.data[i].color=(*c,1)
 elif material==leafmat:
  attr=obj.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
  for v in obj.data.vertices:attr.data[v.index].color=(.18,.35,.028,1)
 elif material==pink:
  attr=obj.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
  for v in obj.data.vertices:attr.data[v.index].color=(.94,.25,.31,1)
 obj.parent=rig;group=obj.vertex_groups.new(name=b);group.add(list(range(len(obj.data.vertices))),1,'REPLACE');mod=obj.modifiers.new('Gesture skin','ARMATURE');mod.object=rig;meshes.append(obj);return obj

def mesh(name,vs,faces,material,b='body',colors=None):
 data=bpy.data.meshes.new(name);data.from_pydata(vs,[],faces);data.update();obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);return finish(obj,name,material,b,colors)
def ell(name,pos,scale,material,b='body',segments=32,rings=20):
 bpy.ops.object.select_all(action='DESELECT')
 bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=pos);o=bpy.context.object;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 # Bake all coordinates into mesh, so all skin spaces share the rig origin.
 for v in o.data.vertices:v.co+=o.location
 o.location=(0,0,0);return finish(o,name,material,b)
def curve(name,pts,radius,material,b='body'):
 data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D';data.resolution_u=7;data.bevel_depth=radius;data.bevel_resolution=2
 sp=data.splines.new('BEZIER');sp.bezier_points.add(len(pts)-1)
 for q,p in zip(sp.bezier_points,pts):q.co=p;q.handle_left_type='AUTO';q.handle_right_type='AUTO'
 o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);bpy.ops.object.select_all(action='DESELECT');bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False);return finish(o,name,material,b)
# Pear silhouette: continuous sculpted surface, tapered neck, no primitive seams.
profile=[(.19,.07),(.24,.16),(.30,.21),(.37,.32),(.46,.43),(.57,.50),(.70,.535),(.84,.515),(.98,.45),(1.10,.34),(1.22,.22),(1.32,.16),(1.43,.14)]
vs=[];cols=[];faces=[]
for j,(z,r) in enumerate(profile):
 for i in range(64):
  a=i*math.tau/64;vs.append((r*math.cos(a),r*.78*math.sin(a),z));g=max(0,min(1,(z-1.07)/.46));base=(.99-.25*g,.93+.02*g,.78-.42*g);x=r*math.cos(a);y=r*.78*math.sin(a);blush=.62*sum(math.exp(-((x-side*.37)/.10)**2-((z-.70)/.085)**2) for side in [-1,1]) if y<-.12 else 0;cols.append(tuple(base[k]*(1-blush)+(.96,.30,.36)[k]*blush for k in range(3)))
  if j:
   a0=(j-1)*64+i;b0=(j-1)*64+(i+1)%64;faces.append((a0,b0,j*64+(i+1)%64,j*64+i))
faces.extend([tuple(range(63,-1,-1)),tuple((len(profile)-1)*64+i for i in range(64))])
body=mesh('Sculpted pearl bulb',vs,faces,skin,colors=cols)
sub=body.modifiers.new('Silhouette polish','SUBSURF');sub.levels=1;sub.render_levels=1
bpy.context.view_layer.objects.active=body;bpy.ops.object.modifier_move_up(modifier=sub.name);bpy.ops.object.modifier_apply(modifier=sub.name)
# Three closed curved fleshy blades with longitudinal highlight ridges and vertex gradients.
for n,(name,dx,height,depth,width) in enumerate([('leaf_c',-.10,1.76,.035,.135),('leaf_l',-.88,1.35,.04,.16),('leaf_r',.86,1.37,.09,.16)]):
 vs=[];cols=[];faces=[];N=48;K=12
 for j in range(N+1):
  t=j/N;cx=dx*t**1.6;z=1.24+height*(t if n==0 else math.sin(t*math.pi/2));cy=depth*t+.035*math.sin(t*math.pi);w=max(.002,width*(.45+.60*math.sin(math.pi*t))*math.sqrt(max(0,math.sin(math.pi*(.1+.9*t)))));th=max(.003,.058*(1-t)**.45)
  for k in range(K):
   a=k*math.tau/K;x=cx+math.cos(a)*w;y=cy+math.sin(a)*th;vs.append((x,y,z))
   green=max(0,min(1,t*3.7));ridge=.035*max(0,math.cos(a))
   cols.append((.82*(1-green)+(.065+ridge)*green,.90*(1-green)+(.20+ridge)*green,.39*(1-green)+.008*green))
   if j:faces.append(((j-1)*K+k,(j-1)*K+(k+1)%K,j*K+(k+1)%K,j*K+k))
 faces.extend([tuple(range(K-1,-1,-1)),tuple(N*K+k for k in range(K))]);mesh('Blade '+name,vs,faces,leafmat,name,cols)
 # Subtle raised, tapered midrib.
 pts=[]
 for j in range(8):
  t=.05+.88*j/7;pts.append((dx*t**1.6,depth*t+.035*math.sin(t*math.pi)-.058*(1-t)**.45-.001,1.24+height*(t if n==0 else math.sin(t*math.pi/2))))
 curve('Midrib '+name,pts,.0045,leafmat,name)
# Eyes contain actual volumes; no painted flat character plane.
for side in [-1,1]:
 x=side*.255;b='eye_'+str(side)
 ell('Ivory eye rim',(x,-.354,.88),(.123,.080,.157),white,b)
 ell('Amber iris',(x,-.410,.883),(.105,.058,.139),iris,b)
 ell('Espresso pupil',(x,-.447,.898),(.080,.036,.108),eye,b)
 ell('Main softbox reflection',(x-.031,-.480,.949),(.029,.011,.038),white,b,20,12)
 ell('Tiny eye glint',(x+.027,-.480,.863),(.012,.008,.014),white,b,16,10)
 curve('Expressive eyebrow '+str(side),[(x-side*.072,-.34,1.098),(x,-.369,1.133),(x+side*.057,-.337,1.108)],.014,rootmat)
ell('Open happy mouth',(0,-.406,.711),(.099,.027,.09),mouthmat)
ell('Tongue',(0,-.429,.676),(.061,.012,.026),pink)
ell('Little upper teeth',(0,-.434,.749),(.062,.009,.011),white)
# Distinct fine root tendrils, with irregular bends and taper in the filament tips.
for i in range(17):
 a=i*2.4;reach=random.uniform(.12,.37);x=math.cos(a)*reach;y=math.sin(a)*reach*.62
 pts=[(.02*math.cos(a),.02*math.sin(a),.235),(x*.25,y*.25,.11),(x*.72,y*.72,.055),(x,y,.04+random.random()*.025)]
 curve('Root filament %02d'%i,pts,.0065 if i%3 else .009,rootmat)
 for j in range(2):
  q=pts[-2];curve('Root hair %02d_%d'%(i,j),[q,(q[0]+.025*math.cos(a+j),q[1]+.018*math.sin(a+j),q[2]-.015),(q[0]+.055*math.cos(a+j),q[1]+.035*math.sin(a+j),.028)],.0028,rootmat)
# Interaction props. Each has its own rig bone, not a whole-model wobble.
ell('Watering can body',(.98,0,1.88),(.21,.15,.18),jade,'can')
curve('Can handle',[(1.1,0,1.99),(1.32,0,2.12),(1.34,0,1.83),(1.12,0,1.79)],.028,gold,'can')
curve('Can spout',[(.84,0,1.82),(.68,0,1.94),(.59,0,2.05)],.034,jade,'can')
ell('Can rose',(.58,0,2.06),(.065,.06,.028),gold,'can')
ell('Sun center',(-.85,.1,2.5),(.13,.05,.13),gold,'sun')
for i in range(12):
 a=i*math.tau/12;curve('Sun ray '+str(i),[(-.85+.19*math.cos(a),.1,2.5+.19*math.sin(a)),(-.85+.25*math.cos(a),.1,2.5+.25*math.sin(a))],.009,gold,'sun')
for i in range(7):ell('Water droplet '+str(i),(.36+random.random()*.12,-.05,1.46+i*.08),(.018,.018,.034),water,'water',16,12)
# A softly puffed heart mesh from a sampled heart outline.
vs=[];faces=[];K=64
for depth in [-.045,0,.045]:
 for i in range(K):
  t=i*math.tau/K;x=16*math.sin(t)**3/80;z=(13*math.cos(t)-5*math.cos(2*t)-2*math.cos(3*t)-math.cos(4*t))/80
  scale=.82 if depth else 1;vs.append((.82+x*scale,depth,1.55+z*scale))
for j in range(2):
 for i in range(K):faces.append((j*K+i,j*K+(i+1)%K,(j+1)*K+(i+1)%K,(j+1)*K+i))
faces.extend([tuple(range(K-1,-1,-1)),tuple(2*K+i for i in range(K))]);mesh('Puffed encouragement heart',vs,faces,pink,'heart')
ell('Music note head',(-.89,0,1.66),(.08,.035,.045),gold,'note')
curve('Music note stem',[(-.82,0,1.66),(-.82,0,1.95),(-.68,0,1.88)],.014,gold,'note')
# Build distinct NLA actions suitable for GLB export.
rig.animation_data_create();props=['can','sun','heart','note','water'];fps=24;scene.render.fps=fps
names=['enter','idle','interact','evolve','celebrate','interact_pat','interact_offer','interact_play','interact_care','interact_cheer']
for name in names:
 action=bpy.data.actions.new(name);rig.animation_data.action=action
 duration=4 if name=='idle' else 3;end=duration*fps
 for frame in range(1,end+1,3):
  t=(frame-1)/(end-1);wave=math.sin(t*math.pi);phase=t*math.tau
  for p in rig.pose.bones:p.location=(0,0,0);p.rotation_mode='XYZ';p.rotation_euler=(0,0,0);p.scale=(1,1,1)
  b=rig.pose.bones['body'];b.location.z=.018*math.sin(phase);b.rotation_euler.y=.018*math.sin(phase)
  for i,k in enumerate(['leaf_c','leaf_l','leaf_r']):rig.pose.bones[k].rotation_euler.y=.035*math.sin(phase+i*.8)
  blink=1-.93*max(0,1-abs(t-.66)/.025)
  for side in [-1,1]:rig.pose.bones['eye_'+str(side)].scale.z=blink
  for k in props:rig.pose.bones[k].scale=(.0001,)*3
  if name=='enter':b.location.z+=.30*(1-t)**2;b.scale=(.85+.15*t,)*3
  if name in ['interact','interact_pat']:
   b.scale=(1+.07*wave,1+.04*wave,1-.09*wave);b.rotation_euler.y=.12*wave
   rig.pose.bones['leaf_c'].rotation_euler.y=.22*wave
   for side in [-1,1]:rig.pose.bones['eye_'+str(side)].scale.z=1-.75*wave
  if name=='interact_offer':
   rig.pose.bones['can'].scale=(wave,)*3;rig.pose.bones['can'].rotation_euler.y=-.38*wave
   wet=max(0,math.sin(math.pi*max(0,min(1,(t-.16)/.65))))
   rig.pose.bones['water'].scale=(wet,)*3;rig.pose.bones['water'].location.z=-.22*t;b.location.z+=.045*wave
  if name=='interact_play':
   b.location.x=.11*math.sin(phase*2)*wave;b.location.z+=.11*abs(math.sin(phase*2))*wave;b.rotation_euler.y=.18*math.sin(phase*2)*wave
   rig.pose.bones['leaf_l'].rotation_euler.y=-.28*math.sin(phase*2)*wave;rig.pose.bones['leaf_r'].rotation_euler.y=.28*math.sin(phase*2)*wave
   rig.pose.bones['note'].scale=(wave,)*3;rig.pose.bones['note'].location.z=.2*t
  if name=='interact_care':
   rig.pose.bones['sun'].scale=(wave,)*3;rig.pose.bones['sun'].rotation_euler.y=.4*wave;rig.pose.bones['leaf_c'].rotation_euler.y=-.10*wave
   b.rotation_euler.y=-.1*wave
  if name in ['interact_cheer','celebrate','evolve']:
   rig.pose.bones['heart'].scale=(wave,)*3;rig.pose.bones['heart'].location.z=.45*t;b.location.z+=.18*math.sin(phase*2)**2*wave
   b.rotation_euler.z=.12*math.sin(phase)*wave
  for p in rig.pose.bones:
   for prop in ['location','rotation_euler','scale']:p.keyframe_insert(prop,frame=frame,group=p.name)
 # Last key uses the exact rest pose for stable return to idle.
 for p in rig.pose.bones:
  p.location=(0,0,0);p.rotation_euler=(0,0,0);p.scale=(.0001,)*3 if p.name in props else (1,1,1)
  for prop in ['location','rotation_euler','scale']:p.keyframe_insert(prop,frame=end,group=p.name)
 track=rig.animation_data.nla_tracks.new();track.name=name;strip=track.strips.new(name,1,action);track.mute=True
rig.animation_data.action=None
for p in rig.pose.bones:p.location=(0,0,0);p.rotation_euler=(0,0,0);p.scale=(.0001,)*3 if p.name in props else (1,1,1)
# Consolidate all meshes; vertex groups preserve the separate gesture bones.
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=body;bpy.ops.object.join();body.name='Scallion and interaction props';meshes=[body]
# Export just the character and rig, separate from the studio lighting and scenery.
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(out/'scallion-neutral-stage0.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_force_sampling=True,export_def_bones=True,export_materials='EXPORT',export_yup=True)
# Export samples animation poses; explicitly restore the resting pose for studio preview.
rig.animation_data.action=None
for tr in rig.animation_data.nla_tracks:tr.mute=True
for p in rig.pose.bones:p.location=(0,0,0);p.rotation_euler=(0,0,0);p.scale=(.0001,)*3 if p.name in props else (1,1,1)
# Studio environment, CPU rendered. A matte jade plinth and distant dreamy bokeh.
for o in meshes:o.select_set(False)
rig.select_set(False)
stone=mat('Studio jade',(.10,.18,.16),.76)
bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=.82,depth=.12,location=(0,0,-.055));plinth=bpy.context.object;plinth.data.materials.append(stone);bevel=plinth.modifiers.new('Soft stone lip','BEVEL');bevel.width=.06;bevel.segments=4
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.13));floor=bpy.context.object;floor.data.materials.append(mat('Backdrop',(.065,.11,.115),.9))
def area(name,pos,power,size,color):
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color;o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,1.4))-o.location).to_track_quat('-Z','Y').to_euler()
area('Warm softbox',(-3,-4,6),650,4,(1,.89,.70));area('Blue fill',(3,-2,3),330,3,(.70,.83,1));area('Golden rim',(1,3,4),850,2,(1,.79,.40))
camdata=bpy.data.cameras.new('Portrait camera');cam=bpy.data.objects.new('Portrait camera',camdata);scene.collection.objects.link(cam);cam.location=(3.1,-7.8,3.1);cam.rotation_euler=(Vector((0,0,1.47))-cam.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO';camdata.ortho_scale=3.85;scene.camera=cam
scene.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(out/'scallion-candidate.blend'));scene.render.filepath=str(out/'scallion-front.png');bpy.ops.render.render(write_still=True)
report={'status':'candidate_not_approved','tool':bpy.app.version_string,'source':'original authored Blender geometry; reference: immortal neutral stage 0','model':'scallion-neutral-stage0.glb','requiredClips':names,'meshObjects':len(meshes),'bytes':(out/'scallion-neutral-stage0.glb').stat().st_size,'note':'Only one neutral initial stage. Other stages/themes remain unfinished. No paid requests.'}
(out/'report.json').write_text(json.dumps(report,indent=2));print('CANDIDATE_READY',json.dumps(report))
