const assert=require('assert'),fs=require('fs');
const {shiftMonths,phase,members}=require('../apps/web/assets/exhibition-calendar.js');
const data=JSON.parse(fs.readFileSync('apps/web/assets/exhibitions.json','utf8'));
const catalog=require('./fixtures/exhibition-classification.cjs');
assert.equal(shiftMonths('2027-01-31',-2),'2026-11-30');
assert.equal(shiftMonths('2028-04-30',-2),'2028-02-29');
assert.equal(phase({status:'confirmed',start:'2027-01-31',end:'2027-02-02'},'2026-11-29'),'future');
assert.equal(phase({status:'confirmed',start:'2027-01-31',end:'2027-02-02'},'2026-11-30'),'reminder');
assert.equal(phase({status:'confirmed',start:'2027-01-31',end:'2027-02-02'},'2027-02-01'),'live');
assert.equal(phase({status:'confirmed',start:'2027-01-31',end:'2027-02-02'},'2027-02-03'),'ended');
assert.equal(phase({status:'postponed',start:null,end:null},'2026-10-24'),'pending');
assert.equal(new Set(data.events.map(e=>e.id)).size,data.events.length);
for(const e of data.events){
 assert(e.sourceUrl.startsWith('https://'));
 if(e.status==='confirmed'){assert(e.start<=e.end);assert(!Number.isNaN(Date.parse(e.start)));}
 else assert.equal(e.start,null);
 for(const t of e.themes)assert(catalog.themes[t],t);

 const rows=members(e,catalog);
 assert.equal(new Set(rows.map(r=>r.code)).size,rows.length);
 for(const c of e.companies){assert(catalog.industries[c.code],c.code);assert(catalog.names[c.code],c.code);assert(c.sourceUrl.startsWith('https://'));}
}
const itf=data.events.find(e=>e.id==='itf-2026');assert.equal(members(itf,catalog).filter(r=>r.evidence.length).length,4);
const health=data.events.find(e=>e.id==='healthcare-2026');assert.equal(members(health,catalog).find(r=>r.code==='6645').evidence[0].kind,'technology');
console.log('PASS dates, leap/month-end reminder boundary, status lifecycle, sources and classification mappings');
