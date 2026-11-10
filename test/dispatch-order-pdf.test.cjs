const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(__dirname+'/../index.html','utf8'),code=html.slice(html.indexOf('  function DispatchOrderPdfModal('),html.indexOf('  function DispatchCenter()'));
const order={id:'12345678-1234-4234-8234-123456789012',orderNumber:'32',project:'Example'},token='a'.repeat(64),tick=()=>new Promise(setImmediate);
function fixture(fetcher){
 const states=[],refs=[],effects=[],pending=[],calls=[];let cursor=0,ri=0,ei=0,closed=0,restored=0;
 const previous={isConnected:true,focus(){restored++;}},client={username:'admin',apiFetch:async(url,options)=>{calls.push({url,options});return fetcher(url,options);}};
 const context={import_react:{createElement:(tag,props,...children)=>({tag,props:props||{},children})},useState:initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useRef:initial=>{const i=ri++;return refs[i]||(refs[i]={current:initial});},useEffect:(fn,deps)=>{const i=ei++,old=effects[i];if(!old||JSON.stringify(old.deps)!==JSON.stringify(deps))pending.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:fn()};});},PanelStock:client,BAKED_WORKER_URL:'https://worker.test',document:{activeElement:previous},encodeURIComponent};vm.createContext(context);vm.runInContext(code,context);
 const render=()=>{cursor=ri=ei=0;const tree=context.DispatchOrderPdfModal({order,onClose:()=>closed++});while(pending.length)pending.shift()();return tree;};return{render,client,calls,states,refs,dispose(){effects.forEach(e=>e.cleanup?.());},get closed(){return closed;},get restored(){return restored;}};
}
function nodes(t){return Array.isArray(t)?t.flatMap(nodes):t&&typeof t==='object'?[t,...nodes(t.children)]:[];}
test('PDF modal uses one scoped ticket and embeds the PDF without general order reads',async()=>{
 const h=fixture(async()=>Response.json({pdfToken:token}));h.render();await tick();const tree=h.render(),frame=nodes(tree).find(n=>n.tag==='iframe');assert.equal(h.calls.length,1);assert.equal(h.calls[0].url,'https://worker.test/orders/'+order.id+'/pdf-link');assert.equal(h.calls[0].options.method,'POST');assert.equal(h.calls[0].options.body,'{}');assert.equal(frame.props.src,'https://worker.test/orders/'+order.id+'/pdf?ticket='+token);assert.equal(frame.props.referrerPolicy,'no-referrer');const dialog=nodes(tree).find(n=>n.props.role==='dialog');dialog.props.onKeyDown({key:'Escape',preventDefault(){}});assert.equal(h.closed,1);h.dispose();assert.equal(h.restored,1);
});
test('permission errors and malformed ticket responses do not embed a PDF and allow retry',async()=>{
 for(const response of [()=>Response.json({error:'Access denied'},{status:403}),()=>Response.json({pdfToken:'javascript:bad'})]){let valid=false;const h=fixture(async()=>valid?Response.json({pdfToken:token}):response());h.render();await tick();let tree=h.render();assert.ok(nodes(tree).some(n=>n.props.role==='alert'));assert.equal(nodes(tree).some(n=>n.tag==='iframe'),false);valid=true;nodes(tree).find(n=>n.tag==='button'&&n.children.includes('Retry PDF')).props.onClick();h.render();await tick();tree=h.render();assert.ok(nodes(tree).some(n=>n.tag==='iframe'));assert.equal(h.calls.length,2);h.dispose();}
});
test('late PDF responses cannot render after account change or modal close',async()=>{
 for(const unmount of [false,true]){let finish;const h=fixture(()=>new Promise(resolve=>finish=resolve));h.render();if(unmount)h.dispose();else h.client.username='another';finish(Response.json({pdfToken:token}));await tick();assert.equal(h.states[0].url,'');if(!unmount)assert.equal(h.render(),null);}
});
