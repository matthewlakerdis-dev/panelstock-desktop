const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('workshop stock is reachable through authorised desktop navigation',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.match(html,/\['workshop','factory.stock'\]/);assert.match(html,/tab === "workshop" && can\("factory.stock"\)/);assert.match(html,/src="workshop-stock.js\?v=1"/);
 const script=fs.readFileSync(path.join(__dirname,'../workshop-stock.js'),'utf8');new vm.Script(script);
 assert.match(script,/localStorage.setItem\(pendingKey,JSON.stringify\(payload\)\)/);assert.match(script,/mutationId:crypto.randomUUID\(\)/);
});
test('both deployment builds include the workshop script and stylesheet',()=>{
 for(const name of ['build-production.cjs','build-staging.cjs']){
  const source=fs.readFileSync(path.join(__dirname,'../scripts',name),'utf8');
  assert.match(source,/'workshop-stock.js'/);assert.match(source,/'workshop-stock.css'/);
 }
});
test('SOH orders existing custom Steel correctly and preserves panel detail actions',()=>{
 const states=[];let cursor=0,opened=null;
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:v=>{const i=cursor++;if(!(i in states))states[i]=typeof v==='function'?v():v;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useEffect(){},Fragment:'fragment'};
 const context={window:{},PanelStock:{username:'test'},localStorage:{getItem:()=>null}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../workshop-stock.js'),'utf8'),context);
 const Component=context.window.createWorkshopStock(React),render=()=>{cursor=0;return Component({isAdmin:true,onPanels:i=>opened=i,onAddOffcut(){},onExportExcel(){},onExportPDF(){}});};
 render();states[0]={items:[{id:'variant:p',legacy:true,category:'panels',name:'Panel',qty:2,reserved:0,available:2}],categories:{'cat-steel':'Steel'},movements:[]};
 const walk=n=>!n||typeof n!=='object'?[]:[n,...(n.children||[]).flat(Infinity).flatMap(walk)];const nodes=walk(render());
 const tabs=nodes.find(n=>n.props['aria-label']==='Stock categories');
 assert.deepEqual(walk(tabs).filter(n=>n.type==='button').map(n=>n.children[0]),['All Stock','Panels','Offcuts','Extrusions','Steel','Fixings','Consumables','Other']);
 nodes.find(n=>n.props['aria-label']==='Stock action for Panel').props.onChange({target:{value:'panels'}});assert.equal(opened.id,'variant:p');
 assert.ok(nodes.some(n=>n.type==='button'&&n.children.includes('Add panel offcut')));
});
