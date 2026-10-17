"""Original Blender-authored chive candidate. Not production-approved art.
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
rigdata=bpy.data.armatures.new('Chive gesture rig');rig=bpy.data.objects.new('SCALLION_RIG',rigdata);scene.collection.objects.link(rig);bpy.context.view_layer.objects.active=rig;rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
def bone(name,head,tail,parent=None):
 b=rigdata.edit_bones.new(name);b.head=head;b.tail=tail
 if parent:b.parent=rigdata.edit_bones[parent]
 return b
# Bone local axes deliberately match world axes: local Y is the bone direction.
# The old Z-aligned rig made an apparent upward movement travel in depth.
bone('body',(0,0,.25),(0,.3,.25))
blades=[('leaf_c',-.10,2.35,.035,.070),('leaf_l',-.52,2.10,.035,.070),('leaf_r',.57,2.16,.07,.075),('leaf_ll',-.88,1.77,.12,.080),('leaf_rr',.87,1.71,.14,.080),('leaf_back_l',-.31,1.99,.22,.064),('leaf_back_r',.32,2.04,.25,.064)]
for name,*_ in blades:bone(name,(0,0,.82),(0,.3,.82),'body')
for side in [-1,1]:bone('eye_'+str(side),(side*.133,-.214,.57),(side*.133,.086,.57),'body')
for name,pos in [('can',(0,0,0)),('sun',(0,0,0)),('heart',(0,0,0)),('note',(0,0,0)),('hand',(0,0,0)),('beam',(0,0,0))]:bone(name,pos,(pos[0],pos[1]+.3,pos[2]))
for i in range(10):bone('drop_'+str(i),(0,0,0),(0,.15,0))
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
# A small bundled leaf sheath rather than an onion/scallion bulb. The flat,
# long chive blades, not the pale base, make up most of the silhouette.
profile=[(.19,.065),(.24,.10),(.31,.17),(.40,.24),(.51,.27),(.62,.265),(.73,.23),(.83,.19),(.94,.17),(1.04,.175)]
vs=[];cols=[];faces=[]
for j,(z,r) in enumerate(profile):
 for i in range(64):
  a=i*math.tau/64;vs.append((r*math.cos(a),r*.78*math.sin(a),z));g=max(0,min(1,(z-.60)/.49));base=(.96-.66*g,.95-.34*g,.79-.64*g);x=r*math.cos(a);y=r*.78*math.sin(a);blush=.45*sum(math.exp(-((x-side*.215)/.06)**2-((z-.45)/.06)**2) for side in [-1,1]) if y<-.10 else 0;cols.append(tuple(base[k]*(1-blush)+(.96,.30,.36)[k]*blush for k in range(3)))
  if j:
   a0=(j-1)*64+i;b0=(j-1)*64+(i+1)%64;faces.append((a0,b0,j*64+(i+1)%64,j*64+i))
faces.extend([tuple(range(63,-1,-1)),tuple((len(profile)-1)*64+i for i in range(64))])
body=mesh('Bundled pale chive sheath',vs,faces,skin,colors=cols)
sub=body.modifiers.new('Silhouette polish','SUBSURF');sub.levels=1;sub.render_levels=1
bpy.context.view_layer.objects.active=body;bpy.ops.object.modifier_move_up(modifier=sub.name);bpy.ops.object.modifier_apply(modifier=sub.name)
# Seven flattened, narrow blades with fine parallel veins and gently bent tips.
for n,(name,dx,height,depth,width) in enumerate(blades):
 vs=[];cols=[];faces=[];N=48;K=8
 for j in range(N+1):
  t=j/N;cx=dx*t**1.6;z=.82+height*(t-.10*t**6);cy=depth*t+.035*math.sin(t*math.pi);w=max(.001,width*(.72+.28*math.sin(math.pi*t))*(1-t**5));th=max(.001,.012*(1-t)**.4)
  for k in range(K):
   a=k*math.tau/K;x=cx+math.cos(a)*w;y=cy+math.sin(a)*th;vs.append((x,y,z))
   green=max(0,min(1,t*4.7));ridge=.035*max(0,math.cos(a))
   cols.append((.36*(1-green)+(.055+ridge)*green,.62*(1-green)+(.27+ridge)*green,.12*(1-green)+.025*green))
   if j:faces.append(((j-1)*K+k,(j-1)*K+(k+1)%K,j*K+(k+1)%K,j*K+k))
 faces.extend([tuple(range(K-1,-1,-1)),tuple(N*K+k for k in range(K))]);mesh('Blade '+name,vs,faces,leafmat,name,cols)
 # Subtle raised, tapered midrib.
 pts=[]
 for j in range(8):
  t=.05+.88*j/7;pts.append((dx*t**1.6,depth*t+.035*math.sin(t*math.pi)-.012*(1-t)**.4-.001,.82+height*(t-.10*t**6)))
 curve('Fine parallel vein '+name,pts,.0017,leafmat,name)
# Eyes contain actual volumes; no painted flat character plane.
for side in [-1,1]:
 x=side*.133;b='eye_'+str(side)
 ell('Ivory eye rim',(x,-.186,.57),(.077,.051,.100),white,b)
 ell('Amber iris',(x,-.223,.572),(.065,.036,.087),iris,b)
 ell('Espresso pupil',(x,-.249,.582),(.050,.023,.068),eye,b)
 ell('Main softbox reflection',(x-.019,-.271,.614),(.018,.007,.024),white,b,20,12)
 ell('Tiny eye glint',(x+.017,-.271,.560),(.008,.005,.009),white,b,16,10)
 curve('Expressive eyebrow '+str(side),[(x-side*.045,-.175,.710),(x,-.196,.731),(x+side*.036,-.176,.714)],.008,rootmat)
ell('Open happy mouth',(0,-.211,.435),(.061,.018,.055),mouthmat)
ell('Tongue',(0,-.227,.413),(.038,.008,.017),pink)
ell('Little upper teeth',(0,-.230,.458),(.038,.006,.007),white)
# Distinct fine root tendrils, with irregular bends and taper in the filament tips.
for i in range(11):
 a=i*2.4;reach=random.uniform(.10,.24);x=math.cos(a)*reach;y=math.sin(a)*reach*.62
 pts=[(.02*math.cos(a),.02*math.sin(a),.235),(x*.25,y*.25,.11),(x*.72,y*.72,.055),(x,y,.04+random.random()*.025)]
 curve('Root filament %02d'%i,pts,.0065 if i%3 else .009,rootmat)
 for j in range(2):
  q=pts[-2];curve('Root hair %02d_%d'%(i,j),[q,(q[0]+.025*math.cos(a+j),q[1]+.018*math.sin(a+j),q[2]-.015),(q[0]+.055*math.cos(a+j),q[1]+.035*math.sin(a+j),.028)],.0028,rootmat)
# Interaction tools are actual weighted meshes. All prop bones start at the
# origin; their poses can be placed with predictable world-space anchors.
ell('Watering can body',(0,0,0),(.19,.14,.17),jade,'can')
curve('Can handle',[(.13,0,.12),(.31,0,.21),(.32,0,-.10),(.13,0,-.12)],.025,gold,'can')
curve('Can spout',[(-.13,0,-.06),(-.27,0,.02),(-.36,0,.12)],.028,jade,'can')
ell('Can rose',(-.36,0,.12),(.058,.052,.025),gold,'can')
for i in range(10):ell('Water droplet '+str(i),(0,0,0),(.014,.014,.029),water,'drop_'+str(i),12,8)
# A soft mitten with a thumb and four rounded fingertips, contacting the leaf.
ell('Visitor palm',(0,0,0),(.15,.075,.07),white,'hand',24,16)
for i in range(4):ell('Visitor finger '+str(i),(-.095+i*.063,0,-.035),(.036,.069,.047),white,'hand',16,10)
ell('Visitor thumb',(.15,0,-.01),(.055,.06,.042),white,'hand',16,10)
ell('Sun center',(0,0,0),(.115,.045,.115),gold,'sun')
for i in range(10):
 a=i*math.tau/10;curve('Sun ray '+str(i),[(.17*math.cos(a),0,.17*math.sin(a)),(.22*math.cos(a),0,.22*math.sin(a))],.008,gold,'sun')
for j in range(3):curve('Light reaching leaf '+str(j),[(-.76,.025,2.72-j*.09),(-.42,.015,2.59-j*.12),(-.17,.01,2.45-j*.15)],.004,gold,'beam')
# Heart is a reaction emitted at the contact site after the greeting.
vs=[];faces=[];K=48
for depth in [-.03,0,.03]:
 for i in range(K):
  t=i*math.tau/K;x=16*math.sin(t)**3/110;z=(13*math.cos(t)-5*math.cos(2*t)-2*math.cos(3*t)-math.cos(4*t))/110
  scale=.82 if depth else 1;vs.append((x*scale,depth,z*scale))
for j in range(2):
 for i in range(K):faces.append((j*K+i,j*K+(i+1)%K,(j+1)*K+(i+1)%K,(j+1)*K+i))
faces.extend([tuple(range(K-1,-1,-1)),tuple(2*K+i for i in range(K))]);mesh('Contact response heart',vs,faces,pink,'heart')
ell('Music note head',(0,0,0),(.06,.025,.035),gold,'note')
curve('Music note stem',[(.05,0,0),(.05,0,.22),(.15,0,.17)],.012,gold,'note')
rig.animation_data_create();props=['can','sun','heart','note','hand','beam']+['drop_'+str(i) for i in range(10)];fps=24;scene.render.fps=fps
names=['enter','idle','interact','evolve','celebrate','interact_pat','interact_offer','interact_play','interact_care','interact_cheer']
contact_checks=[]
def leaf_surface(name,t):
 _,dx,height,depth,_=next(b for b in blades if b[0]==name)
 return (dx*t**1.6,depth*t+.035*math.sin(math.pi*t)-.012*(1-t)**.4,.82+height*(t-.10*t**6))
def smooth(v):
 v=max(0,min(1,v));return v*v*(3-2*v)
def envelope(t,a=.08,b=.87):return smooth((t-a)/.10)*smooth((b-t)/.10)
def anchor(bone_name,point):
 bpy.context.view_layer.update()
 return rig.pose.bones[bone_name].matrix @ rigdata.bones[bone_name].matrix_local.inverted() @ Vector(point)
def show(name,pos,scale=1):
 p=rig.pose.bones[name];p.location=pos;p.scale=(max(.0001,scale),)*3;return p
for name in names:
 action=bpy.data.actions.new(name);rig.animation_data.action=action
 duration=4 if name=='idle' else 3;end=duration*fps
 # Include exact contact/impact phases; these are geometry checks, not art approval.
 frames=sorted(set(range(1,end+1,2))|{end,round(1+(end-1)*.45),round(1+(end-1)*.60)})
 for frame in frames:
  t=(frame-1)/(end-1);wave=math.sin(t*math.pi);phase=t*math.tau
  for p in rig.pose.bones:p.location=(0,0,0);p.rotation_mode='XYZ';p.rotation_euler=(0,0,0);p.scale=(.0001,)*3 if p.name in props else (1,1,1)
  b=rig.pose.bones['body'];b.location.z=.009*math.sin(phase);b.rotation_euler.y=.009*math.sin(phase)
  for i,(k,*_) in enumerate(blades):rig.pose.bones[k].rotation_euler.y=.018*math.sin(phase+i*.8)
  blink=1-.93*max(0,1-abs(t-.66)/.025)
  for side in [-1,1]:rig.pose.bones['eye_'+str(side)].scale.z=blink
  if name=='enter':b.location.z+=.20*(1-t)**2;b.scale=(.86+.14*t,)*3
  if name in ['interact','interact_pat']:
   touch=envelope(t,.26,.71)
   rig.pose.bones['leaf_c'].rotation_euler.y=.12*touch
   for side in [-1,1]:rig.pose.bones['eye_'+str(side)].scale.z=1-.60*touch
   # Follow the posed leaf, so the finger never pats an empty location.
   target=anchor('leaf_c',leaf_surface('leaf_c',.82))
   approach=smooth((t-.08)/.22);withdraw=smooth((t-.71)/.18)
   offset=(1-approach)+withdraw
   p=show('hand',target+Vector((.58*offset,-.01,.078+.28*offset)),envelope(t))
   if .34<t<.65:contact_checks.append({'clip':name,'frame':frame,'kind':'fingertip_to_posed_leaf','distance':round((Vector(p.location)-Vector((0,-.01,.078))-target).length,5)})
  if name=='interact_offer':
   # Tilt first, then emit ten individually rigged droplets from the transformed
   # spout to the leaf-sheath surface. Reactions begin after the first impact.
   can=show('can',(.79,-.12,1.90),envelope(t,.04,.92));can.rotation_euler.y=.72*smooth((t-.10)/.16)
   rotation=can.rotation_euler.to_matrix();spout=Vector(can.location)+rotation@Vector((-.36,0,.12))
   target=anchor('body',(0,-.145,.875))
   wet=smooth((t-.35)/.14)*smooth((.92-t)/.18)
   for i,(k,*_) in enumerate(blades):rig.pose.bones[k].rotation_euler.y+=.075*math.sin((t-.35)*22+i*.6)*wet
   target=anchor('body',(0,-.145,.875))
   for i in range(10):
    u=(t-.22-i*.032)/.22
    if 0<=u<=1:
     pos=spout.lerp(target,u);pos.z+=.06*math.sin(math.pi*u)
     show('drop_'+str(i),pos)
    if .98<=u<=1:contact_checks.append({'clip':name,'frame':frame,'kind':'water_to_sheath','distance':round((pos-target).length,5)})
   for side in [-1,1]:rig.pose.bones['eye_'+str(side)].scale.z=1-.35*wet
  if name=='interact_play':
   step=math.sin(phase*2)*wave;b.location.x=.055*step;b.location.z+=.055*abs(math.sin(phase*2))*wave;b.rotation_euler.y=.06*step
   for i,(k,*_) in enumerate(blades):rig.pose.bones[k].rotation_euler.y+=.13*math.sin(phase*2+i*.35)*wave
   p=show('note',(.65,-.03,1.45+.25*t),wave);p.rotation_euler.y=.15*step
  if name=='interact_care':
   light=envelope(t,.10,.90);show('sun',(-.96,.03,2.85),light);show('beam',(0,0,0),light)
   turn=smooth((t-.26)/.25)*smooth((.92-t)/.22)
   for k,*_ in blades:rig.pose.bones[k].rotation_euler.y=-.09*turn
   for side in [-1,1]:rig.pose.bones['eye_'+str(side)].scale.z=1-.55*turn
  if name in ['interact_cheer','celebrate','evolve']:
   greeting=envelope(t,.28,.68);rig.pose.bones['leaf_r'].rotation_euler.y=.15*greeting
   target=anchor('leaf_r',leaf_surface('leaf_r',.81));off=1-smooth((t-.08)/.24)+smooth((t-.68)/.22)
   show('hand',target+Vector((.53*off,-.01,.078+.20*off)),envelope(t))
   if t>.46:show('heart',target+Vector((0,-.05,(t-.46)*1.1)),math.sin(math.pi*max(0,min(1,(t-.46)/.54))))
   if .35<t<.63:contact_checks.append({'clip':name,'frame':frame,'kind':'leaf_greeting_contact','distance':round((Vector(rig.pose.bones['hand'].location)-Vector((0,-.01,.078))-target).length,5)})
  for p in rig.pose.bones:
   for prop in ['location','rotation_euler','scale']:p.keyframe_insert(prop,frame=frame,group=p.name)
 # Exact rest pose, with all temporary tools hidden, to avoid a snap on returning.
 for p in rig.pose.bones:
  p.location=(0,0,0);p.rotation_euler=(0,0,0);p.scale=(.0001,)*3 if p.name in props else (1,1,1)
  for prop in ['location','rotation_euler','scale']:p.keyframe_insert(prop,frame=end,group=p.name)
 track=rig.animation_data.nla_tracks.new();track.name=name;track.strips.new(name,1,action);track.mute=True
rig.animation_data.action=None
for p in rig.pose.bones:p.location=(0,0,0);p.rotation_euler=(0,0,0);p.scale=(.0001,)*3 if p.name in props else (1,1,1)
# Consolidate all meshes; vertex groups preserve the separate gesture bones.
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=body;bpy.ops.object.join();body.name='Chive and contact interaction props';meshes=[body]
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
report={'status':'candidate_not_approved','tool':bpy.app.version_string,'source':'original authored Blender chive geometry; narrow sheath and seven flat blades; neutral stage 0','model':'scallion-neutral-stage0.glb','requiredClips':names,'contactChecks':contact_checks,'meshObjects':len(meshes),'bytes':(out/'scallion-neutral-stage0.glb').stat().st_size,'note':'Only one neutral initial stage. Other stages/themes remain unfinished. No paid requests.'}
(out/'report.json').write_text(json.dumps(report,indent=2));print('CANDIDATE_READY',json.dumps(report))
