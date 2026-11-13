(function(root){
  'use strict';
  const MAX_PDF=10*1024*1024;
  const STATES={queued:'Queued',processing:'Processing in Nexvia',created_verified:'PO verified',needs_review:'Needs review',cancelled:'Cancelled'};
  const clone=value=>JSON.parse(JSON.stringify(value));
  const money=cents=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(cents/100);
  const requireValue=(ok,message)=>{if(!ok)throw Error(message);};
  function decimal(value){
    const text=String(value).trim();
    requireValue(/^\d{1,10}(?:\.\d{1,6})?$/.test(text),'Use positive decimal quantities and prices with up to six decimal places.');
    const [whole,fraction='']=text.split('.');
    return BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));
  }
  const halfUp=(value,denominator)=>(value+denominator/2n)/denominator;
  function calculateTotals(lines,taxes){
    let subtotal=0n,tax=0n;
    for(const line of lines){
      const quantity=decimal(line.quantity),price=decimal(line.unitPriceExGst);
      requireValue(quantity>0n,'Each quantity must be greater than zero.');
      const amount=halfUp(quantity*price,10000000000n);
      const selected=taxes.find(value=>String(value.id)===String(line.taxRateId));
      requireValue(selected,'Select a tax rate for every line.');
      const rate=decimal(selected.rate);
      subtotal+=amount;tax+=halfUp(amount*rate,100000000n);
    }
    requireValue(subtotal+tax<=1000000000000n,'The request total is too large.');
    return {subtotalCents:Number(subtotal),taxCents:Number(tax),totalCents:Number(subtotal+tax)};
  }
  function pendingStorage(owner){
    let database;
    const open=()=>database||(database=new Promise((resolve,reject)=>{
      if(!root.indexedDB){reject(Error('Browser storage is unavailable. The request was not submitted.'));return;}
      const request=root.indexedDB.open('panelstock-purchase-requests-v1',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('pending');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(Error('The retry record could not be saved. The request was not submitted.'));
    }));
    async function action(mode,operation){
      const db=await open();
      return new Promise((resolve,reject)=>{
        const transaction=db.transaction('pending',mode),request=operation(transaction.objectStore('pending'));
        let result;request.onsuccess=()=>{result=request.result;};
        transaction.oncomplete=()=>resolve(result);
        transaction.onerror=transaction.onabort=()=>reject(Error('The request retry record could not be saved.'));
      });
    }
    return {read:()=>action('readonly',store=>store.get(owner)),write:body=>action('readwrite',store=>store.put(clone(body),owner)),clear:()=>action('readwrite',store=>store.delete(owner))};
  }
  // A saved UUID and exact body survive a timeout, navigation and reload.
  // Restoring only reads status; only the user's Submit/Retry action posts work.
  function createSubmission(api,storage){
    let pending=null;
    const accept=async request=>{await storage.clear();pending=null;return request;};
    async function resolve(){
      if(!pending)return null;
      const response=await api('/purchase-requests/'+encodeURIComponent(pending.requestId));
      if(response.status===404)return null;
      requireValue(response.ok&&response.data?.request,response.data?.error||'The saved request status could not be checked.');
      requireValue(response.data.request.id===pending.requestId,'The returned request did not match the saved request.');
      return accept(response.data.request);
    }
    async function send(){
      requireValue(pending,'There is no saved request to retry.');
      const response=await api('/purchase-requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending)});
      if(response.ok){
        requireValue(response.data?.request?.id===pending.requestId,'The returned request did not match the saved request.');
        return accept(response.data.request);
      }
      if(response.status===409&&response.data?.code==='PURCHASE_REQUEST_CHOICES_CHANGED'){
        // Only unlock a stale-choices rejection after a status read proves
        // this UUID was not saved. Other conflicts remain ambiguous.
        const existing=await resolve();if(existing)return existing;
        await storage.clear();pending=null;
        const error=Error(response.data.error||'Project choices changed. Refresh them before submitting.');error.choicesChanged=true;throw error;
      }
      if([400,422].includes(response.status)){await storage.clear();pending=null;}
      throw Error(response.data?.error||'The result is uncertain. Check status or retry this saved request.');
    }
    return {
      get pending(){return pending?clone(pending):null;},
      async restore(){pending=await storage.read()||null;return pending?resolve():null;},
      async submit(body){requireValue(!pending,'A saved request still needs its result checked.');await storage.write(body);pending=clone(body);return send();},
      async retry(){const found=await resolve();return found||send();},
      resolve,
    };
  }
  function createDetailLoader(api,current,changed){
    let selectedId=null,value=null,busy=false,error='',generation=0;
    async function load(id){
      const version=++generation;busy=true;error='';changed();
      try{
        const response=await api('/purchase-requests/'+encodeURIComponent(id));
        if(!current()||version!==generation||selectedId!==id)return;
        requireValue(response.ok&&response.data?.request?.id===id,response.data?.error||'Request details could not be loaded.');
        value=response.data.request;
      }catch(failure){if(current()&&version===generation&&selectedId===id)error=failure.message;}
      finally{if(current()&&version===generation&&selectedId===id){busy=false;changed();}}
    }
    return {
      get id(){return selectedId;},get value(){return value;},get busy(){return busy;},get error(){return error;},
      select(id){if(id!==selectedId)value=null;selectedId=id;return load(id);},
      show(record){++generation;selectedId=record.id;value=record;busy=false;error='';changed();},
      summary(record){if(record?.id===selectedId&&value)value={...value,...record,lines:value.lines};},
      refresh(){return selectedId?load(selectedId):Promise.resolve();},
    };
  }
  function mount(host,options){
    const doc=host.ownerDocument||root.document,owner=options.username;
    let alive=true,catalog=null,lookupVersion=0,busy=false,locked=false,quote=null;
    let requests=[],projects=[],projectSignature='',permissions={create:false,manage:false},timers=new Set();
    const controller=new AbortController();
    const current=()=>alive&&(!options.currentUsername||options.currentUsername()===owner);
    const later=(fn,delay)=>{const id=root.setTimeout(()=>{timers.delete(id);if(current())fn();},delay);timers.add(id);return id;};
    function el(tag,text,className){const node=doc.createElement(tag);if(text!==undefined&&text!==null)node.textContent=text;if(className)node.className=className;return node;}
    function append(parent,...children){for(const child of children)if(child)parent.appendChild(child);return parent;}
    function button(text,action,className='pr-button'){const node=el('button',text,className);node.type='button';node.addEventListener('click',action);return node;}
    function field(label,node,wide=false){const wrapper=el('label',null,'pr-field'+(wide?' pr-wide':''));append(wrapper,el('span',label),node);return wrapper;}
    function input(type,name,required=true){const node=el('input');node.type=type;node.name=name;node.required=required;return node;}
    function select(name){const node=el('select');node.name=name;node.required=true;return node;}
    function choices(node,rows,label,placeholder='Select…'){
      const previous=node.value;node.replaceChildren();const blank=el('option',placeholder);blank.value='';node.appendChild(blank);
      for(const row of rows){const option=el('option',label(row));option.value=String(row.id);option.disabled=row.disabled===true;node.appendChild(option);}
      if([...node.options].some(option=>option.value===previous&&!option.disabled))node.value=previous;
    }
    async function api(path,init={}){
      requireValue(current(),'Your account changed. Reopen Purchase Requests.');
      const response=await options.apiFetch(options.workerUrl+path,{...init,signal:controller.signal});
      const data=await response.json().catch(()=>({}));
      requireValue(current(),'Your account changed. Reopen Purchase Requests.');
      return {ok:response.ok,status:response.status,data};
    }
    const submitter=createSubmission(api,options.storage||pendingStorage(owner));
    const detailLoader=createDetailLoader(api,current,()=>renderDetails());
    const shell=el('div',null,'pr-workspace');
    const status=el('p',null,'pr-notice');status.setAttribute('role','status');
    const connection=el('p',null,'pr-connection');
    const top=el('div',null,'pr-top');append(top,connection,button('Refresh requests',()=>void refresh()));
    const formCard=el('section',null,'pr-card');
    const form=el('form');form.setAttribute('aria-label','Lennox purchase request');
    const formFields=el('fieldset');formFields.className='pr-form-fields';
    const name=input('text','requestorName');name.maxLength=100;
    const email=input('email','requestorEmail');email.maxLength=254;
    const project=select('project');const supplier=select('supplier');
    const date=input('date','date');date.value=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Brisbane',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const reference=input('text','supplierReference',false);reference.maxLength=200;
    const service=select('service'),breakdown=select('breakdown');
    const grid=el('div',null,'pr-grid');
    append(grid,field('Requestor name *',name),field('Work email *',email),field('Project / building *',project),field('Order date *',date),field('Supplier *',supplier),field('Supplier / quote reference',reference),field('Service *',service),field('Element of work *',breakdown));
    const lookupStatus=el('p',null,'pr-help');lookupStatus.setAttribute('role','status');
    const file=input('file','quote',false);file.accept='application/pdf,.pdf';
    const fileStatus=el('p','Optional PDF, up to 10 MB. Requests with a PDF are saved for office review; they are not automatically created in Nexvia.','pr-help');
    const lineBox=el('div',null,'pr-lines');const totalBox=el('div',null,'pr-totals');
    const addLineButton=button('Add line',()=>addLine());
    append(formFields,grid,lookupStatus,button('Refresh project choices',()=>void lookup()),el('h3','Items'),el('p','Enter unit prices excluding GST. The total below includes the selected tax.','pr-help'),lineBox,addLineButton,totalBox,field('Quote PDF (optional)',file,true),fileStatus);
    const send=el('button','Submit purchase request','pr-primary');send.type='submit';
    const retry=button('Check status and retry saved request',()=>void submit(true),'pr-primary');retry.hidden=true;
    const fresh=button('New purchase request',()=>newRequest());fresh.hidden=true;
    const actions=el('div',null,'pr-actions');append(actions,send,retry,fresh);
    append(form,formFields,actions);append(formCard,el('h2','New purchase request'),el('p','Submit a Lennox purchase request and follow its Nexvia PO and confirmation status.','pr-help'),form);
    const historyCard=el('section',null,'pr-card');const historyList=el('div',null,'pr-history'),historyInfo=el('p',null,'pr-help');
    const details=el('section',null,'pr-details');details.hidden=true;
    append(historyCard,el('h2','Purchase requests'),historyInfo,historyList,details);append(shell,top,status,formCard,historyCard);host.replaceChildren(shell);
    function notice(message,error=false){if(!current())return;status.textContent=message;status.classList.toggle('pr-error',error);}
    function lock(value){locked=value;formFields.disabled=value||!permissions.create;send.disabled=value||!permissions.create||!catalog;retry.hidden=!submitter.pending;retry.disabled=busy;}
    function lineValues(){return [...lineBox.children].map(row=>({description:row.querySelector('[name=description]').value.trim(),quantity:row.querySelector('[name=quantity]').value,unitPriceExGst:row.querySelector('[name=price]').value,chartOfAccountId:row.querySelector('[name=account]').value,taxRateId:row.querySelector('[name=tax]').value,breakdownType:breakdown.value}));}
    function updateTotals(){
      totalBox.replaceChildren();if(!catalog)return;
      try{const amounts=calculateTotals(lineValues(),catalog.taxes);for(const [label,key] of [['Subtotal ex GST','subtotalCents'],['GST','taxCents'],['Total including GST','totalCents']])append(totalBox,append(el('div'),el('span',label),el('strong',money(amounts[key]))));}
      catch{totalBox.appendChild(el('span','Complete quantities, prices and tax rates to calculate the total.'));}
    }
    function populateLine(row){
      choices(row.querySelector('[name=account]'),catalog?.accounts||[],value=>value.name);
      choices(row.querySelector('[name=tax]'),catalog?.taxes||[],value=>value.name+' ('+value.rate+'%)');
      const standard=catalog?.taxes?.find(value=>Number(value.rate)===10);if(standard)row.querySelector('[name=tax]').value=String(standard.id);
    }
    function addLine(){
      if(locked||lineBox.children.length>=200)return;
      const row=el('div',null,'pr-line'),description=input('text','description');description.maxLength=2000;
      const quantity=input('number','quantity');quantity.min='0.000001';quantity.max='1000000000';quantity.step='any';quantity.value='1';
      const price=input('number','price');price.min='0';price.max='1000000000';price.step='any';
      const account=select('account'),tax=select('tax');
      append(row,field('Description *',description,true),field('Quantity *',quantity),field('Unit price ex GST *',price),field('Cost of sales *',account),field('Tax *',tax),button('Remove line',()=>{if(lineBox.children.length>1){row.remove();updateTotals();}},'pr-remove'));
      row.addEventListener('input',updateTotals);row.addEventListener('change',updateTotals);populateLine(row);lineBox.appendChild(row);updateTotals();
    }
    function setCatalog(value){
      catalog=value;choices(supplier,value?.suppliers||[],row=>row.text||row.name);choices(service,value?.services||[],row=>row.name);choices(breakdown,value?.breakdowns||[],row=>row.name);
      for(const row of lineBox.children)populateLine(row);lock(locked);updateTotals();
    }
    async function lookup(){
      const version=++lookupVersion,projectId=Number(project.value);setCatalog(null);
      if(!projectId){lookupStatus.textContent='Select a project to load its current suppliers and account choices.';return;}
      lookupStatus.textContent='Loading current project choices…';
      const take=async response=>{
        if(!current()||version!==lookupVersion)return;
        requireValue(response.ok,response.data.error||'Project choices could not be loaded.');
        const result=response.data;
        if(result.lookup?.state==='ready'&&result.catalog){requireValue(result.catalog.projectPageId===projectId,'Project choices did not match. Select the project again.');setCatalog(result.catalog);lookupStatus.textContent='Project choices are ready.';return;}
        if(result.lookup?.state==='needs_review'){lookupStatus.textContent=result.lookup.message||'Project choices need office review.';return;}
        requireValue(result.lookup?.id,'Project choices could not be queued.');
        lookupStatus.textContent='Waiting for Nexvia project choices. You can keep this page open.';
        later(()=>void api('/purchase-requests/lookups/'+encodeURIComponent(result.lookup.id)).then(take).catch(error=>{if(version===lookupVersion&&current())lookupStatus.textContent=error.message;}),3000);
      };
      try{await take(await api('/purchase-requests/lookups',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectPageId:projectId})}));}
      catch(error){if(version===lookupVersion&&current())lookupStatus.textContent=error.message;}
    }
    project.addEventListener('change',()=>void lookup());
    file.addEventListener('change',()=>{
      quote=file.files?.[0]||null;
      if(quote&&(quote.size>MAX_PDF||!quote.name.toLowerCase().endsWith('.pdf'))){notice('Choose a PDF no larger than 10 MB.',true);file.value='';quote=null;}
    });
    async function payload(){
      requireValue(catalog&&catalog.projectPageId===Number(project.value),'Load the selected project choices before submitting.');
      const lines=lineValues();calculateTotals(lines,catalog.taxes);
      const body={requestId:root.crypto.randomUUID(),projectPageId:catalog.projectPageId,catalogRevision:catalog.revision,requestor:{name:name.value.trim(),email:email.value.trim()},date:date.value,supplierId:supplier.value,supplierReference:reference.value.trim(),serviceId:service.value,breakdownType:breakdown.value,quote:null,quoteBase64:'',lines};
      if(quote){
        requireValue(quote.size<=MAX_PDF,'The PDF must be no larger than 10 MB.');
        const bytes=new Uint8Array(await quote.arrayBuffer());requireValue(new TextDecoder().decode(bytes.slice(0,5))==='%PDF-','Choose a valid PDF file.');
        let binary='';for(let offset=0;offset<bytes.length;offset+=32768)binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));
        body.quote={filename:quote.name};body.quoteBase64=root.btoa(binary);
      }
      return body;
    }
    async function submit(isRetry){
      if(busy||!current())return;
      if(!isRetry&&!form.reportValidity())return;
      busy=true;lock(true);send.textContent='Submitting…';notice('Saving your request…');
      try{
        const request=isRetry?await submitter.retry():await submitter.submit(await payload());
        if(!current())return;upsert(request);detailLoader.show(request);renderHistory();fresh.hidden=false;send.hidden=true;
        notice('Request '+request.reference+' saved. '+(request.state==='needs_review'?'It is waiting for office review.':'Follow its PO status below.'));
      }catch(error){
        if(!current())return;
        if(error.choicesChanged){++lookupVersion;setCatalog(null);lookupStatus.textContent='Refresh project choices and check the supplier, service and account selections. Your line descriptions and prices are retained.';}
        const retained=submitter.pending;notice(retained?'The outcome is not yet confirmed. Your saved request is locked to avoid a duplicate. Check status and retry the same request. '+error.message:error.message,true);
        lock(!!retained);
      }finally{busy=false;if(current()){send.textContent='Submit purchase request';retry.hidden=!submitter.pending;retry.disabled=false;}}
    }
    form.addEventListener('submit',event=>{event.preventDefault();void submit(false);});
    function newRequest(){if(submitter.pending||busy)return;form.reset();name.value=options.profile?.name||name.value;email.value=options.profile?.email||email.value;date.value=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Brisbane',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());quote=null;lineBox.replaceChildren();setCatalog(null);locked=false;addLine();lock(false);send.hidden=false;fresh.hidden=true;notice('');}
    function upsert(request){requests=[request,...requests.filter(value=>value.id!==request.id)].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));}
    function renderHistory(){
      historyList.replaceChildren();if(!requests.length){historyList.appendChild(el('p','No purchase requests yet.','pr-help'));return;}
      const table=el('table');const head=el('tr');for(const label of ['Request','Project','Total incl GST','Status','PO'])head.appendChild(el('th',label));append(table,append(el('thead'),head));const body=el('tbody');
      for(const request of requests){const row=el('tr');const open=button(request.reference,()=>void detailLoader.select(request.id),'pr-link');append(row,append(el('td'),open),el('td',request.project),el('td',money(request.totalCents)),el('td',STATES[request.state]||'Status pending'),el('td',request.result?.purchaseOrderNumber||'—'));body.appendChild(row);}
      append(table,body);historyList.appendChild(table);
    }
    function renderDetails(){
      const request=detailLoader.value||requests.find(value=>value.id===detailLoader.id);details.hidden=!detailLoader.id;details.replaceChildren();if(!detailLoader.id)return;
      if(detailLoader.busy)details.appendChild(el('p','Loading request details…','pr-help'));
      if(detailLoader.error)details.appendChild(el('p',detailLoader.error,'pr-error'));
      if(!request)return;
      append(details,el('h3',request.reference),el('p',(STATES[request.state]||'Status pending')+' · '+request.project),el('p',request.message||'', 'pr-help'));
      const pairs=[['Requested by',request.requestor.name+' · '+request.requestor.email],['Supplier',request.supplierName],['Service',request.serviceName],['Element of work',request.breakdownName],['Order date',request.date],['Supplier reference',request.supplierReference||'—'],['Total including GST',money(request.totalCents)]];
      if(request.quote)pairs.push(['Quote PDF',request.quote.filename+' · saved for office review']);
      if(request.result)pairs.push(['Purchase order',request.result.purchaseOrderNumber]);
      const emailStatus=request.confirmation?.status;
      pairs.push(['Confirmation email',emailStatus==='sent'?'Accepted by email provider':emailStatus==='failed'||emailStatus==='needs_review'?'Needs review':request.result?'Pending':'Available after PO verification']);
      const list=el('dl',null,'pr-summary');for(const [label,value] of pairs)append(list,el('dt',label),el('dd',value));details.appendChild(list);
      for(const line of request.lines||[])details.appendChild(el('p',line.quantity+' × '+line.description+' · '+money(Math.round(Number(line.unitPriceExGst)*100))+' ex GST','pr-detail-line'));
      if(request.quote)details.appendChild(button('Download quote PDF',async()=>{
        if(busy)return;busy=true;
        try{
          const response=await api('/purchase-requests/'+encodeURIComponent(request.id)+'/quote');
          requireValue(response.ok&&response.data.quote?.base64,response.data.error||'The quote PDF could not be downloaded.');
          const raw=root.atob(response.data.quote.base64),bytes=Uint8Array.from(raw,value=>value.charCodeAt(0));
          const blob=new Blob([bytes],{type:'application/pdf'}),url=URL.createObjectURL(blob),link=el('a');
          link.href=url;link.download=response.data.quote.filename||request.quote.filename;doc.body.appendChild(link);link.click();link.remove();root.setTimeout(()=>URL.revokeObjectURL(url),1000);
        }catch(error){notice(error.message,true);}finally{busy=false;}
      }));
      if(request.result?.url){try{const target=new URL(request.result.url);if(target.protocol==='https:'&&target.hostname==='lennox.nexvia.com.au'){const link=el('a','Open verified PO in Nexvia','pr-button');link.href=target.href;link.target='_blank';link.rel='noopener noreferrer';details.appendChild(link);}}catch{}}
      if(request.state==='queued')details.appendChild(button('Cancel queued request',async()=>{
        if(busy)return;if(options.confirm&&!await options.confirm({title:'Cancel purchase request?',message:'Cancel '+request.reference+' before it is processed?',confirmLabel:'Cancel request'}))return;
        busy=true;try{const response=await api('/purchase-requests/'+encodeURIComponent(request.id)+'/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});requireValue(response.ok,response.data.error||'The request could not be cancelled.');upsert(response.data.request);if(detailLoader.id===request.id)detailLoader.show(response.data.request);renderHistory();notice('Request cancelled.');}catch(error){notice(error.message,true);}finally{busy=false;}
      }));
    }
    async function refresh(initial=false){
      try{
        const response=await api('/purchase-requests');requireValue(response.ok,response.data.error||'Purchase requests could not be loaded.');if(!current())return;
        requests=response.data.requests||[];permissions=response.data.permissions||permissions;projects=response.data.projects||[];
        historyInfo.textContent=response.data.historyTruncated?'Showing the 200 most recent purchase requests.':'';
        const selectedSummary=requests.find(value=>value.id===detailLoader.id);detailLoader.summary(selectedSummary);
        connection.textContent=response.data.connection?.connected?'Nexvia connection is online.':'Nexvia connection is offline. Saved requests remain queued until the connection is ready.';
        const signature=JSON.stringify(projects);
        if(initial||signature!==projectSignature){
          const previous=project.value;projectSignature=signature;
          choices(project,projects.map(value=>({...value,id:value.projectPageId})),value=>value.name,'Select a project');
          if(previous&&!project.value){++lookupVersion;setCatalog(null);lookupStatus.textContent='The selected project is no longer available. Select a current project before submitting.';}
        }
        if(initial){options.profile=response.data.profile||{};name.value=options.profile.name||'';email.value=options.profile.email||'';addLine();}
        formCard.hidden=!permissions.create;lock(locked);renderHistory();renderDetails();if(!initial&&detailLoader.id)void detailLoader.refresh();
      }catch(error){if(current())notice(error.message,true);}
    }
    async function start(){
      await refresh(true);if(!current())return;
      try{const found=await submitter.restore();if(!current())return;if(found){upsert(found);detailLoader.show(found);renderHistory();lock(true);send.hidden=true;fresh.hidden=false;notice('Your previously submitted request was found.');}else if(submitter.pending){lock(true);notice('A saved request is waiting for its outcome. Check status and retry it before starting another request.');}}
      catch(error){if(current()){lock(!!submitter.pending);notice(error.message,true);}}
      const poll=()=>{void refresh();later(poll,10000);};later(poll,10000);
    }
    void start();
    return {destroy(){alive=false;++lookupVersion;controller.abort();for(const timer of timers)root.clearTimeout(timer);timers.clear();host.replaceChildren();},refresh};
  }
  root.PanelStockPurchaseRequests={mount,calculateTotals,createSubmission,createDetailLoader,MAX_PDF};
})(typeof window!=='undefined'?window:globalThis);
