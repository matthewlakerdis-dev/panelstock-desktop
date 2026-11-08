const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../workshop-stock.js'),'utf8');
const walk=n=>!n||typeof n!=='object'?[]:[n,...(n.children||[]).flat(Infinity).flatMap(walk)];
const text=n=>n==null?'':typeof n==='string'||typeof n==='number'?String(n):(n.children||[]).flat(Infinity).map(text).join('');
const at='2026-11-08T01:00:00Z',settings=()=>({cosGroups:[{id:'cladding',label:'Cladding',accountCode:'51050'},{id:'fixings',label:'Fixings',accountCode:'51066'}],assetAccountCode:'11350',trackingName:'job',trackingOption:'Factory/Production - BAU',direction:'asset-debit'});
function panel(id,patch={}){
 const row={id:'variant:'+id,name:id+' full sheet',sku:id.toUpperCase(),legacy:true,category:'panels',unit:'sheets',qty:8,reserved:2,available:6,supplier:'Alspec',location:'Sheet rack',catalogId:'catalogue-'+id,color:'White',material:'Aluminium',thickness:3,width:2400,height:1200,countedThisMonth:false,costBasis:'catalogue-area',catalogueCost:{catalogId:'catalogue-'+id,name:'Panel catalogue '+id,ratePerM2:17,width:2400,height:1200},xeroGroup:'cladding',...patch};
 row.stocktakeIdentity=JSON.stringify([row.sku||'',row.catalogId||'',row.color||'',row.material||'',Number(row.thickness),Number(row.width),Number(row.height)]);return row;
}
function fixture(){return {revision:21,stocktakeMonth:{key:'2026-11',label:'November 2026',timeZone:'Australia/Brisbane'},stocktakeSettings:settings(),movements:[],items:[panel('white'),panel('grey',{qty:7,color:'Grey',width:3000,height:1500,catalogueCost:{catalogId:'catalogue-grey',name:'Panel catalogue grey',ratePerM2:17,width:3000,height:1500}}),panel('empty',{qty:0,reserved:0,available:0}),panel('already',{countedThisMonth:true}),panel('other',{supplier:'Capral'}),{id:'offcut:excluded',legacy:true,category:'offcuts',name:'Excluded legacy offcut',unit:'sheets',qty:2,supplier:'Alspec'}, {id:'angle',name:'Workshop angle',sku:'ANGLE',category:'extrusions',unit:'lengths',qty:10,reserved:0,available:10,supplier:'Rondo',location:'Rack A',unitCost:2.5,costBasis:'unit',xeroGroup:'fixings'}],stocktakes:[{id:'mixed',name:'Panels and workshop',categories:['panels','extrusions'],supplier:'',itemIds:['variant:white','variant:grey','angle','offcut:excluded'],counts:{},status:'open'}]};}
function completion(data){
 const quantities={'variant:white':0,'variant:grey':2,angle:3.5},rows=Object.entries(quantities).map(([id,quantity])=>{const item=data.items.find(row=>row.id===id);return {...item,itemId:id,quantity,expectedQty:item.qty,variance:quantity-item.qty,user:'Counter',at,pricingCapturedAt:at};});
 const report={version:2,name:'Panels and workshop',categories:['panels','extrusions'],supplier:'',completedAt:at,pricingCapturedAt:at,stocktakeSettings:settings(),rows};
 return {...structuredClone(data),revision:22,stocktakes:[{...data.stocktakes[0],status:'completed',completedAt:at,itemIds:rows.map(row=>row.itemId),counts:Object.fromEntries(rows.map(row=>[row.itemId,{quantity:row.quantity,expectedQty:row.expectedQty,user:row.user,at,item:{...row}}])),report}]};
}
function harness(){
 const states=[],sent=[],storage=new Map();let cursor=0,ids=0;
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:initial=>{const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],next=>states[i]=typeof next==='function'?next(states[i]):next];},useEffect(){},Fragment:'fragment'};
 const context={window:{},TextEncoder,Blob,atob,crypto:{randomUUID:()=> 'panel-mutation-'+(++ids)},PanelStock:{username:'admin',apiFetch:async(url,options)=>{if(!options)return {ok:true,json:async()=>states[0]};const payload=JSON.parse(options.body);sent.push(payload);return {ok:true,json:async()=>payload.action==='stocktake_batch'?completion(states[0]):states[0]};}},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},document:{addEventListener(){},removeEventListener(){}},setTimeout(){return 0;}};
 vm.runInNewContext(source,context);const C=context.window.createWorkshopStock(React),render=()=>{cursor=0;return walk(C({isAdmin:true,workerUrl:'/api'}));};render();states[0]=fixture();
 const button=label=>render().find(n=>n.type==='button'&&text(n)===label),row=id=>render().find(n=>String(n.props.className||'').split(' ').includes('ws-count-row')&&n.props.key===id),input=id=>walk(row(id)).find(n=>n.props['data-count-input']),control=key=>walk(render().find(n=>n.type==='label'&&n.props.key===key)).find(n=>n.type==='input'||n.type==='select');
 return {states,sent,storage,context,render,button,row,input,control,start(){button('Stocktake').props.onClick();button('Start count').props.onClick();},create(){button('Stocktake').props.onClick();button('Create stocktake').props.onClick();},enter(id,value){input(id).props.onChange({target:{value}});},categoryCount:key=>text(render().find(n=>n.type==='label'&&n.props.key===key)),set(key,value){control(key).props.onChange({target:{value}});},choose(key,checked=true){control(key).props.onChange({target:{checked}});}};
}

test('new stocktakes include full panels with supplier/month filters and retain zero-stock sheets',async()=>{
 const h=harness();h.create();assert.match(h.categoryCount('panels'),/5 items/);assert.ok(walk(h.control('supplier')).some(n=>n.type==='option'&&n.props.value==='Alspec'));
 h.set('name','Remaining AlSpec sheets');h.choose('panels');h.set('supplier','Alspec');assert.match(h.categoryCount('panels'),/4 items/);
 h.render().find(n=>n.props['aria-label']==='Only items not counted this month').props.onChange({target:{checked:true}});
 assert.match(h.categoryCount('panels'),/3 items/);assert.equal(text(h.render().find(n=>n.props['aria-label']==='Items in new stocktake')),'3 items to count');
 const form=h.render().find(n=>n.type==='form');await form.props.onSubmit({preventDefault(){}});const payload=h.sent[0];assert.equal(payload.action,'stocktake_create');assert.deepEqual(payload.categories,['panels']);assert.equal(payload.supplier,'Alspec');assert.equal(payload.uncountedThisMonth,true);assert.equal(payload.stocktakeMonth,'2026-11');assert.equal(h.states[0].items.find(row=>row.id==='variant:empty').qty,0);
});

test('mixed counts accept whole-sheet zero/positive quantities and keep workshop units and identity baselines',async()=>{
 const h=harness();h.start();assert.equal(h.row('offcut:excluded'),undefined);assert.equal(h.render().filter(n=>n.props['data-count-input']).length,3);
 for(const id of ['variant:white','variant:grey']){assert.equal(h.input(id).props.min,0);assert.equal(String(h.input(id).props.step),'1');assert.equal(h.input(id).props.max,10000000);assert.equal(h.input(id).props.inputMode,'numeric');}
 assert.equal(String(h.input('angle').props.step),'0.001');assert.match(text(h.row('variant:grey')),/Aluminium/);assert.match(text(h.row('variant:grey')),/3000/);assert.match(text(h.row('variant:grey')),/1500/);
 h.enter('variant:white','0');h.enter('variant:grey','2');h.enter('angle','3.5');h.button('Review counts').props.onClick();assert.match(text(h.render().find(n=>n.props.className==='ws-count-progress')),/3 of 3 counted/);assert.equal(h.button('Submit stocktake').props.disabled,false);
 await h.button('Submit stocktake').props.onClick();const payload=h.sent[0];assert.equal(payload.action,'stocktake_batch');assert.equal(payload.stocktakeId,'mixed');assert.deepEqual(payload.counts.map(row=>[row.itemId,row.quantity,row.expectedQty]),[['variant:white','0',8],['variant:grey','2',7],['angle','3.5',10]]);
 for(const row of payload.counts.filter(row=>row.itemId.startsWith('variant:')))assert.equal(row.expectedIdentity,h.states[0].items.find(item=>item.id===row.itemId).stocktakeIdentity);
 const dialog=h.render().find(n=>n.props['aria-label']==='Completed stocktake report');assert.ok(dialog);
 const countedRows=walk(dialog).filter(n=>n.type==='tr').map(n=>(n.children||[]).flat(Infinity).filter(child=>child?.type==='td')).filter(row=>row.length);assert.deepEqual(countedRows.map(row=>[text(row[2]),text(row[4])]),[['sheets','0'],['sheets','2'],['lengths','3.5']]);assert.doesNotMatch(text(dialog),/5\.5 (?:sheets|lengths)/);
});

test('fractional/out-of-range sheets and same-quantity material changes block submission until corrected',()=>{
 const h=harness();h.start();h.enter('variant:white','1.5');h.button('Review counts').props.onClick();assert.equal(h.button('Submit stocktake').props.disabled,true);assert.match(text(h.row('variant:white')),/whole number of sheets/);
 h.enter('variant:white','10000001');assert.equal(h.button('Submit stocktake').props.disabled,true);h.enter('variant:white','0');assert.equal(h.button('Submit stocktake').props.disabled,false);
 const item=h.states[0].items.find(row=>row.id==='variant:white'),oldIdentity=item.stocktakeIdentity;item.width=3000;const identity=JSON.parse(oldIdentity);identity[5]=3000;item.stocktakeIdentity=JSON.stringify(identity);assert.equal(item.qty,8);assert.equal(h.button('Submit stocktake').props.disabled,true);assert.match(text(h.row(item.id)),/Stock changed/);
 h.enter(item.id,'0');assert.equal(h.button('Submit stocktake').props.disabled,false);assert.equal(h.sent.length,0);assert.equal([...h.storage.values()].some(value=>JSON.parse(value).counts?.[item.id]?.expectedIdentity===item.stocktakeIdentity),true);
});

function unzip(bytes){const files={};let offset=0;while(bytes.readUInt32LE(offset)===0x04034b50){const size=bytes.readUInt32LE(offset+18),length=bytes.readUInt16LE(offset+26),name=bytes.subarray(offset+30,offset+30+length).toString();files[name]=bytes.subarray(offset+30+length,offset+30+length+size).toString();offset+=30+length+size;}return files;}
const numeric=(xml,ref)=>{const match=xml.match(new RegExp('<c r="'+ref+'"[^>]*><v>([^<]+)</v>'));assert.ok(match,'numeric '+ref);return Number(match[1]);};
const itemRow=(xml,name,column)=>{const match=xml.match(new RegExp('<c r="'+column+'(\\d+)"[^>]*t="inlineStr"[^>]*><is><t[^>]*>'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?: / |<)'));assert.ok(match,name+' row');return Number(match[1]);};

test('completed and monthly panel Excel use counted geometry/catalogue prices rather than later live SOH',async()=>{
 const h=harness(),completed=completion(h.states[0]),raw=completed.stocktakes[0].report,before=JSON.stringify(raw),live=completed.items.map(row=>({...row,qty:99999,width:100,height:100,name:'LATER LIVE ITEM',catalogueCost:{...row.catalogueCost,ratePerM2:999}})),api=h.context.window.PanelStockStocktakeReport;
 const prepared=api.prepareWorkbook(raw,{currentRows:live,currentSettings:settings(),allowCurrentPricing:true,generatedAt:'2026-11-09T00:00:00Z'}),panel=prepared.rows.find(row=>row.itemId==='variant:grey');
 assert.equal(panel.quantity,2);assert.equal(panel.width,3000);assert.equal(panel.height,1500);assert.equal(panel.unitAreaM2,4.5);assert.equal(panel.areaRatePerM2,17);assert.equal(panel.lineValue,153);assert.equal(prepared.rows.find(row=>row.itemId==='variant:white').quantity,0);assert.equal(prepared.costSummary.totalValue,161.75);
 const monthly=api.prepareMonthly(completed.stocktakes,{month:'2026-11',currentRows:live,currentSettings:settings(),allowCurrentPricing:true,generatedAt:'2026-11-09T00:00:00Z'});assert.equal(monthly.rows.length,3);assert.equal(monthly.rows.find(row=>row.itemId==='variant:grey').lineValue,153);
 for(const value of [prepared,monthly]){
  const files=unzip(Buffer.from(await api.xlsx(value).arrayBuffer())),main=files['xl/worksheets/sheet1.xml'],audit=files['xl/worksheets/sheet4.xml'],r=itemRow(main,'grey full sheet','C'),a=itemRow(audit,'variant:grey','A');
  assert.equal(numeric(main,'E'+r),2);assert.equal(numeric(main,'G'+r),76.5);assert.equal(numeric(main,'H'+r),153);assert.match(main,/3000 x 1500 mm/);assert.match(main,/>UOM</);assert.match(main,/autoFilter ref="A4:H/);assert.doesNotMatch(main,/LATER LIVE ITEM|<t[^>]*>Account<|<t[^>]*>Code<|<t[^>]*>Type</);
  assert.equal(numeric(audit,'Y'+a),17);assert.equal(numeric(audit,'Z'+a),4.5);assert.equal(numeric(audit,'K'+a),2);assert.match(audit,/Panel catalogue grey/);assert.match(main,/<c r="H3"[^>]*><f>[^<]+<\/f><v>161\.75<\/v>/);
 }
 assert.equal(JSON.stringify(raw),before);
});
