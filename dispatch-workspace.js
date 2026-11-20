(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PanelStockDispatchWorkspace=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 function resolveView(search,canDispatch,canViewHistory){const params=new URLSearchParams(search),history=params.get('page')==='jobs'||params.get('view')==='job-history';return history&&canViewHistory?'job-history':canDispatch?'deliveries':canViewHistory?'job-history':null;}
 function createComponent(React,Deliveries,JobHistory){
  const h=React.createElement;
  return function DispatchWorkspace({transactions,canDispatch,canViewHistory}){
   const [view,setView]=React.useState(()=>resolveView(location.search,canDispatch,canViewHistory));
   React.useEffect(()=>{const restore=()=>setView(resolveView(location.search,canDispatch,canViewHistory));restore();window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);},[canDispatch,canViewHistory]);
   const selected=view==='job-history'&&canViewHistory?'job-history':canDispatch?'deliveries':canViewHistory?'job-history':null;
   function choose(next){if(next===selected)return;const url=new URL(location.href);url.searchParams.set('page','dispatch');if(next==='job-history')url.searchParams.set('view',next);else url.searchParams.delete('view');history.pushState({...history.state,panelstock:true,key:'dispatch',target:'dispatch'},'',url.pathname+url.search);setView(next);}
   if(!selected)return null;
   return h('section',null,h('nav',{'aria-label':'Dispatch views',className:'ps-dispatch-workspace-tabs'},canDispatch&&h('button',{type:'button','aria-current':selected==='deliveries'?'page':undefined,onClick:()=>choose('deliveries')},'Orders & deliveries'),canViewHistory&&h('button',{type:'button','aria-current':selected==='job-history'?'page':undefined,onClick:()=>choose('job-history')},'Stock job history')),selected==='job-history'?h(JobHistory,{transactions}):h(Deliveries));
  };
 }
 return {resolveView,createComponent};
});
