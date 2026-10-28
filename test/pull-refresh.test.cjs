const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(options={}){
 const listeners=new Map(),elements=[],timers=new Map();let nextTimer=0,blocked=[],calls=0;
 const node=(tag='DIV')=>({tagName:tag,style:{},hidden:false,children:[],parentElement:null,scrollTop:0,scrollHeight:0,clientHeight:0,classList:{toggle(){}},getClientRects:()=>[{}],matches(){return false},setAttribute(){},appendChild(el){this.children.push(el);el.parentNode=this;elements.push(el);},removeChild(el){this.children=this.children.filter(value=>value!==el);el.parentNode=null;}});
 const body=node(),head=node(),html=node();
 const doc={body,head,documentElement:html,scrollingElement:html,hidden:false,createElement:tag=>node(tag.toUpperCase()),getElementById:()=>null,querySelectorAll:selector=>selector==='input[type="file"]'?[]:blocked,addEventListener:(type,fn,opts)=>listeners.set(type,{fn,opts}),removeEventListener:type=>listeners.delete(type)};
 const window={document:doc,navigator:{onLine:true},visualViewport:{scale:1},scrollY:0,getComputedStyle:el=>({overflowY:el.overflow||'visible'}),setTimeout:fn=>{const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),addEventListener(type,fn,options){if(options)void options.passive;},removeEventListener(){}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../pull-refresh.js','utf8'),{window,Promise,Array,String,Math});
 const api=window.PanelStockPullRefresh,target=node();target.parentElement=body;
 const destroy=api.mount({...options,refresh:options.refresh||(()=>{calls++;return true;})});
 function event(type,x=100,y=40,extra={}){let prevented=false;const touch={identifier:1,clientX:x,clientY:y};listeners.get(type)?.fn({target,touches:type==='touchend'?[]:[touch],changedTouches:[touch],cancelable:true,preventDefault(){prevented=true},...extra});return prevented;}
 const gesture=(x=100,y=150)=>{event('touchstart');event('touchmove',x,y);event('touchend',x,y);};
 return {api,window,doc,listeners,target,event,gesture,destroy,node,blocked:value=>{blocked=value;},calls:()=>calls,label:()=>elements.find(el=>el.className==='ps-pull-refresh').children[1].textContent,indicator:()=>elements.find(el=>el.className==='ps-pull-refresh'),timers};
}
const tick=()=>new Promise(setImmediate);
test('refresh triggers once on release, includes subscribers, and short/cancelled/sideways gestures do not refresh',async()=>{
 const f=fixture();let view=0;const stop=f.api.subscribe(()=>{view++;});
 f.event('touchstart');assert.equal(f.event('touchmove',102,150),true);assert.equal(f.calls(),0);assert.equal(f.label(),'Release to refresh');
 f.event('touchend',102,150);f.event('touchend',102,150);await tick();assert.equal(f.calls(),1);assert.equal(view,1);assert.equal(f.label(),'Up to date');
 for(const [x,y,cancel] of [[100,70,false],[180,50,false],[100,10,false],[100,180,true]]){f.event('touchstart');f.event('touchmove',x,y);f.event(cancel?'touchcancel':'touchend',x,y);}
 await tick();assert.equal(f.calls(),1);stop();await f.api.run();assert.equal(view,1);
});
test('scrolling, controls, nested scrollers, pinch zoom and multiple fingers do not trigger refresh',async()=>{
 const f=fixture();f.doc.scrollingElement.scrollTop=50;f.gesture();f.doc.scrollingElement.scrollTop=0;
 f.target.matches=()=>true;f.gesture();f.target.matches=()=>false;
 f.target.scrollHeight=300;f.target.clientHeight=100;f.target.overflow='auto';f.gesture();f.target.overflow='visible';
 f.window.visualViewport.scale=2;f.gesture();f.window.visualViewport.scale=1;
 f.event('touchstart');f.event('touchmove',100,150,{touches:[{identifier:1,clientX:100,clientY:150},{identifier:2,clientX:120,clientY:150}]});f.event('touchend');
 f.event('touchstart');f.event('touchmove',100,150,{cancelable:false});f.event('touchend');
 await tick();assert.equal(f.calls(),0);assert.equal(f.listeners.get('touchmove').opts.passive,false);
});
test('offline, forms, save guards and disabled sessions keep work intact without refreshing',async()=>{
 const f=fixture();f.window.navigator.onLine=false;assert.equal(await f.api.run(),false);assert.match(f.label(),/offline/);
 f.window.navigator.onLine=true;f.blocked([f.node('FORM')]);assert.equal(await f.api.run(),false);assert.match(f.label(),/Save or close/);assert.equal(f.calls(),0);
 const saving=fixture({canRefresh:()=> 'Wait for saving.'});assert.equal(await saving.api.run(),false);assert.equal(saving.label(),'Wait for saving.');
 const loggedOut=fixture({enabled:()=>false});loggedOut.gesture();await tick();assert.equal(loggedOut.calls(),0);
});
test('one refresh runs at a time; failures recover, and cleanup ignores late results',async()=>{
 let finish,calls=0;const f=fixture({refresh:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
 const first=f.api.run();await tick();assert.equal(f.label(),'Refreshing…');assert.equal(await f.api.run(),false);f.gesture();assert.equal(calls,1);
 finish(false);assert.equal(await first,false);assert.match(f.label(),/Could not refresh/);
 const retry=f.api.run();await tick();finish(true);assert.equal(await retry,true);
 const late=f.api.run();await tick();f.destroy();finish(true);await late;assert.equal(f.doc.body.children.length,0);assert.equal(f.listeners.size,0);
 assert.equal(await f.api.run(),false);
});
test('a desktop main scroller must be at the top while nested lists remain independent',async()=>{
 let main;const f=fixture({scrollRoot:()=>main});main=f.node('MAIN');main.scrollHeight=1000;main.clientHeight=400;main.overflow='auto';main.parentElement=f.doc.body;f.target.parentElement=main;
 main.scrollTop=80;f.gesture();await tick();assert.equal(f.calls(),0);
 main.scrollTop=0;f.gesture();await tick();assert.equal(f.calls(),1);
 f.target.scrollHeight=500;f.target.clientHeight=100;f.target.overflow='auto';f.gesture();await tick();assert.equal(f.calls(),1);
});
