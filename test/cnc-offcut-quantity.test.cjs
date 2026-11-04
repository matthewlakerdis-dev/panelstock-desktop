const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const target=fs.existsSync(path.join(__dirname,'../panelstock-app.modern.js'))?'panelstock-app.modern.js':'index.html';
const text=fs.readFileSync(path.join(__dirname,'..',target),'utf8');
const normalizers=text.slice(text.indexOf('function normalizeCncInput('),text.indexOf('function compareCncOrders('));
const formatters=(text.match(/  var (?:fmtDim|stockDimensions|fmtStockDim|fmtCncOffcutDim) = [^\n]+/g)||[]).join('\n');
const plain=value=>JSON.parse(JSON.stringify(value));
function source(name){const marker='    function '+name+'(',start=text.indexOf(marker);assert.ok(start>=0,name);const end=text.indexOf('\n    function ',start+marker.length);assert.ok(end>start,name+' end');return text.slice(start,end);}
function compile(name,context={}){return vm.runInNewContext(formatters+'\n'+normalizers+'\n'+source(name)+';'+name,context);}
const merge=vm.runInNewContext(normalizers+';mergeOffcutStock');
const row=(id,qty=1,extra={})=>({id,sku:id.toUpperCase(),color:'Milled',material:'Solid Aluminium',thickness:3,width:480,height:1200,dimensionOrder:'sheet',qty,note:'Keep the existing note',...extra});
const leftover=(length=480,width=1200)=>({length,width,dimensionOrder:'sheet',source:'cnc-pdf'});

function completion({inventory=[],stockType='variant',selected=[leftover()],stockQty=3}={}){
 const state={},toasts=[];let serial=0;
 const stock=row('source',stockQty,{width:3000,height:1200});
 const scheduled={id:'panel',orderNumber:'22',sheetNumber:'1',panelNumber:'C1F-1',status:'pending',stockItemType:stockType,stockItemId:stock.id,stockSku:stock.sku,sheetWidth:3000,sheetHeight:1200,totalPanelArea:1,panelAreaScope:'sheet',pendingOffcuts:selected};
 const context={cncPanels:[scheduled],variants:stockType==='variant'?[stock]:[],offcuts:stockType==='offcut'?[stock,...inventory]:inventory,transactions:[],username:'Operator',uid:()=>`generated-${++serial}`,genSku:()=>`NEW-${++serial}`,showToast:(...values)=>toasts.push(values),persist:value=>{state.persisted=value;state.persistCount=(state.persistCount||0)+1;}};
 for(const [name,key] of [['setCncPanels','cncPanels'],['setVariants','variants'],['setOffcuts','offcuts'],['setTransactions','transactions']])context[name]=value=>{state[key]=value;context[key]=value;};
 const before=JSON.stringify({cncPanels:context.cncPanels,variants:context.variants,offcuts:context.offcuts,transactions:context.transactions});
 const originals={cncPanels:context.cncPanels,variants:context.variants,offcuts:context.offcuts,transactions:context.transactions};
 const run=compile('completeCncSheet',context);run('22','1',{confirmed:true,offcuts:selected});
 return {state,toasts,context,before,originals,run};
}

test(target+': matching additions increase the existing row without replacing metadata or mutating inputs',()=>{
 const existing=row('existing',3,{catalogId:'catalog',sourceOrderNumber:'19',createdAt:'earlier',extraMetadata:{preserved:true}}),other=row('other',2,{color:'White'}),incoming=row('incoming',2,{material:' solid   aluminium ',color:' MILLED ',thickness:'3',note:'New source'}),inventory=[existing,other],additions=[incoming],snapshot=JSON.stringify({inventory,additions});
 const result=merge(inventory,additions);
 assert.equal(result.offcuts.length,2);assert.equal(result.offcuts[0].qty,5);assert.deepEqual(plain({...result.offcuts[0],qty:3}),existing);assert.equal(result.offcuts[1],other);
 assert.equal(result.additions[0].id,'existing');assert.equal(result.additions[0].sku,'EXISTING');assert.equal(result.additions[0].qty,2);assert.equal(result.additions[0].note,'New source');assert.equal(JSON.stringify({inventory,additions}),snapshot);
});

test(target+': identical pieces from one batch share one new row and keep each physical contribution',()=>{
 const additions=[row('one'),row('two')],snapshot=JSON.stringify(additions),result=merge([],additions);
 assert.equal(result.offcuts.length,1);assert.equal(result.offcuts[0].qty,2);assert.equal(result.offcuts[0].id,'one');assert.deepEqual(plain(result.additions.map(item=>[item.id,item.sku,item.qty])),[['one','ONE',1],['one','ONE',1]]);assert.equal(JSON.stringify(additions),snapshot);
});

test(target+': different material, finish, thickness or ordered axes remain separate stock',()=>{
 const existing=row('existing',3),additions=[row('finish',1,{color:'White'}),row('material',1,{material:'Alpolic'}),row('thickness',1,{thickness:4}),row('rotated',1,{width:1200,height:480})],result=merge([existing],additions);
 assert.equal(result.offcuts.length,5);assert.equal(result.offcuts[0],existing);assert.equal(result.offcuts[0].qty,3);assert.equal(result.offcuts[4].width,1200);assert.equal(result.offcuts[4].height,480);
 const legacy=row('legacy',4,{width:1200,height:480});delete legacy.dimensionOrder;
 const sameDisplay=merge([legacy],[row('new',2,{width:1200,height:480})]);assert.equal(sameDisplay.offcuts.length,1);assert.equal(sameDisplay.offcuts[0].qty,6);assert.equal(sameDisplay.offcuts[0].dimensionOrder,undefined);
 const reversed=merge([legacy],[row('new',1)]);assert.equal(reversed.offcuts.length,2);
});

test(target+': CNC completion merges leftovers into the existing SKU with one stock deduction and per-piece history',()=>{
 const existing=row('existing',3,{catalogId:'original-catalog'}),result=completion({inventory:[existing],selected:[leftover(),leftover()]});
 assert.equal(result.state.offcuts.length,1);assert.equal(result.state.offcuts[0].id,'existing');assert.equal(result.state.offcuts[0].sku,'EXISTING');assert.equal(result.state.offcuts[0].qty,5);assert.equal(result.state.offcuts[0].catalogId,'original-catalog');assert.equal(result.state.variants[0].qty,2);assert.equal(result.state.persistCount,1);
 const added=result.state.transactions.filter(item=>item.type==='offcut_add');assert.equal(added.length,2);for(const item of added){assert.equal(item.sku,'EXISTING');assert.equal(item.qty,1);assert.equal(item.orderNumber,'22');assert.equal(item.sheetNumber,'1');}
 assert.equal(result.state.cncPanels[0].savedOffcuts.length,2);assert.ok(result.state.cncPanels[0].savedOffcuts.every(item=>item.length===480&&item.width===1200));assert.equal(result.state.transactions.filter(item=>item.type==='dispatch').length,1);
 assert.equal(JSON.stringify(result.originals),result.before);assert.equal(existing.qty,3);
 result.run('22','1',{confirmed:true,offcuts:[leftover()]});assert.equal(result.state.persistCount,1,'a completed sheet must not be saved twice');
});

test(target+': consuming an offcut removes the source once before merging the saved remainder',()=>{
 const existing=row('existing',2),result=completion({stockType:'offcut',stockQty:1,inventory:[existing]});
 assert.equal(result.state.offcuts.length,1);assert.equal(result.state.offcuts[0].id,'existing');assert.equal(result.state.offcuts[0].qty,3);assert.equal(result.state.variants.length,0);assert.equal(result.state.transactions.find(item=>item.type==='dispatch').sku,'SOURCE');assert.equal(result.state.transactions.find(item=>item.type==='offcut_add').sku,'EXISTING');assert.equal(JSON.stringify(result.originals),result.before);
 const fresh=completion({stockType:'offcut',stockQty:1});assert.equal(fresh.state.offcuts.length,1);assert.notEqual(fresh.state.offcuts[0].id,'source');assert.equal(fresh.state.offcuts[0].qty,1);
});

test(target+': manual additions reuse the existing identity and record only the amount added',()=>{
 const existing=row('existing',3),state={},toasts=[],activity=[],context={offcuts:[existing],uid:()=> 'discarded-id',genSku:()=> 'DISCARDED-SKU',setOffcuts:value=>state.offcuts=value,persist:value=>state.persisted=value,logTxn:value=>activity.push(value),showToast:(...values)=>toasts.push(values)};
 compile('addOffcut',context)({color:'Milled',material:'Solid Aluminium',thickness:3,width:480,height:1200,qty:2,note:'Added note'});
 assert.equal(state.offcuts.length,1);assert.equal(state.offcuts[0].id,'existing');assert.equal(state.offcuts[0].qty,5);assert.equal(state.offcuts[0].note,existing.note);assert.equal(activity[0].sku,'EXISTING');assert.equal(activity[0].qty,2);assert.equal(existing.qty,3);
});

test(target+': undoing a merged addition subtracts only its contribution and blocks missing or used stock',()=>{
 const txn={id:'add',type:'offcut_add',itemType:'offcut',sku:'EXISTING',qty:2},existing=row('existing',7);
 function run(inventory,transaction=txn){const state={},toasts=[],context={isAdmin:true,offcuts:inventory,variants:[],transactions:[transaction],username:'Admin',uid:()=> 'unexpected-new-row',showToast:(...values)=>toasts.push(values),setOffcuts:value=>state.offcuts=value,setVariants:value=>state.variants=value,setTransactions:value=>state.transactions=value,persist:value=>state.persisted=value};compile('voidTransaction',context)(transaction.id);return{state,toasts};}
 const restored=run([existing]);assert.equal(restored.state.offcuts[0].qty,5);assert.equal(restored.state.offcuts[0].id,'existing');assert.equal(restored.state.transactions[0].voided,true);assert.equal(existing.qty,7);
 for(const inventory of [[],[row('existing',1)]]){const blocked=run(inventory);assert.equal(blocked.state.persisted,undefined);assert.match(blocked.toasts[0][0],/already been used/);}
 const dispatch=run([existing],{...txn,id:'dispatch',type:'dispatch'});assert.equal(dispatch.state.offcuts[0].qty,9,'dispatch undo must retain its existing add-back behavior');
});

test(target+': aggregate limits reject the whole save before stock or history changes',()=>{
 const inventory=[row('existing',9999999)],snapshot=JSON.stringify(inventory),result=merge(inventory,[row('a'),row('b')]);assert.match(result.error,/stock limit/);assert.equal(JSON.stringify(inventory),snapshot);
 for(const qty of [0,-1,1.5,10000001])assert.match(merge([],[row('new',qty)]).error,/whole number/);
 const blocked=completion({inventory,selected:[leftover(),leftover()]});assert.equal(blocked.state.persisted,undefined);assert.equal(blocked.state.offcuts,undefined);assert.match(blocked.toasts[0][0],/stock limit/);assert.equal(JSON.stringify(inventory),snapshot);assert.equal(JSON.stringify(blocked.originals),blocked.before);
});

test(target+': undoing dispatch or damage reuses a matching replacement SKU and rejects overflow atomically',()=>{
 const transaction={id:'return',type:'dispatch',itemType:'offcut',sku:'REMOVED',color:'Milled',material:'Solid Aluminium',thickness:3,width:480,height:1200,dimensionOrder:'sheet',qty:2,note:'Original piece'},destination=row('replacement',3,{catalogId:'keep-catalog',sourceOrderNumber:'25',extraMetadata:{keep:true}});
 function run(inventory,txn=transaction){const state={},toasts=[],snapshot=JSON.stringify({inventory,txn}),context={isAdmin:true,offcuts:inventory,variants:[],transactions:[txn],username:'Admin',uid:()=> 'recreated-id',showToast:(...values)=>toasts.push(values),setOffcuts:value=>state.offcuts=value,setVariants:value=>state.variants=value,setTransactions:value=>state.transactions=value,persist:value=>state.persisted=value};compile('voidTransaction',context)(txn.id);assert.equal(JSON.stringify({inventory,txn}),snapshot);return{state,toasts};}
 for(const type of ['dispatch','damage']){
  const txn={...transaction,type},result=run([destination],txn);assert.equal(result.state.offcuts.length,1);assert.deepEqual(plain({...result.state.offcuts[0],qty:3}),destination);assert.equal(result.state.offcuts[0].qty,5);assert.equal(result.state.offcuts[0].sku,'REPLACEMENT');assert.equal(result.state.transactions[0].sku,'REMOVED');assert.equal(result.state.transactions[0].voided,true);assert.deepEqual(plain(result.state.persisted.offcuts),plain(result.state.offcuts));
 }
 const recreated=run([]);assert.equal(recreated.state.offcuts.length,1);assert.equal(recreated.state.offcuts[0].sku,'REMOVED');assert.equal(recreated.state.offcuts[0].qty,2);
 for(const sku of ['REPLACEMENT','REMOVED']){
  const full=row('replacement',10000000,{sku}),result=run([full]);assert.equal(result.state.persisted,undefined);assert.equal(result.state.offcuts,undefined);assert.equal(result.state.transactions,undefined);assert.match(result.toasts[0][0],/stock limit/);
 }
 const missingAddition=run([destination],{...transaction,type:'offcut_add'});assert.equal(missingAddition.state.persisted,undefined);assert.match(missingAddition.toasts[0][0],/already been used/);
});
