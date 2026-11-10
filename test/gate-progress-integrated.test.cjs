const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(new URL('../index.html',`file://${__filename}`),'utf8');
test('Gate Progress is a native Work page under the normal order-view permission and enabled production flag',()=>{
 assert.match(html,/globalThis.PANELSTOCK_GATE_PROGRESS_ENABLED=true/);
 assert.match(html,/PANELSTOCK_GATE_PROGRESS_ENABLED\?\[\['gate-progress','site.orders.view'\]\]/);
 assert.match(html,/key:"gate-progress",label:"Gate Progress",target:"gate-progress"/);
 assert.match(html,/tab === "gate-progress"[\s\S]*?\(GateProgressPage, \{username\}\)/);
 const source=html.slice(html.indexOf('  function GateProgressPage('),html.indexOf('  function OrdersPage('));assert.doesNotMatch(source,/iframe|sessionStorage|localStorage|\/login/);assert.match(source,/PanelStock.apiFetch\(url,options\)/);assert.match(source,/view\?\.destroy\(\)/);
});
test('integrated page mounts with the current PanelStock account and destroys on navigation',async()=>{
 const effects=[],mounted=[],calls=[],host={};let destroyed=0;
 const context={useRef:()=>({current:host}),useState:()=>['',()=>{}],useEffect:fn=>effects.push(fn),BAKED_WORKER_URL:'https://staging.example',URLSearchParams,location:{search:'?page=gate-progress&gateOrder=order-id'},document:{},PanelStock:{username:'manager',apiFetch:(...args)=>{calls.push(args);return Promise.resolve();}},window:{PanelStockGateProgress:{mount:(root,options)=>{mounted.push({root,options});return {destroy(){destroyed++;}};}}},PageHeading:()=>{},ClipboardList:()=>{},import_jsx_runtime:{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})}};
 const source=html.slice(html.indexOf('  function GateProgressPage('),html.indexOf('  function OrdersPage('));vm.runInNewContext(source+';globalThis.Page=GateProgressPage;',context);context.Page({username:'manager'});const cleanup=effects[0]();await Promise.resolve();assert.equal(mounted.length,1);assert.equal(mounted[0].root,host);assert.equal(mounted[0].options.username,'manager');assert.equal(mounted[0].options.orderId,'order-id');await mounted[0].options.apiFetch('/example',{});assert.equal(calls.length,1);cleanup();assert.equal(destroyed,1);
 mounted.length=0;context.PanelStock.username='another-account';context.Page({username:'manager'});effects[1]();await Promise.resolve();assert.equal(mounted.length,0);
});
