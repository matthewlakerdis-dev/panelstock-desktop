const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
test('verified request-only users restore their identity without requesting stock data',async()=>{
 const start=html.indexOf('  function App() {'),end=html.indexOf('    }, []);\n    useEffect(() => {',start)+'    }, []);'.length;
 const helper=html.slice(html.indexOf('  const canReadStockSession='),start);
 const prefix=helper+html.slice(start,end)+'\nreturn null;\n}';
 const states=[],effects=[];let stockCalls=0;const user={username:'requestor',isAdmin:false,taskAccess:{'purchase-requests.create':true,'factory.stock':false}};
 const context={useState:value=>{const index=states.length;states.push(value);return[value,next=>{states[index]=next;}];},useEffect:fn=>effects.push(fn),DEFAULT_EMAIL_CONFIG:{},DEFAULT_CNC_SETTINGS:{},BAKED_WORKER_URL:'https://api.example.test',STORAGE_KEYS:{},loadKey:async()=>'',saveKey(){},ensureMissingPanelReason:value=>value,PanelStock:{username:user.username,init:async()=>user,snapshot:async()=>{stockCalls++;return null;},apiFetch:async()=>({ok:false})},console};
 vm.runInNewContext(prefix+';globalThis.run=App;',context);context.run();const cleanup=effects[0]();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(stockCalls,0);assert.ok(states.includes('requestor'));assert.ok(states.some(value=>value&&value['purchase-requests.create']===true));assert.equal(states[5],false);cleanup();
 const refresh=html.slice(html.indexOf('      let active = true, refreshTask = null;'),html.indexOf('    function showToast'));
 assert.match(refresh,/if \(!canReadSharedStock\) return Promise.resolve\(true\)/);
 assert.match(html,/canReadStockSession\(\{isAdmin,taskAccess\}\) && [^\n]+text-xs text-slate-400 font-mono/);
});
