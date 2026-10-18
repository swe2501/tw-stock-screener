const {test}=require('node:test'),assert=require('node:assert/strict');
const {validState,backupText,mergeBackup}=require('../../apps/mobile/src/workspace-model');
const stamp='2026-10-18T00:00:00Z';
const stock=(code='2330',note='目前裝置的研究')=>({code,name:'研究標的',note,addedAt:stamp});
const draft=(id='one')=>({id,name:'研究規則',entry:'close > SMA(close, 20)',exit:'',updatedAt:stamp,risk:{stop:5,take:10,maxBars:20}});
test('local workspace roundtrips notes and formulas without executing text',()=>{
 const state={watch:[stock()],drafts:[draft()]};assert.ok(validState(state));assert.deepEqual(mergeBackup({watch:[],drafts:[]},backupText(state)),state);
 const malicious={watch:[stock('2330','<script>fetch("private")</script>')],drafts:[draft()]};assert.ok(validState(malicious));assert.equal(mergeBackup({watch:[],drafts:[]},backupText(malicious)).watch[0].note,malicious.watch[0].note);
});
test('backup merge preserves current records on conflicts and adds only new identities',()=>{
 const current={watch:[stock()],drafts:[draft()]},incoming={watch:[stock('2330','不覆寫原筆記'),stock('2317')],drafts:[draft(),draft('two')]};
 const merged=mergeBackup(current,backupText(incoming));assert.equal(merged.watch.length,2);assert.equal(merged.drafts.length,2);assert.equal(merged.watch[0].note,'目前裝置的研究');assert.equal(current.watch.length,1);
});
test('reject duplicate identities, corrupted versions, oversized notes and invalid risk',()=>{
 for(const state of [{watch:[stock(),stock()],drafts:[]},{watch:[stock('2330','x'.repeat(2001))],drafts:[]},{watch:[],drafts:[{...draft(),risk:{stop:100,take:0,maxBars:0}}]},{watch:[],drafts:[{...draft(),updatedAt:'no-date'}]}])assert.equal(validState(state),false);
 assert.throws(()=>mergeBackup({watch:[],drafts:[]},'{bad'));assert.throws(()=>mergeBackup({watch:[],drafts:[]},JSON.stringify({format:'other',version:1,state:{watch:[],drafts:[]}})));
});
