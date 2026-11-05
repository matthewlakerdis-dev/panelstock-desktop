const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8'),a=html.indexOf('    const selectedProject=',html.indexOf('  function SchedulePage')),b=html.indexOf('    const anchor=',a);
function render(editor,orders){let current=editor;const context={editor,projects:[{id:'p1',name:'One'},{id:'p2',name:'Two'},{id:'factory',scheduleOnly:true}],orders:orders||[{id:'a',projectId:'p1',orderNumber:'1',orderType:'Panels'},{id:'b',project:' TWO ',orderNumber:'2',orderType:'Brackets'}],e:(type,props,...children)=>({type,props,children}),field:()=>({type:'input'}),setEditor:fn=>{current=fn(current)}};return {tree:vm.runInNewContext(html.slice(a,b)+';activityField',context),current:()=>current};}
test('activity selects only the selected project orders and saves order identity',()=>{const h=render({projectId:'p1'}),select=h.tree.children[1];assert.equal(select.type,'select');assert.equal(select.children[2].length,1);assert.equal(select.children[2][0].props.value,'a');select.props.onChange({target:{value:'a'}});assert.equal(h.current().orderId,'a');assert.equal(h.current().title,'Order 1 · Panels');const other=render({projectId:'p2'}).tree.children[1];assert.equal(other.children[2][0].props.value,'b');});
test('activity waits for project selection and factory keeps free text',()=>{assert.equal(render({projectId:''}).tree.children[1].props.disabled,true);assert.equal(render({projectId:'factory'}).tree.type,'input');});

test('panel and gate dropdown choices and saved activities show villa or location',()=>{
 for(const orderType of ['Panels','Gate']){
  const h=render({projectId:'p1'},[{id:'a',projectId:'p1',orderNumber:'1',orderType,locationNotes:' Villa 9\n Level 2 '}]),select=h.tree.children[1];
  assert.equal(select.children[2][0].children[0],`Order 1 · ${orderType} · Villa 9 Level 2`);
  select.props.onChange({target:{value:'a'}});assert.equal(h.current().title,`Order 1 · ${orderType} · Villa 9 Level 2`);
 }
});
