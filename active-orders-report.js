(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PanelStockActiveOrdersReport=api;})(typeof window==='object'?window:globalThis,function(){
  const statuses=[['submitted','Submitted'],['approved','Approved'],['ordered','Ordered'],['in_stock','In stock'],['completed','Ready for dispatch']];
  const defaults=()=>({scope:'all',project:'',orderType:'',status:'',schedule:'all',dateField:'requested',dateFrom:'',dateTo:''});
  function query(filters){
    const params=new URLSearchParams();
    for(const key of ['scope','project','orderType','status','schedule','dateField','dateFrom','dateTo']){
      const value=filters[key]||'';
      if(!value||['scope','schedule'].includes(key)&&value==='all'||key==='dateField'&&(!filters.dateFrom&&!filters.dateTo||value==='requested'))continue;
      params.set(key,value);
    }
    const value=params.toString();return value?'?'+value:'';
  }
  function choices(orders){
    const active=orders.filter(order=>statuses.some(([status])=>status===order.status));
    const values=key=>{const seen=new Map();for(const order of active){const value=String(order[key]||'').trim(),normal=value.replace(/\s+/g,' ').toLocaleLowerCase('en-AU');if(value&&!seen.has(normal))seen.set(normal,value);}return [...seen.values()].sort((a,b)=>a.localeCompare(b,'en-AU',{numeric:true}));};
    return {projects:values('project'),types:values('orderType')};
  }
  function createButton({React,client,baseUrl,document,URL,AbortController,setTimeout,clearTimeout}){
    const {createElement:e,useState,useRef,useEffect}=React;
    return function ActiveOrdersReportButton({orders=[],loadingOrders=false,inline=false}={}){
      const [state,setState]=useState({busy:false,error:'',open:false,filters:defaults()}),request=useRef(null),alive=useRef(true),download=useRef(null),dialog=useRef(null),owner=useRef(null),previous=useRef(null);
      function release(){if(download.current){clearTimeout(download.current.timer);URL.revokeObjectURL(download.current.url);download.current=null;}}
      useEffect(()=>{
        alive.current=true;
        if(inline)open();
        return()=>{alive.current=false;request.current?.abort();release();};
      },[]);
      useEffect(()=>{if(state.open&&!inline)dialog.current?.querySelector('select')?.focus();},[state.open]);
      useEffect(()=>{if(owner.current&&owner.current!==client.username){request.current?.abort();request.current=null;owner.current=null;release();setState({busy:false,error:'',open:false,filters:defaults()});}},[client.username]);
      function close(){if(request.current)return;setState(current=>({...current,open:false,error:''}));if(previous.current?.isConnected)previous.current.focus({preventScroll:true});}
      function open(){if(loadingOrders||request.current)return;owner.current=client.username;previous.current=document.activeElement;setState(current=>({...current,open:true,error:''}));}
      function change(key,value){setState(current=>({...current,error:'',filters:{...current.filters,[key]:value}}));}
      async function exportReport(event){
        event?.preventDefault();if(request.current||!state.open||owner.current!==client.username)return;
        const filters={...state.filters};
        if(filters.dateFrom&&filters.dateTo&&filters.dateFrom>filters.dateTo){setState(current=>({...current,error:'The From date must be on or before the To date.'}));dialog.current?.querySelector('[name="dateFrom"]')?.focus();return;}
        const account=client.username,controller=new AbortController();request.current=controller;setState(current=>({...current,busy:true,error:''}));
        const valid=()=>alive.current&&client.username===account&&owner.current===account;
        try{
          const response=await client.apiFetch(baseUrl+'/orders/active-report.pdf'+query(filters),{signal:controller.signal});
          if(!valid())return;
          if(!response.ok){const result=await response.json().catch(()=>({}));throw Error(result.error||'The Active Orders report could not be generated. Please retry.');}
          const fileName=(response.headers.get('Content-Disposition')||'').match(/filename="(Active_Site_Orders_\d{4}-\d{2}-\d{2}\.pdf)"/)?.[1];
          if(!fileName||!/^application\/pdf(?:;|$)/i.test(response.headers.get('Content-Type')||''))throw Error('The server did not return a PDF report. Please retry.');
          const blob=await response.blob();
          if((await blob.slice(0,5).text())!=='%PDF-')throw Error('The report could not be opened as a PDF. Please retry.');
          if(!valid())return;
          release();
          const url=URL.createObjectURL(blob),link=document.createElement('a');
          download.current={url,timer:setTimeout(release,60000)};
          link.href=url;link.download=fileName;link.style.display='none';document.body.appendChild(link);
          try{link.click();}finally{link.remove();}
        }catch(error){if(valid()&&error.name!=='AbortError')setState(current=>({...current,error:error.message||'The report could not be downloaded. Please retry.'}));}
        finally{if(request.current===controller)request.current=null;if(valid())setState(current=>({...current,busy:false}));}
      }
      const options=choices(orders),filters=state.filters;
      const field=(label,key,values,placeholder)=>e('label',{className:'block text-sm font-medium text-slate-700'},label,e('select',{'aria-label':label,name:key,value:filters[key],disabled:state.busy,onChange:event=>change(key,event.target.value),className:'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2'},placeholder&&e('option',{value:''},placeholder),...values.map(([value,title])=>e('option',{key:value,value},title)),filters[key]&&!values.some(([value])=>value===filters[key])&&e('option',{value:filters[key]},filters[key]+' (no longer in current list)')));
      function keyDown(event){
        if(event.key==='Escape'){event.preventDefault();close();}
        if(event.key==='Tab'){
          const controls=[...dialog.current.querySelectorAll('button:enabled,select:enabled,input:enabled')],first=controls[0],last=controls[controls.length-1];
          if(!controls.length){event.preventDefault();dialog.current.focus();return;}
          if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
        }
      }
      return e('div',{className:'flex flex-col items-start gap-1'},
        !inline&&e('button',{type:'button',disabled:loadingOrders||state.busy,onClick:open,title:'Choose filters and export current active Site Orders',className:'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700'},'Active orders PDF'),
        state.open&&owner.current===client.username&&e('div',{className:inline?'w-full':'fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-6'},e('form',{ref:dialog,tabIndex:inline?undefined:-1,role:inline?undefined:'dialog','aria-modal':inline?undefined:true,'aria-label':'Active orders report',onSubmit:exportReport,onKeyDown:inline?undefined:keyDown,className:inline?'w-full rounded-xl border border-slate-200 bg-white p-5':'max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl sm:p-6'},
          e('h2',{className:'text-lg font-semibold text-slate-900'},'Active orders report'),
          e('p',{className:'mt-1 text-sm text-slate-600'},'Choose which active orders to include in the compact PDF. Dispatched and cancelled orders are excluded.'),
          e('fieldset',{disabled:state.busy,className:'mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2'},
            field('Orders','scope',[['all','All active orders'],['mine','My orders']]),
            field('Project','project',options.projects.map(value=>[value,value]),'All projects'),
            field('Order type','orderType',options.types.map(value=>[value,value]),'All order types'),
            field('Status','status',statuses,'All active statuses'),
            field('Delivery schedule','schedule',[['all','All deliveries'],['scheduled','Scheduled'],['unscheduled','Not scheduled']]),
            field('Date range applies to','dateField',[['ordered','Date ordered'],['requested','Requested delivery'],['scheduled','Scheduled delivery']]),
            ...[['dateFrom','From date'],['dateTo','To date']].map(([key,label])=>e('label',{key,className:'block text-sm font-medium text-slate-700'},label,e('input',{'aria-label':label,type:'date',name:key,value:filters[key],min:key==='dateTo'?filters.dateFrom||undefined:undefined,max:key==='dateFrom'?filters.dateTo||undefined:undefined,onChange:event=>change(key,event.target.value),className:'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2'})))),
          e('p',{className:'mt-3 text-xs text-slate-500'},'Dates are inclusive and use Brisbane time. Leave them blank for all dates. The PDF lists the filters used and reads the latest saved orders when downloaded.'),
          state.error&&e('p',{role:'alert',className:'mt-3 text-sm text-red-700'},state.error),
          e('div',{className:'mt-5 flex flex-wrap justify-end gap-2'},
            e('button',{type:'button',disabled:state.busy,onClick:()=>setState(current=>({...current,filters:defaults(),error:''})),className:'rounded-lg border border-slate-300 px-3 py-2 text-sm'},'Reset filters'),
            !inline&&e('button',{type:'button',disabled:state.busy,onClick:close,className:'rounded-lg border border-slate-300 px-3 py-2 text-sm'},'Close'),
            e('button',{type:'submit',disabled:state.busy,'aria-busy':state.busy,className:'rounded-lg bg-cyan-800 px-4 py-2 text-sm font-semibold text-white'},state.busy?'Preparing report…':'Download PDF')))));
    };
  }
  return {createButton,query,choices,defaults};
});
