const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
const normalizers=html.slice(html.indexOf('function normalizeCncInput('),html.indexOf('function compareCncOrders('));
function importPage(quantity=1){
  let saved,error,closed=false;
  const start=html.indexOf('function review(){const rows=[];for(const page of pages)');
  const submit=html.slice(start,html.indexOf('    return h(',start));
  vm.runInNewContext(normalizers+submit+';submit();',{
    pages:[{page:1,orderNumber:'Order 07',jobReference:'QA Job',sheetNumber:'1',panelNumbers:'21, 22',quantity,stockItemType:'variant',stockItemId:'stock',stockSku:'QA',sheetWidth:4000,sheetHeight:1500,panelArea:4.2}],
    cncPanels:[],setError:value=>error=value,onSave:rows=>saved=JSON.parse(JSON.stringify(rows)),onClose:()=>closed=true
  });
  assert.equal(error,undefined);assert.equal(closed,true);return saved;
}
test('PDF import marks the total as sheet-scoped for every panel and sheet copy',()=>{
  const rows=importPage(2);assert.equal(rows.length,4);
  assert.deepEqual(rows.map(row=>row.sheetNumber),['1','1','1.2','1.2']);
  for(const row of rows){assert.equal(row.panelAreaScope,'sheet');assert.equal(row.totalPanelArea,4.2);}
  const sum=vm.runInNewContext(normalizers+';sumCncPanelArea');
  assert.equal(sum(rows.slice(0,2)),4.2);assert.equal(sum(rows.slice(2)),4.2);
  assert.equal(sum([{totalPanelArea:1.2},{totalPanelArea:3}]),4.2);
});
test('explicit historical corrections keep their existing per-panel allocation and completion metadata',()=>{
  const start=html.indexOf('    function backfillCncDimensions('),end=html.indexOf('\n    function ',start+10);
  const panels=['21','22'].map(id=>({id,status:'completed',completedBy:'operator',completedAt:'2026-08-01',totalPanelArea:4.2,panelAreaScope:'sheet'}));
  let saved;
  vm.runInNewContext(html.slice(start,end)+';backfillCncDimensions(["21","22"],4000,1500,4.2);',{
    cncPanels:panels,transactions:[],username:'qa',uid:()=> 'test',setCncPanels(){},setTransactions(){},persist:fields=>saved=fields.cncPanels,showToast(){}
  });
  const sum=vm.runInNewContext(normalizers+';sumCncPanelArea');
  assert.equal(sum(saved),4.2);
  for(const row of saved){assert.equal(row.totalPanelArea,2.1);assert.equal(row.panelAreaScope,'panel');assert.equal(row.completedBy,'operator');assert.equal(row.completedAt,'2026-08-01');}
  assert.equal(panels[0].totalPanelArea,4.2);
});

test('CNC bulk persistence retains sheet area scope without changing the entered total',()=>{
  const rows=importPage(),start=html.indexOf('    function addCncPanelsBulk('),end=html.indexOf('\n    function ',start+10);
  let saved,id=0;
  vm.runInNewContext(html.slice(start,end)+';addCncPanelsBulk(rows);',{
    rows,normalizeCncInput:row=>row,cncDuplicateKey:row=>row.panelNumber,validateCncSchedule:()=>'',uid:()=>String(++id),cncPanels:[],username:'qa',transactions:[],
    setCncPanels(){},setTransactions(){},persist:fields=>saved=fields.cncPanels,logTxn(){},showToast(){}
  });
  assert.equal(saved.length,2);for(const row of saved){assert.equal(row.panelAreaScope,'sheet');assert.equal(row.totalPanelArea,4.2);}
});
