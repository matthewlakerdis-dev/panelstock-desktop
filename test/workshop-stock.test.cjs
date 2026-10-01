const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('workshop stock is reachable through authorised desktop navigation',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.match(html,/\['workshop','factory.stock'\]/);assert.match(html,/tab === "workshop" && can\("factory.stock"\)/);assert.match(html,/src="workshop-stock.js\?v=3"/);
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
 assert.ok(nodes.some(n=>n.type==='button'&&n.props['aria-label']==='Add panel offcut'));
});
test('workers select named stocktakes and only see unsubmitted items in the count',()=>{
 const states=[];let cursor=0;const storage=new Map();
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:v=>{const i=cursor++;if(!(i in states))states[i]=typeof v==='function'?v():v;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useEffect(){},Fragment:'fragment'};
 const context={window:{},PanelStock:{username:'worker',apiFetch:async()=>({ok:true,json:async()=>states[0]})},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../workshop-stock.js'),'utf8'),context);
 const Component=context.window.createWorkshopStock(React),render=()=>{cursor=0;return Component({isAdmin:false,taskAccess:{'factory.stock':true}});};
 const walk=n=>!n||typeof n!=='object'?[]:[n,...(n.children||[]).flat(Infinity).flatMap(walk)];
 render();states[0]={items:['a','b','c'].map(id=>({id,name:id,sku:id,category:'fixings',qty:2,available:2,unit:'each'})),movements:[],stocktakes:[{id:'count1',name:'October fixings',categories:['fixings'],itemIds:['a','b'],counts:{a:{quantity:2}},status:'open'}]};
 let nodes=walk(render());nodes.find(n=>n.type==='button'&&n.children.includes('Stocktake')).props.onClick();nodes=walk(render());
 assert.ok(!nodes.some(n=>n.type==='button'&&n.children.includes('Create stocktake')));
 nodes.find(n=>n.type==='button'&&n.children.includes('Continue count')).props.onClick();nodes=walk(render());
 assert.ok(nodes.some(n=>n.type==='h3'&&n.children.includes('October fixings')));
 const inputs=nodes.filter(n=>n.props['data-count-input']);assert.equal(inputs.length,1);assert.match(inputs[0].props['aria-label'],/Count b/);
 inputs[0].props.onChange({target:{value:'0'}});assert.ok(storage.has('panelstock:stocktake:worker:count1'));
});

test('restocking overview uses available stock and incoming quantities without mixing units',()=>{
 const states=[];let cursor=0;
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:v=>{const i=cursor++;if(!(i in states))states[i]=typeof v==='function'?v():v;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useEffect(){},Fragment:'fragment'};
 const context={window:{},PanelStock:{username:'worker'},localStorage:{getItem:()=>null}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../workshop-stock.js'),'utf8'),context);
 const Component=context.window.createWorkshopStock(React),render=()=>{cursor=0;return Component({isAdmin:false,taskAccess:{'factory.stock':true}});};
 const walk=n=>!n||typeof n!=='object'?[]:[n,...(n.children||[]).flat(Infinity).flatMap(walk)];
 const text=n=>n==null||n===false?'':typeof n!=='object'?String(n):(n.children||[]).flat(Infinity).map(text).join(' ');
 render();states[0]={items:[
  {id:'a',name:'Angle',category:'extrusions',qty:10,reserved:8,available:2,reorderLevel:10,onOrder:3,unit:'lengths'},
  {id:'b',name:'Rivets',category:'fixings',qty:0,available:0,reorderLevel:2,onOrder:4,unit:'boxes'},
  {id:'c',name:'Healthy',category:'fixings',qty:20,available:20,reorderLevel:2,unit:'each'}
 ],movements:[]};
 let nodes=walk(render()),overview=nodes.find(n=>n.props.className==='ws-restock');
 assert.match(text(overview),/2 low-stock items · 2 awaiting deliveries · 1 to review/);
 const cards=walk(overview).filter(n=>n.type==='article');assert.equal(cards.length,2);
 const angle=cards.find(n=>text(n).includes('Angle'));
 assert.match(text(angle),/Shortfall 5/);assert.match(text(angle),/More stock needed/);
 assert.match(text(cards.find(n=>text(n).includes('Rivets'))),/Shortfall 0/);
 assert.ok(!walk(overview).some(n=>n.type==='button'&&text(n)==='Edit level'));
 states[0].items.push(...Array.from({length:12},(_,n)=>({id:'setup'+n,name:'Unset '+n,sku:'X'+n,category:'fixings',qty:0,available:0,reorderLevel:0,unit:'each'})));
 overview=walk(render()).find(n=>n.props.className==='ws-restock');
 assert.equal(walk(overview).filter(n=>n.type==='article').length,8);
 assert.match(text(overview),/12 need a reorder level/);
 walk(overview).find(n=>n.type==='button'&&text(n)==='Next').props.onClick();
 overview=walk(render()).find(n=>n.props.className==='ws-restock');
 assert.match(text(overview),/Showing 9–14 of 14 items/);
 walk(overview).find(n=>n.type==='button'&&text(n).startsWith('Set reorder level')).props.onClick();
 overview=walk(render()).find(n=>n.props.className==='ws-restock');
 assert.match(text(overview),/Showing 1–8 of 12 items/);
 const unset=walk(overview).find(n=>n.type==='article');
 assert.match(text(unset),/Reorder at — On order 0 Shortfall —/);
 assert.match(text(unset),/No reorder level set/);
 walk(overview).find(n=>n.props['aria-label']==='Search restocking items').props.onChange({target:{value:'X11'}});
 overview=walk(render()).find(n=>n.props.className==='ws-restock');
 assert.equal(walk(overview).filter(n=>n.type==='article').length,1);
 assert.match(text(overview),/Unset 11/);

});
