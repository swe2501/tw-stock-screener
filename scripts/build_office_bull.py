"""Create a continuous original bronze bull surface from smooth anatomical volumes."""
from pathlib import Path
import base64, json
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
# Centre and radii: torso, barrel chest, shoulders, neck, lowered head and muzzle.
VOLUMES=[((0,1.65,-.1),(.84,.8,1.45)),((0,1.87,.85),(.96,.98,.92)),
 ((0,2.03,.35),(.68,.77,.95)),((0,1.41,1.48),(.69,.72,.85)),
 ((0,1.1,2.01),(.6,.65,.62)),((0,.83,2.5),(.56,.32,.4)),
 ((-.64,1.66,.81),(.4,.68,.52)),((.64,1.66,.81),(.4,.68,.52))]
# Splayed front legs and planted hindquarters fuse into the chest rather than look glued on.
for side in [-1,1]:
 VOLUMES += [((side*.67,1.14,.76),(.29,.63,.35)),
             ((side*.82,.6,1.02),(.17,.52,.19)),
             ((side*.92,.24,1.25),(.17,.27,.22)),
             ((side*.62,1.17,-1.02),(.37,.6,.42)),
             ((side*.67,.62,-1.3),(.18,.5,.22)),
             ((side*.72,.25,-1.06),(.15,.27,.19))]


def field(p):
 result=np.full(p.shape[:-1],99.)
 for centre,radii in VOLUMES:
  d=(np.linalg.norm((p-np.array(centre))/np.array(radii),axis=-1)-1)*min(radii)
  k=.16;h=np.maximum(k-np.abs(result-d),0)/k
  result=np.minimum(result,d)-h*h*k*.25
 return result


if __name__=='__main__':
 axes=[np.linspace(-1.35,1.35,45),np.linspace(.025,3.1,52),np.linspace(-1.9,3.1,85)]
 grid=np.stack(np.meshgrid(*axes,indexing='ij'),axis=-1);values=field(grid)
 corners=np.array([[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]])
 starts=np.stack(np.meshgrid(*[np.arange(len(a)-1) for a in axes],indexing='ij'),axis=-1).reshape(-1,3)
 cell_values=np.stack([values[tuple((starts+c).T)] for c in corners],axis=-1)
 starts=starts[(cell_values.min(axis=1)<=0)&(cell_values.max(axis=1)>0)]
 xyz=grid[tuple((starts[:,None,:]+corners[None,:,:]).transpose(2,0,1))]
 val=field(xyz);triangles=[]
 for tet in [[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]]:
  p=xyz[:,tet];v=val[:,tet];codes=((v<0)*np.array([1,2,4,8])).sum(axis=1)
  for code in range(1,15):
   selected=codes==code
   if not selected.any():continue
   q=p[selected];f=v[selected];inside=[i for i in range(4) if code&(1<<i)];outside=[i for i in range(4) if not code&(1<<i)]
   def edge(a,b):
    t=f[:,a]/(f[:,a]-f[:,b]);return q[:,a]+t[:,None]*(q[:,b]-q[:,a])
   if len(inside)==1 or len(outside)==1:
    a=(inside if len(inside)==1 else outside)[0];others=outside if len(inside)==1 else inside
    triangles.append(np.stack([edge(a,b) for b in others],axis=1))
   else:
    a,b=inside;c,d=outside;ac,ad,bc,bd=edge(a,c),edge(a,d),edge(b,c),edge(b,d)
    triangles.extend([np.stack([ac,ad,bc],axis=1),np.stack([ad,bd,bc],axis=1)])
 tris=np.concatenate(triangles);eps=.002
 normals=np.stack([(field(tris+np.eye(3)[i]*eps)-field(tris-np.eye(3)[i]*eps))/(2*eps) for i in range(3)],axis=-1)
 normals/=np.maximum(np.linalg.norm(normals,axis=-1,keepdims=True),1e-8)
 flip=(np.cross(tris[:,1]-tris[:,0],tris[:,2]-tris[:,0])*normals.mean(axis=1)).sum(axis=1)<0
 tris[flip]=tris[flip][:,[0,2,1]];normals[flip]=normals[flip][:,[0,2,1]]
 # Quantised positions and smooth field normals keep the local geometry asset compact.
 positions=np.round(tris.reshape(-1,3)*5000).astype('<i2');n=np.round(normals.reshape(-1,3)*127).astype('i1')
 positions,first,indices=np.unique(positions,axis=0,return_index=True,return_inverse=True);n=n[first];indices=indices.astype('<u2' if len(positions)<65536 else '<u4')
 data={'index':base64.b64encode(indices.tobytes()).decode(),'indexBytes':indices.dtype.itemsize,'position':base64.b64encode(positions.tobytes()).decode(),'normal':base64.b64encode(n.tobytes()).decode(),'vertices':len(positions),'scale':5000}
 (ROOT/'apps/web/assets/ai-office/office-bull-mesh.js').write_text('/* Original continuous charging-bull sculpture; quantised local geometry. */\nwindow.ForesightBullMesh='+json.dumps(data,separators=(',',':'))+';\n',encoding='utf-8')
 print(f'{len(positions)} shared vertices, {len(indices)//3} smooth triangles')
