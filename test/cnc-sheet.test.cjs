const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(match[1].trim())new vm.Script(match[1]);
const handler=html.slice(html.indexOf('    function completeCncSheet('),html.indexOf('    function removeCncPanel('));
assert.ok(!handler.includes('window.confirm'));
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
  assert.equal(r.prompts.length,0);
  assert.equal(r.next[0].status,'completed');assert.equal(r.next[1].status,'completed');
  assert.equal(r.next[0].completedBy,'worker');assert.equal(r.next[0].completedAt,r.next[1].completedAt);
  assert.equal(r.next[2].completedBy,'earlier-worker');assert.equal(r.next[2].completedAt,'2026-01-01');
  for(const p of r.next.slice(3))assert.equal(p.status,'pending');
  assert.match(r.logs[0].desc,/2 panels/);
  assert.deepEqual(Object.keys(r.writes[0]),['cncPanels']);
});
test('an already completed sheet makes no changes',()=>{

  const r=run(true,[]);assert.equal(r.writes.length,0);assert.equal(r.prompts.length,0);
});

test('sheet dialog cancels without completing and requires its confirm button',()=>{
  const source=html.slice(html.indexOf('  function CncSheetDialog('),html.indexOf('  function Cnc',html.indexOf('  function CncSheetDialog(')+10));
  let closed=0,confirmed=0;
  const context={useRef:()=>({current:null}),useEffect:()=>{},import_jsx_runtime:{jsx:(type,props)=>({type,...props})}};
  const render=vm.runInNewContext(source+';CncSheetDialog',context);
  const tree=render({sheet:{orderNumber:'ORDER-A',sheetNumber:'1'},count:2,onClose:()=>closed++,onConfirm:()=>confirmed++});
  function flatten(node){return node && typeof node==='object'?[node,...[node.children].flat().flatMap(flatten)]:[];}
  const nodes=flatten(tree),dialog=nodes.find(n=>n.role==='dialog');
  assert.equal(dialog['aria-modal'],true);
  const cancel=nodes.find(n=>n.type==='button' && n.children==='Cancel');
  const confirm=nodes.find(n=>n.type==='button' && n.children==='Complete sheet');
  cancel.onClick();assert.equal(closed,1);assert.equal(confirmed,0);
  dialog.onKeyDown({key:'Escape',preventDefault(){},stopPropagation(){}});assert.equal(closed,2);assert.equal(confirmed,0);
  confirm.onClick();assert.equal(confirmed,1);
  assert.ok(nodes.some(n=>typeof n.children==='string' && n.children.includes('all 2 pending panels')));
  const empty=flatten(render({sheet:{orderNumber:'ORDER-A',sheetNumber:'1'},count:0,onClose(){},onConfirm(){}}));
  assert.equal(empty.find(n=>n.type==='button' && n.children==='Complete sheet').disabled,true);
});
test('orders group exactly and retain their expansion state across refreshed data',()=>{
 const start=html.indexOf('  function CncOrderGroups('),end=html.indexOf('\n  function ',start+5);
 let state=new Map();
 const render=vm.runInNewContext(html.slice(start,end)+';CncOrderGroups',{useState:()=>[state,fn=>state=fn(state)],import_jsx_runtime:{jsx:(type,props,key)=>({type,...props,key})}});
 const rows=[{id:'1',orderNumber:'A',status:'pending'},{id:'2',orderNumber:'A',status:'completed'},{id:'3',orderNumber:'B',status:'pending'}];
 const props={panels:rows,allPanels:rows,query:'',renderGroup:group=>group};
 let tree=render(props);assert.equal(tree.children.length,2);assert.equal(tree.children[0].children[0]['aria-expanded'],false);
 tree.children[0].children[0].onClick();tree=render({...props,panels:rows.map(p=>({...p}))});
 assert.equal(tree.children[0].children[0]['aria-expanded'],true);assert.equal(tree.children[0].children[1].children.length,2);
 assert.equal(tree.children[1].children[0]['aria-expanded'],false);
 tree=render({...props,query:'A',panels:rows.slice(0,2)});assert.equal(tree.children.length,1);assert.equal(tree.children[0].children[0]['aria-expanded'],true);
});
test('job references are collapsible and separate the same order across different jobs',()=>{
 const start=html.indexOf('  function CncJobGroups('),end=html.indexOf('\n  function ',start+5);
 const normStart=html.indexOf('function normalizeCncInput('),normEnd=html.indexOf('  function CncJobGroups(',normStart);
 let state=new Map();
 const context={useState:()=>[state,fn=>state=fn(state)],CncOrderGroups:()=>{},import_jsx_runtime:{jsx:(type,props,key)=>({type,...props,key})}};
 const render=vm.runInNewContext(html.slice(normStart,normEnd)+html.slice(start,end)+';CncJobGroups',context);
 const panels=[{orderNumber:'1',jobReference:'JOB a',status:'pending'},{orderNumber:'1',jobReference:'job A',status:'completed'},{orderNumber:'1',jobReference:'JOB B',status:'pending'},{orderNumber:'2',jobReference:'',status:'pending'}];
 const props={panels,allPanels:panels,query:'',renderGroup:rows=>rows};
 let tree=render(props);assert.equal(tree.children.length,3);assert.equal(tree.children[0].children[0].children[0].children,'Job A');
 assert.equal(tree.children[2].children[0].children[0].children,'No job reference');
 assert.equal(tree.children[0].children[1].hidden,true);
 tree.children[0].children[0].onClick();tree=render(props);assert.equal(tree.children[0].children[1].hidden,false);
 assert.equal(tree.children[0].children[1].children.allPanels.length,2);
 assert.equal(tree.children[1].children[1].hidden,true);
});