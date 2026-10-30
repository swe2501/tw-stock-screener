/* Same-origin admin status bridge. This view never calls the task API. */
(function(){
  'use strict';
  const permitted={news:17,chip:7,tech:7,macro:7,risk:14,etf:7,data:6,boss:0};
  let roles=[];
  function decorate(){
    document.querySelectorAll('.department').forEach(b=>{
      const existing=b.querySelector('.existing-role-count');if(existing)existing.remove();
      const count=roles.filter(r=>r.department===+b.dataset.department).length;if(!count)return;
      const badge=document.createElement('small');badge.className='existing-role-count';badge.textContent=count+' 組';badge.title='既有排程角色';b.append(badge);
    });
  }
  function render(){
    const content=document.querySelector('#exploreContent');if(!content||!document.querySelector('.profile-heading'))return;
    content.querySelector('.live-department-roles')?.remove();
    const id=ForesightOffice.selectedDepartment,items=roles.filter(r=>r.department===id);
    if(!items.length)return;
    const section=document.createElement('section');section.className='live-department-roles';
    const title=document.createElement('h3');title.textContent='現有排程角色';section.append(title);
    items.forEach(role=>{
      const row=document.createElement('div');row.className='live-role-row';
      const name=document.createElement('b');name.textContent=role.name;
      const state=document.createElement('span');state.className='live-role-state';state.dataset.state=role.status;state.textContent=role.statusText;
      const button=document.createElement('button');button.type='button';button.textContent='查看工作紀錄 ↗';button.onclick=()=>{parent.postMessage({type:'foresight-office-open-role',key:role.key},location.protocol==='file:'?'*':location.origin);document.querySelector('#officeExploreDialog').close();};
      row.append(name,state,button);section.append(row);
    });
    const note=document.createElement('p');note.textContent=id===0?'總管為既有排程協調角色，不代表執行長或總經理已自動化。':'狀態沿用 AI 研究室現有資料；各組仍使用原本的排程與工作紀錄。';section.append(note);
    const footer=content.querySelector('.profile-footer');if(footer)footer.textContent='既有排程狀態如下；新任務另於任務中心指派與驗收。';content.append(section);
  }
  addEventListener('message',event=>{
    if(parent===window||event.source!==parent||(event.origin!==location.origin&&!(location.protocol==='file:'&&(event.origin==='null'||event.origin==='file://')))||event.data?.type!=='foresight-office-departments'||!Array.isArray(event.data.roles))return;
    roles=event.data.roles.filter(r=>r&&permitted[r.key]===r.department).map(r=>({key:r.key,department:r.department,name:String(r.name).slice(0,70),status:['done','work','stuck','idle','warn'].includes(r.status)?r.status:'unknown',statusText:String(r.statusText).slice(0,24)}));
    decorate();render();
  });
  const observer=new MutationObserver(()=>{if(document.querySelector('.profile-heading')&&!document.querySelector('.live-department-roles'))render();});
  observer.observe(document.querySelector('#exploreContent'),{childList:true});
  if(parent!==window)parent.postMessage({type:'foresight-office-ready'},location.protocol==='file:'?'*':location.origin);
})();
