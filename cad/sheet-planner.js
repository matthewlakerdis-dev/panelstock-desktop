/* Sheet proposals only. No stock mutations or CNC completion operations. */
(()=>{'use strict';
function availableStock(data){
 const reserved=new Map(),seen=new Set();
 for(const p of data.cncPanels||[]){if(p.status==='completed'||!p.stockItemType||!p.stockItemId)continue;const key=JSON.stringify([p.jobReference||'',p.orderNumber||'',p.sheetNumber||'',p.stockItemType,p.stockItemId]);if(seen.has(key))continue;seen.add(key);const stockKey=p.stockItemType+':'+p.stockItemId;reserved.set(stockKey,(reserved.get(stockKey)||0)+1);}
 return [['offcut',data.offcuts||[]],['variant',data.variants||[]]].flatMap(([type,items])=>items.map(s=>({...s,type,quantity:Math.max(0,Number(s.qty)-(reserved.get(type+':'+s.id)||0)),width:Math.max(Number(s.width),Number(s.height)),height:Math.min(Number(s.width),Number(s.height)),thickness:Number(s.thickness)}))).filter(s=>Number.isInteger(s.quantity)&&s.quantity>0&&s.width>0&&s.height>0&&s.material&&s.color&&s.thickness>0);
}
function groupKey(s){return JSON.stringify([s.material.trim().toLowerCase(),s.color.trim().toLowerCase(),s.thickness]);}
async function open({panels,request,download,projectName}){
 const data=await request('/data'),stock=availableStock(data);
 if(!stock.length)throw Error('No unallocated SOH sheets or usable offcuts are available.');
 const dialog=document.createElement('dialog');dialog.className='combine-picker sheet-picker';
 const header=document.createElement('header');header.innerHTML='<h2>Plan panels on sheets</h2><p>10 mm between panels · No edge margin · Direction arrows face right</p>';
 const body=document.createElement('div');body.className='combine-body';const footer=document.createElement('footer');
 const note=document.createElement('p');note.textContent='Planning and downloads do not reserve or deduct stock. Stock is deducted only when the sheet is completed in the CNC tracker. Offcuts are used first. Sheet length runs left to right.';body.append(note);
 const materialLabel=document.createElement('label');materialLabel.textContent='Material, colour and thickness for these panels';const material=document.createElement('select');const groups=new Map();stock.forEach(s=>groups.set(groupKey(s),s));material.append(new Option('Choose the material for this job',''));for(const [key,s]of groups)material.append(new Option(s.material+' · '+s.color+' · '+s.thickness+' mm',key));materialLabel.append(material);body.append(materialLabel);
 const panelList=document.createElement('div');panelList.className='combine-list';const choices=[];
 for(const panel of panels){const label=document.createElement('label');label.className='combine-row';const check=document.createElement('input');check.type='checkbox';check.style.width='18px';check.checked=!!panel.dxf;check.disabled=!panel.dxf;const text=document.createElement('span');text.textContent=panel.name+' · Qty '+panel.quantity+(panel.dxf?'':' · Generate drawing first');label.append(check,text);panelList.append(label);choices.push({check,panel});}body.append(panelList);
 const stockTitle=document.createElement('h3');stockTitle.textContent='Available sheets and offcuts';const stockList=document.createElement('div');body.append(stockTitle,stockList);
 const results=document.createElement('div');body.append(results);let stockChoices=[],urls=[],revision=0,working=false;
 const status=document.createElement('p');status.className='combine-status';status.setAttribute('role','status');
 const build=document.createElement('button');build.type='button';build.className='primary';build.textContent='Preview sheet plan';const close=document.createElement('button');close.type='button';close.textContent='Close';footer.append(status,close,build);dialog.append(header,body,footer);
 function clear(){revision++;results.replaceChildren();urls.forEach(URL.revokeObjectURL);urls=[];status.textContent='Choose panels and stock, then preview the plan.';build.disabled=working||!material.value;}
 function stockRows(){stockChoices=[];stockList.replaceChildren();for(const s of stock.filter(s=>groupKey(s)===material.value)){const label=document.createElement('label');label.className='combine-row';const check=document.createElement('input');check.type='checkbox';check.checked=true;check.style.width='18px';const text=document.createElement('span');text.textContent=(s.type==='offcut'?'Offcut':'Full sheet')+' · '+s.width+' × '+s.height+' mm · '+s.quantity+' available · '+(s.sku||s.id);label.append(check,text);stockList.append(label);stockChoices.push({check,s});check.onchange=clear;}clear();}
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
   for(const sheet of plan.sheets){const card=document.createElement('section'),heading=document.createElement('h3');heading.textContent='Sheet '+sheet.number+' · '+(sheet.stock.type==='offcut'?'Offcut':'Full sheet')+' · '+sheet.stock.width+' × '+sheet.stock.height+' mm';const caption=document.createElement('p');caption.textContent=(sheet.stock.sku||sheet.stock.id)+' · '+sheet.panels.length+' panels · '+sheet.utilisation+'% cut area';const img=document.createElement('img');img.alt='Sheet '+sheet.number+' layout';img.style.width='100%';const url=URL.createObjectURL(new Blob([sheet.svg],{type:'image/svg+xml'}));urls.push(url);img.src=url;const button=document.createElement('button');button.type='button';button.textContent='Download sheet '+sheet.number+' DXF';button.onclick=()=>download(sheet.dxf,'application/dxf',prefix+'-sheet-'+sheet.number+'.dxf');card.append(heading,caption,img,button);results.append(card);}
   if(plan.sheets.length){const manifest=document.createElement('button');manifest.type='button';manifest.textContent='Download sheet plan';manifest.onclick=()=>download(JSON.stringify({...plan,projectName,plannedAt:new Date().toISOString(),sheets:plan.sheets.map(({dxf,svg,...sheet})=>sheet)},null,2),'application/json',prefix+'-sheet-plan.json');results.append(manifest);}
 }catch(e){if(dialog.isConnected)status.textContent=e.message||'Could not prepare the sheet plan.';}finally{working=false;build.disabled=!material.value;}};
 const dismiss=()=>{revision++;urls.forEach(URL.revokeObjectURL);dialog.close();dialog.remove();};close.onclick=dismiss;dialog.oncancel=e=>{e.preventDefault();dismiss();};document.body.append(dialog);clear();dialog.showModal();
}
window.PanelSheetPlanner={availableStock,groupKey,open};
})();
