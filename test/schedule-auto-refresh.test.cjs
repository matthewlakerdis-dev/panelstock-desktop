const test=require('node:test'),assert=require('node:assert/strict'),{createController}=require('../schedule-auto-refresh.js');
function fixture(refresh){let id=0,busy=false;const timers=new Map(),events={},document={hidden:false,addEventListener:(name,fn)=>events[name]=fn,removeEventListener:name=>delete events[name]},window={setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:key=>timers.delete(key),addEventListener:(name,fn)=>events[name]=fn,removeEventListener:name=>delete events[name]},controller=createController({refresh,isBusy:()=>busy,document,window});return{controller,timers,events,document,busy:value=>busy=value};}
test('checks every two seconds without overlapping slow requests and wakes on focus',async()=>{
 let finish,calls=0;const f=fixture(()=>{calls++;return new Promise(resolve=>finish=resolve);});assert.equal([...f.timers.values()][0].ms,2000);
 const pending=f.controller.refresh();assert.equal(calls,1);await f.controller.refresh();f.events.focus();assert.equal(calls,1);
 finish();await pending;assert.equal(f.timers.size,1);assert.equal([...f.timers.values()][0].ms,2000);f.controller.destroy();assert.equal(f.timers.size,0);assert.deepEqual(Object.keys(f.events),[]);
});
test('hidden pages and active edits or drags pause network checks',async()=>{
 let calls=0;const f=fixture(async()=>calls++);f.document.hidden=true;await f.controller.refresh();assert.equal(calls,0);f.document.hidden=false;f.busy(true);await f.controller.refresh();assert.equal(calls,0);f.busy(false);await f.controller.refresh();assert.equal(calls,1);f.controller.destroy();
});
test('unmount aborts in-flight work and failed checks remain retryable',async()=>{
 let signal;const f=fixture(value=>{signal=value;return new Promise(()=>{});});void f.controller.refresh();f.controller.destroy();assert.equal(signal.aborted,true);assert.equal(f.timers.size,0);
 const retry=fixture(async()=>{throw Error('Offline');});await retry.controller.refresh();assert.equal(retry.timers.size,1);retry.controller.destroy();
});
