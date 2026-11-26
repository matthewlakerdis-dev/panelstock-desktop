const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ResetControls,View}=require('../qa-panel-area-import.js');

const preview=(snapshot='snapshot-one')=>({ok:true,snapshot,generation:null,panelCount:3,knownAreaCount:2,statusCounts:{approved:1,awaiting:2}});
const reply=(result,status=200)=>({response:{ok:status>=200&&status<300,status},result});
const queue=[{id:'a',kind:'panel',status:'approved',panelArea:null,panelAreaRevision:2},{id:'b',kind:'panel',status:'awaiting',panelArea:null,panelAreaRevision:1}];
function harness(Component,props){
  const slots=[],effects=[],dependencies=[],refs=[];let cursor=0,refCursor=0,dirty=false,tree;
  const React={Fragment:Symbol('fragment'),createElement:(type,props,...children)=>({type,props:{...(props||{}),children}}),
    useState(initial){const index=cursor++;if(!Object.hasOwn(slots,index))slots[index]=typeof initial==='function'?initial():initial;return [slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;dirty=true;}];},
    useRef(initial){const index=cursor++;if(!Object.hasOwn(slots,index))slots[index]={current:initial};refs[refCursor++]=slots[index];return slots[index];},
    useEffect(effect,deps){const index=cursor++,before=dependencies[index];if(!before||deps.some((value,i)=>!Object.is(value,before[i]))){dependencies[index]=deps;effects.push(effect);}}
  };
  function render(){cursor=refCursor=0;dirty=false;tree=Component({...props,React});for(const effect of effects.splice(0))effect();return tree;}
  async function flush(){for(let i=0;i<12;i++){await new Promise(resolve=>setImmediate(resolve));if(dirty)render();}return tree;}
  function all(node=tree,result=[]){if(Array.isArray(node)){node.forEach(child=>all(child??null,result));return result;}if(node&&typeof node==='object'){result.push(node);all(node.props?.children??null,result);}return result;}
  const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):node==null||node===false?'':String(node);
  const control=name=>all().find(node=>node.type==='button'&&text(node)===name);
  const checkbox=()=>all().find(node=>node.type==='input'&&node.props.type==='checkbox');
  render();return {render,flush,all,text:()=>text(tree),control,checkbox,get tree(){return tree;},slots,refs,React};
}
function fixture(customRequest,options={}){
  const calls=[],saved=[],busy=[];
  const request=async(url,init={})=>{calls.push({url,init});return customRequest?customRequest(url,init,calls):url.endsWith('/qa/queue')?reply({items:queue}):init.method==='POST'?reply({ok:true,resetId:JSON.parse(init.body).resetId,backupId:'backup:area-reset:one',panelCount:3}):reply(preview());};
  const props={canManage:true,base:'/api',request,busy:false,onBusy:value=>busy.push(value),onReset:value=>saved.push(value),...options};
  return {...harness(ResetControls,props),calls,saved,busy,props};
}
async function open(h){await h.flush();await h.control('Review reset for all orders').props.onClick();await h.flush();}
async function confirm(h){h.checkbox().props.onChange({target:{checked:true}});await h.flush();}

test('non-managers never request or render reset controls, and server-denied managers see none',async()=>{
  const worker=fixture(null,{canManage:false});await worker.flush();assert.equal(worker.tree,null);assert.equal(worker.calls.length,0);
  const manager=fixture(()=>reply({error:'Admin access required'},403));await manager.flush();assert.equal(manager.tree,null);assert.equal(manager.calls.length,1);assert.equal(manager.calls[0].init.method,undefined);
});
test('opening the importer or reset preview never mutates, and all-order counts and confirmation gate are visible',async()=>{
  const h=fixture();await open(h);
  assert.match(h.text(),/ALL ORDERS · 3 panels · 2 with recorded m²/);assert.match(h.text(),/Completed QA: 1 · Awaiting QA: 2/);
  assert.match(h.text(),/Previous area values are backed up/);assert.match(h.text(),/QA results, photos and history, and CNC sheet areas stay unchanged/);
  assert.equal(h.control('Reset all panel m²').props.disabled,true);
  await h.control('Reset all panel m²').props.onClick();await h.flush();
  assert.equal(h.calls.filter(call=>call.init.method==='POST').length,0);
  await confirm(h);assert.equal(h.control('Reset all panel m²').props.disabled,false);
});
test('confirmed reset posts the reviewed snapshot and refreshes every QA item before notifying the importer',async()=>{
  const h=fixture();await open(h);await confirm(h);await h.control('Reset all panel m²').props.onClick();await h.flush();
  const posts=h.calls.filter(call=>call.init.method==='POST');assert.equal(posts.length,1);const body=JSON.parse(posts[0].init.body);
  assert.equal(posts[0].url,'/api/qa/panels/area-reset');assert.match(body.resetId,/^[a-zA-Z0-9-]{16,80}$/);assert.equal(body.expectedSnapshot,'snapshot-one');assert.equal(body.reason,'Replace existing QA areas with sticker totals');
  assert.equal(h.calls.at(-1).url,'/api/qa/queue');assert.deepEqual(h.saved[0].items,queue);assert.equal(h.saved[0].reset.backupId,'backup:area-reset:one');assert.equal(h.busy.at(-1),false);
});
test('transport failure retries the exact reset request rather than creating another operation',async()=>{
  let posts=0;const h=fixture((url,init)=>{if(init.method==='POST'){if(++posts===1)throw Error('Connection lost');return reply({ok:true,resetId:JSON.parse(init.body).resetId,backupId:'backup:one',panelCount:3});}return url.endsWith('/qa/queue')?reply({items:queue}):reply(preview());});
  await open(h);await confirm(h);await h.control('Reset all panel m²').props.onClick();await h.flush();
  assert.match(h.text(),/Connection lost/);assert.equal(h.saved.length,0);
  await h.control('Retry reset verification').props.onClick();await h.flush();
  const sent=h.calls.filter(call=>call.init.method==='POST');assert.equal(sent.length,2);assert.equal(sent[0].init.body,sent[1].init.body);assert.equal(h.saved.length,1);
});
test('a stale snapshot refreshes counts and requires a new explicit confirmation',async()=>{
  let gets=0;const h=fixture((url,init)=>init.method==='POST'?reply({error:'Changed'},409):reply({...preview(++gets>2?'snapshot-two':'snapshot-one'),panelCount:gets>2?4:3}));
  await open(h);await confirm(h);await h.control('Reset all panel m²').props.onClick();await h.flush();
  assert.match(h.text(),/ALL ORDERS · 4 panels/);assert.match(h.text(),/Review the updated counts and confirm again/);assert.equal(h.checkbox().props.checked,false);assert.equal(h.control('Reset all panel m²').props.disabled,true);assert.equal(h.saved.length,0);
  await confirm(h);await h.control('Reset all panel m²').props.onClick();await h.flush();
  const sent=h.calls.filter(call=>call.init.method==='POST').map(call=>JSON.parse(call.init.body));assert.notEqual(sent[0].resetId,sent[1].resetId);assert.equal(sent[1].expectedSnapshot,'snapshot-two');
});
test('a saved reset with failed queue refresh retries the same receipt before showing refreshed items',async()=>{
  let refreshes=0;const h=fixture((url,init)=>url.endsWith('/qa/queue')?(++refreshes===1?reply({error:'Unavailable'},503):reply({items:queue})):init.method==='POST'?reply({ok:true,resetId:JSON.parse(init.body).resetId,backupId:'backup:one',panelCount:3}):reply(preview()));
  await open(h);await confirm(h);await h.control('Reset all panel m²').props.onClick();await h.flush();assert.equal(h.saved.length,0);assert.match(h.text(),/reset was saved, but QA could not be refreshed/);
  await h.control('Retry reset verification').props.onClick();await h.flush();const sent=h.calls.filter(call=>call.init.method==='POST');assert.equal(sent[0].init.body,sent[1].init.body);assert.equal(h.saved.length,1);
});
test('the server receipt must match the operation before local QA areas are refreshed',async()=>{
  const h=fixture((url,init)=>init.method==='POST'?reply({ok:true,resetId:'wrong-operation',backupId:'backup:one',panelCount:3}):reply(preview()));
  await open(h);await confirm(h);await h.control('Reset all panel m²').props.onClick();await h.flush();assert.match(h.text(),/could not be verified/);assert.equal(h.saved.length,0);assert.equal(h.calls.some(call=>call.url.endsWith('/qa/queue')),false);
});
test('importer clears the old PDF review, selected scope and retry references when areas reset',async()=>{
  const saved=[],h=harness(View,{items:[{id:'a',kind:'panel',project:'Salacia',orderNumber:'25'}],canManage:true,base:'/api',request:async()=>reply({}),onSaved:result=>saved.push(result),onClose(){}});
  const scope=h.all().find(node=>node.type==='select');scope.props.onChange({target:{value:'["Salacia","25"]'}});await h.flush();
  // These represent a PDF review already in progress when the separate reset controls are used.
  h.slots[0]=[{page:1,reference:'A',areaM2:2.5}];h.slots[1]='stickers.pdf';h.slots[3]=[{page:1,state:'ready',reference:'A',areaM2:2.5,item:{id:'a'}}];h.slots[4]={1:true};h.slots[7]=true;h.slots[9]={1:'a'};h.refs[1].current='old-import-id';h.refs[2].current='old-payload';h.render();
  assert.match(h.text(),/stickers.pdf/);const child=h.all().find(node=>node.type===ResetControls);child.props.onReset({items:queue,reset:{backupId:'backup:one'}});await h.flush();
  assert.equal(h.text().includes('stickers.pdf'),false);assert.equal(h.all().find(node=>node.type==='select').props.value,'');assert.equal(h.all().some(node=>node.type==='button'&&node.props.children.includes('Save 1 panel areas')),false);assert.deepEqual(h.slots[9],{});assert.equal(h.refs[1].current,null);assert.equal(h.refs[2].current,null);assert.deepEqual(saved[0].items,queue);
});
test('a second click while the reset is in flight cannot start another POST',async()=>{
  let release;const hold=new Promise(resolve=>{release=resolve;});
  const h=fixture(async(url,init)=>{if(init.method==='POST'){await hold;return reply({ok:true,resetId:JSON.parse(init.body).resetId,backupId:'backup:one',panelCount:3});}return url.endsWith('/qa/queue')?reply({items:queue}):reply(preview());});
  await open(h);await confirm(h);const click=h.control('Reset all panel m²').props.onClick,first=click();await click();
  assert.equal(h.calls.filter(call=>call.init.method==='POST').length,1);release();await first;await h.flush();assert.equal(h.saved.length,1);
});
