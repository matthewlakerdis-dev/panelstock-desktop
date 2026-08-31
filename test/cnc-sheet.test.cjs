const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(match[1].trim())new vm.Script(match[1]);
const handler=html.slice(html.indexOf('    function completeCncSheet('),html.indexOf('    function removeCncPanel('));
assert.ok(handler.includes('window.confirm'));
function run(accept=true,panels) {
  const base={orderNumber:'ORDER-A',sheetNumber:'1',status:'pending'};
  const cncPanels=panels??[
    {...base,id:'a',panelNumber:'1'}, {...base,id:'b',panelNumber:'2'},
    {...base,id:'done',status:'completed',completedBy:'earlier-worker',completedAt:'2026-01-01'},
    {...base,id:'other-order',orderNumber:'ORDER-B'}, {...base,id:'other-sheet',sheetNumber:'2'},
    {...base,id:'leading-zero',sheetNumber:'01'}
  ];
  const result={writes:[],logs:[],prompts:[],before:JSON.stringify(cncPanels)};
  vm.runInNewContext(handler+';completeCncSheet("ORDER-A","1");',{
    cncPanels,username:'worker',window:{confirm:message=>{result.prompts.push(message);return accept;}},
    setCncPanels:next=>result.next=next,persist:next=>result.writes.push(next),logTxn:tx=>result.logs.push(tx),showToast:()=>{}
  });
  assert.equal(JSON.stringify(cncPanels),result.before,'original snapshot remains unchanged');
  return result;
}
test('complete sheet updates all pending panels in exactly that order/sheet in one batch',()=>{
  const r=run();
  assert.equal(r.writes.length,1);
  assert.equal(r.logs.length,1);
  assert.match(r.prompts[0],/all 2 pending panels on Order ORDER-A, Sheet 1/);
  assert.equal(r.next[0].status,'completed');assert.equal(r.next[1].status,'completed');
  assert.equal(r.next[0].completedBy,'worker');assert.equal(r.next[0].completedAt,r.next[1].completedAt);
  assert.equal(r.next[2].completedBy,'earlier-worker');assert.equal(r.next[2].completedAt,'2026-01-01');
  for(const p of r.next.slice(3))assert.equal(p.status,'pending');
  assert.match(r.logs[0].desc,/2 panels/);
  assert.deepEqual(Object.keys(r.writes[0]),['cncPanels']);
});
test('cancel and an already completed sheet make no changes',()=>{
  assert.equal(run(false).writes.length,0);
  const r=run(true,[]);assert.equal(r.writes.length,0);assert.equal(r.prompts.length,0);
});
