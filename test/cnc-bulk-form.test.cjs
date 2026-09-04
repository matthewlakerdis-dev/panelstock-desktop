const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

for (const repo of ['panelstock-desktop']) {
 const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
 test(repo+': shared CNC picker keeps search text clear of its icon',()=>assert.match(html,/placeholder:"Search colour, material, size, SKU…",style:\{paddingLeft:"2\.5rem"\}/));
 test(repo+': shared CNC picker follows SOH material sorting',()=>assert.match(html,/function CncStockPicker[\s\S]+?sortSohItems=items=>groupByMaterialLargestFirst/));
 const normalize=html.slice(html.indexOf('function normalizeCncInput('),html.indexOf('function compareCncOrders('));
 const start=html.indexOf('  function prepareCncBulkRows(');
 const end=html.indexOf(repo==='panelstock'?'  function CncTab(':'  function CncPage(',start);
 const source=normalize+html.slice(start,end);
 const prepare=vm.runInNewContext(source+';prepareCncBulkRows');
 const stock={stockItemType:'variant',stockItemId:'stock-1',stockSku:'SKU-1',sheetWidth:4000,sheetHeight:1500};
 test(repo+': bulk entry shares and normalizes order details without changing identifiers',()=>{
  const result=prepare({...stock,orderNumber:'Order #0007',jobReference:'mERIDIAN CONSTRUCTIONS'},[{sheetNumber:' 01 ',panelNumber:'a73-219',totalPanelArea:'4.2'},{sheetNumber:'2',panelNumber:'0002',totalPanelArea:'3.1'},{sheetNumber:'',panelNumber:''}]);
  assert.equal(result.errors.length,0);assert.equal(result.rows.length,2);
  assert.deepEqual(JSON.parse(JSON.stringify(result.rows)),[
   {orderNumber:'0007',jobReference:'Meridian Constructions',stockItemType:'variant',stockItemId:'stock-1',stockSku:'SKU-1',sheetWidth:4000,sheetHeight:1500,totalPanelArea:4.2,sheetNumber:'01',panelNumber:'A73-219'},
   {orderNumber:'0007',jobReference:'Meridian Constructions',stockItemType:'variant',stockItemId:'stock-1',stockSku:'SKU-1',sheetWidth:4000,sheetHeight:1500,totalPanelArea:3.1,sheetNumber:'2',panelNumber:'0002'}]);
 });
 test(repo+': invalid or duplicate lines reject the entire batch',()=>{
  for(const [order,lines] of [
   [{...stock,orderNumber:'Order',jobReference:'Test'},[{sheetNumber:'1',panelNumber:'A',totalPanelArea:1}]],
   [{orderNumber:'7',jobReference:'Test'},[{sheetNumber:'1',panelNumber:'A'},{sheetNumber:'2',panelNumber:' '}]],
   [{orderNumber:'7',jobReference:'Test'},[{sheetNumber:'1',panelNumber:'a'},{sheetNumber:'1',panelNumber:'A'}]],
   [{orderNumber:'7',jobReference:'Test'},[{sheetNumber:'',panelNumber:''}]]
  ]){const r=prepare(order,lines);assert.ok(r.errors.length);assert.equal(r.rows.length,0);}
  assert.equal(prepare({...stock,orderNumber:'7',jobReference:'Test'},[{sheetNumber:'1',panelNumber:'A',totalPanelArea:1},{sheetNumber:'2',panelNumber:'A',totalPanelArea:1}]).rows.length,2);
 });
 test(repo+': form adds/removes rows, preserves shared details and saves once',()=>{
  const states=[],refs=[];let cursor=0,refCursor=0,saves=[],closed=0;
  const render=vm.runInNewContext(source+';CncBulkForm',{
   useState:initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},
   useRef:initial=>{const i=refCursor++;return refs[i]??(refs[i]={current:initial});},
   Trash2:()=>{},CncStockPicker:props=>({tag:'picker',...props}),inputCls:'input',import_jsx_runtime:{jsx:(type,props,key)=>({tag:type,...props,key})}
  });
  const flatten=n=>n&&typeof n==='object'?[n,...[n.children].flat().flatMap(flatten)]:[];
  let tree,nodes;
  const variants=[{id:'stock-1',sku:'SKU-1',qty:3,color:'White',material:'ACM',thickness:4,width:4000,height:1500}];
  const refresh=()=>{cursor=0;refCursor=0;tree=render({variants,offcuts:[],onSave:rows=>saves.push(rows),onClose:()=>closed++});nodes=flatten(tree);};
  const button=text=>nodes.find(n=>n.tag==='button'&&n.children===text);
  refresh();button('+ Add line').onClick();refresh();assert.equal(nodes.filter(n=>n.tag==='input').length,8);
  nodes.find(n=>n['aria-label']==='Remove line 2').onClick();refresh();assert.equal(nodes.filter(n=>n.tag==='input').length,5);
  nodes.find(n=>n.tag==='input'&&n.placeholder==='e.g. 001234').onChange({target:{value:'Order 7'}});refresh();
  nodes.find(n=>n['aria-label']==='Sheet number line 1').onChange({target:{value:'1'}});refresh();
  tree.onSubmit({preventDefault(){}});refresh();assert.equal(saves.length,0);assert.ok(nodes.some(n=>n.role==='alert'));
  nodes.find(n=>n['aria-label']==='Panel ID line 1').onChange({target:{value:'a1'}});refresh();
  nodes.find(n=>n['aria-label']==='Total panel area line 1').onChange({target:{value:'4.2'}});refresh();
  tree.onSubmit({preventDefault(){}});assert.equal(saves.length,0);refresh();
  nodes.find(n=>n.tag==='input'&&n.placeholder==='e.g. Meridian Constructions').onChange({target:{value:'Test'}});refresh();
  nodes.find(n=>typeof n.tag==='function'&&n.onSelect).onSelect(variants[0]);refresh();
  tree.onSubmit({preventDefault(){}});assert.equal(saves.length,1);assert.equal(closed,1);assert.equal(saves[0][0].panelNumber,'A1');
 });
}
