/* Orbit and screen-space pan share one stable target, including during zoom. */
(function(){
  'use strict';
  window.ForesightCamera={attach:function({stage,camera,read,zoomTo,rotate,panBy,stop,pick,select,mode}){
    const points=new Map();let gesture=null,pinch=0,mid=null;
    function dimensions(){const s=read();return {x:(camera.right-camera.left)/s.zoom,y:(camera.top-camera.bottom)/s.zoom};}
    function screenOffset(dx,dy){const size=dimensions(),right=new THREE.Vector3(),up=new THREE.Vector3();right.setFromMatrixColumn(camera.matrixWorld,0);up.setFromMatrixColumn(camera.matrixWorld,1);return right.multiplyScalar(-dx/stage.clientWidth*size.x).add(up.multiplyScalar(dy/stage.clientHeight*size.y));}
    function zoom(value,x,y){const before=read().zoom,after=Math.max(.65,Math.min(4,value)),rect=stage.getBoundingClientRect(),sx=(x-rect.left)/rect.width-.5,sy=.5-(y-rect.top)/rect.height;
      const size=dimensions(),right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1);
      panBy(right.multiplyScalar(sx*size.x*(1-before/after)).add(up.multiplyScalar(sy*size.y*(1-before/after))));zoomTo(after);
    }
    stage.addEventListener('contextmenu',e=>{if(!e.target.closest('button'))e.preventDefault();});
    stage.addEventListener('pointerdown',e=>{if(![0,1,2].includes(e.button)||e.target.closest('button'))return;e.preventDefault();stop();stage.setPointerCapture(e.pointerId);points.set(e.pointerId,{x:e.clientX,y:e.clientY});gesture={x:e.clientX,y:e.clientY,moved:false,pan:e.button!==0||e.shiftKey||mode()==='pan'};stage.classList.add('dragging');if(points.size===2){const p=[...points.values()];pinch=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);mid={x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2};}});
    stage.addEventListener('pointermove',e=>{if(!points.has(e.pointerId))return;const previous=points.get(e.pointerId);points.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(points.size===2){const p=[...points.values()],distance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),center={x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2};if(mid)panBy(screenOffset(center.x-mid.x,center.y-mid.y));if(pinch)zoom(read().zoom*distance/pinch,center.x,center.y);pinch=distance;mid=center;gesture.moved=true;}
      else{const dx=e.clientX-previous.x,dy=e.clientY-previous.y;if(gesture.pan)panBy(screenOffset(dx,dy));else rotate(-dx*.005,dy*.0035);if(Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>4)gesture.moved=true;}
    });
    function end(e){if(!points.has(e.pointerId))return;points.delete(e.pointerId);if(gesture&&!gesture.moved&&!gesture.pan&&e.type==='pointerup'){const id=pick(e.clientX,e.clientY);if(id!==null)select(id,true);}if(points.size===1&&gesture){const p=[...points.values()][0];gesture.x=p.x;gesture.y=p.y;gesture.moved=true;}if(!points.size){gesture=null;pinch=0;mid=null;stage.classList.remove('dragging');}}
    stage.addEventListener('pointerup',end);stage.addEventListener('pointercancel',end);stage.addEventListener('lostpointercapture',end);
    stage.addEventListener('wheel',e=>{e.preventDefault();stop();zoom(read().zoom*Math.exp(-Math.max(-120,Math.min(120,e.deltaY))*.0015),e.clientX,e.clientY);},{passive:false});
    return {zoomAt:zoom};
  }};
})();
