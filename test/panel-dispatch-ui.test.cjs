const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const start=source.indexOf('  function PanelDispatchLoads()'),end=source.indexOf('  function DispatchPage(',start);
function render(loads,selected=null,filter="active"){let index=0;const values=[loads,false,'',selected,{destinationType:'site'},'',filter];const context={import_react:{createElement:(tag,props,...children)=>({tag,props,children})},useState:()=>[values[index++],()=>{}],useEffect:()=>{},PageHeading:'heading',Truck:'truck',EmptyState:'empty',PanelStock:{},BAKED_WORKER_URL:''};vm.createContext(context);return vm.runInContext(source.slice(start,end)+';PanelDispatchLoads()',context);}
function nodes(tree){if(!tree||typeof tree!=='object')return [];if(Array.isArray(tree))return tree.flatMap(nodes);return [tree,...nodes(tree.children)];}
const base={id:'load',project:'Job',orderNumber:'001',status:'waiting',items:[{id:'p',reference:'1'}],legs:[],routing:false,fabricationComplete:false,qaComplete:false,ready:false};
test('dispatch screen renders disabled dispatch while production is pending',()=>{const buttons=nodes(render([base])).filter(n=>n.tag==='button');assert.equal(buttons.find(n=>n.children.includes('Dispatch load')).props.disabled,true);assert.equal(buttons.some(n=>n.children.includes('Complete fabrication')),false);});
test('powder coating load displays completion action, not another dispatch',()=>{const buttons=nodes(render([{...base,status:'at_powder_coaters'}])).filter(n=>n.tag==='button');assert.ok(buttons.find(n=>n.children.includes('Mark coating complete')));assert.equal(buttons.some(n=>n.children.includes('Dispatch load')),false);});
test('second-leg form only offers site',()=>{const options=nodes(render([],{...base,status:'ready_for_site'})).filter(n=>n.tag==='option');assert.deepEqual(options.map(n=>n.props.value),['site']);});
test('QA no longer includes a dispatch form or dispatch button',()=>{const qa=source.slice(source.indexOf('  function QaCenter('),source.indexOf('  function AuditCenter('));assert.equal(qa.includes('/qa/dispatch'),false);assert.equal(qa.includes('Dispatch load'),false);});

test('active view hides dispatched loads and places ready loads first',()=>{const pending={...base,id:'pending',project:'Pending project'},ready={...base,id:'ready',project:'Ready project',ready:true,routing:true,fabricationComplete:true,qaComplete:true},sent={...ready,id:'sent',project:'Sent project',status:'dispatched_to_site'};const headings=nodes(render([pending,sent,ready])).filter(n=>n.tag==='h3').map(n=>n.children[0]);assert.deepEqual(headings,['Ready project','Pending project']);assert.deepEqual(nodes(render([pending,sent,ready],null,'dispatched')).filter(n=>n.tag==='h3').map(n=>n.children[0]),['Sent project']);});
