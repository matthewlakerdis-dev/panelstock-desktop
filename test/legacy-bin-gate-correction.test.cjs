const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const legacy={id:'legacy-gate',orderNumber:'60',orderType:'Gate',colour:'',project:'Palm Lakes',villa:'V74',siteContact:'Contact',phone:'0400000000',requestedDeliveryDate:'2026-11-20',status:'approved',updatedAt:'saved-version',items:[{quantity:2,description:'V74 BIN GATES'}],manualProduction:{stages:{drawn:'pending'},qaRevision:null},gateComponents:{spec:{sets:[{gates:1,highlights:2,posts:0}]},components:[{id:'original-gate',key:'set-1-gate'}]}};
function expression(marker){
 const start=source.indexOf(marker);assert.ok(start>=0,'Editor field is present');let depth=0,quote='',escaped=false;
 for(let index=start;index<source.length;index++){
  const char=source[index];
  if(quote){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char===quote)quote='';continue;}
  if(['"',"'",'`'].includes(char)){quote=char;continue;}
  if(char==='(')depth++;else if(char===')'&&!--depth)return source.slice(start,index+1);
 }
 throw Error('Editor field did not close');
}
const typeField=expression('e("select",{disabled:panel.mode==="view",value:panel.order.orderType||"Other"');
const colourField=expression('e("select",{name:"colour",required:isGateOrder(panel.order)');
function field(code,panel){
 return vm.runInNewContext(code,{panel,orderTypes:['Panels','Bin Gate','Buggy Gate','Fixings','Other'],isGateOrder:order=>['gate','bin gate','buggy gate','side access gate'].includes(String(order.orderType).trim().toLowerCase()),e:(tag,props,...children)=>({tag,props,children}),update:(key,value)=>{panel.order={...panel.order,[key]:value};}});
}
test('legacy Gate can be changed to Bin Gate and back without disappearing from the editor',()=>{
 const panel={mode:'edit',base:structuredClone(legacy),order:structuredClone(legacy)},options=select=>select.children.flat(Infinity).filter(child=>child?.tag==='option').map(option=>option.props.value);
 let select=field(typeField,panel);assert.ok(options(select).includes('Gate'));
 select.props.onChange({target:{value:'Bin Gate'}});select=field(typeField,panel);
 assert.equal(select.props.value,'Bin Gate');assert.ok(options(select).includes('Gate'));
 assert.equal(panel.order.colour,'');assert.deepEqual(panel.order.items,legacy.items);assert.deepEqual(panel.order.gateComponents,legacy.gateComponents);
 select.props.onChange({target:{value:'Gate'}});assert.equal(field(typeField,panel).props.value,'Gate');
 const create={mode:'new',base:null,order:{orderType:'Other'}};assert.ok(!options(field(typeField,create)).includes('Gate'));
 create.order.orderType='Gate';assert.ok(!options(field(typeField,create)).includes('Gate'),'new orders never offer the retired legacy type');
});
test('only compatible existing gate edits can retain a missing saved colour',()=>{
 for(const orderType of ['Gate','Bin Gate']){
  const panel={mode:'edit',base:structuredClone(legacy),order:{...legacy,orderType}};
  assert.equal(field(colourField,panel).props.required,false);assert.equal(field(colourField,panel).props.value,'');
 }
 const cases=[
  {mode:'new',base:null,order:{...legacy,orderType:'Bin Gate'}},
  {mode:'edit',base:legacy,order:{...legacy,orderType:'Buggy Gate'}},
  {mode:'edit',base:{...legacy,orderType:'Bin Gate'},order:{...legacy,orderType:'Gate'}},
  {mode:'edit',base:{...legacy,colour:'Spruce'},order:{...legacy,orderType:'Bin Gate',colour:''}},
  {mode:'edit',base:{...legacy,colour:'Norwegian Beech'},order:{...legacy,colour:''}}
 ];
 for(const panel of cases)assert.equal(field(colourField,panel).props.required,true);
 const selected={mode:'edit',base:legacy,order:{...legacy,orderType:'Bin Gate',colour:'Spruce'}};
 assert.equal(field(colourField,selected).props.required,true);assert.equal(field(colourField,selected).props.value,'Spruce');
});
test('saving the legacy Bin Gate correction sends its blank colour and original parts without choosing a finish',async()=>{
 const start=source.indexOf('    async function saveOrder(event)'),end=source.indexOf('    async function downloadOrder(',start);let submitted;
 const context={panel:{mode:'edit',base:structuredClone(legacy),order:{...structuredClone(legacy),orderType:'Bin Gate'}},saving:false,pendingFiles:[],BAKED_WORKER_URL:'https://synthetic.example',isPanelOrder:()=>false,validateSiteOrderForm:()=>true,setNotice(){},setSaving(){},setPendingFiles(){},loadOrders:async()=>{},PanelStock:{apiFetch:async(url,options)=>{assert.equal(url,'https://synthetic.example/orders/legacy-gate');submitted=JSON.parse(options.body);return Response.json({ok:true,order:submitted.order});}}};
 context.setPanel=next=>{context.panel=typeof next==='function'?next(context.panel):next;};
 vm.runInNewContext(source.slice(start,end)+'globalThis.save=saveOrder;',context);
 await context.save({preventDefault(){},currentTarget:{}});
 assert.equal(submitted.order.orderType,'Bin Gate');assert.equal(submitted.order.colour,'');assert.equal(submitted.expectedUpdatedAt,'saved-version');
 for(const key of ['items','manualProduction','gateComponents'])assert.deepEqual(submitted.order[key],legacy[key]);
 assert.equal(context.panel,null);
});
