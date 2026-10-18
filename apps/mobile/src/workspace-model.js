function validState(s){
 if(!s||!Array.isArray(s.watch)||s.watch.length>100||!Array.isArray(s.drafts)||s.drafts.length>30)return false;
 const watches=new Set(),drafts=new Set();
 for(const v of s.watch){if(!v||typeof v.code!=='string'||!/^[0-9]{4,6}[A-Z]?$/.test(v.code)||watches.has(v.code)||typeof v.name!=='string'||v.name.length>80||typeof v.note!=='string'||v.note.length>2000||typeof v.addedAt!=='string'||!Number.isFinite(Date.parse(v.addedAt)))return false;watches.add(v.code);}
 for(const d of s.drafts){if(!d||typeof d.id!=='string'||!d.id||d.id.length>100||drafts.has(d.id)||typeof d.name!=='string'||!d.name.trim()||d.name.length>60||typeof d.entry!=='string'||!d.entry.trim()||d.entry.length>4000||typeof d.exit!=='string'||d.exit.length>4000||typeof d.updatedAt!=='string'||!Number.isFinite(Date.parse(d.updatedAt)))return false;if(d.risk&&(!Number.isFinite(d.risk.stop)||d.risk.stop<0||d.risk.stop>=100||!Number.isFinite(d.risk.take)||d.risk.take<0||d.risk.take>1000||!Number.isInteger(d.risk.maxBars)||d.risk.maxBars<0||d.risk.maxBars>1000))return false;drafts.add(d.id);}
 return true;
}
function backupText(state){if(!validState(state))throw Error('本機資料格式不完整。');return JSON.stringify({format:'academy.mobile.workspace',version:1,exportedAt:new Date().toISOString(),state},null,2);}
function mergeBackup(current,text){
 if(typeof text!=='string'||text.length>1000000)throw Error('備份過大，最多 100 萬字。');
 let data;try{data=JSON.parse(text);}catch{throw Error('請貼上完整的 JSON 備份內容。');}
 if(data?.format!=='academy.mobile.workspace'||data.version!==1||!validState(data.state)||!validState(current))throw Error('備份版本或資料格式不符合。');
 const watch=[...current.watch,...data.state.watch.filter(v=>!current.watch.some(x=>x.code===v.code))],drafts=[...current.drafts,...data.state.drafts.filter(v=>!current.drafts.some(x=>x.id===v.id))];
 const merged={watch,drafts};if(!validState(merged))throw Error('合併後超過 100 檔自選或 30 個策略，請先整理資料。');return merged;
}
module.exports={validState,backupText,mergeBackup};
