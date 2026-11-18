const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8'),a=html.indexOf('    const selectedProject=',html.indexOf('  function SchedulePage')),b=html.indexOf('    const anchor=',a);
function render(editor,orders){let current=editor,pdfOrder=null;const context={editor,projects:[{id:'p1',name:'One'},{id:'p2',name:'Two'},{id:'factory',scheduleOnly:true}],orders:orders||[{id:'a',projectId:'p1',orderNumber:'1',orderType:'Panels'},{id:'b',project:' TWO ',orderNumber:'2',orderType:'Brackets'}],e:(type,props,...children)=>({type,props,children}),field:()=>({type:'input'}),update:(key,value)=>{current={...current,[key]:value}},setPdfOrder:order=>{pdfOrder=order},setEditor:fn=>{current=fn(current)}};return {tree:vm.runInNewContext(html.slice(a,b)+';activityField',context),current:()=>current,pdf:()=>pdfOrder};}
test('activity selects only the selected project orders and saves order identity',()=>{const h=render({projectId:'p1'}),select=h.tree.children[1];assert.equal(select.type,'select');assert.equal(select.children[2].length,1);assert.equal(select.children[2][0].props.value,'a');select.props.onChange({target:{value:'a'}});assert.equal(h.current().orderId,'a');assert.equal(h.current().title,'Order 1 · Panels');const other=render({projectId:'p2'}).tree.children[1];assert.equal(other.children[2][0].props.value,'b');});
test('activity waits for project selection and factory keeps free text',()=>{assert.equal(render({projectId:''}).tree.children[1].props.disabled,true);assert.equal(render({projectId:'factory'}).tree.type,'input');});

test('panel and gate dropdown choices and saved activities show villa or location',()=>{
 for(const orderType of ['Panels','Gate','Bin Gate','Buggy Gate']){
  const h=render({projectId:'p1'},[{id:'a',projectId:'p1',orderNumber:'1',orderType,locationNotes:' Villa 9\n Level 2 '}]),select=h.tree.children[1];
  assert.equal(select.children[2][0].children[0],`Order 1 · ${orderType} · Villa 9 Level 2`);
  select.props.onChange({target:{value:'a'}});assert.equal(h.current().title,`Order 1 · ${orderType} · Villa 9 Level 2`);
 }
});

test('Other allows a required custom activity for projects without orders',()=>{
 const h=render({projectId:'p1'},[]),select=h.tree.children[1];
 assert.equal(select.children[3].props.value,'__other__');select.props.onChange({target:{value:'__other__'}});
 assert.equal(h.current().orderId,'');assert.equal(h.current().activityOther,true);
 const custom=render(h.current(),[]),input=custom.tree.children[2].children[1];assert.equal(input.props.required,true);
 input.props.onChange({target:{value:'Site clean up'}});assert.equal(custom.current().title,'Site clean up');
});
test('saved custom activities reopen under Other and can switch back to an order',()=>{
 const h=render({id:'entry',projectId:'p1',orderId:'',title:'Site clean up'}),select=h.tree.children[1];
 assert.equal(select.props.value,'__other__');assert.equal(h.tree.children[2].children[1].props.value,'Site clean up');
 select.props.onChange({target:{value:'a'}});assert.equal(h.current().activityOther,false);assert.equal(h.current().orderId,'a');assert.equal(h.current().title,'Order 1 · Panels');
});

test('order choices and saved titles use panel Location and gate Villa before legacy notes',()=>{
 for(const order of [{id:'a',projectId:'p1',orderNumber:'1',orderType:'Panels',location:'North elevation',locationNotes:'Old note'},...['Gate','Bin Gate','Buggy Gate'].map(orderType=>({id:'a',projectId:'p1',orderNumber:'1',orderType,villa:'V135',location:'Old bay',locationNotes:'Old note'}))]){
  const h=render({projectId:'p1'},[order]),select=h.tree.children[1],label=`Order 1 · ${order.orderType} · ${order.orderType==='Panels'?order.location:order.villa}`;assert.equal(select.children[2][0].children[0],label);select.props.onChange({target:{value:'a'}});assert.equal(h.current().title,label);
 }
});

test('dispatched orders are hidden while previously scheduled orders are marked and remain selectable',()=>{
 const orders=[{id:'shipped',projectId:'p1',orderNumber:'1',status:'dispatched'},{id:'active',projectId:'p1',orderNumber:'2',orderType:'Panels',alreadyScheduled:true}],h=render({projectId:'p1'},orders),select=h.tree.children[1];
 assert.equal(select.children[2].length,1);assert.equal(select.children[2][0].props.value,'active');assert.equal(select.children[2][0].children[0],'Order 2 · Panels · Already scheduled');select.props.onChange({target:{value:'active'}});assert.equal(h.current().title,'Order 2 · Panels');
});

test('selecting an order offers its PDF without changing the schedule draft',()=>{const draft={projectId:'p1',orderId:'a',title:'Order 1 · Panels',notes:'Keep these notes',date:'2026-11-17'},h=render(draft),button=h.tree.children.find(node=>node?.type==='button'&&node.children.includes('Open order PDF'));assert.ok(button);assert.equal(button.props.type,'button');button.props.onClick();assert.equal(h.pdf().id,'a');assert.equal(h.current(),draft);});
test('Other, no order, and mismatched projects do not offer an order PDF',()=>{for(const draft of [{projectId:'p1'},{projectId:'p1',activityOther:true,title:'Collect goods'},{projectId:'p2',orderId:'a'}]){const h=render(draft);assert.equal(h.tree.children.some(node=>node?.type==='button'&&node.children.includes('Open order PDF')),false);}});

test('all order types show their explicit Location in schedule activities while historical non-panel notes stay notes',()=>{
 for(const orderType of ['Fabrication','Fibre Cement','Fixings','Consumables']){
  const h=render({projectId:'p1'},[{id:'a',projectId:'p1',orderNumber:'7',orderType,location:'Zone B',locationNotes:'Keep this note separate'}]);const select=h.tree.children[1];assert.equal(select.children[2][0].children[0],`Order 7 · ${orderType} · Zone B`);select.props.onChange({target:{value:'a'}});assert.equal(h.current().title,`Order 7 · ${orderType} · Zone B`);
 }
});
