"""Trace the existing transparent brand PNG into coloured, holed extrusion contours.

This produces geometry data only; it does not edit the source artwork.
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def area(p):
    return sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(p,p[1:]+p[:1]))/2


def contours(mask):
    edges = {}
    h,w = mask.shape
    for y,x in zip(*np.where(mask)):
        y,x=int(y),int(x)
        for a,b,inside in [((x,y),(x+1,y),y>0 and mask[y-1,x]),
                           ((x+1,y),(x+1,y+1),x<w-1 and mask[y,x+1]),
                           ((x+1,y+1),(x,y+1),y<h-1 and mask[y+1,x]),
                           ((x,y+1),(x,y),x>0 and mask[y,x-1])]:
            if not inside: edges.setdefault(a,[]).append(b)
    loops=[]
    while edges:
        start=next(iter(edges));p=[start];current=start
        while True:
            options=edges.get(current)
            if not options: break
            nxt=options.pop()
            if not options: del edges[current]
            current=nxt
            if current==start: break
            p.append(current)
        if current!=start or abs(area(p))<2: continue
        # Collinear grid vertices add no contour information.
        p=[b for a,b,c in zip(p[-1:]+p[:-1],p,p[1:]+p[:1])
           if (b[0]-a[0])*(c[1]-b[1])!=(b[1]-a[1])*(c[0]-b[0])]
        if len(p)>2: loops.append(p)
    outer=[{'outline':p,'holes':[]} for p in loops if area(p)>0]
    for hole in (p for p in loops if area(p)<0):
        x,y=hole[0];candidates=[]
        for group in outer:
            p=group['outline'];inside=False
            for a,b in zip(p,p[1:]+p[:1]):
                if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:inside=not inside
            if inside:candidates.append(group)
        if candidates:min(candidates,key=lambda g:abs(area(g['outline'])))['holes'].append(hole)
    return outer


if __name__=='__main__':
    source=Image.open(ROOT/'apps/web/assets/brand/foresight-owl-light.png').convert('RGBA')
    source.thumbnail((420,280),Image.Resampling.LANCZOS)
    a=np.array(source).astype(float);visible=a[:,:,3]>115
    gold=visible&(a[:,:,0]>110)&(a[:,:,0]>a[:,:,2]*1.2)&(a[:,:,1]>a[:,:,2]*1.1)
    data={'width':source.width,'height':source.height,'layers':[
        {'name':'charcoal','shapes':contours(visible&~gold)},
        {'name':'gold','shapes':contours(gold)}]}
    output=ROOT/'apps/web/assets/ai-office/office-logo-contours.js'
    output.write_text('/* Geometry traced from the original owl; transparent gaps are real holes. */\nwindow.ForesightOwlReliefContours='+json.dumps(data,separators=(',',':'))+';\n',encoding='utf-8')
    print(f'{sum(len(x["shapes"]) for x in data["layers"])} coloured shapes; {sum(len(s["holes"]) for x in data["layers"] for s in x["shapes"])} holes')
