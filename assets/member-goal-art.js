/* Original project artwork generated with imagegen; see goal-art/README.md. */
(() => {'use strict';
const themes={immortal:'韭菜成仙',garden:'心願花園',mountain:'登峰之旅',space:'星際旅程',castle:'夢想城堡',pet:'陪伴小獸',ocean:'珊瑚海洋',gem:'光之晶石',train:'夢想列車'};
const cells={garden:[0,0],mountain:[1,0],space:[2,0],castle:[0,1],pet:[1,1],ocean:[2,1],gem:[0,2],train:[1,2]};
function scene(theme,ratio,gender='neutral',motion='full'){
 if(!Object.hasOwn(themes,theme))theme='immortal';
 const p=Math.max(0,Math.min(1,+ratio||0)),stage=Math.min(4,Math.floor(p*5)),mode=['full','lite','static'].includes(motion)?motion:'static',row=gender==='female'?0:gender==='male'?1:2,frame=Math.min(4,Math.floor(p*4)),blend=p*4-frame;
 const sprite=(col,opacity)=>`<div class="mt-character-sprite" style="--sprite-x:${col*25}%;--sprite-y:${row*50}%;opacity:${opacity}"></div>`;
 const art=theme==='immortal'?sprite(frame,1)+(blend>0&&frame<4?sprite(frame+1,blend):''):`<div class="mt-companion-sprite" style="--sprite-x:${cells[theme][0]*50}%;--sprite-y:${cells[theme][1]*50}%;--companion-growth:${.86+p*.14}"></div>`;
 const captions=theme==='immortal'?['萌芽・初見','啟程・修習','凝心・蛻變','御風・將成','化境・成仙']:['初見・新的開始','啟程・累積一點','同行・日漸成長','將至・堅定前行','達成・珍藏此刻'];
 return `<div class="mt-cinema mt-motion-${mode}" data-stage="${stage}" role="img" aria-label="${themes[theme]}，${Math.round(p*100)}% 目標進度"><div class="mt-cinema-halo"></div><div class="mt-character-layer">${art}</div><div class="mt-cinema-mist"></div><div class="mt-cinema-particles">${Array.from({length:9},(_,i)=>`<i style="--i:${i};top:${20+i*7}%"></i>`).join('')}</div><span class="mt-scene-caption">${captions[stage]}</span></div>`;
}
window.AcademyGoalArt={themes,scene};
})();
