/* Original Foresight motion composition. Local artwork; no external rendering engine. */
(()=>{'use strict';
 const TAU=Math.PI*2,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),mix=(a,b,t)=>a+(b-a)*t;
 const ease=(a,b,v)=>{const x=clamp((v-a)/(b-a));return x*x*(3-2*x);};
 const loaded={},names=['snowy-owl-v2','pearl-owl-v2','fish-jewel-v2','fish-jewel-extra-v2','owl-banks-v2'];
 names.forEach(name=>{const im=new Image();im.decoding='async';im.onload=()=>dispatchEvent(new Event('fqi-arrival-art-ready'));im.src='assets/arrival/'+name+'.webp';loaded[name]=im;});
 const ready=im=>im?.complete&&im.naturalWidth>0;
 const bounds=[[[14,135,613,492],[627,153,613,320],[60,627,567,559],[627,721,604,395]],[[30,60,597,567],[627,140,621,408],[52,627,575,582],[627,750,604,361]]];
 const fish=Array.from({length:20},(_,i)=>({id:i,type:i%8,depth:.3+(i%5)*.16,phase:i*2.399,origin:(i*.137+.08)%1,dir:i%3===0?-1:1,vx:0,vy:0,ox:0,oy:0,x:0,y:0}));
 let last=0,lookX=0,lookY=0,lookTargetX=0,lookTargetY=0,yaw=0,wing=0,head=0,state={},lastPointer={x:-1,y:-1},ripples=[];
 const stars=Array.from({length:54},(_,i)=>({x:(i*.618034)%1,y:(i*.381966+.13)%1,phase:i*1.21}));
 const palette=['#397caa','#b39252','#2b9c9e','#a86b59'];
 // Continuous shoulder stroke; each wing is a single connected surface.
 function wingStroke(time){const p=((time/2.65)%1+1)%1;
  // A smooth periodic stroke has no held keyframe or abrupt change of velocity.
  return .235-.315*Math.cos(TAU*p)+.025*Math.sin(TAU*p*2);
 }
 // Calibrated eye/face landmarks for each selected image, not one crop reused for every pose.
 function landmarks(angle,style){
  if(!angle)return style?{x:.503,y:.445,eyes:[[.468,.415,.0118,.015],[.537,.415,.0118,.015]]}:{x:.515,y:.415,eyes:[[.4835,.386,.0102,.0126],[.547,.386,.0102,.0126]]};
  if(angle<0)return style?{x:.780,y:.529,eyes:[[.735,.501,.015,.009],[.824,.502,.010,.010]]}:{x:.779,y:.608,eyes:[[.734,.581,.014,.010],[.824,.584,.010,.011]]};
  return style?{x:.221,y:.531,eyes:[[.175,.505,.010,.010],[.266,.502,.014,.009]]}:{x:.225,y:.609,eyes:[[.179,.584,.010,.011],[.272,.580,.014,.010]]};
 }
 function drawGaze(ctx,mark,ow,oh){
  for(const e of mark.eyes){const x=(e[0]-mark.x)*ow,y=(e[1]-mark.y)*oh,rx=e[2]*ow,ry=e[3]*oh;
   ctx.save();ctx.translate(x,y);ctx.scale(1,ry/rx);ctx.beginPath();ctx.arc(0,0,rx,0,TAU);ctx.clip();
   const iris=ctx.createRadialGradient(-rx*.15,-rx*.18,rx*.12,0,0,rx);iris.addColorStop(0,'#e3b84e');iris.addColorStop(.58,'#c39735');iris.addColorStop(.87,'#8f6824');iris.addColorStop(1,'#372e20');ctx.fillStyle=iris;ctx.fillRect(-rx,-rx,rx*2,rx*2);
   ctx.globalAlpha=.18;ctx.strokeStyle='#fff0b0';ctx.lineWidth=.35;for(let i=0;i<12;i++){const a=i*TAU/12;ctx.beginPath();ctx.moveTo(Math.cos(a)*rx*.47,Math.sin(a)*rx*.47);ctx.lineTo(Math.cos(a)*rx*.85,Math.sin(a)*rx*.85);ctx.stroke();}ctx.globalAlpha=1;
   const gx=lookX*rx*.30,gy=lookY*rx*.23;ctx.fillStyle='#192029';ctx.beginPath();ctx.ellipse(gx,gy,rx*.43,rx*.51,0,0,TAU);ctx.fill();ctx.fillStyle='#ffffffd9';ctx.beginPath();ctx.arc(gx-rx*.17,gy-rx*.23,rx*.13,0,TAU);ctx.fill();ctx.restore();
  }
 }
 function wingLayers(im,source,faceX,faceY,key){
  if(!im._layers)im._layers={};if(im._layers[key])return im._layers[key];
  const [sx,sy,sw,sh]=source,cw=Math.min(sw,960),ch=Math.round(cw*sh/sw),blank=()=>{const c=document.createElement('canvas');c.width=cw;c.height=ch;return c;};
  const base=blank(),bg=base.getContext('2d');bg.drawImage(im._cool,sx,sy,sw,sh,0,0,cw,ch);
  function cutHead(g){g.save();g.globalCompositeOperation='destination-out';g.translate(faceX*cw,faceY*ch);g.scale(cw*.12,ch*.17);const hm=g.createRadialGradient(0,0,.8,0,0,1);hm.addColorStop(0,'#fff');hm.addColorStop(1,'#fff0');g.fillStyle=hm;g.fillRect(-1,-1,2,2);g.restore();}
  function horizontal(g,stops){const gr=g.createLinearGradient(0,0,cw,0);stops.forEach(([x,a])=>gr.addColorStop(clamp(x),`rgba(255,255,255,${a})`));g.fillStyle=gr;g.fillRect(0,0,cw,ch);}
  function mask(side,part){const c=blank(),g=c.getContext('2d'),bank=Math.abs(faceX-.5)>.15,far=bank&&side===Math.sign(faceX-.5),root=faceX+side*(far?.015:.085),joint=side<0?root*.55:root+(1-root)*.45;
   horizontal(g,side<0?[[0,1],[root-.045,1],[root+.035,0],[1,0]]:[[0,0],[root-.035,0],[root+.045,1],[1,1]]);
   if(part!=='total'){const m=blank(),mg=m.getContext('2d');horizontal(mg,side<0?[[0,1],[joint-.012,1],[joint+.012,0],[1,0]]:[[0,0],[joint-.012,0],[joint+.012,1],[1,1]]);g.globalCompositeOperation=part==='outer'?'destination-in':'destination-out';g.drawImage(m,0,0);}
   const vertical=g.createLinearGradient(0,0,0,ch);vertical.addColorStop(0,'#fff');vertical.addColorStop(clamp(faceY+.22),'#fff');vertical.addColorStop(clamp(faceY+.34),'#fff0');vertical.addColorStop(1,'#fff0');g.globalCompositeOperation='destination-in';g.fillStyle=vertical;g.fillRect(0,0,cw,ch);return{canvas:c,root,joint};
  }
  const body=blank(),g=body.getContext('2d');g.drawImage(base,0,0);const sides=[];
  for(const side of [-1,1]){const row={side};for(const part of ['inner','outer']){const m=mask(side,part),c=blank(),cg=c.getContext('2d');cg.drawImage(base,0,0);cg.globalCompositeOperation='destination-in';cg.drawImage(m.canvas,0,0);cutHead(cg);row[part]=c;row.root=m.root;row.joint=m.joint;}const total=mask(side,'total'),whole=blank(),wg=whole.getContext('2d');wg.drawImage(base,0,0);wg.globalCompositeOperation='destination-in';wg.drawImage(total.canvas,0,0);cutHead(wg);row.whole=whole;const bank=Math.abs(faceX-.5)>.15,far=bank&&side===Math.sign(faceX-.5);row.pivotY=bank?faceY+(far?-.20:-.03):faceY+.065;g.globalCompositeOperation='destination-out';g.drawImage(total.canvas,0,0);sides.push(row);}
  // Remove the original head before drawing its tracked layer, avoiding a doubled outline.
  cutHead(g);
  const result={body,sides};im._layers[key]=result;return result;
 }
 function curved(ctx,x,y,rx,ry,start,end){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,start,end);ctx.stroke();}
 function fishPosition(f,t,w,h,mobile){
  const speed=.045+f.depth*.028,phase=t*speed+f.phase;
  const x=w*(.5+Math.cos(phase)*(.44+f.depth*.10)+Math.sin(phase*.63+f.id)*.07);
  const y=h*(.48+Math.sin(phase*.83+f.id*.37)*(.29+f.depth*.09));
  const vx=-Math.sin(phase)*(.44+f.depth*.10)+Math.cos(phase*.63+f.id)*.044;
  const vy=Math.cos(phase*.83+f.id*.37)*(.29+f.depth*.09)*.83;
  f.dir=vx<0?-1:1;f.swimAngle=Math.atan2(vy*h,Math.abs(vx)*w)*f.dir;f.turn=Math.max(.36,Math.min(1,Math.abs(vx)*2.2));
  // Text remains an uncluttered reading island; large creatures travel around it.
  const corridor=!mobile&&x<w*.48&&y>h*.26&&y<h*.78;
  return{x,y,corridor};
 }
 function drawFish(ctx,f,rect,im,t,alpha,size){
  const [sx,sy,sw,sh]=rect,fh=size*sh/sw,beat=t*(2.6+f.depth*.65)+f.phase;
  ctx.save();ctx.translate(f.x,f.y);ctx.rotate(clamp(f.swimAngle||0,-.65,.65)+Math.sin(t*.48+f.phase)*.025+clamp(f.vy/110,-.16,.16));ctx.scale(f.dir*(f.turn||1),1);ctx.globalAlpha=alpha;
  // A continuous deforming strip mesh: the nose stays steady, the tail follows a travelling wave.
  const slices=18,dw=size/slices;
  for(let j=0;j<slices;j++){const u=(j+.5)/slices,tail=Math.pow(clamp((.78-u)/.78),1.6),dy=Math.sin(beat-u*3.2)*tail*fh*.075;
   const x0=Math.round(-size/2+j*dw),x1=Math.round(-size/2+(j+1)*dw);
   ctx.drawImage(im,sx+j*sw/slices,sy,sw/slices,sh,x0,-fh/2+dy,x1-x0,fh);
  }ctx.restore();
 }
 function wake(ctx,f,t,size,color,alpha){
  ctx.save();ctx.translate(f.x-f.dir*size*.45,f.y);ctx.scale(f.dir,1);ctx.lineWidth=.7;
  const fade=ctx.createLinearGradient(0,0,-size*1.15,0);fade.addColorStop(0,color+'80');fade.addColorStop(.45,color+'45');fade.addColorStop(1,color+'00');ctx.strokeStyle=fade;ctx.globalAlpha=alpha*.5;
  for(const side of [-1,1]){ctx.beginPath();for(let j=0;j<=16;j++){const u=j/16,x=-u*size*1.15,y=side*size*(.025+u*.15)+Math.sin(u*5.5-t*2.3+f.phase)*size*.025*u;j?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}ctx.restore();
 }
 function owlImage(ctx,im,box,t,opacity,anglePose,style){
  if(!ready(im)||opacity<.005)return;
  let source=[0,0,im.naturalWidth,im.naturalHeight];const mark=landmarks(anglePose,style),faceX=mark.x,faceY=mark.y;
  if(anglePose){const right=anglePose>0;source=[right?627:0,style?627:0,627,627];}
  const [sx,sy,sw,sh]=source,ow=box.width,oh=ow*sh/sw,cx=box.x,cy=box.y;
  const anchorX=faceX,anchorY=faceY;
  // Every view is aligned by its face, so the camera turn has no positional snap.
  const dx=-anchorX*ow,dy=-anchorY*oh;
  if(!im._cool){const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const g=c.getContext('2d');g.filter='saturate(.3) brightness(1.04)';g.drawImage(im,0,0);im._cool=c;}
  ctx.save();ctx.globalAlpha=opacity;ctx.translate(cx,cy);ctx.rotate(yaw*.055);ctx.scale(1-Math.abs(yaw)*.035,1);
  const layerKey=anglePose?'bank-'+anglePose+'-'+style:'front',layers=wingLayers(im,source,faceX,faceY,layerKey),stroke=box.static?0:wingStroke(t);
  // Never rotate a detached outer-feather crop: a full wing shares one shoulder pivot.
  // The feathered shoulder overlaps the fixed torso throughout the stroke.
  for(const side of layers.sides){const rx=dx+side.root*ow,ry=dy+side.pivotY*oh;
   ctx.save();ctx.translate(rx,ry);ctx.rotate(side.side*stroke);ctx.translate(-rx,-ry);ctx.drawImage(side.whole,dx,dy,ow,oh);ctx.restore();
  }
  ctx.drawImage(layers.body,dx,dy,ow,oh);
  // The head has independent, bounded gaze tracking. A feathered mask avoids a cutout edge.
  const headKey=anglePose?'bank-'+anglePose+'-'+style:'front',hx=sx+sw*(faceX-.12),hy=sy+sh*(faceY-.17),hw=sw*.24,hh=sh*.34;
  if(!im._heads)im._heads={};
  if(!im._heads[headKey]){const c=document.createElement('canvas');c.width=320;c.height=320;const g=c.getContext('2d');g.drawImage(im,hx,hy,hw,hh,0,0,320,320);g.globalCompositeOperation='destination-in';const mask=g.createRadialGradient(160,160,128,160,160,160);mask.addColorStop(0,'#fff');mask.addColorStop(1,'#fff0');g.fillStyle=mask;g.fillRect(0,0,320,320);im._heads[headKey]=c;}
  ctx.save();ctx.translate(lookX*ow*.007,lookY*oh*.005);ctx.rotate(lookX*.025);ctx.drawImage(im._heads[headKey],-ow*.12,-oh*.17,ow*.24,oh*.34);drawGaze(ctx,mark,ow,oh);ctx.restore();ctx.restore();
 }
 function render(a){
  const {ctx,w,h,heroRect:r,colors,dark,pointer,clock,reduce,clouds,logo}=a;
  const t=reduce?22:clock/1000,cycle=t%38,mobile=w<621,dt=clamp((t-last)||.033,0,.06);last=t;
  const px=pointer.x<0?r.x:pointer.sx,py=pointer.y<0?r.y:pointer.sy;
  const lookRadius=Math.max(180,w*.32);lookTargetX=pointer.x<0?Math.sin(t*.25)*.45:clamp((px-r.x)/lookRadius,-1,1);lookTargetY=pointer.y<0?Math.sin(t*.19)*.2:clamp((py-r.y)/(h*.45),-1,1);
  lookX+=((reduce?0:lookTargetX)-lookX)*(1-Math.exp(-dt/.095));lookY+=((reduce?0:lookTargetY)-lookY)*(1-Math.exp(-dt/.11));
  const flightYaw=reduce?0:Math.sin(t*.24)*.7; yaw+=(flightYaw+lookX*.25-yaw)*.035;
  wing=reduce?0:wingStroke(t);head=lookX;
  const arrival=reduce?1:ease(0,2.7,t),approach=mix(.83,1,arrival);
  const visualW=Math.min(mobile?290:660,r.width*.82,r.height*(mobile?1.02:1.12))*approach;
  const cx=r.x+(reduce?0:Math.sin(t*.26)*12+lookX*10+(1-arrival)*60),cy=r.y+(mobile?-9:0)+(reduce?0:Math.sin(t*.51)*10-(1-arrival)*35);
  const faceY=cy-visualW*.025;
  ctx.clearRect(0,0,w,h);
  // Large, legible light on porcelain; restrained iridescent depth on midnight.
  const halo=ctx.createRadialGradient(cx,cy,visualW*.08,cx,cy,visualW*.83);halo.addColorStop(0,dark?'#ddbc6835':'#5794b83b');halo.addColorStop(.52,dark?'#23627920':'#7e9cb22a');halo.addColorStop(1,'#0000');ctx.fillStyle=halo;ctx.fillRect(0,0,w,h);
  if(!mobile){ctx.save();ctx.globalAlpha=dark?.035:.045;ctx.strokeStyle=colors.accent;ctx.lineWidth=.7;ctx.font='500 '+Math.min(w*.085,140)+'px Georgia,serif';ctx.textAlign='center';ctx.strokeText(cycle<12?'OBSERVE':cycle<18?'CONNECT':'FORESIGHT',cx,cy-visualW*.33);ctx.restore();}
  // Glass lanes sit behind the creatures and remain animated throughout the logo phase.
  ctx.save();ctx.translate(cx,cy+visualW*.1);ctx.rotate(-.2+Math.sin(t*.10)*.04);
  for(let i=0;i<3;i++){ctx.strokeStyle=dark?(i===1?'#e3c57e':'#7cabc8'):(i===1?'#bb995c':'#397caa');ctx.lineWidth=i===1?1.2:.65;ctx.globalAlpha=dark?.15:.18;
   curved(ctx,0,0,visualW*(.59+i*.065),visualW*(.18+i*.05),0,TAU);
   const p=t*(.13+i*.025)+i*2.1,x=Math.cos(p)*visualW*(.59+i*.065),y=Math.sin(p)*visualW*(.18+i*.05);ctx.globalAlpha=.7;ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.arc(x,y,i===1?2.4:1.8,0,TAU);ctx.fill();
  }ctx.restore();
  // Market ribbons are decorative paths, never fabricated market data.
  for(let k=0;k<2;k++){ctx.beginPath();for(let x=0;x<=w;x+=14){const y=h*(.75+k*.025)+Math.sin(x/w*6.5+t*.18+k)*h*.022+(x/w-.5)*h*.03;x?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.lineWidth=k?.45:.9;ctx.strokeStyle=k?colors.accent:colors.line;ctx.globalAlpha=.22;ctx.stroke();}
  stars.forEach((s,i)=>{const x=s.x*w+Math.sin(t*.15+s.phase)*5,y=s.y*h+Math.cos(t*.2+s.phase)*8,near=pointer.x>=0&&Math.hypot(x-px,y-py)<150;ctx.globalAlpha=near?.65:.2;ctx.fillStyle=i%3?colors.accent:colors.ink;ctx.fillRect(x,y,near?2:1,near?2:1);});
  const count=mobile?9:15;let dispersing=0;
  fish.slice(0,count).forEach(f=>{const pos=fishPosition(f,t,w,h,mobile);let bx=pos.x,by=pos.y;
   const dx=bx+f.ox-px,dy=by+f.oy-py,d=Math.hypot(dx,dy),near=!reduce&&pointer.x>=0&&d<175;
   if(near){const force=(1-d/175)*240,angle=d>1?Math.atan2(dy,dx):f.phase;f.vx+=Math.cos(angle)*force*dt;f.vy+=Math.sin(angle)*force*dt;dispersing++;}
   f.vx+=(-f.ox*.7-f.vx*1.5)*dt;f.vy+=(-f.oy*.7-f.vy*1.5)*dt;f.ox=clamp(f.ox+f.vx*dt,-150,150);f.oy=clamp(f.oy+f.vy*dt,-130,130);f.x=bx+f.ox;f.y=by+f.oy;
   const bank=f.type<4?0:1,im=loaded[bank?'fish-jewel-extra-v2':'fish-jewel-v2'],size=(mobile?30:42)+(mobile?24:42)*f.depth;
   const distOwl=Math.hypot((f.x-cx)/Math.max(1,visualW*.6),(f.y-cy)/Math.max(1,visualW*.4));
   const alpha=pos.corridor?.09:distOwl<.85?.16:.36+f.depth*.32;
   if(ready(im)){wake(ctx,f,t,size,palette[f.type%4],alpha);drawFish(ctx,f,bounds[bank][f.type%4],im,t,alpha,size);}
  });
  // Pointer rings are emitted from movement, expand, then disappear without looping circles.
  if(!reduce&&pointer.x>=0&&Math.hypot(px-lastPointer.x,py-lastPointer.y)>48){ripples.push({x:px,y:py,start:t});lastPointer={x:px,y:py};if(ripples.length>5)ripples.shift();}
  ripples=ripples.filter(p=>t-p.start<1.65&&t>=p.start);ripples.forEach(p=>{const age=(t-p.start)/1.65;ctx.globalAlpha=(1-age)*.18;ctx.strokeStyle=colors.accent;ctx.lineWidth=.65;curved(ctx,p.x,p.y,12+age*48,7+age*23,0,TAU);});
  // Snowy → pearl sculpture → mosaic → exact original logo → reverse transformation.
  const pearl=ease(6,9,cycle)*(1-ease(29,34,cycle));
  const dissolve=ease(12,15,cycle)*(1-ease(31,35,cycle));
  const logoAlpha=ease(18,21,cycle)*(1-ease(26,30,cycle));
  const mosaicAlpha=ease(12,15,cycle)*(1-ease(19,22,cycle))+ease(27,30,cycle)*(1-ease(32,35,cycle));
  const morphology=ease(15,20,cycle)*(1-ease(29,34,cycle));
  let stage=cycle<6?0:cycle<12?1:cycle<18?2:cycle<28?3:4;
  if(reduce)stage=3;
  // Camera view changes while the bird is fully dissolved, avoiding double heads or ghost wings.
  // The next bank then grows out of the mosaic and stays coherent for the whole flight.
  const poseIndex=reduce?0:Math.floor((t+7)/38)%3,side=[0,-1,1][poseIndex];
  const natural=(1-pearl)*(1-dissolve),sculpted=pearl*(1-dissolve);
  // Center the complete silhouette, rather than the face of an asymmetric bank pose.
  const poseMark=landmarks(side,pearl>.5?1:0),owlBox={x:cx+(poseMark.x-.5)*visualW,y:faceY+(side?(poseMark.y-.5)*visualW:0),width:visualW,static:reduce};
  if(side&&ready(loaded['owl-banks-v2'])){owlImage(ctx,loaded['owl-banks-v2'],owlBox,t,natural,side,0);owlImage(ctx,loaded['owl-banks-v2'],owlBox,t,sculpted,side,1);}
  else{owlImage(ctx,loaded['snowy-owl-v2'],owlBox,t,natural,0,0);owlImage(ctx,loaded['pearl-owl-v2'],owlBox,t,sculpted,0,1);}
  const mosaic=window.FqiArrivalMosaic||[],logoPoints=clouds[dark?'dark':'light'];
  if(mosaicAlpha>.005){const scatter=Math.sin(clamp(morphology)*Math.PI)*visualW*.09;ctx.save();ctx.translate(cx,faceY+visualW*.045);
   mosaic.forEach((p,i)=>{const target=logoPoints[i%logoPoints.length],sx=(p[0]-.5)*visualW,sy=(p[1]-.415)*visualW*2/3,tx=target.x*visualW*.76,ty=target.y*visualW*.76*.634;
    const x=mix(sx,tx,morphology)+Math.sin(i*2.4+t*.7)*scatter,y=mix(sy,ty,morphology)+Math.cos(i*1.7+t*.6)*scatter;
    const size=mix(visualW/80,visualW/135,morphology),c=target.gold?(dark?'#edca74':'#b18a39'):(dark?'#d9e5ed':'#3c586a');ctx.globalAlpha=clamp(mosaicAlpha)*(.65+.35*Math.sin(i+t*.6)**2);ctx.fillStyle=morphology>.55?c:(dark?`rgb(${p[2]},${p[3]},${p[4]})`:'#7896a8');ctx.fillRect(x-size/2,y-size/2,size,size);
   });ctx.restore();}
  const logoPulse=reduce?0:(.5-.5*Math.cos((cycle-20)*TAU/2.8)),reveal=reduce?0:Math.exp(-(((cycle-20.2)/.7)**2));
  if(logoAlpha>.005&&ready(logo)){const lw=visualW*.76,lh=lw*.634;ctx.save();ctx.translate(cx,faceY+visualW*.045);
   if(!reduce){ctx.globalAlpha=logoAlpha*(.22+logoPulse*.26+reveal*.20);ctx.shadowColor=dark?'#f1cd67':'#559fc5';ctx.shadowBlur=16+logoPulse*22+reveal*14;ctx.drawImage(logo,350,0,1340,850,-lw/2,-lh/2,lw,lh);}
   ctx.globalAlpha=logoAlpha;ctx.shadowBlur=0;ctx.drawImage(logo,350,0,1340,850,-lw/2,-lh/2,lw,lh);ctx.restore();}
  if(!ready(loaded['snowy-owl-v2'])&&!ready(loaded['pearl-owl-v2'])&&ready(logo)){ctx.globalAlpha=.8;ctx.drawImage(logo,350,0,1340,850,cx-visualW*.32,cy-visualW*.2,visualW*.64,visualW*.405);}
  // Three conceptual orbit nodes: useful brand meaning, without dashboard clutter.
  if(!mobile){['行情','籌碼','題材'].forEach((word,i)=>{const p=t*.10+i*TAU/3,x=cx+Math.cos(p)*visualW*.55,y=cy+Math.sin(p)*visualW*.25;ctx.globalAlpha=.7;ctx.fillStyle=colors.ink;ctx.font='11px "Microsoft JhengHei",sans-serif';ctx.textAlign='center';ctx.fillText(word,x,y);ctx.globalAlpha=.25;ctx.strokeStyle=colors.accent;ctx.beginPath();ctx.moveTo(x,y+8);ctx.lineTo(mix(x,cx,.16),mix(y,cy,.16));ctx.stroke();});}
  ctx.globalAlpha=1;
  state={cycle,stage,pose:side,fishCount:count,dispersing,yaw,headX:lookX,headY:lookY,wing,logoAlpha,logoPulse,mosaicAlpha:clamp(mosaicAlpha),natural,sculpted,ready:names.every(n=>ready(loaded[n])),reduced:reduce,fish:fish.slice(0,count).map(f=>({id:f.id,x:f.x,y:f.y,vx:f.vx,vy:f.vy}))};
  return state;
 }
 window.FqiArrivalVisual={render,state:()=>({...state}),reset(){last=0;lookX=lookY=yaw=0;ripples=[];fish.forEach(f=>{f.vx=f.vy=f.ox=f.oy=0;});},assets:names.map(n=>'assets/arrival/'+n+'.webp')};
})();
