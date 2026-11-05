const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../workshop-stock.js'),'utf8');
const walk=n=>!n||typeof n!=='object'?[]:[n,...(n.children||[]).flat(Infinity).flatMap(walk)];
const text=n=>n===null||n===undefined?'':typeof n==='string'||typeof n==='number'?String(n):(n.children||[]).flat(Infinity).map(text).join('');
const pricingKeys=['unitCost','packCost','packSize','costBasis','costSourceItemId'];
const catalogueCost=(width,height,ratePerM2=40)=>({catalogId:'white',name:'White ACP',ratePerM2,width,height});
const base=(id,name,category,patch={})=>({id,name,sku:id,category,unit:'sheets',qty:3,reserved:1,available:2,onOrder:7,supplier:'Supplier',color:'White',material:'ACP',thickness:3,reorderLevel:0,...patch});
const fixture=()=>({revision:21,movements:[],items:[
 base('variant:derived','Catalogue full panel','panels',{legacy:true,costBasis:'catalogue-area',catalogueCost:catalogueCost(2400,1200),width:2400,height:1200,effectiveUnitCost:115.2,unitCost:999,packCost:5000,packSize:20,xeroGroup:'cladding'}),
 base('offcut:derived','Catalogue offcut','offcuts',{legacy:true,catalogId:'white',costBasis:'catalogue-area',catalogueCost:catalogueCost(1200,600),width:1200,height:600,effectiveUnitCost:28.8,unitCost:777,packCost:2500,packSize:10,costSourceItemId:'variant:obsolete',xeroGroup:'materials'}),
 base('variant:unit','Manual full panel','panels',{legacy:true,costBasis:'unit',unitCost:120,width:2400,height:1200}),
 base('variant:pack','Manual pack panel','panels',{legacy:true,costBasis:'pack',unitCost:25,packCost:1000,packSize:10,width:2400,height:1200}),
 base('offcut:area','Source-priced offcut','offcuts',{legacy:true,costBasis:'area',unitCost:55,width:1200,height:600,costSourceItemId:'variant:unit',areaCostStatus:'resolved',areaCostSources:[{id:'variant:unit',name:'Manual full panel',width:2400,height:1200,ratePerM2:120/2.88,priced:true}],areaCost:{sourceItemId:'variant:unit',sourceName:'Manual full panel',sourceWidth:2400,sourceHeight:1200,sourceCostBasis:'unit',sourceUnitCost:120,sourcePackCost:null,sourcePackSize:1,offcutWidth:1200,offcutHeight:600,ratePerM2:120/2.88,effectiveUnitCost:30}}),
 base('bolt','Manual fixing','fixings',{unit:'each',costBasis:'unit',unitCost:2})
]});
function harness(){
 const states=[],sent=[],exports=[],xeroSnapshots=[],storage=new Map();let cursor=0;
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:value=>{const i=cursor++;if(!(i in states))states[i]=typeof value==='function'?value():value;return [states[i],value=>states[i]=typeof value==='function'?value(states[i]):value];},useEffect(){},Fragment:'fragment'};
 const context={window:{},TextEncoder,Blob,atob,crypto:{randomUUID:()=> 'catalogue-price-mutation'},PanelStock:{username:'admin',apiFetch:async(url,options)=>{if(options)sent.push(JSON.parse(options.body));return {ok:true,json:async()=>states[0]};}},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},document:{addEventListener(){},createElement:()=>({click(){},remove(){}}),body:{appendChild(){}}},URL:{createObjectURL:()=> 'blob:catalogue-export',revokeObjectURL(){}},setTimeout(){return 0;}};
 vm.runInNewContext(source,context);const soh=context.window.PanelStockStocktakeReport.soh;
 for(const format of ['xlsx','pdf'])soh[format]=snapshot=>{exports.push({format,snapshot});return new Blob([format]);};
 soh.xero.prepare=(snapshot)=>{xeroSnapshots.push(snapshot);return {rows:[],issues:['Choose journal settings'],totals:{balanceCents:0,debitCents:0,creditCents:0}};};
 const C=context.window.createWorkshopStock(React),render=()=>{cursor=0;return walk(C({isAdmin:true,workerUrl:'/api'}));};render();states[0]=fixture();
 const node=label=>render().find(n=>n.props['aria-label']===label),button=label=>render().find(n=>n.type==='button'&&n.children.includes(label)),control=key=>walk(render().find(n=>n.type==='label'&&n.props.key===key)).find(n=>n.type==='input'||n.type==='select'),bulkField=key=>render().find(n=>n.props.className==='ws-bulk-field'&&n.props.key===key);
 return {states,sent,exports,xeroSnapshots,render,node,button,control,bulkField,set(key,value){const input=control(key);assert.ok(input,key);input.props.onChange({target:{value}});},check(label,checked=true){node(label).props.onChange({target:{checked}});},openItem(name){node('Stock action for '+name).props.onChange({target:{value:'metadata'}});},selectItem(name){const item=states[0].items.find(i=>i.name===name);node('Select '+item.name+' '+item.sku).props.onChange({target:{checked:true}});},openExport(){node('Export SOH').props.onClick();},download(format='Excel'){button('Download '+format).props.onClick();return exports.at(-1)?.snapshot;},async save(){await render().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});return sent.at(-1);}};
}

test('catalogue-priced panels and offcuts show the shared square-metre rate in SOH and read-only area costing in the editor',()=>{
 const x=harness();for(const [name,area,cost] of [['Catalogue full panel','2.88','$115.20'],['Catalogue offcut','0.72','$28.80']]){
  const row=x.render().find(n=>n.type==='tr'&&walk(n).some(child=>child.props['aria-label']==='Stock action for '+name)),label=walk(row).find(n=>n.props.className==='ws-unit-cost');assert.equal(text(label),'$40.00 / m² (AUD ex GST)');
  x.openItem(name);for(const key of pricingKeys)assert.equal(x.control(key),undefined,key+' must not be editable');const form=x.render().find(n=>n.type==='form'),content=text(form);assert.match(content,/Catalogue area pricing/);assert.match(content,/White ACP/);assert.ok(content.includes('Rate: $40.00 / m² (AUD ex GST)'));assert.ok(content.includes('Area: '+area+' m²'));assert.ok(content.includes('Calculated cost per sheets: '+cost));assert.ok(content.includes('Change the price per m² in Catalogue.'));x.button('Cancel').props.onClick();
 }
});

test('saving derived panel metadata omits old price fields while preserving editable stock details and Xero assignment',async()=>{
 for(const name of ['Catalogue full panel','Catalogue offcut']){const x=harness(),before=structuredClone(x.states[0]);x.openItem(name);x.set('name','Renamed '+name);x.set('supplier','Updated supplier');x.set('xeroGroup','silicone');const payload=await x.save();assert.equal(payload.action,'metadata');assert.equal(payload.itemId,before.items.find(i=>i.name===name).id);for(const key of pricingKeys)assert.equal(Object.hasOwn(payload,key),false,key+' must not be submitted');assert.equal(payload.name,'Renamed '+name);assert.equal(payload.supplier,'Updated supplier');assert.equal(payload.xeroGroup,'silicone');assert.equal(payload.unit,'sheets');assert.deepEqual(x.states[0],before);}
});

test('zero catalogue rates remain a valid free derived cost with no editable per-sheet price',()=>{
 const x=harness(),item=x.states[0].items[0];item.catalogueCost.ratePerM2=0;item.effectiveUnitCost=0;x.openItem(item.name);const content=text(x.render().find(n=>n.type==='form'));assert.ok(content.includes('Rate: $0.00 / m² (AUD ex GST)'));assert.ok(content.includes('Calculated cost per sheets: $0.00'));assert.equal(x.control('unitCost'),undefined);assert.equal(x.control('costBasis'),undefined);
});

test('legacy manual unit, pack and full-sheet-source area editors keep their existing editable pricing fields and payloads',async()=>{
 const x=harness();x.openItem('Manual full panel');assert.equal(x.control('costBasis').props.value,'unit');assert.equal(x.control('unitCost').props.value,120);x.set('unitCost','130.50');let payload=await x.save();assert.equal(payload.costBasis,'unit');assert.equal(payload.unitCost,'130.50');
 x.openItem('Manual pack panel');assert.equal(x.control('costBasis').props.value,'pack');assert.equal(x.control('packCost').props.value,1000);assert.equal(x.control('packSize').props.value,10);x.set('packCost','1100.50');payload=await x.save();assert.equal(payload.costBasis,'pack');assert.equal(payload.packCost,'1100.50');assert.equal(payload.packSize,10);assert.equal(payload.unitCost,25);
 x.openItem('Source-priced offcut');assert.equal(x.control('costBasis').props.value,'area');assert.equal(x.control('costSourceItemId').props.value,'variant:unit');payload=await x.save();assert.equal(payload.costBasis,'area');assert.equal(payload.costSourceItemId,'variant:unit');assert.equal(payload.unitCost,55);
});

test('uncosted PDF and Excel snapshots omit catalogue pricing; costed snapshots include independent catalogue cost objects and actual dimensions',()=>{
 const x=harness();x.openExport();for(const format of ['PDF','Excel']){const snapshot=x.download(format);assert.equal(snapshot.includeCostings,false);for(const row of snapshot.rows)for(const key of ['catalogueCost','unitCost','packCost','costBasis','effectiveUnitCost'])assert.equal(Object.hasOwn(row,key),false,key);}
 x.check('Include costings');const snapshot=x.download('PDF');for(const id of ['variant:derived','offcut:derived']){const row=snapshot.rows.find(r=>r.itemId===id),original=x.states[0].items.find(i=>i.id===id);assert.equal(row.costBasis,'catalogue-area');assert.deepEqual(structuredClone(row.catalogueCost),original.catalogueCost);assert.notEqual(row.catalogueCost,original.catalogueCost);assert.equal(row.width,original.width);assert.equal(row.height,original.height);assert.equal(row.catalogueCost.width,original.width);assert.equal(row.catalogueCost.height,original.height);assert.equal(row.qty,3);assert.equal(row.reserved,1);assert.equal(row.onOrder,7);}
 snapshot.rows.find(r=>r.itemId==='variant:derived').catalogueCost.ratePerM2=123;assert.equal(x.states[0].items[0].catalogueCost.ratePerM2,40);assert.equal(x.sent.length,0);
});

test('Xero forces costed catalogue snapshots without changing the ordinary PDF/Excel cost toggle',()=>{
 const x=harness();x.openExport();assert.equal(x.node('Include costings').props.checked,false);x.button('Xero journal CSV').props.onClick();assert.ok(x.node('Xero journal CSV'));const snapshot=x.xeroSnapshots.at(-1);assert.equal(snapshot.includeCostings,true);
 for(const id of ['variant:derived','offcut:derived']){const row=snapshot.rows.find(r=>r.itemId===id),original=x.states[0].items.find(i=>i.id===id);assert.equal(row.costBasis,'catalogue-area');assert.equal(row.catalogueCost.ratePerM2,40);assert.equal(row.width,original.width);assert.equal(row.height,original.height);assert.notEqual(row.catalogueCost,original.catalogueCost);}
 x.button('Back to SOH export').props.onClick();assert.equal(x.node('Include costings').props.checked,false);assert.ok(x.download().rows.every(row=>!Object.hasOwn(row,'catalogueCost')));assert.equal(x.sent.length,0);
});

test('bulk selections containing a derived panel or offcut disable pricing changes while allowing a shared Xero group update',async()=>{
 for(const name of ['Catalogue full panel','Catalogue offcut']){const x=harness();x.selectItem(name);x.selectItem('Manual fixing');x.button('Bulk edit').props.onClick();for(const key of ['costBasis','unitCost','packCost','packSize']){const field=x.bulkField(key),checkbox=walk(field).find(n=>n.type==='input'&&n.props.type==='checkbox'),editor=walk(field).find(n=>n.props['aria-label']);assert.equal(checkbox.props.disabled,true,key);assert.equal(editor.props.disabled,true,key);}
  const field=x.bulkField('xeroGroup'),checkbox=walk(field).find(n=>n.type==='input'&&n.props.type==='checkbox');assert.equal(checkbox.props.disabled,false);checkbox.props.onChange({target:{checked:true}});const editor=x.node('Xero stock group');assert.equal(editor.props.disabled,false);editor.props.onChange({target:{value:'materials'}});const payload=await x.save();assert.equal(payload.action,'bulk_metadata');assert.equal(payload.itemIds.length,2);assert.deepEqual(payload.changes,{xeroGroup:'materials'});for(const key of pricingKeys)assert.equal(Object.hasOwn(payload.changes,key),false);
 }
});

test('a bulk selection containing only manually priced items retains editable price controls',async()=>{
 const x=harness();x.selectItem('Manual full panel');x.selectItem('Manual fixing');x.button('Bulk edit').props.onClick();const field=x.bulkField('unitCost'),checkbox=walk(field).find(n=>n.type==='input'&&n.props.type==='checkbox');assert.equal(checkbox.props.disabled,false);checkbox.props.onChange({target:{checked:true}});const editor=x.node('Unit cost (AUD ex GST)');assert.equal(editor.props.disabled,false);editor.props.onChange({target:{value:'12.40'}});const payload=await x.save();assert.equal(payload.action,'bulk_metadata');assert.equal(payload.changes.unitCost,'12.40');
});
