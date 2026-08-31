const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const source=html.slice(html.indexOf('  function prepareCatalogBulkRows('),html.indexOf('  function CatalogAdmin('));
const prepare=vm.runInNewContext(source+';prepareCatalogBulkRows');
const shared={material:' Solid Aluminium ',color:' White '};
const line={thickness:'3',width:'1200',height:'2400',reorderPoint:''};
test('catalog bulk entry converts dimensions, trims shared fields and defaults reorder to zero',()=>{
 const result=prepare(shared,[line,{...line,width:'1500',reorderPoint:'10'},{}]);
 assert.equal(result.errors.length,0);assert.equal(result.rows.length,2);
 assert.deepEqual(JSON.parse(JSON.stringify(result.rows[0])),{material:'Solid Aluminium',color:'White',thickness:3,width:1200,height:2400,reorderPoint:0});
 assert.equal(result.rows[1].reorderPoint,10);
});
test('catalog bulk rejects incomplete dimensions, invalid reorder points and duplicates without partial rows',()=>{
 for(const bad of [{...line,width:''},{...line,height:'-1'},{...line,thickness:'Infinity'},{...line,reorderPoint:'1.5'},{...line,reorderPoint:'-1'}]){
  const result=prepare(shared,[line,bad]);assert.equal(result.rows.length,0);assert.ok(result.errors.length);
 }
 assert.ok(prepare({material:' ',color:'White'},[line]).errors.length);
 assert.ok(prepare(shared,[]).errors.length);
 assert.ok(prepare(shared,[line,{...line,width:'01200'}]).errors.length);
 assert.ok(prepare(shared,[line],[{material:'solid aluminium',color:'white',thickness:3,width:1200,height:2400}]).errors.length);
});
test('catalog batch creates linked catalog and zero-stock entries in one save without changing existing stock',()=>{
 const start=html.indexOf('    function addCatalogItemsBulk('),end=html.indexOf('    function removeCatalogItem(',start);
 const catalog=[{id:'old'}],variants=[{id:'stock',qty:27}];let saved=[],logs=[],id=0;
 const rows=prepare(shared,[line,{...line,width:'1500'}]).rows;
 vm.runInNewContext(html.slice(start,end)+';addCatalogItemsBulk(rows);',{rows,catalog,variants,uid:()=>String(++id),genSku:()=> 'SKU'+(++id),setCatalog(){},setVariants(){},persist:next=>saved.push(next),logTxn:tx=>logs.push(tx),showToast(){}});
 assert.equal(saved.length,1);assert.equal(logs.length,1);assert.equal(saved[0].variants[0],variants[0]);
 assert.equal(saved[0].catalog.length,3);assert.equal(saved[0].variants.length,3);
 for(let i=1;i<=2;i++){const c=saved[0].catalog[i],v=saved[0].variants[i];assert.equal(v.catalogId,c.id);assert.equal(v.sku,c.sku);assert.equal(v.qty,0);}
 assert.notEqual(saved[0].catalog[1].sku,saved[0].catalog[2].sku);
});

test('shared thickness applies to all sizes, ignores empty rows, rejects invalid thickness and catches duplicates',()=>{
 const sharedDetails={...shared,thickness:'4'};
 const sizes=[{width:'4000',height:'1575',reorderPoint:''},{width:'3000',height:'1500',reorderPoint:'5'},{}];
 const result=prepare(sharedDetails,sizes);
 assert.equal(result.errors.length,0);assert.equal(result.rows.length,2);
 assert.deepEqual(Array.from(result.rows,r=>r.thickness),[4,4]);
 assert.equal(prepare(sharedDetails,[{...sizes[0],thickness:'8'}]).rows[0].thickness,4);
 for(const thickness of ['',0,-3,'Infinity','abc',1000001]){const r=prepare({...sharedDetails,thickness},sizes);assert.ok(r.errors.length);assert.equal(r.rows.length,0);}
 assert.ok(prepare(sharedDetails,[{}]).errors.length);
 assert.ok(prepare(sharedDetails,[sizes[0],{...sizes[0],width:'04000'}]).errors.length);
 assert.ok(prepare(sharedDetails,[sizes[0]],[{material:'Solid Aluminium',color:'White',thickness:4,width:4000,height:1575}]).errors.length);
});
test('catalog form keeps one thickness when adding and removing rows and saves all sizes together',()=>{
 let states=[],refs=[],cursor=0,refCursor=0,saves=[],closed=0;
 const render=vm.runInNewContext(source+';CatalogBulkForm',{useState:initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useRef:initial=>{const i=refCursor++;return refs[i]||(refs[i]={current:initial});},Trash2:'trash',SheetMeasureGuide:'measure-guide',inputCls:'',import_jsx_runtime:{jsx:(tag,props)=>({tag,...props})}});
 const flatten=n=>n&&typeof n==='object'?[n,...[n.children].flat().flatMap(flatten)]:[];
 let tree,nodes;
 const draw=()=>{cursor=refCursor=0;tree=render({catalog:[],onSave:rows=>saves.push(rows),onClose:()=>closed++});nodes=flatten(tree);};
 const input=(placeholder,value)=>{nodes.find(n=>n.tag==='input'&&n.placeholder===placeholder).onChange({target:{value}});draw();};
 const size=(label,value)=>{nodes.find(n=>n['aria-label']===label).onChange({target:{value}});draw();};
 draw();input('e.g. Solid Aluminium','Aluminium');input('e.g. White','White');input('e.g. 3','3');
 size('Width row 1','4000');size('Height row 1','1575');
 nodes.find(n=>n.children==='+ Add line').onClick();draw();
 size('Width row 2','3000');size('Height row 2','1500');
 input('e.g. 3','4');assert.equal(nodes.filter(n=>n.tag==='input'&&n.placeholder==='e.g. 3').length,1);
 nodes.find(n=>n.children==='+ Add line').onClick();draw();nodes.find(n=>n['aria-label']==='Remove size row 3').onClick();draw();
 tree.onSubmit({preventDefault(){}});
 assert.equal(saves.length,1);assert.equal(closed,1);assert.equal(saves[0].length,2);assert.deepEqual(Array.from(saves[0],r=>r.thickness),[4,4]);
});
