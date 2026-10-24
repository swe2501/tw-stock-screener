const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const html=fs.readFileSync(require('node:path').resolve(__dirname,'../apps/web/index.html'),'utf8');const start=html.indexOf('    function breadthCommentary('),end=html.indexOf('    function loadBreadth(){',start);const context={};vm.runInNewContext(html.slice(start,end),context);const explain=context.breadthCommentary;
test('market breadth observations follow direction, participation and magnitude rules',()=>{
 const cases=[[[.6,.8,700,200,100],'漲勢涵蓋較廣'],[[.6,-.8,200,700,100],'指數與個股表現不同步'],[[-1.81,-1.8,303,959,106],'下跌涵蓋較廣'],[[-.6,.8,700,200,100],'個股表現較指數穩定'],[[.1,.1,490,510,0],'漲跌分布較均衡'],[[2.5,.4,550,400,50],'指數變動較個股明顯'],[[.3,0,300,300,400],'個股表現較為分散']];
 for(const [args,title] of cases){const result=explain(...args);assert.equal(result.title,title);assert.doesNotMatch(result.title+result.text,/買進|賣出|布局|進場|停損|目標價|保證|崩盤|主力出逃/);}
});
test('missing and invalid data cannot produce a market interpretation',()=>{for(const args of [[null,-1,3,9,1],[1,null,3,9,1],[NaN,0,1,1,0],[0,0,0,0,0],[0,0,-1,3,0]])assert.equal(explain(...args).title,'比較資料尚待完整');});
test('display boundaries stay explicit and do not invent strong breadth from a small difference',()=>{assert.equal(explain(.3,.3,590,410,0).title,'個股表現較為分散');assert.equal(explain(.3,.3,600,400,0).title,'漲勢涵蓋較廣');assert.equal(explain(.2,.2,550,450,0).title,'漲跌分布較均衡');});
