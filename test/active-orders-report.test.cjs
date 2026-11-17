const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {createButton}=require('../active-orders-report.js');
const tick=()=>new Promise(setImmediate);
function fixture(fetcher){
  const states=[],refs=[],effects=[],downloads=[],urls=[],revoked=[],timers=new Map(),calls=[];let si=0,ri=0,disposed=false;
  const client={username:'alice',apiFetch:(url,options)=>{calls.push({url,options});return fetcher(url,options);}};
  const React={createElement:(tag,props,...children)=>({tag,props:props||{},children}),useState(initial){const i=si++;if(!(i in states))states[i]=initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useRef(initial){const i=ri++;return refs[i]??(refs[i]={current:initial});},useEffect(fn){if(!effects.length)effects.push(fn());}};
  const document={body:{appendChild(){}},createElement(){return{style:{},click(){downloads.push({href:this.href,filename:this.download});},remove(){}};}},URL={createObjectURL(blob){urls.push(blob);return'blob:report-'+urls.length;},revokeObjectURL(url){revoked.push(url);}};
  const Button=createButton({React,client,baseUrl:'https://api.test',document,URL,AbortController,setTimeout:fn=>{timers.set(timers.size+1,fn);return timers.size;},clearTimeout:id=>timers.delete(id)});
  const render=()=>{si=ri=0;return Button();},button=()=>render().children[0];
  return {render,button,client,states,downloads,urls,revoked,timers,calls,dispose(){if(!disposed){disposed=true;effects.forEach(fn=>fn?.());}}};
}
const success=()=>new Response('%PDF-1.7\nexample',{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="Active_Site_Orders_2026-11-18.pdf"'}});
function nodes(t){return Array.isArray(t)?t.flatMap(nodes):t&&typeof t==='object'?[t,...nodes(t.children)]:[];}
test('export downloads a fresh authenticated server PDF with its Brisbane filename and no order mutations',async()=>{
  const h=fixture(async()=>success());await h.button().props.onClick();assert.equal(h.calls.length,1);assert.equal(h.calls[0].url,'https://api.test/orders/active-report.pdf');assert.equal(h.calls[0].options.method,undefined);assert.ok(h.calls[0].options.signal instanceof AbortSignal);
  assert.deepEqual(h.downloads,[{href:'blob:report-1',filename:'Active_Site_Orders_2026-11-18.pdf'}]);assert.equal(h.button().props.disabled,false);assert.equal(h.urls[0].type,'application/pdf');assert.equal(await h.urls[0].text(),'%PDF-1.7\nexample');
  [...h.timers.values()][0]();assert.deepEqual(h.revoked,['blob:report-1']);h.dispose();
});
test('the request lock prevents duplicate clicks; permission, network and malformed download errors are visible and retryable',async()=>{
  let finish;const h=fixture(()=>new Promise(resolve=>finish=resolve)),click=h.button().props.onClick,pending=click();await click();assert.equal(h.calls.length,1);assert.equal(h.button().props.disabled,true);finish(Response.json({error:'View site orders required'},{status:403}));await pending;
  assert.ok(nodes(h.render()).some(n=>n.props.role==='alert'&&n.children.includes('View site orders required')));assert.equal(h.downloads.length,0);
  h.client.apiFetch=async()=>success();await h.button().props.onClick();assert.equal(h.downloads.length,1);assert.equal(h.states[0].error,'');h.dispose();
  for(const response of [()=>Response.json({error:'Unavailable'},{status:503}),()=>new Response('HTML'),()=>new Response('not a PDF',{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="Active_Site_Orders_2026-11-18.pdf"'}}),()=>{throw Error('Network unavailable');}]){
    const f=fixture(async()=>response());await f.button().props.onClick();assert.equal(f.downloads.length,0);assert.ok(nodes(f.render()).some(n=>n.props.role==='alert'));assert.equal(f.button().props.disabled,false);f.dispose();
  }
});
test('account changes, component disposal and aborted requests never download a late report',async()=>{
  for(const action of ['account','dispose']){
    let finish;const h=fixture(()=>new Promise(resolve=>finish=resolve)),pending=h.button().props.onClick();if(action==='account')h.client.username='bob';else{h.dispose();assert.equal(h.calls[0].options.signal.aborted,true);}finish(success());await pending;assert.equal(h.downloads.length,0);assert.equal(h.urls.length,0);h.dispose();
  }
  const h=fixture(async()=>success());await h.button().props.onClick();await h.button().props.onClick();assert.deepEqual(h.revoked,['blob:report-1']);h.dispose();assert.deepEqual(h.revoked,['blob:report-1','blob:report-2']);
});
test('the Site Orders heading loads the report control and the published build versions its asset',()=>{
  const html=fs.readFileSync(__dirname+'/../index.html','utf8'),build=fs.readFileSync(__dirname+'/../scripts/build-production.cjs','utf8');
  assert.match(html,/<script src="active-orders-report\.js\?v=/);assert.match(html,/ActiveOrdersReportButton = window\.PanelStockActiveOrdersReport\.createButton/);
  const heading=html.slice(html.indexOf('e(PageHeading, { icon: e(projectsOnly'),html.indexOf('notice && e("div"',html.indexOf('e(PageHeading, { icon: e(projectsOnly')));
  assert.match(heading,/action: !projectsOnly/);assert.match(heading,/e\(ActiveOrdersReportButton\)/);assert.equal(build.match(/'active-orders-report\.js'/g).length,2);
});
