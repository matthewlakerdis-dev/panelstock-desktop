const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../reports-page.js'),'utf8');
const children=value=>Array.isArray(value)?value.flatMap(children):value&&typeof value==='object'?[value,...children(value.children)]:[];
function harness(props={}){
 const window={};
 vm.runInNewContext(source,{window,requestAnimationFrame:callback=>callback()});
 const state=[],refs=[],effects=[];
 let cursor=0;
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),
  useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],value=>{state[i]=value;}];},
  useRef(initial){const i=cursor++;return refs[i]??(refs[i]={current:initial});},
  useEffect(effect,deps){const i=cursor++;if(!state[i]||deps.some((value,j)=>state[i][j]!==value)){state[i]=deps;effects.push(effect);}}
 };
 const Reports=window.createReportsPage(React);
 const draw=(Component,data)=>{cursor=0;return children(Component(data));};
 const report=()=>draw(Reports,props);
 const pick=(label,value)=>report().find(node=>node.type==='label'&&node.children[0].children[0]===label).children[1].props.onChange({target:{value}});
 return {report,pick,draw,reset(){state.length=0;refs.length=0;effects.length=0;},tick:async()=>{while(effects.length)effects.shift()();await new Promise(setImmediate);}};
}
test('Production m² picker offers ISO week rows across years and commits the selected week only on OK',()=>{
 const report=harness();report.pick('Report','m2');report.pick('Group by','weekly');
 const picker=report.report().find(node=>node.props.label==='From week');
 report.reset();
 const commits=[];
 const props={...picker.props,value:'2026-W01',onChange:value=>commits.push(value)};
 report.draw(picker.type,props).find(n=>n.type==='button').props.onClick();
 const dialog=report.draw(picker.type,props).find(n=>typeof n.type==='function');
 report.reset();
 const calendar=()=>report.draw(dialog.type,dialog.props);
 const week=calendar().find(n=>n.props['aria-label']==='Week 1, 29 Dec 2025 – 4 Jan 2026');
 assert.equal(week.props['aria-pressed'],true);
 calendar().find(n=>n.props['aria-label']==='Next month').props.onClick();
 calendar().find(n=>n.props['aria-label']==='Week 2, 5 Jan 2026 – 11 Jan 2026').props.onClick();
 assert.deepEqual(commits,[]);
 calendar().find(n=>n.type==='button'&&n.children.includes('OK')).props.onClick();
 assert.deepEqual(commits,['2026-W02']);
});
test('QA options narrow by project and order, and both order overview types are available',async()=>{
 const requested=[];
 const h=harness({loadQa:async()=>({items:[
  {id:'P1',kind:'panel',project:'North',orderNumber:'001',reference:'P-01',latest:{}},
  {id:'P2',kind:'panel',project:'North',orderNumber:'002',reference:'P-02',latest:{}},
  {id:'G1',kind:'metalwork',gateOrderId:'gate-1',project:'North',orderNumber:'201',reference:'Leaf A',gateOrder:{villa:'Villa 7'},latest:{}}
 ],gateOrders:[{orderId:'gate-1',project:'North',orderNumber:'201',villa:'Villa 7'}]}),
 downloadQaOverview:async selection=>{requested.push({...selection});}});
 h.pick('Report','qa');h.report();await h.tick();
 h.pick('Project','North');h.pick('Order number','001');
 assert.ok(h.report().some(n=>n.type==='option'&&n.props.value==='P1'));
 assert.ok(!h.report().some(n=>n.type==='option'&&n.props.value==='P2'));
 const overview=()=>h.report().find(n=>n.type==='button'&&n.children.includes('Download order QA overview PDF'));
 await overview().props.onClick();
 h.pick('Inspection type','gate');h.pick('Project','North');h.pick('Order number','gate-1');
 assert.ok(h.report().some(n=>n.type==='option'&&n.children.includes('Villa 7 · Leaf A')));
 await overview().props.onClick();
 assert.deepEqual(requested,[{project:'North',orderNumber:'001'},{orderId:'gate-1'}]);
});
