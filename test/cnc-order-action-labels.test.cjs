const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const appPath=process.env.CNC_ACTION_LABEL_APP||path.join(__dirname,fs.existsSync(path.join(__dirname,'../panelstock-app.modern.js'))?'../panelstock-app.modern.js':'../index.html'),app=fs.readFileSync(appPath,'utf8');
const factory=app.match(/      function jsxProd\(type, config, maybeKey\) \{[\s\S]*?\n      \}/);
assert.ok(factory,'Use the actual React JSX factory embedded in the deployed application');
const jsx=vm.runInNewContext(factory[0]+';jsxProd',{REACT_ELEMENT_TYPE:Symbol.for('react.transitional.element')});
const start=app.indexOf('  function CncOrderGroups('),end=app.indexOf('  function CncSheetGroups(',start);
assert.ok(start>=0&&end>start,'CNC order grouping component is present');
const component=app.slice(start,end),scope={project:'Tower',orderNumber:'001'};
const pending={id:'pending-record',jobReference:'Tower',orderNumber:'001',sheetNumber:'1',panelNumber:'P-1',status:'pending'},completed={...pending,id:'legacy-cut-record',panelNumber:'P-2',status:'completed',completedAt:null};
function nodes(value){return Array.isArray(value)?value.flatMap(nodes):value&&typeof value==='object'?[value,...nodes(value.props?.children)]:[];}
function render(panels,allPanels,handlers={}){
 const context={Map,Set,import_jsx_runtime:{jsx,jsxs:jsx},useState:initial=>[typeof initial==='function'?initial():initial,()=>{}],compareCncOrders:()=>0,CncSheetGroups:'sheets',CncOffcutPrintButton:'labels',CncDeleteGroupButton:'delete'};
 const CncOrderGroups=vm.runInNewContext(component+';CncOrderGroups',context);
 return nodes(CncOrderGroups({panels,allPanels,query:'filtered order',renderGroup(){},...handlers}));
}
const action=(all,label)=>all.find(node=>node.type==='button'&&node.props['aria-label']===label);
test('the production JSX factory treats its third argument as a key and only renders props.children',()=>{
 const wrong=jsx('button',{type:'button'},'Reset QA'),correct=jsx('button',{type:'button',children:'Reset QA'});
 assert.equal(wrong.key,'Reset QA');assert.equal(wrong.props.children,undefined);
 assert.equal(correct.props.children,'Reset QA');assert.equal(correct.key,null);
});
test('both admin CNC order actions render their visible labels and retain the full order callbacks',()=>{
 const calls=[],all=render([pending],[pending,completed],{onResetQa:value=>calls.push(['reset',value]),onReuploadDrawings:value=>calls.push(['reupload',value])});
 const reset=action(all,'Reset QA for order 001'),reupload=action(all,'Re-upload CNC drawings for order 001');
 assert.ok(reset);assert.ok(reupload);
 assert.deepEqual([reset.props.children,reupload.props.children],['Reset QA','Re-upload CNC drawings']);
 assert.notEqual(reset.key,'Reset QA');assert.notEqual(reupload.key,'Re-upload CNC drawings');
 assert.equal(reset.props.disabled,false);assert.notEqual(reupload.props.disabled,true);
 reset.props.onClick();reupload.props.onClick();assert.deepEqual(JSON.parse(JSON.stringify(calls)),[['reset',scope],['reupload',scope]]);
 assert.equal(all.find(node=>node.type==='sheets').props.allPanels.length,2);
});
test('pending-only orders keep readable labels while disabling QA reset and permitting drawing reupload',()=>{
 const all=render([pending],[pending],{onResetQa(){},onReuploadDrawings(){}}),reset=action(all,'Reset QA for order 001'),reupload=action(all,'Re-upload CNC drawings for order 001');
 assert.equal(reset.props.children,'Reset QA');assert.equal(reset.props.disabled,true);
 assert.equal(reupload.props.children,'Re-upload CNC drawings');assert.notEqual(reupload.props.disabled,true);
});
test('admin actions are absent when callbacks are not supplied and stay separately permission-gated',()=>{
 const all=render([completed],[completed]);assert.equal(action(all,'Reset QA for order 001'),undefined);assert.equal(action(all,'Re-upload CNC drawings for order 001'),undefined);
 assert.match(app,/onResetOrderQa: isAdmin \? resetCncOrderQaRequest : null/);assert.match(app,/onReuploadOrderIds: isAdmin \? reuploadCncOrderIdsRequest : null/);
 assert.match(app,/onResetQa: isAdmin && typeof onResetOrderQa === "function" \? setOrderQaToReset : null/);assert.match(app,/onReuploadDrawings: isAdmin && typeof onReuploadOrderIds === "function" \? setOrderToReupload : null/);
});
