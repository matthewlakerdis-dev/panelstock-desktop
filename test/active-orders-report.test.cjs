const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {createButton,query,choices,defaults}=require('../active-orders-report.js');
const tick=()=>new Promise(setImmediate);
function fixture(fetcher,props={}){
  const states=[],refs=[],effects=[],downloads=[],urls=[],revoked=[],timers=new Map(),calls=[];let si=0,ri=0,disposed=false;
  const client={username:'alice',apiFetch:(url,options)=>{calls.push({url,options});return fetcher(url,options);}};
  const React={createElement:(tag,props,...children)=>({tag,props:props||{},children}),useState(initial){const i=si++;if(!(i in states))states[i]=initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useRef(initial){const i=ri++;return refs[i]??(refs[i]={current:initial});},useEffect(fn){if(!effects.length)effects.push(fn());}};
  const document={activeElement:{isConnected:true,focus(){}},body:{appendChild(){}},createElement(){return{style:{},click(){downloads.push({href:this.href,filename:this.download});},remove(){}};}},URL={createObjectURL(blob){urls.push(blob);return'blob:report-'+urls.length;},revokeObjectURL(url){revoked.push(url);}};
  const Button=createButton({React,client,baseUrl:'https://api.test',document,URL,AbortController,setTimeout:fn=>{timers.set(timers.size+1,fn);return timers.size;},clearTimeout:id=>timers.delete(id)});
  const render=()=>{si=ri=0;return Button(props);},button=()=>render().children[0],form=()=>nodes(render()).find(n=>n.tag==='form');
  const open=()=>{button().props.onClick();return form();},submit=()=>form().props.onSubmit({preventDefault(){}}),change=(name,value)=>nodes(render()).find(n=>n.props.name===name).props.onChange({target:{value}});
  return {render,button,open,submit,form,change,client,states,downloads,urls,revoked,timers,calls,dispose(){if(!disposed){disposed=true;effects.forEach(fn=>fn?.());}}};
}
const success=()=>new Response('%PDF-1.7\nexample',{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="Active_Site_Orders_2026-11-18.pdf"'}});
function nodes(t){return Array.isArray(t)?t.flatMap(nodes):t&&typeof t==='object'?[t,...nodes(t.children)]:[];}
test('export downloads a fresh authenticated server PDF with its Brisbane filename and no order mutations',async()=>{
  const h=fixture(async()=>success());h.open();assert.equal(h.calls.length,0);await h.submit();assert.equal(h.calls.length,1);assert.equal(h.calls[0].url,'https://api.test/orders/active-report.pdf');assert.equal(h.calls[0].options.method,undefined);assert.ok(h.calls[0].options.signal instanceof AbortSignal);
  assert.deepEqual(h.downloads,[{href:'blob:report-1',filename:'Active_Site_Orders_2026-11-18.pdf'}]);assert.equal(h.button().props.disabled,false);assert.equal(h.urls[0].type,'application/pdf');assert.equal(await h.urls[0].text(),'%PDF-1.7\nexample');
  [...h.timers.values()][0]();assert.deepEqual(h.revoked,['blob:report-1']);h.dispose();
});
test('the request lock prevents duplicate clicks; permission, network and malformed download errors are visible and retryable',async()=>{
  let finish;const h=fixture(()=>new Promise(resolve=>finish=resolve));h.open();const click=h.form().props.onSubmit,pending=click();await click();assert.equal(h.calls.length,1);assert.equal(h.button().props.disabled,true);finish(Response.json({error:'View site orders required'},{status:403}));await pending;
  assert.ok(nodes(h.render()).some(n=>n.props.role==='alert'&&n.children.includes('View site orders required')));assert.equal(h.downloads.length,0);
  h.client.apiFetch=async()=>success();await h.submit();assert.equal(h.downloads.length,1);assert.equal(h.states[0].error,'');h.dispose();
  for(const response of [()=>Response.json({error:'Unavailable'},{status:503}),()=>new Response('HTML'),()=>new Response('not a PDF',{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="Active_Site_Orders_2026-11-18.pdf"'}}),()=>{throw Error('Network unavailable');}]){
    const f=fixture(async()=>response());f.open();await f.submit();assert.equal(f.downloads.length,0);assert.ok(nodes(f.render()).some(n=>n.props.role==='alert'));assert.equal(f.button().props.disabled,false);f.dispose();
  }
});
test('account changes, component disposal and aborted requests never download a late report',async()=>{
  for(const action of ['account','dispose']){
    let finish;const h=fixture(()=>new Promise(resolve=>finish=resolve));h.open();const pending=h.submit();if(action==='account')h.client.username='bob';else{h.dispose();assert.equal(h.calls[0].options.signal.aborted,true);}finish(success());await pending;assert.equal(h.downloads.length,0);assert.equal(h.urls.length,0);h.dispose();
  }
  const h=fixture(async()=>success());h.open();await h.submit();await h.submit();assert.deepEqual(h.revoked,['blob:report-1']);h.dispose();assert.deepEqual(h.revoked,['blob:report-1','blob:report-2']);
});
test('the Site Orders heading loads the report control and the published build versions its asset',()=>{
  const html=fs.readFileSync(__dirname+'/../index.html','utf8'),build=fs.readFileSync(__dirname+'/../scripts/build-production.cjs','utf8');
  assert.match(html,/<script src="active-orders-report\.js\?v=/);assert.match(html,/ActiveOrdersReportButton = window\.PanelStockActiveOrdersReport\.createButton/);
  const heading=html.slice(html.indexOf('e(PageHeading, { icon: e(projectsOnly'),html.indexOf('notice && e("div"',html.indexOf('e(PageHeading, { icon: e(projectsOnly')));
  assert.match(heading,/action: !projectsOnly/);assert.match(heading,/e\(ActiveOrdersReportButton,\{orders,loadingOrders\}\)/);assert.equal(build.match(/'active-orders-report\.js'/g).length,2);
});

test('filter choices include only active saved projects/types and export filters do not alter the list',async()=>{
 const orders=[{project:'Tower & East',orderType:'Bin Gate',status:'completed'},{project:'Tower & East',orderType:'Panels',status:'ordered'},{project:'Archived',orderType:'Old type',status:'dispatched'},{project:'Cancelled',orderType:'Cancelled type',status:'cancelled'}],before=JSON.stringify(orders);
 assert.deepEqual(choices(orders),{projects:['Tower & East'],types:['Bin Gate','Panels']});
 const h=fixture(async()=>success(),{orders});h.open();
 for(const [name,value]of Object.entries({scope:'mine',project:'Tower & East',orderType:'Bin Gate',status:'completed',schedule:'scheduled',dateField:'scheduled',dateFrom:'2026-11-20',dateTo:'2026-11-30'}))h.change(name,value);
 await h.submit();const params=new URL(h.calls[0].url).searchParams;assert.deepEqual(Object.fromEntries(params),{scope:'mine',project:'Tower & East',orderType:'Bin Gate',status:'completed',schedule:'scheduled',dateField:'scheduled',dateFrom:'2026-11-20',dateTo:'2026-11-30'});
 assert.equal(JSON.stringify(orders),before);assert.equal(h.states[0].filters.project,'Tower & East');
 nodes(h.render()).find(n=>n.tag==='button'&&n.children.includes('Reset filters')).props.onClick();assert.deepEqual(h.states[0].filters,defaults());h.dispose();
});
test('date bounds reject reversed ranges without sending a request, and closing restores the open control',async()=>{
 const h=fixture(async()=>success());h.open();h.change('dateFrom','2026-11-30');h.change('dateTo','2026-11-20');await h.submit();assert.equal(h.calls.length,0);assert.match(h.states[0].error,/From date/);
 h.change('dateTo','2026-11-30');await h.submit();assert.equal(h.calls.length,1);
 nodes(h.render()).find(n=>n.tag==='button'&&n.children.includes('Close')).props.onClick();assert.equal(h.form(),undefined);h.dispose();
});
test('default export remains unfiltered and only selected date bounds are transmitted',()=>{
 assert.equal(query(defaults()),'');assert.equal(query({...defaults(),dateField:'scheduled'}),'');
 assert.deepEqual(Object.fromEntries(new URLSearchParams(query({...defaults(),dateField:'ordered',dateTo:'2026-11-30'}))),{dateField:'ordered',dateTo:'2026-11-30'});
});

test('Reports shows the Site Orders filters inline and uses the same PDF endpoint',async()=>{
  const reports=fs.readFileSync(__dirname+'/../reports-page.js','utf8');
  assert.match(reports,/h\(ActiveOrdersReportButton, \{orders, inline:true\}\)/);
  const orders=[{project:'Workshop',orderType:'Gate',status:'ordered'}];
  const direct=fixture(async()=>success(),{orders});
  assert.equal(direct.form(),undefined);
  direct.open();
  const launched=fixture(async()=>success(),{orders,inline:true});
  launched.render();
  const fields=form=>nodes(form).filter(n=>n.props.name).map(n=>[n.props.name,n.props.value]);
  assert.deepEqual(fields(launched.form()),fields(direct.form()));
  assert.equal(fields(launched.form()).length,8);
  assert.equal(launched.calls.length,0);
  launched.change('project','Workshop');
  await launched.submit();
  assert.equal(launched.calls[0].url,'https://api.test/orders/active-report.pdf?project=Workshop');
  assert.equal(launched.downloads.length,1);
  assert.equal(launched.form().props.role,undefined);
  assert.equal(nodes(launched.form()).some(n=>n.tag==='button'&&n.children.includes('Close')),false);
  launched.dispose();
  direct.dispose();
});
