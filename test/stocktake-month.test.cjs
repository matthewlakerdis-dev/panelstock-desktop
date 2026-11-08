const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../workshop-stock.js'),'utf8');
const walk=n=>!n||typeof n!=='object'?[]:[n,...(n.children||[]).flat(Infinity).flatMap(walk)];
const text=n=>!n?'':typeof n==='string'||typeof n==='number'?String(n):(n.children||[]).flat(Infinity).map(text).join('');
const monthlyLabel='Only items not counted this month';
const stock=(id,category,supplier,countedThisMonth=false,patch={})=>({id,name:id,sku:id,category,supplier,countedThisMonth,unit:'each',qty:5,reserved:0,available:5,...patch});
const fixture=()=>({revision:17,stocktakeMonth:{key:'2026-11',label:'November 2026',timeZone:'Australia/Brisbane'},movements:[],items:[
 stock('counted-in-partial','extrusions','Rondo',true),
 stock('zero-uncounted','extrusions','Rondo',false,{qty:0,available:0}),
 stock('counted-last-month','extrusions','Rondo',false,{lastCountedAt:'2026-10-29T02:00:00Z'}),
 stock('other-supplier','extrusions','Capral'),
 stock('counted-fixing','fixings','Rondo',true),
 stock('uncounted-fixing','fixings','Capral'),
 stock('workshop-offcut','offcuts','Rondo'),
 stock('variant:panel','panels','Rondo',false,{legacy:true,unit:'sheets'}),
 stock('offcut:panel','offcuts','Rondo',false,{legacy:true,unit:'sheets'})
],stocktakes:[{id:'partial',name:'Part submitted',categories:['extrusions'],itemIds:['counted-in-partial','zero-uncounted'],counts:{'counted-in-partial':{quantity:5}},status:'open'}]});
function harness({missingMonth=false,failFirst=false}={}){
 const states=[],sent=[],storage=new Map();let cursor=0,ids=0;
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:value=>{const i=cursor++;if(!(i in states))states[i]=typeof value==='function'?value():value;return [states[i],value=>states[i]=typeof value==='function'?value(states[i]):value];},useEffect(){},Fragment:'fragment'};
 const context={window:{},TextEncoder,Blob,atob,crypto:{randomUUID:()=> 'month-mutation-'+(++ids)},PanelStock:{username:'admin',apiFetch:async(url,options)=>{if(options){sent.push(JSON.parse(options.body));if(failFirst&&sent.length===1)throw Error('Network unavailable');}return {ok:true,json:async()=>states[0]};}},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},document:{addEventListener(){}},setTimeout(){return 0;}};
 vm.runInNewContext(source,context);const C=context.window.createWorkshopStock(React),render=()=>{cursor=0;return walk(C({isAdmin:true,workerUrl:'/api'}));};render();states[0]=fixture();if(missingMonth)delete states[0].stocktakeMonth;
 const button=label=>render().find(n=>n.type==='button'&&n.children.includes(label));button('Stocktake').props.onClick();button('Create stocktake').props.onClick();
 const label=key=>render().find(n=>n.type==='label'&&n.props.key===key),control=key=>walk(label(key)).find(n=>n.type==='input'||n.type==='select');
 const monthly=()=>render().find(n=>n.type==='input'&&n.props['aria-label']===monthlyLabel)||walk(render().find(n=>n.type==='label'&&text(n).includes(monthlyLabel))).find(n=>n.type==='input'&&n.props.type==='checkbox');
 return {states,sent,storage,render,button,control,monthly,set(key,value){control(key).props.onChange({target:{value}});},toggle(checked){monthly().props.onChange({target:{checked}});},choose(key,checked=true){control(key).props.onChange({target:{checked}});},categoryCount(key){return text(walk(label(key)).find(n=>n.type==='small'));},selectedCategory(key){return control(key).props.checked;},submit:async()=>{const form=render().find(n=>n.type==='form');await form.props.onSubmit({preventDefault(){}});return sent.at(-1);},save:()=>render().find(n=>n.type==='button'&&n.props.type==='submit')};
}

test('new stocktakes default to all eligible workshop items and omit the month lease from the ordinary POST',async()=>{
 const x=harness(),before=structuredClone(x.states[0]);assert.ok(x.monthly());assert.equal(x.monthly().props.checked,false);assert.equal(x.monthly().props.disabled,false);
 assert.match(x.categoryCount('extrusions'),/4 items/);assert.match(x.categoryCount('fixings'),/2 items/);assert.match(x.categoryCount('offcuts'),/1 items/);assert.equal(x.control('panels'),undefined);
 x.set('name','November workshop count');x.choose('extrusions');assert.equal(text(x.render().find(n=>n.props['aria-label']==='Items in new stocktake')),'4 items to count');const payload=await x.submit();assert.equal(payload.action,'stocktake_create');assert.equal(payload.name,'November workshop count');assert.deepEqual(payload.categories,['extrusions']);assert.ok(payload.uncountedThisMonth===undefined||payload.uncountedThisMonth===false);assert.equal(Object.hasOwn(payload,'stocktakeMonth'),false);assert.deepEqual(x.states[0],before);
});

test('monthly eligibility combines category and supplier filters while retaining zero-stock and previous-month items',async()=>{
 const x=harness();x.set('name','Remaining Rondo items');x.choose('extrusions');x.choose('fixings');x.set('supplier','Rondo');x.toggle(true);
 assert.match(x.categoryCount('extrusions'),/2 items/);assert.match(x.categoryCount('fixings'),/0 items/);assert.match(x.categoryCount('offcuts'),/1 items/);assert.equal(x.control('supplier').props.value,'Rondo');assert.equal(x.selectedCategory('extrusions'),true);assert.equal(x.selectedCategory('fixings'),true);
 assert.equal(text(x.render().find(n=>n.props['aria-label']==='Items in new stocktake')),'2 items to count');x.toggle(false);assert.match(x.categoryCount('extrusions'),/3 items/);assert.match(x.categoryCount('fixings'),/1 items/);x.toggle(true);assert.match(x.categoryCount('extrusions'),/2 items/);
 const payload=await x.submit();assert.equal(payload.uncountedThisMonth,true);assert.equal(payload.stocktakeMonth,'2026-11');assert.equal(payload.supplier,'Rondo');assert.deepEqual(payload.categories,['extrusions','fixings']);assert.equal(payload.name,'Remaining Rondo items');
});

test('monthly category counts exclude items submitted in an open partial stocktake and exclude automatic panel snapshots from manual counts',()=>{
 const x=harness();x.toggle(true);assert.match(x.categoryCount('extrusions'),/3 items/);assert.match(x.categoryCount('fixings'),/1 items/);assert.match(x.categoryCount('offcuts'),/1 items/);assert.equal(x.control('panels'),undefined);
 const zero=x.states[0].items.find(i=>i.id==='zero-uncounted');assert.equal(zero.qty,0);assert.equal(zero.countedThisMonth,false);assert.equal(x.states[0].stocktakes[0].status,'open');assert.equal(x.states[0].items.find(i=>i.id==='counted-in-partial').countedThisMonth,true);
});

test('a monthly filter with no remaining workshop items can create a fresh automatic panel snapshot',async()=>{
 const x=harness();x.set('name','Already counted');x.set('supplier','Rondo');x.choose('fixings');x.toggle(true);assert.match(x.categoryCount('fixings'),/0 items/);assert.equal(x.save().props.disabled,false);assert.equal(text(x.render().find(n=>n.props['aria-label']==='Items in new stocktake')),'0 items to count');assert.ok(x.render().some(n=>n.type==='p'&&/No uncounted workshop items.*fresh panel SOH snapshot/.test(text(n))));
 x.toggle(false);assert.equal(x.selectedCategory('fixings'),true);assert.equal(x.control('supplier').props.value,'Rondo');assert.equal(x.save().props.disabled,false);x.toggle(true);
 const payload=await x.submit();assert.equal(x.sent.length,1);assert.equal(x.storage.size,0);assert.equal(payload.uncountedThisMonth,true);assert.equal(payload.stocktakeMonth,'2026-11');assert.deepEqual(payload.categories,['fixings']);assert.equal(payload.supplier,'Rondo');
});

test('missing server month context disables the optional checkbox while ordinary stocktake creation remains available',async()=>{
 const x=harness({missingMonth:true});assert.ok(x.monthly());assert.equal(x.monthly().props.disabled,true);assert.equal(x.monthly().props.checked,false);x.set('name','Normal stocktake');x.choose('extrusions');
 const payload=await x.submit();assert.equal(payload.action,'stocktake_create');assert.equal(Object.hasOwn(payload,'stocktakeMonth'),false);assert.ok(payload.uncountedThisMonth===undefined||payload.uncountedThisMonth===false);
});


test('losing the server month after selecting the monthly filter blocks even a forced form submission',async()=>{
 const x=harness();x.set('name','Month unavailable');x.choose('extrusions');x.toggle(true);delete x.states[0].stocktakeMonth;assert.equal(x.monthly().props.disabled,true);assert.equal(x.save().props.disabled,true);await x.submit();assert.equal(x.sent.length,0);assert.equal(x.storage.size,0);
});

test('retry preserves the exact monthly request and mutation when the displayed server month changes',async()=>{
 const x=harness({failFirst:true});x.set('name','Retry November');x.set('supplier','Rondo');x.choose('extrusions');x.toggle(true);await x.submit();assert.equal(x.sent.length,1);assert.equal(x.sent[0].stocktakeMonth,'2026-11');assert.equal(x.sent[0].uncountedThisMonth,true);
 const first=structuredClone(x.sent[0]);x.states[0].stocktakeMonth={key:'2026-12',label:'December 2026',timeZone:'Australia/Brisbane'};for(const item of x.states[0].items)item.countedThisMonth=true;
 assert.equal(x.monthly().props.disabled,true);assert.equal(x.control('supplier').props.disabled,true);assert.equal(x.save().props.disabled,false);assert.ok(x.save().children.includes('Retry save'));await x.submit();assert.equal(x.sent.length,2);assert.deepEqual(x.sent[1],first);assert.equal(x.sent[1].mutationId,'month-mutation-1');
});

test('creating a count waits for stock data before enabling or submitting Save',async()=>{
 const x=harness();x.set('name','Wait for stock');x.choose('extrusions');const loaded=x.states[0];x.states[0]=null;
 assert.equal(x.save().props.disabled,true);await x.submit();assert.equal(x.sent.length,0);assert.equal(x.storage.size,0);
 x.states[0]=loaded;assert.equal(x.save().props.disabled,false);const payload=await x.submit();assert.equal(payload.expectedRevision,17);assert.equal(payload.name,'Wait for stock');
});
