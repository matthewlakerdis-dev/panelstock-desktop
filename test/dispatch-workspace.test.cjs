const {test}=require('node:test'),assert=require('node:assert/strict'),{resolveView,createComponent}=require('../dispatch-workspace.js');
test('legacy Jobs links and history tabs preserve permissions when choosing a dispatch view',()=>{
 for(const search of ['?page=jobs','?page=dispatch&view=job-history']){
  assert.equal(resolveView(search,true,true),'job-history');assert.equal(resolveView(search,true,false),'deliveries');assert.equal(resolveView(search,false,true),'job-history');assert.equal(resolveView(search,false,false),null);
 }
 assert.equal(resolveView('?page=dispatch',true,true),'deliveries');assert.equal(resolveView('?page=dispatch',false,true),'job-history');
});
test('combined dispatch renders only permitted records and retains the original transaction history',()=>{
 const prior={location:global.location,window:global.window};global.location={search:'?page=dispatch&view=job-history'};global.window={addEventListener(){},removeEventListener(){}};
 try{
  const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:fn=>[fn(),()=>{}],useEffect:fn=>fn()},Deliveries=()=>{},History=()=>{},Page=createComponent(React,Deliveries,History),transactions=[{id:'saved',type:'dispatch'}];
  const tree=Page({transactions,canDispatch:false,canViewHistory:true});assert.equal(tree.children[1].type,History);assert.equal(tree.children[1].props.transactions,transactions);assert.equal(tree.children[0].children.filter(Boolean).length,1);
  const deliveries=Page({transactions,canDispatch:true,canViewHistory:false});assert.equal(deliveries.children[1].type,Deliveries);assert.equal(Page({transactions,canDispatch:false,canViewHistory:false}),null);
 }finally{Object.assign(global,prior);}
});
