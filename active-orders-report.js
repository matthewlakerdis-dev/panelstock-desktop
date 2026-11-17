(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PanelStockActiveOrdersReport=api;})(typeof window==='object'?window:globalThis,function(){
  function createButton({React,client,baseUrl,document,URL,AbortController,setTimeout,clearTimeout}){
    const {createElement:e,useState,useRef,useEffect}=React;
    return function ActiveOrdersReportButton(){
      const [state,setState]=useState({busy:false,error:''}),request=useRef(null),alive=useRef(true),download=useRef(null);
      function release(){if(download.current){clearTimeout(download.current.timer);URL.revokeObjectURL(download.current.url);download.current=null;}}
      useEffect(()=>{alive.current=true;return()=>{alive.current=false;request.current?.abort();release();};},[]);
      async function exportReport(){
        if(request.current)return;
        const owner=client.username,controller=new AbortController();request.current=controller;setState({busy:true,error:''});
        const valid=()=>alive.current&&client.username===owner;
        try{
          const response=await client.apiFetch(baseUrl+'/orders/active-report.pdf',{signal:controller.signal});
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
        }catch(error){if(valid()&&error.name!=='AbortError')setState({busy:false,error:error.message||'The report could not be downloaded. Please retry.'});}
        finally{request.current=null;if(valid())setState(current=>({...current,busy:false}));}
      }
      return e('div',{className:'flex flex-col items-start gap-1'},
        e('button',{type:'button',disabled:state.busy,onClick:exportReport,'aria-busy':state.busy,title:'Export all current active Site Orders, including orders ready for dispatch',className:'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700'},state.busy?'Preparing report…':'Active orders PDF'),
        state.error&&e('span',{role:'alert',className:'text-xs text-red-700'},state.error));
    };
  }
  return {createButton};
});
