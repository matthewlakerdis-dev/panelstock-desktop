/* Sheet proposals only. No stock mutations or CNC completion operations. */
(()=>{'use strict';
function availableStock(data){
 const reserved=new Map(),seen=new Set();
 for(const p of data.cncPanels||[]){if(p.status==='completed'||!p.stockItemType||!p.stockItemId)continue;const key=JSON.stringify([p.jobReference||'',p.orderNumber||'',p.sheetNumber||'',p.stockItemType,p.stockItemId]);if(seen.has(key))continue;seen.add(key);const stockKey=p.stockItemType+':'+p.stockItemId;reserved.set(stockKey,(reserved.get(stockKey)||0)+1);}
 return [['offcut',data.offcuts||[]],['variant',data.variants||[]]].flatMap(([type,items])=>items.map(s=>({...s,type,quantity:Math.max(0,Number(s.qty)-(reserved.get(type+':'+s.id)||0)),width:Math.max(Number(s.width),Number(s.height)),height:Math.min(Number(s.width),Number(s.height)),thickness:Number(s.thickness)}))).filter(s=>Number.isInteger(s.quantity)&&s.quantity>0&&s.width>0&&s.height>0&&s.material&&s.color&&s.thickness>0);
}
function groupKey(s){return JSON.stringify([s.material.trim().toLowerCase(),s.color.trim().toLowerCase(),s.thickness]);}
function trackerPacket(plan,data,order,job,start,id=()=>crypto.randomUUID()){
 if(plan.unplaced.length||!plan.sheets.length)throw Error('Place every selected panel before sending the plan to CNC.');
 order=String(order||'').trim();job=String(job||'').trim();start=Number(start);
 if(!order||order.length>100||job.length>120||!Number.isSafeInteger(start)||start<1)throw Error('Enter an order number and a whole starting sheet number.');
 const available=availableStock(data),needed=new Map(),changes=[],used=new Set();
 const normal=value=>String(value||'').trim().toLowerCase();
 const key=p=>JSON.stringify([normal(p.jobReference),normal(p.orderNumber),normal(p.sheetNumber),normal(p.panelNumber)]);
 const existing=new Set((data.cncPanels||[]).map(key));
 for(const [i,sheet]of plan.sheets.entries()){
  if((data.cncPanels||[]).some(p=>normal(p.jobReference)===normal(job)&&normal(p.orderNumber)===normal(order)&&normal(p.sheetNumber)===String(start+i)))throw Error('This sheet number is already scheduled. Choose another starting sheet number.');
  const item=available.find(s=>s.id===sheet.stock.id&&s.type===sheet.stock.type);
  if(!item||groupKey(item)!==groupKey(sheet.stock)||item.width!==sheet.stock.width||item.height!==sheet.stock.height)throw Error('Stock has changed. Preview a new plan.');
  const stockKey=item.type+':'+item.id;needed.set(stockKey,(needed.get(stockKey)||0)+1);
  if(needed.get(stockKey)>item.quantity)throw Error('Not enough unallocated stock. Preview a new plan.');
  for(const panel of sheet.panels){
   if(!Number.isFinite(panel.area)||panel.area<=0)throw Error('Preview a new plan to include panel areas.');
   const record={id:id(),orderNumber:order,jobReference:job,sheetNumber:String(start+i),panelNumber:panel.name+(panel.copy>1?' (copy '+panel.copy+')':''),stockItemType:item.type,stockItemId:item.id,stockSku:item.sku,sheetWidth:item.width,sheetHeight:item.height,totalPanelArea:panel.area,panelAreaScope:'panel',status:'pending',completedBy:null,completedAt:null};
   const k=key(record);if(existing.has(k)||used.has(k))throw Error('A panel with this order and sheet number is already scheduled. Choose another starting sheet number.');
   used.add(k);changes.push({field:'cncPanels',id:record.id,before:null,after:record});
  }
 }
 const activity={id:id(),type:'cnc',source:'cad-sheet-plan',desc:'Scheduled '+changes.length+' panels on '+plan.sheets.length+' sheets from CAD · Order '+order,qty:'',timestamp:new Date().toISOString()};
 changes.push({field:'transactions',id:activity.id,before:null,after:activity});
 return {mutationId:id(),restoreEpoch:data.restoreEpoch||0,changes};
}
async function open({panels,request,download,projectName}){
 const data=await request('/data'),stock=availableStock(data);
 if(!stock.length)throw Error('No unallocated SOH sheets or usable offcuts are available.');
 const dialog=document.createElement('dialog');dialog.className='combine-picker sheet-picker';dialog.setAttribute('aria-labelledby','sheet-plan-title');
 const header=document.createElement('header');header.innerHTML='<h2 id="sheet-plan-title">Plan panels on sheets</h2><p>10 mm between panels · No edge margin · Direction arrows face right</p>';
 const body=document.createElement('div');body.className='combine-body';const footer=document.createElement('footer');
 const note=document.createElement('p');note.className='sheet-plan-note';note.textContent='Offcuts first � Multiple panels per sheet � Stock deducted only on CNC completion';body.append(note);
 const materialLabel=document.createElement('label');materialLabel.className='sheet-material';materialLabel.textContent='Material, colour and thickness';const material=document.createElement('select');const groups=new Map();stock.forEach(s=>groups.set(groupKey(s),s));material.append(new Option('Choose the material for this job',''));for(const [key,s]of groups)material.append(new Option(s.material+' · '+s.color+' · '+s.thickness+' mm',key));materialLabel.append(material);body.append(materialLabel);
 const panelList=document.createElement('div');panelList.className='combine-list';const choices=[];
 for(const panel of panels){const label=document.createElement('label');label.className='combine-row';const check=document.createElement('input');check.type='checkbox';check.style.width='18px';check.checked=!!panel.dxf;check.disabled=!panel.dxf;const text=document.createElement('span');text.textContent=panel.name+' · Qty '+panel.quantity+(panel.dxf?'':' · Generate drawing first');label.append(check,text);panelList.append(label);choices.push({check,panel});}const setup=document.createElement('div');setup.className='sheet-setup';const panelSection=document.createElement('section');panelSection.className='sheet-selection';const panelTitle=document.createElement('h3');panelTitle.textContent='Panels';const selectionCount=document.createElement('p');selectionCount.className='sheet-selection-count';selectionCount.setAttribute('role','status');const toolbar=document.createElement('div');toolbar.className='combine-toolbar';for(const [label,selected]of [['Select all',true],['Clear',false]]){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>{choices.forEach(c=>{if(!c.check.disabled)c.check.checked=selected;});clear();};toolbar.append(button);}panelSection.append(panelTitle,selectionCount,toolbar,panelList);setup.append(panelSection);body.append(setup);
 const stockTitle=document.createElement('h3');stockTitle.textContent='Sheets and offcuts';const stockList=document.createElement('div');stockList.className='sheet-stock-list';const stockSection=document.createElement('section');stockSection.className='sheet-selection';stockSection.append(stockTitle,stockList);setup.append(stockSection);
 const results=document.createElement('div');results.className='sheet-results';body.append(results);let stockChoices=[],urls=[],revision=0,working=false;
 const status=document.createElement('p');status.className='combine-status';status.setAttribute('role','status');
 const build=document.createElement('button');build.type='button';build.className='primary';build.textContent='Preview sheet plan';const close=document.createElement('button');close.type='button';close.textContent='Close';footer.append(status,close,build);dialog.append(header,body,footer);
 function clear(){const selected=choices.filter(c=>c.check.checked);selectionCount.textContent=selected.length+' of '+choices.length+' drawings selected � '+selected.reduce((n,c)=>n+Number(c.panel.quantity||1),0)+' panel copies';for(const {check}of [...choices,...stockChoices])check.closest('label').classList.toggle('is-selected',check.checked);revision++;results.replaceChildren();urls.forEach(URL.revokeObjectURL);urls=[];status.textContent='Choose panels and stock, then preview the plan.';build.disabled=working||!material.value||!choices.some(c=>c.check.checked)||!stockChoices.some(c=>c.check.checked);}
 function stockRows(){stockChoices=[];stockList.replaceChildren();if(!material.value){const empty=document.createElement('p');empty.className='sheet-stock-empty';empty.textContent='Choose a material above to see available sheets and usable offcuts.';stockList.append(empty);}for(const s of stock.filter(s=>groupKey(s)===material.value)){const label=document.createElement('label');label.className='combine-row';const check=document.createElement('input');check.type='checkbox';check.checked=true;check.style.width='18px';const text=document.createElement('span');text.textContent=(s.type==='offcut'?'Offcut':'Full sheet')+' · '+s.width+' × '+s.height+' mm · '+s.quantity+' available · '+(s.sku||s.id);label.append(check,text);stockList.append(label);stockChoices.push({check,s});check.onchange=clear;}clear();}
 material.onchange=stockRows;choices.forEach(c=>c.check.onchange=clear);
 build.onclick=async()=>{if(working)return;clear();const version=revision;working=true;build.disabled=true;status.textContent='Checking current SOH and arranging panels…';try{
   const selected=choices.filter(c=>c.check.checked).map(c=>c.panel);if(!selected.length)throw Error('Select at least one generated panel.');
   if(selected.some(p=>!['right','left','up','down'].includes(p.direction)))throw Error('Set the direction arrow on every selected panel and generate it again.');
   const fresh=availableStock(await request('/data'));const chosen=stockChoices.filter(c=>c.check.checked).map(c=>fresh.find(s=>s.type===c.s.type&&s.id===c.s.id&&groupKey(s)===material.value)).filter(Boolean);if(!chosen.length)throw Error('Selected stock is no longer available. Reopen the planner to refresh SOH.');
   const payload={sheetPlan:true,panels:selected,stock:chosen.map(s=>({id:s.id,type:s.type,sku:s.sku,material:s.material,color:s.color,thickness:s.thickness,width:s.width,height:s.height,quantity:s.quantity}))};if(new TextEncoder().encode(JSON.stringify(payload)).length>9*1024*1024)throw Error('Choose fewer drawings for this plan.');
   const plan=await request('/cad/generate',payload);if(!dialog.isConnected||version!==revision)return;
   status.textContent=plan.sheets.length+' sheets planned · '+plan.unplaced.length+' panel copies could not fit. Stock has not changed.';
   if(plan.unplaced.length){const warning=document.createElement('p');warning.textContent='Not placed: '+plan.unplaced.map(p=>p.name+' (copy '+p.copy+')').join(', ')+'. No available sheet fits, or available quantities have been used.';results.append(warning);}
   const prefix=(projectName||'PanelStock').replace(/[^a-z0-9_-]/gi,'_');
   for(const sheet of plan.sheets){const card=document.createElement('section'),heading=document.createElement('h3');heading.textContent='Sheet '+sheet.number+' · '+(sheet.stock.type==='offcut'?'Offcut':'Full sheet')+' · '+sheet.stock.width+' × '+sheet.stock.height+' mm';const caption=document.createElement('p');caption.textContent=(sheet.stock.sku||sheet.stock.id)+' � '+sheet.panels.length+' panel'+(sheet.panels.length===1?'':'s')+' � '+sheet.utilisation+'% cut area � '+sheet.panels.map(p=>p.name+(p.copy>1?' (copy '+p.copy+')':'')).join(', ');const img=document.createElement('img');img.alt='Sheet '+sheet.number+' layout';img.style.width='100%';const url=URL.createObjectURL(new Blob([sheet.svg],{type:'image/svg+xml'}));urls.push(url);img.src=url;const button=document.createElement('button');button.type='button';button.textContent='Download sheet '+sheet.number+' DXF';button.onclick=()=>download(sheet.dxf,'application/dxf',prefix+'-sheet-'+sheet.number+'.dxf');card.append(heading,caption,img,button);results.append(card);}
   if(plan.sheets.length&&!plan.unplaced.length){
    const form=document.createElement('form'),heading=document.createElement('h3');heading.textContent='Send approved plan to CNC tracker';form.append(heading);
    const fields=[];
    for(const [text,value,type]of [['Order number','','text'],['Job reference',projectName||'','text'],['First sheet number','1','number']]){
     const label=document.createElement('label');label.textContent=text;const input=document.createElement('input');input.type=type;input.value=value;if(type==='number'){input.min='1';input.step='1';}input.maxLength=text==='Job reference'?120:100;input.required=text!=='Job reference';label.append(input);form.append(label);fields.push(input);
    }
    const explain=document.createElement('p');explain.textContent='Creates pending entries for these panels and their selected stock. Stock quantities are deducted only on CNC completion. Download the sheet DXFs before cutting.';
    const send=document.createElement('button');send.type='submit';send.textContent='Approve and send to CNC';form.append(explain,send);results.append(form);
    let packet=null,sending=false,sent=false;
    form.onsubmit=async event=>{event.preventDefault();if(sending||sent)return;sending=true;send.disabled=true;fields.forEach(input=>input.disabled=true);working=true;material.disabled=true;build.disabled=true;choices.forEach(c=>c.check.disabled=true);stockChoices.forEach(c=>c.check.disabled=true);
     try{if(!packet)packet=trackerPacket(plan,await request('/data'),fields[0].value,fields[1].value,fields[2].value);
      await request('/mutations',packet);sent=true;send.textContent='Sent to CNC tracker';status.textContent='Plan sent to CNC tracker as pending. Stock quantities are unchanged.';material.disabled=true;choices.forEach(c=>c.check.disabled=true);stockChoices.forEach(c=>c.check.disabled=true);build.disabled=true;
     }catch(error){status.textContent=error.message||'Could not send plan. Retry to check the same submission.';send.textContent='Retry sending to CNC';if(!packet||(error.status&&error.status<500)){packet=null;fields.forEach(input=>input.disabled=false);} }
     finally{sending=false;working=false;send.disabled=sent;if(!sent&&!packet){material.disabled=false;build.disabled=!material.value;choices.forEach(c=>c.check.disabled=!c.panel.dxf);stockChoices.forEach(c=>c.check.disabled=false);}}
    };
   }
   if(plan.sheets.length){const manifest=document.createElement('button');manifest.type='button';manifest.textContent='Download sheet plan';manifest.onclick=()=>download(JSON.stringify({...plan,projectName,plannedAt:new Date().toISOString(),sheets:plan.sheets.map(({dxf,svg,...sheet})=>sheet)},null,2),'application/json',prefix+'-sheet-plan.json');results.append(manifest);}
 }catch(e){if(dialog.isConnected)status.textContent=e.message||'Could not prepare the sheet plan.';}finally{working=false;build.disabled=!material.value;}};
 const dismiss=()=>{revision++;urls.forEach(URL.revokeObjectURL);dialog.close();dialog.remove();};close.onclick=dismiss;dialog.oncancel=e=>{e.preventDefault();dismiss();};document.body.append(dialog);stockRows();dialog.showModal();
}
window.PanelSheetPlanner={availableStock,groupKey,trackerPacket,open};
})();
