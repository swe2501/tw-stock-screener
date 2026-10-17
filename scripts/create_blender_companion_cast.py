"""Author the complete free local companion cast in Blender, without paid services.

blender -b -t 6 --python scripts/create_blender_companion_cast.py -- OUTPUT
Optional: --themes garden,pet --personas neutral --stages 0,4 --render
Outputs are review candidates; this script never approves the production manifest.
Geometry, rig, costumes, environments and animation are authored here. No image
plane is used as a character. The illustrated references guide identity, not UVs.
"""
import argparse
import bpy
import json
import math
import random
import sys
from pathlib import Path
from mathutils import Vector, Matrix, Euler

THEMES = ['immortal','garden','mountain','space','castle','pet','ocean','gem','train']
PERSONAS = ['female','male','neutral']
CLIPS = ['enter','idle','interact','evolve','celebrate','interact_pat',
         'interact_offer','interact_play','interact_care','interact_cheer']
GOLD=(.76,.45,.12); CREAM=(.96,.88,.67); WHITE=(.96,.97,.92)
DARK=(.025,.018,.032); PINK=(.88,.30,.40); LEAF=(.16,.42,.09)
PALETTES={
 'female':[(.39,.18,.66),(.77,.55,.88),(.79,.47,.73)],
 'male':[(.045,.17,.43),(.18,.44,.65),(.22,.43,.58)],
 'neutral':[(.025,.28,.25),(.26,.58,.49),(.30,.55,.41)]}

def mix(a,b,t):return tuple(x*(1-t)+y*t for x,y in zip(a,b))
def clamp(t):return max(0,min(1,t))
def smooth(t):t=clamp(t);return t*t*(3-2*t)
def envelope(t,a=.08,b=.91):return smooth((t-a)/.12)*smooth((b-t)/.12)
def lerp(a,b,t):return Vector(a).lerp(Vector(b),t)

class Character:
 def __init__(self,theme,persona,stage):
  self.theme,self.persona,self.stage=theme,persona,stage
  self.rng=random.Random(THEMES.index(theme)*97+PERSONAS.index(persona)*13+stage)
  self.primary,self.secondary,self.accent=PALETTES[persona]
  self.objects=[];self.materials={};self.props=[];self.contact_samples=[];self.fur_image=None
  self.features=[];self.leaves=[];self.limbs=[];self.wings=[]
  self.head_top=(0,0,2.15);self.mouth=(0,-.50,1.70)
  self.paw=(.46,-.16,1.05);self.water_target=None
  bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
  for data in [bpy.data.meshes,bpy.data.armatures,bpy.data.materials,bpy.data.actions,bpy.data.curves]:
   for item in list(data):
    if item.users==0:data.remove(item)
  data=bpy.data.armatures.new('Companion anatomical rig')
  self.rig=bpy.data.objects.new('RIG_'+theme+'_'+persona+'_'+str(stage),data)
  bpy.context.scene.collection.objects.link(self.rig)
  self.bones={};self.new_bone('root',(0,0,.1));self.new_bone('body',(0,0,.7),'root')
  self.new_bone('head',(0,0,1.65),'body')
  for side in [-1,1]:
   self.new_bone('arm'+str(side),(side*.32,0,1.05),'body')
   self.new_bone('foot'+str(side),(side*.23,0,.30),'body')
   self.new_bone('ear'+str(side),(side*.32,0,2.00),'head')
   self.new_bone('wing'+str(side),(side*.30,.15,1.0),'body')
   self.new_bone('eye'+str(side),(side*.20,-.35,1.7),'head')
  self.new_bone('tail',(0,.20,.5),'body')
  self.new_bone('plant',(0,0,0))
  for name in ['tool_hand','tool_food','tool_brush','tool_can','reply','light']:
   self.new_bone(name,(0,0,0));self.props.append(name)
  for i in range(8):
   name='drop'+str(i);self.new_bone(name,(0,0,0));self.props.append(name)
  self.mat('velvet',.65 if theme in ['garden','mountain','pet'] else .48,0);self.mat('silk',.42,0)
  self.mat('gold',.27,.72);self.mat('gloss',.13,0);self.mat('crystal',.15,.15)

 def new_bone(self,name,origin,parent=None):
  bpy.ops.object.select_all(action='DESELECT');self.rig.select_set(True)
  bpy.context.view_layer.objects.active=self.rig;bpy.ops.object.mode_set(mode='EDIT')
  b=self.rig.data.edit_bones.new(name);b.head=origin;b.tail=Vector(origin)+Vector((0,.18,0))
  if parent:b.parent=self.rig.data.edit_bones[parent]
  bpy.ops.object.mode_set(mode='OBJECT');self.rig.select_set(False)
  self.bones[name]=Vector(origin)

 def mat(self,name,roughness,metal):
  m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF')
  p.inputs['Roughness'].default_value=roughness;p.inputs['Metallic'].default_value=metal
  if name=='velvet':p.inputs['Subsurface Weight'].default_value=.045
  if name in ['gloss','crystal']:p.inputs['Coat Weight'].default_value=.5
  attr=m.node_tree.nodes.new('ShaderNodeVertexColor');attr.layer_name='Color'
  m.node_tree.links.new(attr.outputs['Color'],p.inputs['Base Color'])
  self.materials[name]=m
  if name=='velvet' and self.theme in ['garden','mountain','pet']:
   # Embedded, authored micro-fiber normal map; procedural shader nodes alone
   # would disappear during glTF export, so store real pixels and real UVs.
   image=bpy.data.images.new('Original fine fur normal',width=256,height=256)
   image.colorspace_settings.name='Non-Color';pixels=[]
   for y in range(256):
    v=y/256
    for x in range(256):
     u=x/256;nx=.16*math.sin(math.tau*(u*51+.10*math.sin(v*19)))+.055*math.sin(math.tau*(u*93+v*.4));ny=.018*math.sin(math.tau*(v*13+u*2));nz=math.sqrt(max(.01,1-nx*nx-ny*ny));pixels.extend((nx*.5+.5,ny*.5+.5,nz*.5+.5,1))
   image.pixels=pixels;image.pack();self.fur_image=image
   tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image
   normal=m.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.045
   m.node_tree.links.new(tex.outputs['Color'],normal.inputs['Color']);m.node_tree.links.new(normal.outputs['Normal'],p.inputs['Normal'])
   tint=bpy.data.images.new('Original soft fiber variation',width=256,height=256);values=[]
   for y in range(256):
    for x in range(256):
     u=x/256;v=y/256
     fibers=.5+.5*math.sin(math.tau*(u*79+.05*math.sin(v*53)))
     grain=.5+.5*math.sin(x*17.13+y*39.17)
     gray=.975+.006*fibers+.006*grain;values.extend((gray,gray,gray,1))
   tint.pixels=values;tint.pack();tone=m.node_tree.nodes.new('ShaderNodeTexImage');tone.image=tint
   multiply=m.node_tree.nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
   m.node_tree.links.new(attr.outputs['Color'],multiply.inputs[1]);m.node_tree.links.new(tone.outputs['Color'],multiply.inputs[2]);m.node_tree.links.new(multiply.outputs['Color'],p.inputs['Base Color'])

 def mesh(self,name,verts,faces,color,bone='body',material='velvet',gradient=True):
  data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
  o=bpy.data.objects.new(name,data);bpy.context.scene.collection.objects.link(o)
  data.materials.append(self.materials[material])
  colors=data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
  zmin=min(v[2] for v in verts);height=max(.001,max(v[2] for v in verts)-zmin)
  for v in data.vertices:
   c=color(v.co) if callable(color) else color
   shade=(.90+.10*(v.co.z-zmin)/height) if gradient else 1
   colors.data[v.index].color=(*[clamp(k*shade) for k in c],1)
  for f in data.polygons:f.use_smooth=True
  if self.fur_image:
   uv=data.uv_layers.new(name='Fiber UV')
   for face in data.polygons:
    coords=[]
    for loop_index in face.loop_indices:
     v=data.vertices[data.loops[loop_index].vertex_index].co;coords.append((loop_index,math.atan2(v.y,v.x)/math.tau+.5,v.z*.65))
    seam=max(q[1] for q in coords)-min(q[1] for q in coords)>.5
    for loop_index,u,v in coords:uv.data[loop_index].uv=(u+1 if seam and u<.5 else u,v)
  group=o.vertex_groups.new(name=bone);group.add(list(range(len(verts))),1,'REPLACE')
  mod=o.modifiers.new('Skin','ARMATURE');mod.object=self.rig;o.parent=self.rig
  self.objects.append(o);return o

 def ell(self,name,pos,scale,color,bone='body',material='velvet',rotation=None,n=24,rings=16):
  verts=[];faces=[];rot=Euler(rotation or (0,0,0)).to_matrix();p=Vector(pos)
  for j in range(rings+1):
   a=math.pi*j/rings
   for i in range(n):
    b=math.tau*i/n
    v=Vector((math.sin(a)*math.cos(b)*scale[0],math.sin(a)*math.sin(b)*scale[1],math.cos(a)*scale[2]))
    verts.append(tuple(p+rot@v))
    if j:faces.append(((j-1)*n+i,(j-1)*n+(i+1)%n,j*n+(i+1)%n,j*n+i))
  return self.mesh(name,verts,faces,color,bone,material)

 def tube(self,name,points,radius,color,bone='body',material='velvet',steps=5,sides=8,taper=.20):
  points=[Vector(p) for p in points];path=[]
  for k in range(len(points)-1):
   p0=points[max(0,k-1)];p1=points[k];p2=points[k+1];p3=points[min(len(points)-1,k+2)]
   for j in range(steps):
    t=j/steps
    path.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
  path.append(points[-1]);verts=[];faces=[]
  for j,p in enumerate(path):
   tangent=(path[min(j+1,len(path)-1)]-path[max(j-1,0)]).normalized()
   u=tangent.cross(Vector((0,0,1)))
   if u.length<.01:u=tangent.cross(Vector((1,0,0)))
   u.normalize();v=tangent.cross(u).normalized();r=radius*(1-(1-taper)*j/(len(path)-1))
   for i in range(sides):
    q=p+r*(u*math.cos(i*math.tau/sides)+v*math.sin(i*math.tau/sides));verts.append(tuple(q))
    if j:faces.append(((j-1)*sides+i,(j-1)*sides+(i+1)%sides,j*sides+(i+1)%sides,j*sides+i))
  faces.extend([tuple(range(sides-1,-1,-1)),tuple((len(path)-1)*sides+i for i in range(sides))])
  return self.mesh(name,verts,faces,color,bone,material)

 def ring(self,name,center,radius,tube,color,bone='body',axis='Z',material='gold',n=32):
  c=Vector(center);verts=[];faces=[]
  for j in range(n):
   a=j*math.tau/n
   for i in range(6):
    b=i*math.tau/6;v=((radius+tube*math.cos(b))*math.cos(a),(radius+tube*math.cos(b))*math.sin(a),tube*math.sin(b))
    if axis=='Y':v=(v[0],v[2],v[1])
    if axis=='X':v=(v[2],v[0],v[1])
    verts.append(tuple(c+Vector(v)));faces.append((j*6+i,j*6+(i+1)%6,((j+1)%n)*6+(i+1)%6,((j+1)%n)*6+i))
  return self.mesh(name,verts,faces,color,bone,material)

 def lathe(self,name,profile,color,bone='body',center=(0,0,0),flute=0,material='silk',n=32):
  verts=[];faces=[];c=Vector(center)
  for j,(z,r) in enumerate(profile):
   for i in range(n):
    a=i*math.tau/n;rr=r*(1+flute*math.cos(a*8));verts.append(tuple(c+Vector((rr*math.cos(a),rr*math.sin(a),z))))
    if j:faces.append(((j-1)*n+i,(j-1)*n+(i+1)%n,j*n+(i+1)%n,j*n+i))
  faces.extend([tuple(range(n-1,-1,-1)),tuple((len(profile)-1)*n+i for i in range(n))])
  return self.mesh(name,verts,faces,color,bone,material)

 def leaf(self,name,base,tip,width,color,bone='plant',curl=.1,spin=0,thickness=.016,triangular=False):
  base=Vector(base);tip=Vector(tip);vs=[];faces=[];N=20
  for j in range(N+1):
   t=j/N;p=base.lerp(tip,t);p.y+=curl*math.sin(t*math.pi);w=max(.001,width*((1-t)**.75 if triangular else math.sin(math.pi*(.10+.90*t))))
   for k in range(8):
    a=k*math.tau/8;u=w*math.cos(a);v=thickness*math.sin(a)*(1-t)
    vs.append(tuple(p+Vector((u*math.cos(spin)-v*math.sin(spin),u*math.sin(spin)+v*math.cos(spin),0))))
    if j:faces.append(((j-1)*8+k,(j-1)*8+(k+1)%8,j*8+(k+1)%8,j*8+k))
  faces.extend([tuple(range(7,-1,-1)),tuple(N*8+i for i in range(8))])
  return self.mesh(name,vs,faces,color,bone,'silk')

 def face(self,center=(0,-.38,1.77),spacing=.21,eye_size=.115,bone='head',closed=False,skin=None,mouth_depth=.045):
  x,y,z=center;skin=skin or CREAM
  for side in [-1,1]:
   b='eye'+str(side);xx=x+side*spacing
   # Eye bones pivot at their actual eye center, rather than scaling from the skull.
   bpy.context.view_layer.objects.active=self.rig;self.rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
   eb=self.rig.data.edit_bones[b];eb.head=(xx,y,z);eb.tail=(xx,y+.18,z)
   bpy.ops.object.mode_set(mode='OBJECT');self.rig.select_set(False)
   if closed:
    self.tube('Sleepy smiling eyelid',[(xx-eye_size*.7,y-.025,z),(xx,y-.047,z-.024),(xx+eye_size*.7,y-.025,z)],.014,DARK,b)
   else:
    self.ell('Soft ivory eye rim',(xx,y,z),(eye_size,.043,eye_size*1.15),WHITE,b,'gloss',n=20,rings=12)
    self.ell('Iris',(xx,y-.033,z),(eye_size*.83,.030,eye_size*.98),mix(self.secondary,(.11,.25,.18),.45),b,'gloss',n=20,rings=12)
    self.ell('Deep pupil',(xx,y-.057,z+.005),(eye_size*.58,.020,eye_size*.78),DARK,b,'gloss',n=20,rings=12)
    self.ell('Softbox catchlight',(xx-eye_size*.24,y-.076,z+eye_size*.38),(eye_size*.22,.008,eye_size*.26),WHITE,b,'gloss',n=12,rings=8)
    self.ell('Small catchlight',(xx+eye_size*.29,y-.077,z-eye_size*.34),(eye_size*.095,.006,eye_size*.11),WHITE,b,'gloss',n=12,rings=8)
   self.ell('Rosy cheek',(xx+side*.055,y+.008,z-.15),(.073,.012,.033),mix(skin,PINK,.40),bone,'velvet',n=16,rings=10)
   if self.persona=='female' and not closed:
    self.tube('Outer eyelash',[(xx+side*eye_size*.65,y-.035,z+.055),(xx+side*eye_size*1.1,y-.025,z+.11)],.009,DARK,b)
  self.mouth=(x,y-mouth_depth,z-.21)
  self.ell('Happy mouth',self.mouth,(.064,.020,.045),(.18,.025,.045),bone,'gloss',n=20,rings=12)
  self.ell('Tongue',(x,y-mouth_depth-.019,z-.228),(.038,.008,.017),PINK,bone,n=16,rings=10)

 def jewel(self,pos,size=.10,bone='body'):
  self.ell('Gilded brooch',pos,(size,.035,size*1.15),GOLD,bone,'gold',n=20,rings=12)
  self.ell('Inset jewel',Vector(pos)+Vector((0,-.03,0)),(size*.66,.026,size*.78),self.secondary,bone,'crystal',n=16,rings=10)

 def flower(self,pos,size=.07,bone='plant',color=None):
  color=color or mix(self.secondary,PINK,.45);x,y,z=pos
  for i in range(5):
   a=i*math.tau/5;self.ell('Silken flower petal',(x+math.cos(a)*size*.7,y,z+math.sin(a)*size*.7),(size*.55,size*.25,size*.55),color,bone,'silk',n=12,rings=8)
  self.ell('Pollen center',(x,y-.02,z),(size*.29,.018,size*.29),GOLD,bone,'gold',n=12,rings=8)

 def crown(self,z=2.23,bone='head'):
  self.ring('Crown fillet',(0,0,z),.22,.018,GOLD,bone)
  for i in range(5):
   a=math.tau*i/5;self.tube('Crown point',[(math.cos(a)*.21,math.sin(a)*.21,z),(math.cos(a)*.18,math.sin(a)*.18,z+.12)],.025,GOLD,bone,'gold',steps=3)
  self.jewel((0,-.23,z+.04),.055,bone)

 def fox(self,pet=False):
  s=self.stage;coat=(.94,.89,.77) if pet else (.49,.105,.013)
  cheek=(.97,.91,.76);h=1.56+.035*s
  def body_color(v):
   front=smooth((-v.y+.02)/.20);width=.16+.09*math.sin(clamp((v.z-.2)/1.1)*math.pi)
   chest=front*smooth((width-abs(v.x))/.055)*smooth((v.z-.25)/.13)*smooth((1.20-v.z)/.12)
   return mix(coat,cheek,chest)
  def head_color(v):
   front=smooth((-v.y-.01)/.23);chin=smooth((h-.055-v.z)/.10)
   sides=smooth((abs(v.x)-.12)/.13)*smooth((h+.045-v.z)/.13)
   return mix(coat,cheek,max(chin,sides)*front)
  self.ell('Continuous fur torso',(0,.105,.75),(.36,.335,.53),body_color,n=32,rings=24)
  self.ell('Sculpted fox head',(0,.05,h),(.47,.39,.405),head_color,'head',n=40,rings=28)
  for side in [-1,1]:
   b='ear'+str(side)
   self.leaf('Cupped triangular fox ear',(side*.25,.035,h+.17),(side*.42,.055,h+.68),.17,coat,b,curl=.025,thickness=.075,triangular=True)
   self.leaf('Soft pink triangular inner ear',(side*.28,-.030,h+.27),(side*.415,.042,h+.60),.095,mix(PINK,CREAM,.67),b,curl=.012,thickness=.012,triangular=True)
   # Long connected forelegs and grounded paws, with a thicker seated haunch.
   self.ell('Seated rear haunch',(side*.28,.08,.30),(.21,.25,.25),coat,'foot'+str(side),rotation=(0,side*.18,0))
   self.ell('Rear fox paw',(side*.30,-.10,.105),(.17,.24,.105),mix(coat,DARK,.22),'foot'+str(side))
   self.tube('Tapered continuous foreleg',[(side*.18,.05,1.06),(side*.25,-.14,.70),(side*.225,-.265,.16)],.115,coat,'arm'+str(side),steps=7,sides=12,taper=.74)
   self.ell('Front fox paw',(side*.225,-.265,.115),(.125,.17,.115),mix(coat,DARK,.14),'arm'+str(side),n=24,rings=14)
   for j in range(2):self.tube('Fine paw toe crease',[(side*.225+(j-.5)*.055,-.419,.10),(side*.225+(j-.5)*.055,-.411,.16)],.004,mix(coat,DARK,.45),'arm'+str(side),steps=3)
  # One continuous tapered muzzle; the pale cheek pattern is on the skull itself.
  vs=[];faces=[];N=32
  for j,(y,rx,rz,zz) in enumerate([(-.245,.245,.14,h-.13),(-.32,.215,.12,h-.14),(-.405,.15,.085,h-.13),(-.465,.080,.050,h-.105),(-.482,.035,.025,h-.10)]):
   for i in range(N):
    a=i*math.tau/N;vs.append((rx*math.cos(a),y,zz+rz*math.sin(a)))
    if j:faces.append(((j-1)*N+i,(j-1)*N+(i+1)%N,j*N+(i+1)%N,j*N+i))
  faces.extend([tuple(range(N-1,-1,-1)),tuple(4*N+i for i in range(N))]);self.mesh('Continuous tapered fox muzzle',vs,faces,cheek,'head')
  self.ell('Soft triangular nose',(0,-.490,h-.093),(.047,.023,.031),(.055,.026,.018),'head','gloss',n=24,rings=14)
  # Inset almond-shaped eyes: fine warm lids, amber irises and small catchlights.
  for side in [-1,1]:
   x=side*.205;y=-.296;z=h+.045;b='eye'+str(side)
   bpy.context.view_layer.objects.active=self.rig;self.rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
   eb=self.rig.data.edit_bones[b];eb.head=(x,y,z);eb.tail=(x,y+.18,z)
   bpy.ops.object.mode_set(mode='OBJECT');self.rig.select_set(False)
   if pet and s==0:
    self.tube('Relaxed smiling eyelid',[(x-.07,y-.015,z),(x,y-.025,z-.022),(x+.07,y-.015,z)],.010,(.12,.065,.045),b,steps=5)
   else:
    self.ell('Inset warm eye white',(x,y,z),(.105,.024,.114),(.89,.84,.67),b,'gloss',n=28,rings=18)
    self.ell('Amber eye iris',(x,y-.018,z),(.091,.014,.103),(.10,.038,.012),b,'gloss',n=28,rings=18)
    self.ell('Deep brown pupil',(x,y-.029,z+.004),(.063,.010,.084),(.012,.007,.005),b,'gloss',n=24,rings=16)
    self.ell('Large soft catchlight',(x-.024,y-.040,z+.042),(.023,.006,.028),WHITE,b,'gloss',n=16,rings=10)
    self.ell('Small catchlight',(x+.030,y-.039,z-.037),(.009,.004,.010),WHITE,b,'gloss',n=12,rings=8)
    self.tube('Soft upper eyelid',[(x-.093,y-.006,z+.052),(x,y-.010,z+.116),(x+.087,y+.005,z+.069)],.009,mix(coat,DARK,.38),b,steps=5,taper=.55)
   self.tube('Fine brow fur',[(x-side*.060,-.27,h+.22),(x,-.288,h+.24),(x+side*.045,-.26,h+.225)],.008,mix(coat,CREAM,.35),'head',steps=4,taper=.25)
  self.mouth=(0,-.459,h-.165)
  self.tube('Fox smile left',[(-.078,-.431,h-.17),(-.038,-.459,h-.18),(0,-.463,h-.165)],.006,(.17,.055,.025),'head',steps=5,taper=.70)
  self.tube('Fox smile right',[(0,-.463,h-.165),(.038,-.459,h-.18),(.078,-.431,h-.17)],.006,(.17,.055,.025),'head',steps=5,taper=.70)
  self.tube('Nose to smile',[(0,-.488,h-.11),(0,-.469,h-.165)],.004,(.17,.055,.025),'head',steps=3,taper=.70)
  # Volumetric bushy tail, tapering naturally. Color is continuous across the tip.
  tail_color=lambda v:mix(coat,cheek,smooth((v.z-.70)/.20))
  self.tube('Continuous bushy fox tail',[(.02,.30,.42),(.37,.48,.28),(.70,.38,.44),(.77,.23,.81),(.63,.12,1.10)],.205,tail_color,'tail',steps=10,sides=16,taper=.18)
  # Short sculpted tufts follow the skin. These add silhouette and soft fur,
  # rather than a set of hard spikes or a painted billboard.
  for i in range(115):
   a=self.rng.random()*math.tau;t=.23+self.rng.random()*2.55
   v=Vector((.47*math.sin(t)*math.cos(a),.39*math.sin(t)*math.sin(a),.405*math.cos(t)))
   p=v+Vector((0,.05,h));normal=Vector((v.x/.47**2,v.y/.39**2,v.z/.405**2)).normalized()
   if p.y<.05:continue
   tangent=Vector((math.copysign(.22,p.x),.12,-.55));tangent-=normal*tangent.dot(normal);tangent.normalize()
   length=.025+self.rng.random()*.026
   self.tube('Silhouette head fur',[p,p+normal*.007+tangent*length*.55,p+tangent*length+normal*.003],.008,head_color(p),'head',steps=2,sides=5,taper=.015)
  for i in range(65):
   a=self.rng.random()*math.tau;t=.35+self.rng.random()*2.25
   v=Vector((.36*math.sin(t)*math.cos(a),.335*math.sin(t)*math.sin(a),.53*math.cos(t)));p=v+Vector((0,.105,.75))
   if p.y<.12:continue
   n=Vector((v.x/.36**2,v.y/.335**2,v.z/.53**2)).normalized();down=Vector((0,0,-1));down-=n*down.dot(n)
   if down.length<.1:continue
   down.normalize();self.tube('Fine body fur',[p,p+n*.006+down*.018,p+down*.037],.007,body_color(p),steps=2,sides=5,taper=.015)
  self.head_top=(0,.03,h+.405);self.paw=(.225,-.265,.23)
  if pet:
   self.features+=['refined continuous fox anatomy','modeled fur and embedded fiber normal','sleeping initial stage' if s==0 else 'inset amber eyes']
   if s>=1:self.ring('Guardian collar',(0,0,1.15),.27,.035,self.primary,'body',material='silk');self.jewel((0,-.28,1.12),.075)
   if s>=2:
    for side in [-1,1]:self.leaf('Guardian shoulder plume',(side*.25,.10,1.08),(side*.62,.13,1.30),.12,self.secondary)
   if s>=3:self.dragon_wings(feathered=True)
   if s>=4:self.crown(h+.39)
  else:
   self.fox_cape()
   self.jewel((0,-.295,1.16),.073)
   if self.theme=='garden':self.garden()
   else:self.mountain()

 def fox_cape(self):
  # A draped, open-front garment with two surfaces, folds and embroidered hems.
  vs=[];faces=[];N=40;K=14
  for depth in [-.009,.009]:
   for j in range(K+1):
    t=j/K;z=1.21-.86*t;r=.28+.15*math.sin(t*math.pi*.70)
    for i in range(N+1):
     a=-math.pi/4+i/N*math.pi*1.5;rr=r+depth+.020*math.sin(a*9)*t
     vs.append((rr*math.cos(a),.09+rr*.91*math.sin(a),z+.025*math.sin(a*5)*t))
  layer=(K+1)*(N+1)
  for side in [0,1]:
   for j in range(K):
    for i in range(N):q=side*layer+j*(N+1)+i;faces.append((q,q+1,q+N+2,q+N+1))
  boundary=list(range(N+1))+[j*(N+1)+N for j in range(1,K+1)]+[K*(N+1)+i for i in range(N-1,-1,-1)]+[j*(N+1) for j in range(K-1,0,-1)]
  for i,q in enumerate(boundary):r=boundary[(i+1)%len(boundary)];faces.append((q,r,r+layer,q+layer))
  self.mesh('Draped open-front embroidered cape',vs,faces,self.primary,material='silk')
  for a in [-math.pi/4,math.pi*1.25]:
   pts=[]
   for j in range(9):t=j/8;r=.28+.15*math.sin(t*math.pi*.70);pts.append((r*math.cos(a),.09+r*.91*math.sin(a)-.009,1.21-.86*t+.025*math.sin(a*5)*t))
   self.tube('Cape gold embroidered edge',pts,.009,GOLD,material='gold',steps=3,taper=1)
  for side in [-1,1]:
   for j in range(3):
    z=.48+j*.18;x=side*(.31-j*.025);y=-.18
    self.tube('Embroidered leaf stem',[(x,y,z),(x-side*.035,y-.005,z+.09)],.004,GOLD,material='gold',steps=3,taper=.5)
    self.leaf('Gold embroidery leaf',(x,y-.005,z+.025),(x+side*.045,y-.010,z+.065),.014,GOLD,'body',0,thickness=.004)
  self.ring('Soft fabric neck collar',(0,.01,1.20),.285,.035,self.primary,material='silk')
  for side in [-1,1]:self.tube('Fine collar gold piping',[(side*.25,-.10,1.19),(side*.17,-.23,1.18),(0,-.28,1.16)],.006,GOLD,material='gold',steps=4,taper=1)
 def garden(self):
  s=self.stage;self.features+=['fox gardener','growing bonsai planter']
  center=(.78,-.06,0)
  self.lathe('Hollow glazed planter',[(.04,.18),(.11,.27),(.34,.31),(.39,.34),(.39,.30),(.14,.25),(.11,.16)],self.primary,center=center,flute=.020)
  self.ring('Planter lip',(.78,-.06,.39),.34,.025,GOLD)
  self.ring('Planter foot gilding',(.78,-.06,.10),.265,.012,GOLD)
  self.ell('Moist soil',(.78,-.06,.335),(.29,.29,.020),(.10,.055,.019),'plant')
  for i in range(8):
   a=i*math.tau/8;x=.78+.302*math.cos(a);y=-.06+.302*math.sin(a)
   self.tube('Porcelain gilt branch',[(x,y,.15),(x+.015*math.cos(a),y+.015*math.sin(a),.28)],.004,GOLD,material='gold',steps=3,taper=.55)
   for j in [-1,1]:
    self.tube('Porcelain gilt leaf',[(x,y,.20),(x+j*.035*math.sin(a),y-j*.035*math.cos(a),.245)],.007,GOLD,material='gold',steps=3,taper=.05)
  for i in range(3):
   a=i*math.tau/3;self.ell('Golden planter foot',(.78+.19*math.cos(a),-.06+.19*math.sin(a),.032),(.045,.045,.032),GOLD,'body','gold',n=16,rings=10)
  height=.58+s*.23
  self.tube('Growing bonsai trunk',[(.78,-.06,.35),(.73,-.02,.44),(.82,-.02,height)],.016+s*.007,LEAF if s<2 else (.28,.13,.05),'plant',taper=.55)
  for i in range(2+s*2):
   a=i*2.4;r=.13+.025*s;z=.40+(height-.42)*(i+1)/(2+s*2)
   base=(.80,0,z);tip=(.78+math.cos(a)*r,math.sin(a)*r,z+.15)
   self.tube('Bonsai branch',[base,tip],.008+s*.0015,LEAF if s<2 else (.28,.13,.05),'plant',steps=3)
   self.leaf('Bonsai leaf',tip,Vector(tip)+Vector((math.cos(a)*.16,0,.10)),.075,LEAF)
   if s>=3 or i==0 and s==2:self.flower(Vector(tip)+Vector((0,-.03,.06)),.055+.005*s)
  self.water_target=(.78,-.15,.355)
  h=1.56+.035*s
  self.jewel((-.32,-.14,h+.27),.045,'head')
  self.tube('Delicate ear ornament chain',[(-.32,-.14,h+.27),(-.39,-.12,h+.17),(-.37,-.13,h+.06)],.006,GOLD,'head','gold',steps=5,taper=1)
  if self.persona=='female':self.flower((-.34,-.10,h+.33),.058,'head')
  elif self.persona=='male':self.jewel((-.28,-.19,h+.26),.055,'head')
  if s>=4:self.crown(2.18)

 def mountain(self):
  s=self.stage;self.features+=['fox hiker','backpack and climbing equipment']
  self.ell('Weathered summit rock',(0,.12,.01),(.66,.48,.12),(.30,.32,.25),'root',n=24,rings=12)
  if s>=1:
   self.ell('Hiking backpack',(0,.37,.91),(.31,.19,.37),(.32,.21,.09))
   for side in [-1,1]:
    self.tube('Backpack shoulder strap',[(side*.23,.22,1.18),(side*.29,-.27,1.07),(side*.24,-.30,.67)],.035,(.25,.12,.035),steps=5,taper=1)
   self.tube('Rolled blanket',[(-.28,.35,1.29),(0,.35,1.29),(.28,.35,1.29)],.10,self.secondary,steps=4,taper=1)
  if s>=2:
   self.ring('Coiled climbing rope',(-.35,-.27,.74),.16,.018,(.70,.23,.045),axis='Y')
   self.ring('Climbing rope inner coil',(-.35,-.29,.74),.12,.018,(.70,.23,.045),axis='Y')
   self.ell('Warm hiking jacket',(0,.04,.80),(.40,.30,.42),self.primary)
  if s>=3:
   for side in [-1,1]:
    self.ring('Brass goggle rim',(side*.16,-.16,2.02),.11,.022,GOLD,'head',axis='Y')
    self.ell('Blue goggle lens',(side*.16,-.16,2.02),(.09,.025,.09),self.secondary,'head','crystal',n=20,rings=12)
  if s>=4:
   self.tube('Summit staff',[(.66,0,.1),(.66,0,1.62)],.022,(.27,.15,.06),'root',steps=3,taper=1)
   self.mesh('Summit pennant',[(.66,0,1.62),(.99,0,1.51),(.66,0,1.39)],[(0,1,2)],self.primary,'root','silk')

 def dragon_wings(self,feathered=False):
  s=self.stage;span=.44+.10*s
  for side in [-1,1]:
   bone='wing'+str(side);root=Vector((side*.28,.19,1.12));upper=Vector((side*(.58+span),.22,1.84+.08*s));outer=Vector((side*(.70+span),.27,.94));low=Vector((side*.52,.21,.88))
   self.tube('Golden wing leading edge',[root,upper,outer],.035,GOLD,bone,'gold',taper=.4)
   if feathered:
    for j in range(12):
     base=root.lerp(upper,j/14);tip=upper.lerp(outer,.10+j*.075)
     direction=tip-base;rotation=direction.to_track_quat('Z','Y').to_euler()
     self.ell('Rounded guardian flight feather',(base+tip)*.5,(.075,.040,direction.length*.55),mix(WHITE,self.secondary,j/20),bone,'silk',rotation=rotation,n=16,rings=12)
     self.tube('Feather gold vane',[base,tip],.008,GOLD,bone,'gold',steps=3)
   else:
    # A closed curved membrane with a scalloped trailing edge, not a flat card.
    vs=[];faces=[];N=12;K=8
    for depth in [-.014,.014]:
     for j in range(N+1):
      u=j/N;top=root.lerp(upper,u)
      bottom=low.lerp(outer,u);bottom.z+=.10*math.sin(u*math.pi*3)**2
      for k in range(K+1):
       t=k/K;p=top.lerp(bottom,t);p.y+=depth+.08*math.sin(math.pi*u)*math.sin(math.pi*t);vs.append(tuple(p))
    layer=(N+1)*(K+1)
    for a in [0,1]:
     for j in range(N):
      for k in range(K):
       i=a*layer+j*(K+1)+k;faces.append((i,i+1,i+K+2,i+K+1))
    # Close all four membrane boundaries.
    boundary=list(range(K+1))+[j*(K+1)+K for j in range(1,N+1)]+[N*(K+1)+k for k in range(K-1,-1,-1)]+[j*(K+1) for j in range(N-1,0,-1)]
    for i,a in enumerate(boundary):b=boundary[(i+1)%len(boundary)];faces.append((a,b,b+layer,a+layer))
    self.mesh('Curved dragon wing membrane',vs,faces,mix(self.secondary,PINK,.25),bone,'silk')
    for t in [.32,.64,1]:self.tube('Wing finger',[root,upper.lerp(outer,t)],.015,GOLD,bone,'gold',steps=4)
   self.wings.append(bone)

 def dragon(self):
  s=self.stage;gem=self.theme=='gem';coat=mix((.48,.25,.68),self.secondary,.25)
  self.ell('Dragon haunch',(0,.12,.65),(.46,.37,.48),coat)
  self.ell('Cream belly',(0,-.23,.65),(.27,.07,.35),CREAM)
  self.ell('Dragon skull',(0,.05,1.55),(.44,.37,.43),coat,'head')
  self.ell('Dragon snout',(0,-.30,1.43),(.28,.17,.19),mix(coat,CREAM,.5),'head')
  self.face((0,-.307,1.67),.20,.12,skin=mix(coat,CREAM,.4),closed=gem and s==0)
  for side in [-1,1]:
   self.tube('Curved ivory horn',[(side*.25,.06,1.81),(side*.29,.06,2.08),(side*.21,.04,2.20)],.065,GOLD,'head','gold',taper=.01)
   self.leaf('Dragon pointed ear',(side*.31,.0,1.73),(side*.66,.02,1.95),.11,coat,'ear'+str(side),thickness=.045)
   self.ell('Dragon forearm',(side*.35,-.12,.61),(.14,.15,.29),coat,'arm'+str(side))
   self.ell('Dragon taloned foot',(side*.28,-.12,.17),(.20,.26,.16),coat,'foot'+str(side))
   for j in range(3):self.ell('Ivory toe claw',(side*.28+(j-1)*.073,-.35,.16),(.025,.065,.027),CREAM,'foot'+str(side),n=12,rings=8)
  self.tube('Curled dragon tail',[(0,.23,.40),(.52,.32,.20),(.78,.06,.28),(.69,-.13,.49)],.16,coat,'tail',steps=6,taper=.10)
  for i in range(6):
   self.leaf('Dorsal crest',(0,.20+i*.025,1.82-i*.20),(0,.42+i*.025,2.01-i*.20),.07,GOLD,'head' if i<2 else 'body')
  self.dragon_wings();self.jewel((0,-.32,1.12),.095)
  self.head_top=(0,-.18,1.905);self.paw=(.35,-.12,.90)
  self.features+=['purple dragon anatomy','growing crystal cluster' if gem else 'growing castle']
  if s>=2:self.crown(1.99)
  if gem:
   for i in range(3+s*2):
    a=i*2.4;x=math.cos(a)*(.55+.03*s);y=math.sin(a)*.33;h=.25+(i%3)*.14+s*.07
    self.crystal((x,y,.03),h,.10+.015*s)
  else:self.castle()

 def crystal(self,pos,height,radius):
  x,y,z=pos;vs=[];faces=[];n=6
  for zz,r in [(z,radius*.7),(z+height*.70,radius),(z+height,0)]:
   for i in range(n):vs.append((x+r*math.cos(i*math.tau/n),y+r*math.sin(i*math.tau/n),zz))
  for j in range(2):
   for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
  faces.append(tuple(range(n-1,-1,-1)))
  self.mesh('Faceted growing crystal',vs,faces,mix((.49,.16,.86),self.secondary,.35),'plant','crystal',False)

 def castle(self):
  s=self.stage
  self.ell('Castle moss island',(0,.55,.02),(.90,.62,.13),(.22,.30,.12),'root')
  for i in range(1+s):
   a=i*2.4;x=math.cos(a)*(.62 if i else .70);y=.42+math.sin(a)*.23;h=.45+s*.13+(i%2)*.24
   self.lathe('Cream castle tower',[(.08,.12),(.12,.15),(h,.13)],CREAM,center=(x,y,0))
   self.lathe('Turret conical roof',[(h,.19),(h+.32,.006)],self.primary,center=(x,y,0),flute=.04)
   self.ring('Turret gilding',(x,y,h),.18,.012,GOLD)
   self.ell('Tower arched window',(x,y-.133,h*.65),(.038,.012,.065),self.primary,'body','gloss',n=16,rings=10)

 def turtle(self):
  s=self.stage;skin=(.30,.68,.55)
  self.ell('Turtle body',(0,.10,.50),(.53,.62,.30),skin)
  self.ell('Domed shell',(0,.25,.68),(.56,.66,.33),self.primary)
  self.ring('Shell golden rim',(0,.25,.56),.57,.025,GOLD)
  # Curved hexagonal scutes follow the domed surface, with fine metallic sutures.
  for x,y in [(0,0),(-.25,.08),(.25,.08),(-.22,.39),(.22,.39),(0,.62)]:
   zz=.68+.30*math.sqrt(max(.05,1-(x/.62)**2-((y-.25)/.73)**2))
   self.ell('Domed individual shell scute',(x,y,zz),(.20,.22,.045),mix(self.primary,self.secondary,.3),'body','silk',n=16,rings=10)
   points=[]
   for i in range(7):a=i*math.tau/6;points.append((x+.17*math.cos(a),y+.19*math.sin(a),zz+.012))
   self.tube('Shell polygon gold suture',points,.009,GOLD,material='gold',steps=2,taper=1)
  self.ell('Turtle head',(0,-.42,.90),(.35,.32,.32),mix(skin,CREAM,.45),'head')
  self.face((0,-.675,.96),.17,.11,skin=CREAM)
  for side in [-1,1]:
   self.ell('Front flipper',(side*.48,-.25,.31),(.34,.17,.10),skin,'arm'+str(side),rotation=(0,side*.18,side*.35))
   self.ell('Hind flipper',(side*.39,.57,.22),(.23,.14,.085),skin,'foot'+str(side),rotation=(0,0,-side*.4))
   for i in range(6):self.ell('Flipper scale',(side*(.38+(i%3)*.10),-.30+(i//3)*.09,.39),(.028,.039,.009),mix(skin,CREAM,.35),'arm'+str(side),n=10,rings=6)
  self.head_top=(0,-.44,1.22);self.paw=(.58,-.25,.40)
  self.ell('Sandy ocean floor',(0,.10,.03),(.86,.84,.07),(.61,.49,.25),'root')
  for i in range(s+1):
   a=i*2.3;x=math.cos(a)*.68;y=.23+math.sin(a)*.60
   for j in range(3):
    self.tube('Coral branch',[(x,y,.06),(x+(j-1)*.07,y,.22),(x+(j-1)*.13,y,.32+.08*s)],.023,mix(PINK,self.secondary,i/(s+2)),'plant',steps=4,taper=.45)
  if s>=2:self.jewel((0,-.69,.66),.065,'head')
  if s>=4:self.crown(1.19)
  self.features+=['turtle with domed scutes','stage-dependent coral reef']

 def astronaut(self):
  s=self.stage
  self.ell('Padded space suit',(0,.02,.92),(.38,.25,.47),CREAM)
  self.ell('Suit chest panel',(0,-.237,1.0),(.27,.035,.21),self.primary,'body','silk')
  self.jewel((0,-.28,1.04),.10)
  self.ell('Astronaut head',(0,.005,1.79),(.38,.335,.39),(.88,.58,.37),'head')
  self.face((0,-.278,1.80),.16,.098,skin=(.95,.72,.52))
  # Hair is modeled as curved locks; female/male/neutral silhouettes differ.
  hair=(.16,.07,.025)
  self.ell('Continuous sculpted hair cap',(0,.035,2.035),(.395,.305,.225),hair,'head',n=24,rings=16)
  for side in [-1,1]:
   self.tube('Swept fringe',[(side*.02,-.19,2.19),(side*.19,-.29,2.13),(side*.32,-.26,1.94)],.075,hair,'head',steps=5,taper=.20)
  count=10 if self.persona=='female' else 7
  for i in range(count):
   a=i*math.tau/count;x=.29*math.cos(a);y=.21*math.sin(a)
   self.tube('Sculpted hair lock',[(x,y,1.98),(x*1.1,y*1.15,2.13),(x*.85,y-.025,1.93-(.25 if self.persona=='female' and i>4 else 0))],.072,(.16,.07,.025),'head',steps=4,taper=.25)
  self.ring('Open helmet gold surround',(0,0,1.76),.45,.032,GOLD,'head',axis='Y')
  for side in [-1,1]:
   self.ell('Suit upper sleeve',(side*.40,0,1.03),(.14,.18,.28),CREAM,'arm'+str(side))
   self.ell('Space glove',(side*.43,-.05,.79),(.135,.14,.16),self.primary,'arm'+str(side))
   self.ell('Suit trouser',(side*.20,0,.48),(.17,.17,.28),CREAM,'foot'+str(side))
   self.ell('Magnetic space boot',(side*.21,-.10,.16),(.20,.27,.15),self.primary,'foot'+str(side))
   self.ring('Sleeve trim',(side*.40,0,.90),.13,.025,GOLD,'arm'+str(side))
  self.ell('Life support pack',(0,.28,1.02),(.31,.16,.38),self.primary)
  self.head_top=(0,0,2.18);self.paw=(.43,-.05,.95)
  self.features+=['child astronaut','rocket' if s<3 else 'piloted starship']
  if s>=1:
   self.ring('Training utility belt',(0,0,.75),.33,.037,self.primary,material='silk')
   for side in [-1,1]:self.jewel((side*.19,-.25,.73),.040)
   self.features.append('training harness and wrist gauges')
  if s>=2:
   for side in [-1,1]:
    self.ell('Thruster pack',(side*.30,.29,1.07),(.13,.16,.28),self.secondary)
    self.ring('Thruster exhaust',(side*.30,.29,.84),.11,.022,GOLD)
   self.features.append('twin life-support thrusters')
  if s<3:
   self.lathe('Rocket hull',[(.12,.06),(.25,.16),(.75,.16),(1.04,.07),(1.13,0)],CREAM,center=(.83,.12,0))
   self.jewel((.83,-.05,.68),.09)
   for side in [-1,1]:self.leaf('Rocket stabilizer',(.83+side*.10,.12,.40),(.83+side*.28,.12,.12),.085,self.primary)
  else:
   self.ell('Starship sweeping hull',(0,.25,.28),(.95,.63,.23),CREAM,'root')
   for side in [-1,1]:
    self.ell('Starship nacelle',(side*.65,.10,.34),(.22,.49,.19),self.primary,'root','silk')
    self.ell('Blue engine core',(side*.65,-.36,.34),(.14,.035,.13),(.06,.47,.95),'root','crystal')
   self.ring('Orbital halo',(0,.38,1.90),.88,.012,GOLD,'root',axis='Y')
   if s==4:
    for i in range(4):
     a=i*1.9;self.ell('Surveyed new planet',(math.cos(a)*.98,.40,1.85+math.sin(a)*.80),(.10,.10,.10),mix(self.secondary,(.10,.35,.80),i/4),'root','crystal',n=16,rings=10)

 def immortal(self):
  s=self.stage
  if s<3:
   self.lathe('Narrow chive leaf sheath',[(.12,.06),(.20,.12),(.34,.23),(.55,.24),(.74,.16),(.89,.14)],lambda v:mix(CREAM,(.25,.55,.12),smooth((v.z-.52)/.5)),flute=.025,material='velvet')
   self.face((0,-.225,.49),.12,.075,skin=CREAM)
   self.head_top=(0,0,.89);self.mouth=(0,-.27,.28)
   for i in range(7):
    name='leaf'+str(i);self.new_bone(name,(0,0,.72),'head');self.leaves.append(name)
    dx=[-.08,-.48,.51,-.77,.78,-.28,.29][i];height=[2.14,1.90,1.95,1.52,1.49,1.77,1.81][i]
    depth=[-.05,-.30,.32,.15,-.19,.56,-.52][i];spin=[0,.32,-.4,-.2,.2,1.0,-.9][i]
    self.leaf('Flat narrow chive blade',(0,i*.01,.72),(dx,depth,.72+height),.065,lambda v:mix((.34,.59,.10),(.04,.26,.018),clamp((v.z-.72)/1.2)),name,.04,spin)
   self.head_top=(-.0688,-.028,2.5604);self.paw=(.3825,.270,2.1825);self.water_target=(0,-.18,.75)
   if self.persona=='female':self.flower((-.19,-.10,.72),.04,'head')
   if self.persona=='male':self.jewel((.17,-.12,.73),.035,'head')
   for i in range(9):
    a=i*2.4;self.tube('Fine chive root',[(0,0,.14),(.10*math.cos(a),.08*math.sin(a),.055),(.19*math.cos(a),.13*math.sin(a),.025)],.007,(.53,.37,.13),steps=4,taper=.12)
   if s>=1:
    self.ring('Cultivation sash',(0,0,.30),.20,.025,self.primary,material='silk')
    self.jewel((0,-.20,.30),.045)
   if s==2:
    self.lathe('First cultivation robe',[(.12,.30),(.22,.26),(.54,.20)],self.primary,flute=.07)
    for side in [-1,1]:self.tube('Emerging sleeve',[(side*.18,0,.48),(side*.35,-.04,.40),(side*.40,-.06,.50)],.065,self.secondary,'arm'+str(side),steps=4,taper=.85)
   self.features+=['seven flat chive leaves','cultivation sash' if s else 'small pale sheath']
  else:
   # Later forms really become a person in robes, retaining a chive-leaf emblem.
   self.lathe('Flowing pleated immortal robe',[(.11,.49),(.25,.42),(.62,.29),(1.12,.24),(1.40,.31)],self.primary,flute=.055)
   self.lathe('Pale inner robe',[(.14,.28),(.65,.18),(1.27,.15)],CREAM,center=(0,-.08,0),flute=.03)
   self.ell('Immortal face',(0,.010,1.85),(.28,.245,.34),(.92,.69,.48),'head')
   self.face((0,-.198,1.86),.12,.075,skin=(.94,.75,.57))
   hair=(.13,.07,.13) if self.persona=='female' else (.09,.08,.07) if self.persona=='male' else (.71,.75,.67)
   self.ell('Immortal hair crown',(0,.035,2.055),(.29,.23,.19),hair,'head',n=24,rings=16)
   for side in [-1,1]:self.tube('Swept immortal fringe',[(side*.01,-.16,2.18),(side*.14,-.235,2.13),(side*.24,-.20,1.98)],.050,hair,'head',steps=5,taper=.16)
   for i in range(11):
    a=i*math.tau/11;x=.24*math.cos(a);y=.17*math.sin(a)+.03
    self.tube('Long sculpted immortal hair',[(x,y,1.99),(x*1.1,y+.06,2.16),(x*1.35,y+.13,1.42),(x*1.55,y+.18,1.05)],.052,hair,'head',steps=5,taper=.25)
   for side in [-1,1]:
    self.tube('Broad flowing sleeve',[(side*.24,0,1.32),(side*.43,-.01,1.11),(side*.59,-.12,1.30)],.14,self.secondary,'arm'+str(side),steps=5,taper=.80)
    self.ell('Immortal hand',(side*.59,-.13,1.34),(.07,.06,.09),(.92,.69,.48),'arm'+str(side))
    self.tube('Gold robe embroidery',[(side*.15,-.23,1.38),(side*.21,-.22,.98),(side*.30,-.29,.60),(side*.39,-.29,.17)],.010,GOLD,material='gold',steps=6,taper=.7)
    self.tube('Floating silk ribbon',[(side*.24,.1,1.32),(side*.68,.10,1.28),(side*.80,.13,.94),(side*.56,.18,.57)],.048,self.secondary,'arm'+str(side),steps=7,taper=.14)
   self.jewel((0,-.26,1.02),.075)
   self.crown(2.11)
   for i in [-1,0,1]:self.leaf('Chive crown emblem',(0,0,2.16),(i*.13,.02,2.48-abs(i)*.08),.03,LEAF,'head')
   if s==4:
    for i in range(9):
     a=i*2.4;self.ell('Auspicious cloud',(.40*math.cos(a),.29*math.sin(a),.07),(.24,.20,.11),mix(WHITE,self.secondary,.15),'root',n=20,rings=12)
   self.head_top=(0,-.06,2.17);self.paw=(.59,-.13,1.43)
   self.features+=['human immortal form','flowing robe and sculpted hair','chive-leaf crown emblem']

 def train(self):
  s=self.stage;self.features+=['character steam engine','growing passenger carriages']
  self.ell('Rounded enamel boiler',(0,.14,.86),(.42,.64,.42),self.primary)
  self.ell('Ivory locomotive face',(0,-.465,.87),(.35,.055,.35),CREAM,'head')
  self.face((0,-.515,.93),.17,.105,skin=CREAM)
  self.ring('Boiler front gold band',(0,-.45,.87),.39,.025,GOLD,'head',axis='Y')
  self.lathe('Flared chimney',[(1.13,.11),(1.43,.12),(1.48,.17),(1.55,.17)],self.primary,center=(0,-.05,0))
  self.ring('Chimney golden rim',(0,-.05,1.54),.17,.025,GOLD)
  self.ell('Engine cab',(0,.66,1.10),(.42,.28,.40),self.primary)
  self.ell('Curved cab roof',(0,.66,1.49),(.49,.35,.085),self.secondary)
  for side in [-1,1]:
   self.ell('Cab window',(side*.40,.61,1.16),(.018,.15,.20),(.87,.66,.20),'body','gloss',n=16,rings=10)
   for j in range(3):
    y=-.19+j*.39;bone='foot'+str(side)
    self.ring('Driving wheel tire',(side*.43,y,.31),.25,.035,GOLD,bone,axis='X')
    for k in range(8):
     a=k*math.tau/8;self.tube('Wheel spoke',[(side*.43,y,.31),(side*.43,y+.21*math.cos(a),.31+.21*math.sin(a))],.012,GOLD,bone,'gold',steps=2,taper=1)
   self.tube('Driving connecting rod',[(side*.47,-.19,.31),(side*.47,.60,.31)],.025,self.secondary,'foot'+str(side),steps=3,taper=1)
  self.head_top=(0,-.05,1.55);self.paw=(0,-.465,1.22);self.mouth=(0,-.59,.72)
  for i in range(s):
   y=1.35+i*.70
   self.ell('Passenger carriage',(0,y,.73),(.36,.31,.37),self.primary,'root')
   self.ell('Carriage rounded roof',(0,y,1.12),(.40,.35,.07),self.secondary,'root')
   for side in [-1,1]:
    for j in [-1,1]:
     self.ell('Carriage lamp window',(side*.35,y+j*.15,.81),(.018,.10,.14),(.88,.65,.21),'root','gloss',n=12,rings=8)
     self.ring('Carriage wheel',(side*.34,y+j*.18,.28),.17,.025,GOLD,'root',axis='X',n=24)
   self.tube('Carriage coupling',[(0,y-.45,.4),(0,y-.31,.4)],.025,GOLD,'root','gold',steps=2,taper=1)
  for j in range(2+s):
   self.ell('Leaf-shaped green steam',(.08*math.sin(j),-.05+j*.07,1.72+j*.16),(.10+j*.015,.08,.09),mix(self.secondary,WHITE,.55),'plant',n=16,rings=10)
  self.jewel((0,-.53,.53),.085,'head')
  if self.persona=='female':self.flower((-.29,-.48,1.10),.06,'head')

 def tools(self):
  # Anatomically readable visitor glove, held tool, food, brush and can.
  self.ell('Visitor palm',(0,0,.065),(.12,.065,.065),WHITE,'tool_hand',n=20,rings=12)
  for i in range(4):self.ell('Visitor fingertip',(-.08+i*.051,0,.025),(.030,.058,.035),WHITE,'tool_hand',n=12,rings=8)
  self.ell('Visitor thumb',(.12,0,.07),(.045,.045,.035),WHITE,'tool_hand',n=12,rings=8)
  self.ell('Offered fruit',(0,0,0),(.075,.065,.075),PINK,'tool_food','gloss',n=16,rings=10)
  self.leaf('Fruit leaf',(0,0,.055),(.09,0,.11),.025,LEAF,'tool_food',0)
  self.ell('Soft care brush',(0,0,.03),(.12,.065,.03),self.primary,'tool_brush','silk',n=16,rings=10)
  for i in range(5):self.tube('Brush bristle',[(-.08+i*.04,0,.02),(-.08+i*.04,0,-.025)],.010,CREAM,'tool_brush',steps=2,taper=1)
  self.tube('Brush handle',[(.08,0,.03),(.25,0,.03)],.027,GOLD,'tool_brush','gold',steps=2,taper=1)
  self.ell('Watering can',(0,0,0),(.16,.12,.14),self.primary,'tool_can','silk',n=20,rings=12)
  self.tube('Watering spout',[(-.10,0,-.05),(-.22,0,.01),(-.31,0,.12)],.025,GOLD,'tool_can','gold',steps=4,taper=1)
  self.tube('Watering handle',[(.10,0,.10),(.25,0,.12),(.27,0,-.08),(.10,0,-.10)],.022,GOLD,'tool_can','gold',steps=4,taper=1)
  for i in range(8):self.ell('Droplet',(0,0,0),(.013,.013,.026),(.13,.63,.90),'drop'+str(i),'crystal',n=10,rings=8)
  self.ell('Response glow',(0,0,0),(.065,.04,.065),GOLD,'reply','gold',n=16,rings=10)
  self.ring('Response halo',(0,0,0),.12,.009,GOLD,'light',axis='Y',n=24)

 def posed(self,bone,point):
  bpy.context.view_layer.update()
  return self.rig.pose.bones[bone].matrix @ self.rig.data.bones[bone].matrix_local.inverted() @ Vector(point)

 def show(self,name,pos,scale=1):
  p=self.rig.pose.bones[name];p.location=pos;p.scale=(max(.0001,scale),)*3;return p

 def animate(self):
  rig=self.rig;rig.animation_data_create();scene=bpy.context.scene;scene.render.fps=24
  for clip in CLIPS:
   action=bpy.data.actions.new(clip);rig.animation_data.action=action
   end=97 if clip=='idle' else 73
   for frame in range(1,end+1,2):
    t=(frame-1)/(end-1);phase=t*math.tau;wave=math.sin(t*math.pi)
    for p in rig.pose.bones:p.location=(0,0,0);p.rotation_mode='XYZ';p.rotation_euler=(0,0,0);p.scale=(.0001,)*3 if p.name in self.props else (1,1,1)
    body=rig.pose.bones['body'];head=rig.pose.bones['head']
    # Breathing and appendage motion; root stays planted.
    body.scale=(1+.007*math.sin(phase),1+.008*math.sin(phase),1+.006*math.sin(phase))
    if self.theme!='train':head.rotation_euler.y=.015*math.sin(phase)
    rig.pose.bones['tail'].rotation_euler.z=.07*math.sin(phase)
    if self.theme=='train':rig.pose.bones['plant'].scale=(1+.07*math.sin(phase),)*3
    for i,k in enumerate(self.leaves):rig.pose.bones[k].rotation_euler.y=.016*math.sin(phase+i*.6)
    for k in self.wings:rig.pose.bones[k].rotation_euler.z=.025*math.sin(phase)
    blink=1-.93*max(0,1-abs(t-.67)/.028)
    for side in [-1,1]:rig.pose.bones['eye'+str(side)].scale.z=blink
    if clip=='enter':
     rig.pose.bones['root'].scale=(.86+.14*smooth(t/.40),)*3
     if self.theme=='train':rig.pose.bones['root'].location.y=.4*(1-smooth(t/.5))
     else:body.location.z=.12*(1-smooth(t/.5))
    if clip in ['interact','interact_pat']:
     touch=envelope(t,.28,.70);head.rotation_euler.y=.075*touch
     for side in [-1,1]:rig.pose.bones['eye'+str(side)].scale.z=1-.65*touch
     k=self.leaves[0] if self.leaves else 'body' if self.theme=='train' else 'head'
     target=self.posed(k,self.head_top)
     off=1-smooth((t-.06)/.24)+smooth((t-.70)/.20)
     self.show('tool_hand',target+Vector((off*.50,-.012,.025+off*.34)),envelope(t))
     if .36<t<.63:self.contact_samples.append({'clip':clip,'frame':frame,'targetBone':k,'anchor':list(target),'contactOffset':.025})
    if clip=='interact_offer':
     if self.water_target and (self.theme=='immortal' or self.stage<=2):
      target=self.posed('plant' if self.theme=='garden' else 'body',self.water_target)
      can=self.show('tool_can',target+Vector((.58,-.05,.90)),envelope(t,.04,.94));can.rotation_euler.y=.65*smooth((t-.10)/.15)
      spout=Vector(can.location)+can.rotation_euler.to_matrix()@Vector((-.31,0,.12))
      for i in range(8):
       u=(t-.20-i*.043)/.24
       if 0<=u<=1:
        p=spout.lerp(target,u);p.z+=.04*math.sin(math.pi*u);self.show('drop'+str(i),p)
      react=smooth((t-.42)/.12)*smooth((.92-t)/.16)
      rig.pose.bones['plant'].rotation_euler.y=.045*math.sin(phase*3)*react
      for i,k in enumerate(self.leaves):rig.pose.bones[k].rotation_euler.y+=.065*math.sin(phase*3+i*.5)*react
      head.rotation_euler.y=.045*react
     else:
      # Move the offering into the actual moving mouth; shrink only once it arrives.
      arrival=smooth((t-.09)/.29);chew=envelope(t,.39,.77)
      head.rotation_euler.x=-.07*chew
      target=self.posed('head',self.mouth)
      position=target+Vector((.65*(1-arrival),-.13*(1-arrival),.14*(1-arrival)))
      self.show('tool_food',position,envelope(t,.03,.82)*(1-smooth((t-.40)/.16)))
      for side in [-1,1]:rig.pose.bones['eye'+str(side)].scale.z=1-.45*chew
      self.show('reply',target+Vector((-.26,0,.24+.22*t)),chew*.7)
      if .38<t<.43:self.contact_samples.append({'clip':clip,'frame':frame,'targetBone':'head','anchor':list(target),'contactOffset':0})
    if clip=='interact_play':
     beat=math.sin(phase*2)*wave
     if self.theme=='train':
      rig.pose.bones['root'].location.y=.11*math.sin(phase)*wave
      for side in [-1,1]:rig.pose.bones['foot'+str(side)].rotation_euler.x=beat*.65
     elif self.theme=='ocean':
      body.location.z=.07*wave;body.rotation_euler.y=.08*beat
      for side in [-1,1]:rig.pose.bones['arm'+str(side)].rotation_euler.y=side*.35*beat
     else:
      body.location.z=.075*math.sin(phase*2)**2*wave;body.rotation_euler.z=.075*beat
      for side in [-1,1]:
       rig.pose.bones['arm'+str(side)].rotation_euler.y=side*.20*beat
       rig.pose.bones['foot'+str(side)].rotation_euler.x=side*.13*beat
     rig.pose.bones['tail'].rotation_euler.z=.28*beat
     for i,k in enumerate(self.leaves):rig.pose.bones[k].rotation_euler.y=.13*math.sin(phase*2+i*.3)*wave
     for k in self.wings:rig.pose.bones[k].rotation_euler.y=.15*beat
    if clip=='interact_care':
     touch=envelope(t,.28,.72);head.rotation_euler.y=.035*math.sin(phase)*touch
     for side in [-1,1]:rig.pose.bones['eye'+str(side)].scale.z=1-.78*touch
     k=self.leaves[0] if self.leaves else 'body' if self.theme in ['ocean','train'] else 'head'
     point=self.head_top if self.theme!='ocean' else (0,.25,1.02)
     target=self.posed(k,point);off=1-smooth((t-.07)/.22)+smooth((t-.72)/.18)
     self.show('tool_brush',target+Vector((.10*math.sin(phase*2)*touch,-.02,.025+.30*off)),envelope(t))
    if clip in ['interact_cheer','celebrate','evolve']:
     touch=envelope(t,.26,.68)
     arm='head' if self.theme=='train' else 'arm1';rig.pose.bones[arm].rotation_euler.y=-.25*touch
     if self.leaves:arm=self.leaves[min(2,len(self.leaves)-1)];rig.pose.bones[arm].rotation_euler.y=.10*touch
     target=self.posed(arm,self.paw)
     off=1-smooth((t-.06)/.24)+smooth((t-.68)/.20)
     self.show('tool_hand',target+Vector((.50*off,-.02,.025+.20*off)),envelope(t))
     reply=envelope(t,.42,.98);self.show('reply',target+Vector((0,-.04,.18+(t-.42)*.7)),reply)
     self.show('light',target+Vector((0,-.02,.18+(t-.42)*.7)),reply)
     if clip=='evolve':body.scale=(1+.035*wave,)*3
     for k in self.wings:rig.pose.bones[k].rotation_euler.y=.18*wave
    for p in rig.pose.bones:
     for prop in ['location','rotation_euler','scale']:p.keyframe_insert(prop,frame=frame,group=p.name)
   # Last frame restores every transform. Lifecycle clips crossfade into looped idle.
   for p in rig.pose.bones:
    p.location=(0,0,0);p.rotation_euler=(0,0,0);p.scale=(.0001,)*3 if p.name in self.props else (1,1,1)
    for prop in ['location','rotation_euler','scale']:p.keyframe_insert(prop,frame=end,group=p.name)
   tr=rig.animation_data.nla_tracks.new();tr.name=clip;tr.strips.new(clip,1,action);tr.mute=True
  self.reset()

 def reset(self):
  self.rig.animation_data.action=None
  for tr in self.rig.animation_data.nla_tracks:tr.mute=True
  for p in self.rig.pose.bones:p.location=(0,0,0);p.rotation_euler=(0,0,0);p.scale=(.0001,)*3 if p.name in self.props else (1,1,1)
  bpy.context.scene.frame_set(1)

 def build(self):
  if self.theme=='immortal':self.immortal()
  elif self.theme in ['garden','mountain','pet']:self.fox(self.theme=='pet')
  elif self.theme in ['castle','gem']:self.dragon()
  elif self.theme=='ocean':self.turtle()
  elif self.theme=='space':self.astronaut()
  elif self.theme=='train':self.train()
  # Each persona has its own modeled ornaments, not just a file name/color change.
  if self.persona=='female' and self.theme not in ['immortal','garden','train']:
   self.flower(Vector(self.head_top)+Vector((-.16,-.05,-.02)),.055,'head')
   self.features.append('sculpted floral ornament')
  if self.persona=='male' and self.theme not in ['immortal','mountain']:
   pos=Vector(self.head_top)+Vector((0,-.10,-.05));self.jewel(pos,.055,'head')
   self.features.append('geometric gilded crest')
  if self.persona=='neutral':self.features.append('jade botanical palette')
  self.tools();self.animate()

 def export(self,out,render=False):
  directory=out/self.theme/self.persona;directory.mkdir(parents=True,exist_ok=True)
  file=directory/(str(self.stage)+'.glb')
  bpy.ops.object.select_all(action='DESELECT')
  for o in self.objects:o.select_set(True)
  bpy.context.view_layer.objects.active=self.objects[0];bpy.ops.object.join()
  mesh=bpy.context.object;mesh.name='Authored '+self.theme+' '+self.persona+' stage '+str(self.stage)
  bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);self.rig.select_set(True);bpy.context.view_layer.objects.active=self.rig
  temporary=directory/(str(self.stage)+'.tmp.glb')
  bpy.ops.export_scene.gltf(filepath=str(temporary),export_format='GLB',use_selection=True,
   export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,
   export_force_sampling=True,export_def_bones=True,export_materials='EXPORT',export_yup=True)
  temporary.replace(file);self.reset()
  mesh.data.calc_loop_triangles()
  info={'id':self.theme+'/'+self.persona+'/'+str(self.stage),'file':file.relative_to(out).as_posix(),
   'status':'authored_candidate','artPass':'refinement_in_progress' if self.theme in ['garden','mountain','pet'] else 'blockout_needs_refinement','approved':False,'triangles':len(mesh.data.loop_triangles),
   'bytes':file.stat().st_size,'bones':len(self.rig.data.bones),'materials':len(mesh.data.materials),
   'clips':CLIPS,'features':self.features,'contactSamples':self.contact_samples,
   'provenance':'Original mesh, vertex colors, rig and animation authored by project script; no paid or external generation.'}
  (directory/(str(self.stage)+'.json')).write_text(json.dumps(info,ensure_ascii=False,indent=2),encoding='utf8')
  if render:
   self.studio();bpy.ops.wm.save_as_mainfile(filepath=str(directory/(str(self.stage)+'.blend')))
   bpy.context.scene.render.filepath=str(directory/(str(self.stage)+'.png'));bpy.ops.render.render(write_still=True)
  return info

 def studio(self):
  scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24
  scene.cycles.use_denoising=True;scene.render.resolution_x=600;scene.render.resolution_y=700;scene.render.resolution_percentage=100
  scene.render.image_settings.file_format='PNG';scene.world.color=(.15,.19,.22);scene.view_settings.view_transform='AgX'
  bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,0));floor=bpy.context.object
  m=bpy.data.materials.new('Studio backdrop');m.diffuse_color=(.06,.10,.11,1);m.use_nodes=True;m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.06,.10,.11,1);floor.data.materials.append(m)
  for pos,power,size,col in [((-3,-4,6),700,4,(1,.87,.69)),((4,-2,3),380,3,(.70,.83,1)),((1,4,5),900,3,(1,.77,.40))]:
   d=bpy.data.lights.new('Softbox','AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=col
   o=bpy.data.objects.new('Softbox',d);scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
  d=bpy.data.cameras.new('Review camera');cam=bpy.data.objects.new('Review camera',d);scene.collection.objects.link(cam)
  cam.location=(3,-7,3);target=Vector((0,.35 if self.theme=='train' else 0,1.30 if self.theme=='immortal' and self.stage<3 else 1.12))
  cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=3.6 if self.theme!='train' else 3.6+self.stage*.5;scene.camera=cam

def main():
 parser=argparse.ArgumentParser();parser.add_argument('output');parser.add_argument('--themes',default=','.join(THEMES));parser.add_argument('--personas',default=','.join(PERSONAS));parser.add_argument('--stages',default='0,1,2,3,4');parser.add_argument('--render',action='store_true')
 args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(args.output).resolve();out.mkdir(parents=True,exist_ok=True)
 themes=args.themes.split(',');personas=args.personas.split(',');stages=list(map(int,args.stages.split(',')))
 if any(t not in THEMES for t in themes) or any(p not in PERSONAS for p in personas) or any(s not in range(5) for s in stages):raise ValueError('Invalid theme/persona/stage')
 reports=[]
 for theme in themes:
  for persona in personas:
   for stage in stages:
    c=Character(theme,persona,stage);c.build();info=c.export(out,args.render);reports.append(info)
    (out/'latest-batch.json').write_text(json.dumps({'status':'candidates_not_approved','required':135,'exportedThisRun':len(reports),'models':reports},ensure_ascii=False,indent=2),encoding='utf8')
    print('CAST_EXPORTED',info['id'],info['bytes'],info['triangles'],flush=True)
 print('BATCH_FINISHED',len(reports),flush=True)

if __name__=='__main__':main()
