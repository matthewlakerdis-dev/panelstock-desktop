const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
test('catalog creation returns one material definition without creating a sized stock row',()=>{
 const start=html.indexOf('    function addCatalogItem('),end=html.indexOf('    function addCatalogItemsBulk(',start);
 const writes=[];let id=0;
 const item=vm.runInNewContext(html.slice(start,end)+';addCatalogItem({color:"Silver",material:"ACP",thickness:4,width:1200,height:2400});',{
  uid:()=>String(++id),genSku:()=> 'TEST-NEW',catalog:[],catalogKey:item=>`${item.color}|${item.material}|${item.thickness}`,setCatalog(){},persist:v=>writes.push(v),logTxn(){},showToast(){}
 });
 assert.equal(writes.length,1);assert.equal(item.id,writes[0].catalog[0].id);assert.equal(writes[0].variants,undefined);assert.equal(item.width,0);assert.equal(item.height,0);
});

function receiptRun(qty,{admin=true,existing=false,onHand=10}={}) {
 const row={material:'ACP',color:'Silver',thickness:4,width:1200,height:2400};
 const catalog=existing?[{...row,id:'cat',sku:'TEST'}]:[],variants=existing?[{...row,id:'v',catalogId:'cat',sku:'TEST',qty:onHand}]:[];
 const start=html.indexOf('    function receiveMaterialStock('),end=html.indexOf('    function receiveStock(',start);
 const validation=html.slice(html.indexOf('  function prepareCatalogBulkRows('),html.indexOf('  function CatalogBulkForm('));
 let writes=[],logs=[],id=0;
 const error=vm.runInNewContext(validation+html.slice(start,end)+';receiveMaterialStock({material:row,qty,ref:" PO-123 "});',{row,qty,isAdmin:admin,catalog,variants,uid:()=>String(++id),genSku:()=> 'NEW-SKU',setCatalog(){},setVariants(){},persist:v=>writes.push(v),logTxn:v=>logs.push(v),showToast(){},fmtDim:()=>''});
 return {error,writes,logs};
}
test('popup receipt stages new catalog and received quantity together and records reference',()=>{
 const r=receiptRun(5);assert.equal(r.error,null);assert.equal(r.writes.length,1);assert.equal(r.writes[0].catalog.length,1);assert.equal(r.writes[0].variants[0].qty,5);assert.equal(r.writes[0].variants[0].catalogId,r.writes[0].catalog[0].id);assert.equal(r.logs[0].type,'receipt');assert.equal(r.logs[0].qty,5);assert.equal(r.logs[0].ref,'PO-123');
});
test('existing popup receipt increments stock without duplicating catalog',()=>{
 const r=receiptRun(3,{existing:true});assert.equal(r.error,null);assert.equal(r.writes.length,1);assert.equal(r.writes[0].catalog,undefined);assert.equal(r.writes[0].variants.length,1);assert.equal(r.writes[0].variants[0].qty,13);
});
test('invalid receipt quantities, and overflow make no changes',()=>{
 for(const [qty,options] of [[0,{}],[-1,{}],[1.5,{}],[NaN,{}],[Infinity,{}],[2,{existing:true,onHand:9999999}]]){const r=receiptRun(qty,options);assert.ok(r.error);assert.equal(r.writes.length,0);assert.equal(r.logs.length,0);}
});
test('manual popup requires quantity and prevents duplicate submission',()=>{
 const start=html.indexOf('  function ReceiveMaterialForm('),end=html.indexOf('  function ReceiveMaterialDialog(',start);
 const validation=html.slice(html.indexOf('  function prepareCatalogBulkRows('),html.indexOf('  function CatalogBulkForm('));
 let states=[],cursor=0,saved=[],closed=0;const saving={current:false};
 const item={id:'a',sku:'A',material:'ACP',color:'Silver',thickness:4,width:1200,height:2400};
 const render=vm.runInNewContext(validation+html.slice(start,end)+';ReceiveMaterialForm',{useRef:()=>saving,useState:init=>{const i=cursor++;if(!(i in states))states[i]=init;return [states[i],v=>states[i]=v];},inputCls:'',SheetMeasureGuide:'measure-guide',X:'x',swatchColour:()=>'',fmtDim:()=>'',import_jsx_runtime:{jsx:(tag,props)=>({tag,...props})}});
 const flatten=n=>n&&typeof n==='object'?[n,...[n.children].flat().flatMap(flatten)]:[];
 const draw=()=>{cursor=0;return render({catalog:[item],variants:[],onReceiveStock:data=>{saved.push(data);return null;},onClose:()=>closed++});};
 let tree=draw();assert.ok(!flatten(tree).some(n=>n.placeholder?.startsWith('Search')));states[0]={material:'ACP',color:'Silver',thickness:'4',width:'1200',height:'2400'};tree=draw();tree.onSubmit({preventDefault(){}});assert.equal(saved.length,0);
 tree=draw();const labels=flatten(tree).filter(n=>n.tag==='label');labels.find(n=>n.children[0]==='Quantity received *').children[1].onChange({target:{value:'7'}});tree=draw();
 tree=draw();tree.onSubmit({preventDefault(){}});tree.onSubmit({preventDefault(){}});assert.equal(saved.length,1);assert.equal(saved[0].qty,7);assert.equal(closed,1);
});

test("users can receive a new material from the popup",()=>{const r=receiptRun(2,{admin:false});assert.equal(r.error,null);assert.equal(r.writes[0].variants[0].qty,2);});
