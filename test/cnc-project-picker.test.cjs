const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const files=[path.join(__dirname,"../index.html")];
function harness(file,fetch){
 const text=fs.readFileSync(file,'utf8'),source=text.slice(text.indexOf('  function CncProjectPicker('),text.indexOf('  function CncBulkForm('));
 let states=[],cursor=0,effect,cleanup,pending=true,props={value:'',onChange:()=>{}};
 const render=vm.runInNewContext(source+';CncProjectPicker',{useState:v=>{const i=cursor++;if(!(i in states))states[i]=v;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useEffect:fn=>{if(pending){effect=fn;pending=false;}},PanelStock:{apiFetch:fetch},BAKED_WORKER_URL:'https://example.test',inputCls:'input',import_jsx_runtime:{jsx:(tag,props)=>({tag,...props})}});
 const draw=patch=>{props={...props,...patch};cursor=0;return render(props);};
 const flatten=n=>Array.isArray(n)?n.flatMap(flatten):n&&typeof n==='object'?[n,...flatten(n.children)]:[];
 return {draw:patch=>flatten(draw(patch)),load:async()=>{cleanup=effect();await new Promise(resolve=>setImmediate(resolve));},retry:()=>{pending=true;},unmount:()=>cleanup(),states:()=>states};
}
for(const file of files){
 test(file+': all projects including inactive are sorted, deduplicated and selectable',async()=>{
  let endpoint,chosen;const ui=harness(file,async url=>{endpoint=url;return {ok:true,json:async()=>({projects:[{id:'b',name:'Zulu',active:false},{id:'a',name:'Alpha'},{id:'dup',name:'alpha'},{id:'blank',name:' '}]})};});
  assert.equal(ui.draw().find(n=>n.tag==='select').disabled,true);await ui.load();
  const nodes=ui.draw({onChange:v=>chosen=v});assert.equal(endpoint,'https://example.test/projects');
  assert.deepEqual(nodes.filter(n=>n.tag==='option').map(n=>n.children),['Select a project','Alpha','Zulu (inactive)']);
  nodes.find(n=>n.tag==='select').onChange({target:{value:'Zulu'}});assert.equal(chosen,'Zulu');
  assert.equal(ui.draw({value:'ALPHA'}).find(n=>n.tag==='select').value,'Alpha');
  assert.ok(ui.draw({value:'Old job'}).some(n=>n.tag==='option'&&n.children==='Old job (existing reference)'));
 });
 test(file+': a failed project request can be retried; empty lists are explained',async()=>{
  let attempt=0;const ui=harness(file,async()=>{if(!attempt++)throw Error('offline');return {ok:true,json:async()=>({projects:[]})};});
  ui.draw();await ui.load();let nodes=ui.draw();assert.ok(nodes.some(n=>n.role==='alert'));nodes.find(n=>n.tag==='button').onClick();ui.retry();ui.draw();await ui.load();
  assert.ok(ui.draw().some(n=>n.role==='status'&&n.children.includes('No projects found')));
 });
 test(file+': unmounted picker ignores late project responses',async()=>{
  let finish;const ui=harness(file,()=>new Promise(resolve=>finish=resolve));ui.draw();await ui.load();ui.unmount();
  finish({ok:true,json:async()=>({projects:[{name:'Late'}]})});await new Promise(resolve=>setImmediate(resolve));assert.equal(ui.states()[1],'loading');
 });
 test(file+': strict import project selection accepts only a loaded project and never preserves PDF text',async()=>{
  const changes=[],ui=harness(file,async()=>({ok:true,json:async()=>({projects:[{id:'known',name:'Chosen Project'}]})}));
  ui.draw({value:'PDF project text',strict:true,required:true,onChange:(name,project)=>changes.push({name,project})});await ui.load();
  const nodes=ui.draw(),select=nodes.find(n=>n.tag==='select');assert.equal(select.value,'');assert.equal(select.required,true);assert.ok(!nodes.some(n=>n.tag==='option'&&n.children==='PDF project text (existing reference)'));
  select.onChange({target:{value:'PDF project text'}});assert.equal(changes[0].name,'');assert.equal(changes[0].project,null);
  select.onChange({target:{value:'Chosen Project'}});assert.equal(changes[1].name,'Chosen Project');assert.equal(changes[1].project.id,'known');
 });

}

