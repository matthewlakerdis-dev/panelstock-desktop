const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const slice=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)+start.length));
const helpers=slice('  function catalogPricePatch(','  function CatalogSingleForm(');
const single=slice('  function CatalogSingleForm(','\n  function ');
const bulk=slice('  function prepareCatalogBulkRows(','  function CatalogAdmin(');
const admin=slice('  function CatalogAdmin(','\n  function ');
const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
const plain=value=>JSON.parse(JSON.stringify(value));
const keyFor=c=>JSON.stringify([c.color.toLowerCase(),c.material.toLowerCase(),Number(c.thickness)]);
const label='Price per m² (AUD ex GST)';
const details={color:'White',material:'Aluminium',thickness:3};
const price=vm.runInNewContext(helpers+';catalogPricePatch');
const prepare=vm.runInNewContext(helpers+bulk+';prepareCatalogBulkRows');
const flat=node=>Array.isArray(node)?node.flatMap(flat):node&&typeof node==='object'?[node,...flat(node.children),...flat(node.action)]:[];
const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.children):node==null||node===false?'':String(node);

test('catalogue rate distinguishes missing, cleared and free prices and rejects fractional cents',()=>{
 for(const blank of [undefined,null,'','  '])assert.deepEqual(plain(price(blank)),{});
 assert.deepEqual(plain(price('',true)),{unitCostPerM2:null});
 for(const [input,expected] of [['0',0],[0,0],['1.15',1.15],['28.50',28.5],[1000000000,1000000000]])assert.equal(price(input).unitCostPerM2,expected);
 for(const invalid of [-1,'Infinity','abc','1.001',0.0000001,1e-20,1000000000.01])assert.throws(()=>price(invalid),/price per m²/);
 const sizes=[{width:'4000',height:'1500'},{width:'3000',height:'1200'}];
 const result=prepare({...details,unitCostPerM2:'32.75'},sizes);
 assert.equal(result.errors.length,0);assert.deepEqual(Array.from(result.rows,row=>row.unitCostPerM2),[32.75,32.75]);
 assert.ok(prepare({...details,unitCostPerM2:'1.001'},sizes).errors.length);
 assert.ok(prepare(details,sizes).rows.every(row=>!own(row,'unitCostPerM2')));
});

function harness(catalog=[]){
 let states=[],refs=[],cursor=0,refCursor=0,saves=[],edits=[];
 const jsx=(tag,props,key)=>({tag,...props,key});
 const context=vm.createContext({
  useState:initial=>{const index=cursor++;if(!(index in states))states[index]=initial;return [states[index],value=>states[index]=typeof value==='function'?value(states[index]):value];},
  useRef:initial=>{const index=refCursor++;return refs[index]||(refs[index]={current:initial});},
  import_jsx_runtime:{jsx,jsxs:jsx,Fragment:'fragment'},import_react:{default:{Fragment:'fragment'}},
  CapitalizedInput:'capitalized',SheetMeasureGuide:'measure',Trash2:'trash',Pencil:'pencil',ChevronRight:'chevron',FileSpreadsheet:'excel',Printer:'printer',Plus:'plus',Layers:'layers',PageHeading:'heading',EmptyState:'empty',inputCls:'',
  groupByMaterialLargestFirst:items=>[{material:'Aluminium',items}],catalogKey:keyFor,swatchColour:()=> '#fff'
 });
 vm.runInContext(helpers+single+bulk+admin,context);
 let tree,nodes;
 const draw=()=>{cursor=refCursor=0;tree=context.CatalogAdmin({catalog,onAdd:value=>saves.push(value),onEdit:(id,value)=>edits.push({id,...value}),onRemove(){},onAddBulk(){},onExportExcel(){},onExportPDF(){}});nodes=flat(tree);};
 const open=()=>{const clickable=nodes.find(n=>n.className?.includes('cursor-pointer')&&n.onClick);if(clickable){clickable.onClick();draw();}};
 const button=value=>nodes.find(n=>n.tag==='button'&&text(n).trim()===value);
 const form=()=>nodes.find(n=>n.tag===context.CatalogSingleForm);
 draw();open();
 return {context,draw,button,form,saves,edits,nodes:()=>nodes,fill:values=>{form().setForm({...form().form,...values});draw();},renderSingle:()=>context.CatalogSingleForm(form())};
}

test('catalogue create form keeps price optional and saves numeric zero',()=>{
 for(const [input,expected] of [['',undefined],['0',0],['25.60',25.6]]){
  const h=harness();h.nodes().find(n=>n.tag==='button'&&/Add material/.test(text(n))).onClick({stopPropagation(){}});
  h.draw();h.fill({...details,thickness:'3',unitCostPerM2:input});
  const field=flat(h.renderSingle()).find(n=>n['aria-label']===label);
  assert.equal(field.step,'0.01');assert.equal(field.min,'0');assert.equal(field.max,'1000000000');assert.equal(field.required,undefined);
  h.form().onSave();assert.equal(h.saves.length,1);
  assert.equal(h.saves[0].unitCostPerM2,expected);assert.equal(own(h.saves[0],'unitCostPerM2'),expected!==undefined);
 }
});

test('catalogue edit preloads zero, clears to null and keeps invalid price edits open',()=>{
 const h=harness([{...details,id:'material',sku:'SKU',unitCostPerM2:0}]);
 h.nodes().find(n=>n.tag==='button'&&n.children?.tag==='pencil').onClick();h.draw();
 assert.equal(h.form().form.unitCostPerM2,'0');
 h.fill({unitCostPerM2:'1.001'});h.form().onSave();h.draw();
 assert.equal(h.edits.length,0);assert.match(h.form().priceError,/two decimal places/);
 assert.ok(flat(h.renderSingle()).some(n=>n.role==='alert'));
 h.fill({unitCostPerM2:''});h.form().onSave();assert.equal(h.edits.length,1);assert.equal(h.edits[0].unitCostPerM2,null);
});

test('bulk price input applies one rate to each entered sheet size',()=>{
 const h=harness(),saved=[];let states=[],refs=[],cursor=0,refCursor=0;
 h.context.useState=initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],value=>states[i]=typeof value==='function'?value(states[i]):value];};
 h.context.useRef=initial=>{const i=refCursor++;return refs[i]||(refs[i]={current:initial});};
 let tree,nodes;
 const draw=()=>{cursor=refCursor=0;tree=h.context.CatalogBulkForm({catalog:[],onSave:rows=>saved.push(rows),onClose(){}});nodes=flat(tree);};
 const change=(predicate,value)=>{nodes.find(predicate).onChange({target:{value}});draw();};
 draw();change(n=>n.placeholder==='e.g. Solid Aluminium','Aluminium');change(n=>n.placeholder==='e.g. White','White');change(n=>n.placeholder==='e.g. 3','3');
 change(n=>n['aria-label']===label,'12.50');change(n=>n['aria-label']==='Length row 1','4000');change(n=>n['aria-label']==='Width row 1','1500');
 nodes.find(n=>n.children==='+ Add line').onClick();draw();change(n=>n['aria-label']==='Length row 2','3000');change(n=>n['aria-label']==='Width row 2','1200');
 tree.onSubmit({preventDefault(){}});assert.equal(saved.length,1);assert.deepEqual(Array.from(saved[0],r=>r.unitCostPerM2),[12.5,12.5]);
});

test('catalogue persistence changes prices without changing existing stock quantities or manual prices',()=>{
 const existing={...details,id:'old',sku:'OLD',unitCostPerM2:8,width:0,height:0};
 const variant={...details,id:'panel',catalogId:'old',qty:7,unitCost:90};
 let saved=[],id=0;
 const context=vm.createContext({catalog:[existing,{...existing,id:'duplicate'}],variants:[variant],catalogKey:keyFor,catalogPricePatch:price,uid:()=>String(++id),genSku:()=> 'SKU'+(++id),setCatalog(){},setVariants(){},persist:next=>saved.push(next),logTxn(){},showToast(){}});
 vm.runInContext(slice('    function addCatalogItem(','    function receiveStock('),context);
 vm.runInContext('editCatalogItem("old",{color:"White",material:"Aluminium",thickness:3,unitCostPerM2:12.5})',context);
 assert.ok(saved[0].catalog.every(c=>c.unitCostPerM2===12.5));assert.equal(saved[0].variants[0].qty,7);assert.equal(saved[0].variants[0].unitCost,90);assert.equal(own(saved[0].variants[0],'unitCostPerM2'),false);
 vm.runInContext('editCatalogItem("old",{color:"White",material:"Aluminium",thickness:3,unitCostPerM2:null})',context);assert.ok(saved[1].catalog.every(c=>c.unitCostPerM2===null));
 vm.runInContext('addCatalogItem({color:"Black",material:"Aluminium",thickness:3,unitCostPerM2:0})',context);assert.equal(saved[2].catalog.at(-1).unitCostPerM2,0);assert.equal(saved[2].variants,undefined);
 vm.runInContext('addCatalogItemsBulk([{color:"Blue",material:"Aluminium",thickness:4,width:4000,height:1500,unitCostPerM2:10}])',context);
 assert.equal(saved[3].catalog.at(-1).unitCostPerM2,10);if(saved[3].variants){assert.equal(saved[3].variants[0].qty,7);assert.equal(saved[3].variants.at(-1).qty,0);assert.ok(saved[3].variants.every(v=>!own(v,'unitCostPerM2')));}
 assert.equal(variant.qty,7);assert.equal(variant.unitCost,90);assert.equal(existing.unitCostPerM2,8);
});

test('catalogue exports append explicit ex-GST rates with missing and zero distinct',()=>{
 const catalog=[{...details,id:'a',sku:'A',unitCostPerM2:0},{...details,color:'Black',id:'b',sku:'B',unitCostPerM2:12.5},{...details,color:'Blue',id:'c',sku:'C'}];
 let exportedRows,pdfLines,downloads=[];
 const context=vm.createContext({catalog,catalogKey:keyFor,catalogPriceLabel:vm.runInNewContext(helpers+';catalogPriceLabel'),rowsToCSV:rows=>{exportedRows=rows;return 'csv';},Blob,prepareExport:(blob,name)=>downloads.push({blob,name}),todayStr:()=> '2026-11-05',buildPdfBlob:lines=>{pdfLines=lines;return new Blob(['pdf']);},pad:(value,width)=>String(value).padEnd(width,' ')});
 vm.runInContext(slice('    function exportCatalogExcel(','    function ') + slice('    function exportCatalogPDF(','    function ') + ';exportCatalogExcel();exportCatalogPDF();',context);
 assert.deepEqual(Object.keys(exportedRows[0]),['Colour','Material','Thickness (mm)',label]);assert.deepEqual(Array.from(exportedRows,r=>r[label]),[0,12.5,'']);
 assert.ok(pdfLines.some(line=>line.text.includes('Price per m² (AUD ex GST): $0.00')));assert.ok(pdfLines.some(line=>line.text.endsWith('Not priced')));assert.equal(downloads.length,2);
});
