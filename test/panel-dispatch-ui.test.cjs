const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const start=source.indexOf('  function PanelDispatchLoads()'),end=source.indexOf('  function DispatchPage(',start);
function view(loads,selected=null,filter="active"){
 let index=0;const values=[loads,false,'',selected,{destinationType:'site'},'',filter];
 const context={import_react:{createElement:(tag,props,...children)=>({tag,props,children})},useState:initial=>{const i=index++;if(!(i in values))values[i]=initial;return [values[i],value=>{values[i]=typeof value==='function'?value(values[i]):value;}];},useRef:initial=>({current:initial}),useEffect:()=>{},PageHeading:'heading',Truck:'truck',EmptyState:'empty',PanelStock:{},BAKED_WORKER_URL:''};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 return {render(){index=0;return context.PanelDispatchLoads();}};
}
function render(loads,selected=null,filter="active"){return view(loads,selected,filter).render();}
function nodes(tree){if(!tree||typeof tree!=='object')return [];if(Array.isArray(tree))return tree.flatMap(nodes);return [tree,...nodes(tree.children)];}
const base={id:'load',project:'Job',orderNumber:'001',status:'waiting',items:[{id:'p',reference:'1'}],legs:[],routing:false,fabricationComplete:false,qaComplete:false,ready:false};
test('dispatch screen renders disabled dispatch while production is pending',()=>{const buttons=nodes(render([base])).filter(n=>n.tag==='button');assert.equal(buttons.find(n=>n.children.includes('Dispatch load')).props.disabled,true);assert.equal(buttons.some(n=>n.children.includes('Complete fabrication')),false);});
test('powder coating load displays completion action, not another dispatch',()=>{const buttons=nodes(render([{...base,status:'at_powder_coaters'}])).filter(n=>n.tag==='button');assert.ok(buttons.find(n=>n.children.includes('Mark coating complete')));assert.equal(buttons.some(n=>n.children.includes('Dispatch load')),false);});
test('second-leg form only offers site',()=>{const options=nodes(render([],{...base,status:'ready_for_site'})).filter(n=>n.tag==='option');assert.deepEqual(options.map(n=>n.props.value),['site']);});
test('coated loads awaiting final QA stay active with no dispatch action',()=>{const tree=nodes(render([{...base,status:'awaiting_final_qa',routing:true,qaComplete:true}])),buttons=tree.filter(n=>n.tag==='button');assert.ok(buttons.find(n=>n.children.includes('Approve final QA')));assert.equal(buttons.some(n=>n.children.includes('Dispatch to site')),false);assert.ok(tree.some(n=>n.children?.includes('Awaiting final QA')));});
test('QA no longer includes a dispatch form or dispatch button',()=>{const qa=source.slice(source.indexOf('  function QaCenter('),source.indexOf('  function AuditCenter('));assert.equal(qa.includes('/qa/dispatch'),false);assert.equal(qa.includes('Dispatch load'),false);});

test('active view hides dispatched loads and places ready loads first',()=>{const pending={...base,id:'pending',project:'Pending project'},ready={...base,id:'ready',project:'Ready project',ready:true,routing:true,fabricationComplete:true,qaComplete:true},sent={...ready,id:'sent',project:'Sent project',status:'dispatched_to_site'};const projects=tree=>nodes(tree).filter(n=>n.props?.className==='ps-panel-load-project').map(n=>n.children[0]);assert.deepEqual(projects(render([pending,sent,ready])),['Ready project','Pending project']);assert.deepEqual(projects(render([pending,sent,ready],null,'dispatched')),['Sent project']);});

test('milled first-leg form only offers powder coaters',()=>{const options=nodes(render([],{...base,requiresPowderCoating:true})).filter(n=>n.tag==='option');assert.deepEqual(options.map(n=>n.props.value),['powder_coaters']);});
test('milled dispatch card explains the required coating route',()=>{const tree=nodes(render([{...base,requiresPowderCoating:true,finalQaRequired:true,ready:true,routing:true,qaComplete:true,fabricationComplete:true}]));assert.ok(tree.some(n=>n.children?.includes('Send to powder coaters')));assert.ok(tree.some(n=>n.children?.includes('Final QA')));});

test('load rows start collapsed and toggle only the requested load',()=>{
 const screen=view([base,{...base,id:'other',project:'Other project'}]);
 let tree=nodes(screen.render()),summaries=tree.filter(n=>n.props?.className==='ps-panel-load-summary');
 assert.deepEqual(summaries.map(n=>n.props['aria-expanded']),[false,false]);
 assert.deepEqual(tree.filter(n=>n.props?.className==='ps-panel-load-expanded').map(n=>n.props.hidden),[true,true]);
 summaries[0].props.onClick();tree=nodes(screen.render());summaries=tree.filter(n=>n.props?.className==='ps-panel-load-summary');
 assert.deepEqual(summaries.map(n=>n.props['aria-expanded']),[true,false]);
 assert.equal(summaries[0].props['aria-controls'],'panel-load-details-load');
 assert.equal(tree.find(n=>n.props?.id==='panel-load-details-load').props.hidden,false);
 summaries[0].props.onClick();assert.equal(nodes(screen.render()).find(n=>n.props?.id==='panel-load-details-load').props.hidden,true);
});

test('progress excludes optional coating stages and includes every required coated stage',()=>{
 const progress=load=>nodes(render([load])).find(n=>n.props?.className==='ps-panel-load-progress-text').children[0];
 assert.equal(progress(base),'0 of 3 stages complete');
 const completed={...base,routing:true,fabricationComplete:true,qaComplete:true,ready:true};
 assert.equal(progress(completed),'3 of 3 stages complete');
 const coated={...completed,status:'awaiting_final_qa',requiresPowderCoating:true,finalQaRequired:true,ready:false,legs:[{destinationType:'powder_coaters'}]};
 assert.equal(progress(coated),'4 of 5 stages complete');
 assert.equal(progress({...coated,finalQa:{by:'inspector'},status:'ready_for_site',ready:true}),'5 of 5 stages complete');
});

test('summary and dispatch controls continue to honour server readiness and current QA blockers',()=>{
 const checked={...base,routing:true,fabricationComplete:true,qaComplete:true,ready:false};
 let tree=nodes(render([checked]));assert.equal(tree.find(n=>n.tag==='button'&&n.children.includes('Dispatch load')).props.disabled,true);
 assert.equal(tree.some(n=>n.children?.includes('In production')),true);
 tree=nodes(render([{...checked,status:'awaiting_final_qa',qaComplete:false,requiresPowderCoating:true}]));
 assert.equal(tree.find(n=>n.tag==='button'&&n.children.includes('Approve final QA')).props.disabled,true);
 assert.equal(tree.some(n=>n.children?.includes('Waiting for QA')),true);
});
