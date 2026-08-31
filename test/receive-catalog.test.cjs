const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
test('catalog creation returns the new selectable item with zero stock and one linked save',()=>{
 const start=html.indexOf('    function addCatalogItem('),end=html.indexOf('    function addCatalogItemsBulk(',start);
 const writes=[];let id=0;
 const item=vm.runInNewContext(html.slice(start,end)+';addCatalogItem({color:"Silver",material:"ACP",thickness:4,width:1200,height:2400,reorderPoint:5});',{
  uid:()=>String(++id),genSku:()=> 'TEST-NEW',catalog:[],variants:[],setCatalog(){},setVariants(){},persist:v=>writes.push(v),logTxn(){},showToast(){},fmtDim:()=>''
 });
 assert.equal(writes.length,1);assert.equal(item.id,writes[0].catalog[0].id);assert.equal(writes[0].variants[0].catalogId,item.id);assert.equal(writes[0].variants[0].qty,0);
});
test('Receive offers catalog creation only to admins and selects created item without receiving stock',()=>{
 const name=html.includes('  function ReceiveTab(')?'ReceiveTab':'ReceivePage';
 const start=html.indexOf('  function '+name+'('),end=html.indexOf('\n  function ',start+5),source=html.slice(start,end);
 const states=[];let cursor=0,received=0,added=0;
 const jsx=(tag,props)=>({tag,...props});
 const context={useState:init=>{const i=cursor++;if(!(i in states))states[i]=init;return [states[i],v=>states[i]=v];},import_jsx_runtime:{jsx,jsxs:jsx},ReceiveMaterialDialog:'dialog',SectionTitle:'title',PageHeading:'title',Package:'icon',Plus:'plus',Field:'field',CapitalizedInput:'input',Search:'search',Check:'check',inputCls:'',swatchColour:()=>'',fmtDim:()=>''};
 const render=vm.runInNewContext(source+';'+name,context);
 const flatten=n=>n&&typeof n==='object'?[n,...[n.children].flat().flatMap(flatten)]:[];
 const item={id:'new',color:'Silver',material:'ACP',thickness:4,width:1200,height:2400};
 const props={catalog:[],variants:[],onAddCatalogItem:()=>{added++;return item;},onSubmit:()=>received++};
 const draw=isAdmin=>{cursor=0;return flatten(render({...props,isAdmin}));};
 assert.ok(!draw(false).some(n=>n.tag==='button'&&Array.isArray(n.children)&&n.children.includes('Add missing material')));
 const button=draw(true).find(n=>n.tag==='button'&&Array.isArray(n.children)&&n.children.includes('Add missing material'));assert.ok(button);button.onClick();
 const dialog=draw(true).find(n=>n.tag==='dialog');assert.ok(dialog);dialog.onSave([{material:'ACP'}]);dialog.onClose();
 assert.equal(added,1);assert.equal(received,0);assert.equal(states[1].id,'new');assert.equal(states[0],false);
});

test('Receive picker fills editable details and reuses exact existing materials instead of duplicating them',()=>{
 const start=html.indexOf('  function ReceiveMaterialForm('),end=html.indexOf('  function ReceiveMaterialDialog(',start);
 const validation=html.slice(html.indexOf('  function prepareCatalogBulkRows('),html.indexOf('  function CatalogBulkForm('));
 let states=[],cursor=0,chosen=[],saved=[];
 const item={id:'a',sku:'A',material:'ACP',color:'Silver',thickness:4,width:1200,height:2400};
 const render=vm.runInNewContext(validation+html.slice(start,end)+';ReceiveMaterialForm',{useState:init=>{const i=cursor++;if(!(i in states))states[i]=init;return [states[i],v=>states[i]=v];},inputCls:'',X:'x',swatchColour:()=>'',fmtDim:()=>'',import_jsx_runtime:{jsx:(tag,props)=>({tag,...props})}});
 const flatten=n=>n&&typeof n==='object'?[n,...[n.children].flat().flatMap(flatten)]:[];
 const draw=()=>{cursor=0;return render({catalog:[item],variants:[],onSave:rows=>saved.push(rows),onSelectExisting:v=>chosen.push(v),onClose(){}});};
 let tree=draw();flatten(tree).find(n=>n.tag==='button'&&n.className?.includes('text-left')).onClick();tree=draw();assert.equal(states[1].width,'1200');
 tree.onSubmit({preventDefault(){}});assert.equal(chosen.length,1);assert.equal(saved.length,0);
 const labels=flatten(tree).filter(n=>n.tag==='label');const width=labels.find(n=>n.children[0]==='Width (mm) *').children[1];width.onChange({target:{value:'1500'}});tree=draw();tree.onSubmit({preventDefault(){}});assert.equal(saved.length,1);assert.equal(saved[0][0].width,1500);assert.equal(item.width,1200);
 states=[];tree=draw();tree.onSubmit({preventDefault(){}});assert.equal(saved.length,1);assert.ok(states[2].length);
});
