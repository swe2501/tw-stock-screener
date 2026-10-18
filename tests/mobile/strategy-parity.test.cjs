const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../apps/web/assets/member-strategy-engine.js'),'utf8').replace(/\r\n/g,'\n');
const native=require('../../apps/mobile/src/vendor/strategy-engine');
test('mobile rule engine snapshot matches website baseline exactly',()=>{
 const digest=crypto.createHash('sha256').update(source).digest('hex'),wrapper=fs.readFileSync(path.join(__dirname,'../../apps/mobile/src/vendor/strategy-engine.js'),'utf8');assert.ok(wrapper.includes('Source SHA256: '+digest));assert.ok(wrapper.replace(/\r\n/g,'\n').includes(source));
});
test('Chinese translation and historical formula results match website engine',()=>{
 const context={window:{},crypto:crypto.webcrypto};vm.runInNewContext(source,context);const web=context.window.AcademyStrategyEngine;
 const code=native.formula.fromChinese('收盤價高於 20 日均線');assert.equal(code,web.formula.fromChinese('收盤價高於 20 日均線'));
 const rows=Array.from({length:40},(_,i)=>({time:new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10),open:100+i,high:101+i,low:99+i,close:100+i,volume:null}));
 assert.deepEqual(native.formula.evaluate(rows,{code}).left,Array.from(web.formula.evaluate(rows,{code}).left));
 assert.throws(()=>native.formula.compile('fetch("private")'));
 const guide=native.formula.createGuide();assert.ok(guide.start().message.includes('本機規則'));assert.ok(guide.send('不知道').choices.length>0);
});
