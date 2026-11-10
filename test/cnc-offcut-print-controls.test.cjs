const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const labels=require('../offcut-labels.js');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,fs.existsSync(path.join(root,'panelstock-app.modern.js'))?'panelstock-app.modern.js':'index.html'),'utf8');
function source(name){const start=app.indexOf('function '+name+'(');assert.ok(start>=0,name);const end=app.indexOf('\n  function ',start+9);return app.slice(start,end<0?undefined:end);}
function components(){
 const context={useState:init=>[typeof init==='function'?init():init,()=>{}],import_jsx_runtime:{jsx:(type,props,key)=>({type,...props,key})},PanelStockOffcutLabels:labels};
 vm.createContext(context);
 const names=['normalizeCncInput','compareCncOrders','CncOffcutPrintButton','CncJobGroups','CncOrderGroups','CncSheetGroups'];
 vm.runInContext(names.map(source).join('\n')+'\nthis.api={'+names.join(',')+'};',context);
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
 const context={cncPanels:rows,...stock,showToast(){},persist(){writes++;},setCncPanels(){writes++;},PanelStockOffcutLabels:{collectForCnc:(input,value)=>{collected={input,value};return output;},print:input=>{printed=input;return{ok:true};}}};
 vm.createContext(context);vm.runInContext(app.slice(start,end)+'\nthis.result=printScheduledOffcutLabels();',context);
 assert.equal(context.result,true);assert.equal(collected.input,rows);assert.equal(collected.value.variants,stock.variants);assert.equal(printed,output);
 assert.equal(writes,0);assert.equal(JSON.stringify(rows),before);
});

test('client loads the updated shared offcut renderer',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');assert.match(html,/offcut-labels\.js\?v=2/);
});
