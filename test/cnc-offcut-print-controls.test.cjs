const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const labels=require('../offcut-labels.js');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,fs.existsSync(path.join(root,'panelstock-app.modern.js'))?'panelstock-app.modern.js':'index.html'),'utf8');
function source(name){const start=app.indexOf('function '+name+'(');assert.ok(start>=0,name);const end=app.indexOf('\n  function ',start+9);return app.slice(start,end<0?undefined:end);}
function components(view='pending'){
 const jsx=(type,props,key)=>({type,...props,key});
 const createElement=(type,props,...children)=>({type,...props,...(children.length?{children:children.length===1?children[0]:children}:{})});
 const context={useState:init=>{const value=typeof init==='function'?init():init;return[value==='pending'?view:value,()=>{}];},import_jsx_runtime:{jsx,jsxs:jsx},import_react:{createElement},PanelStockOffcutLabels:labels,CNC_PUBLIC_TOKEN:'test-share-token',inputCls:'input'};
 for(const name of ['SectionTitle','CncRouterIcon','PageHeading','Plus','FileSpreadsheet','LinkIcon','Search','EmptyState'])context[name]=()=>null;
 vm.createContext(context);
 const page=app.includes('function CncTab(')?'CncTab':'CncPage';
 const names=['normalizeCncInput','compareCncOrders','CncOffcutPrintButton','CncJobGroups','CncOrderGroups','CncSheetGroups',page];
 vm.runInContext(names.map(source).join('\n')+'\nthis.api={'+names.join(',')+'};this.api.page='+page+';',context);
 return context.api;
}
function walk(node){return node&&typeof node==='object'?[node,...[node.children].flat().flatMap(walk)]:[];}
const proposal={length:480,width:1200,dimensionOrder:'sheet',approved:true,status:'pending'};
const row=(id,patch={})=>({id,jobReference:'Project A',orderNumber:'33',sheetNumber:'1',panelNumber:id,status:'pending',pendingOffcuts:[proposal],...patch});

test('order and sheet print actions include hidden siblings and stay within the selected project',()=>{
 const api=components(),calls=[];
 const all=[row('a'),row('b',{status:'completed'}),row('leading-zero',{sheetNumber:'01'}),row('copy',{sheetNumber:'1.2'}),row('other-order',{orderNumber:'34'}),row('other-project',{jobReference:'Other job'})];
 const before=JSON.stringify(all),print=rows=>calls.push(rows.map(r=>r.id));
 const tree=api.CncJobGroups({panels:[all[0],all[5]],allPanels:all,query:'a',renderGroup:()=>null,onPrintOffcutLabels:print});
 const jobs=walk(tree).filter(n=>n.type===api.CncOrderGroups);
 assert.equal(jobs.length,2);
 const orderTree=api.CncOrderGroups(jobs[0]);
 const orderAction=walk(orderTree).find(n=>n.type===api.CncOffcutPrintButton);
 const orderButton=api.CncOffcutPrintButton(orderAction);orderButton.onClick({stopPropagation(){}});
 assert.deepEqual(calls[0],['a','b','leading-zero','copy']);
 const sheetProps=walk(orderTree).find(n=>n.type===api.CncSheetGroups);
 const sheetTree=api.CncSheetGroups(sheetProps);
 const sheetAction=walk(sheetTree).find(n=>n.type===api.CncOffcutPrintButton);
 const sheetButton=api.CncOffcutPrintButton(sheetAction);let stopped=0;
 sheetButton.onClick({stopPropagation(){stopped++;}});
 assert.deepEqual(calls[1],['a','b']);assert.equal(stopped,1);
 assert.match(sheetButton['aria-label'],/sheet 1 in order 33/);
 const otherOrder=api.CncOrderGroups(jobs[1]);
 api.CncOffcutPrintButton(walk(otherOrder).find(n=>n.type===api.CncOffcutPrintButton)).onClick();
 assert.deepEqual(calls[2],['other-project']);assert.equal(JSON.stringify(all),before);
});

test('sheet control counts physical offcut pieces, not the number of panels',()=>{
 const api=components();let printed;
 const pieces=[proposal,{...proposal}];
 const panels=[row('a',{pendingOffcuts:pieces}),row('b',{pendingOffcuts:pieces})];
 const button=api.CncOffcutPrintButton({panels,onPrint:rows=>printed=rows,scope:{kind:'sheet',orderNumber:'33',sheetNumber:'1'}});
 assert.equal(button.disabled,false);assert.equal(button.children,'Print offcut labels (2)');
 button.onClick();assert.equal(printed,panels);
});

test('empty and historical unrecorded offcuts disable the print control',()=>{
 const api=components();
 for(const panels of [[row('empty',{pendingOffcuts:[]})],[row('old',{status:'completed'})]]){
  const button=api.CncOffcutPrintButton({panels,onPrint(){throw Error('No print expected');},scope:{kind:'order',orderNumber:'33'}});
  assert.equal(button.disabled,true);assert.match(button.title,/No retained offcuts/);
 }
});

test('CNC print handler uses read-only completed-aware collector without changing records',()=>{
 const start=app.indexOf('function printScheduledOffcutLabels('),end=app.indexOf('function addCncPanel(',start);
 assert.ok(start>=0&&end>start);
 const rows=[row('completed',{status:'completed'})],before=JSON.stringify(rows),stock={variants:[],offcuts:[]};let collected,printed,writes=0;
 const output=[{length:480,width:1200,material:'Solid Aluminium',thickness:3,color:'Milled'}];
 const context={isAdmin:true,cncPanels:rows,...stock,showToast(){},persist(){writes++;},setCncPanels(){writes++;},PanelStockOffcutLabels:{collectForCnc:(input,value)=>{collected={input,value};return output;},print:input=>{printed=input;return{ok:true};}}};
 vm.createContext(context);vm.runInContext(app.slice(start,end)+'\nthis.result=printScheduledOffcutLabels();',context);
 assert.equal(context.result,true);assert.equal(collected.input,rows);assert.equal(collected.value.variants,stock.variants);assert.equal(printed,output);
 assert.equal(writes,0);assert.equal(JSON.stringify(rows),before);
});

test('client loads the updated shared offcut renderer',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');assert.match(html,/offcut-labels\.js\?v=3/);
});


test('CNC page hides every offcut print entry point from nonadmins and keeps them for admins',()=>{
 for(const view of ['pending','completed']){
  const api=components(view),panels=[row('a',{status:view==='completed'?'completed':'pending',...(view==='completed'?{savedOffcuts:[proposal]}:{})})];
  const print=()=>{};
  for(const isAdmin of [false,undefined,true]){
   const tree=api.page({cncPanels:panels,variants:[],offcuts:[],isAdmin,onPrintOffcutLabels:print});
   const toolbar=walk(tree).find(node=>node.type==='button'&&node.children==='Print offcut labels');
   assert.equal(Boolean(toolbar),isAdmin===true&&view==='pending');
   const groups=walk(tree).find(node=>node.type===api.CncJobGroups);
   assert.ok(groups);
   assert.equal(groups.onPrintOffcutLabels,isAdmin===true?print:null);
   const jobs=api.CncJobGroups(groups);
   const orderProps=walk(jobs).find(node=>node.type===api.CncOrderGroups);
   const orderTree=api.CncOrderGroups({...orderProps,query:"a"});
   assert.equal(walk(orderTree).some(node=>node.type===api.CncOffcutPrintButton),isAdmin===true);
   const sheetProps=walk(orderTree).find(node=>node.type===api.CncSheetGroups);
   assert.equal(walk(api.CncSheetGroups(sheetProps)).some(node=>node.type===api.CncOffcutPrintButton),isAdmin===true);
  }
 }
});

test('direct CNC print invocation rejects nonadmins before accessing labels or opening print windows',()=>{
 const start=app.indexOf('function printScheduledOffcutLabels('),end=app.indexOf('function addCncPanel(',start);
 for(const isAdmin of [false,undefined]){
  const errors=[];let serviceReads=0;
  const context={isAdmin,cncPanels:[row('a')],showToast:(...args)=>errors.push(args)};
  Object.defineProperty(context,'PanelStockOffcutLabels',{get(){serviceReads++;throw Error('Labels must not be accessed');}});
  vm.createContext(context);vm.runInContext(app.slice(start,end)+'\nthis.result=printScheduledOffcutLabels();',context);
  assert.equal(context.result,false);assert.equal(serviceReads,0);assert.match(errors[0][0],/Admin access required/);assert.equal(errors[0][1],'err');
 }
});

test('stock Manage action only offers offcut labels to admins and rejects a forged nonadmin selection',()=>{
 const stockSource=fs.readFileSync(path.join(root,'workshop-stock.js'),'utf8');
 for(const isAdmin of [false,true]){
  const states=[];let cursor=0,prints=0;
  const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:init=>{const i=cursor++;if(!(i in states))states[i]=typeof init==='function'?init():init;return[states[i],value=>states[i]=typeof value==='function'?value(states[i]):value];},useEffect(){},Fragment:'fragment'};
  const context={window:{PanelStockOffcutLabels:{fromItem:item=>item,print(){prints++;}}},PanelStock:{username:isAdmin?'admin':'worker'},localStorage:{getItem:()=>null}};
  vm.runInNewContext(stockSource,context);
  const Component=context.window.createWorkshopStock(React),render=()=>{cursor=0;return Component({isAdmin,taskAccess:{'factory.stock':true}});};
  render();states[0]={items:[{id:'offcut:one',category:'offcuts',legacy:true,name:'Offcut',qty:1,available:1}],movements:[]};
  const walkStock=node=>!node||typeof node!=='object'?[]:[node,...(node.children||[]).flat(Infinity).flatMap(walkStock)];
  const nodes=walkStock(render()),select=nodes.find(node=>node.props['aria-label']==='Stock action for Offcut');
  assert.ok(select);
  assert.equal(walkStock(select).some(node=>node.type==='option'&&node.props.value==='print-offcut'),isAdmin);
  select.props.onChange({target:{value:'print-offcut'}});
  assert.equal(prints,isAdmin?1:0);
  if(!isAdmin)assert.ok(states.some(value=>typeof value==='string'&&value.includes('Admin access required')));
 }
});

test('legacy stock-detail offcut printing rejects nonadmins without changing full-sheet labels',()=>{
 const start=app.indexOf('function printLabel('),end=app.indexOf('function exportActivityExcel(',start);
 assert.ok(start>=0&&end>start);
 for(const isAdmin of [false,true]){
  const errors=[];let prints=0,exports=0;
  const context={isAdmin,offcuts:[],showToast:(...args)=>errors.push(args),PanelStockOffcutLabels:{fromItem:item=>item,print(){prints++;}},buildLabelLines:()=>[],buildPdfBlob:()=>({}),prepareExport(){exports++;}};
  vm.createContext(context);vm.runInContext(app.slice(start,end)+'\nthis.api=printLabel;',context);
  context.api({id:'offcut',itemType:'offcut'});assert.equal(prints,isAdmin?1:0);
  if(!isAdmin)assert.match(errors[0][0],/Admin access required/);
  context.api({id:'fullsheet',itemType:'variant',sku:'FULL'});assert.equal(exports,1);
 }
});
