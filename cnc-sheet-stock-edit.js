(function(root){
  'use strict';
  const text=value=>String(value??'').trim();
  const order=value=>/\border(?=\b|\d)/i.test(text(value))?text(value).replace(/\D/g,''):text(value);
  const scope=row=>JSON.stringify([text(row.jobReference).replace(/\s+/g,' ').toLowerCase(),order(row.orderNumber).toLowerCase(),text(row.sheetNumber).toLowerCase()]);
  const stockId=row=>text(row.stockItemId||row.stockVariantId);
  const stockType=row=>row.stockItemType||'variant';
  const dimensions=row=>[Number(row.sheetWidth),Number(row.sheetHeight)].sort((a,b)=>b-a);
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,canonical(value[key])])):value;
  const fingerprint=value=>JSON.stringify(canonical(value));
  function hasStockChange(before,after){
    return stockType(before)!==stockType(after)||stockId(before)!==stockId(after)||text(before.stockSku)!==text(after.stockSku)||Number(before.sheetWidth)!==Number(after.sheetWidth)||Number(before.sheetHeight)!==Number(after.sheetHeight);
  }
  function plan({panels=[],panel,input={},variants=[],offcuts=[]}){
    const stockChanged=!!panel&&hasStockChange(panel,input),base={stockChanged,error:'',rows:[],affected:[],panelIds:[],signature:'',sheetNumber:text(panel?.sheetNumber)};
    if(!stockChanged)return base;
    const fail=error=>({...base,error});
    const current=panels.filter(row=>row.id===panel.id);
    if(current.length!==1||current[0].status!=='pending')return fail('This pending panel changed. Close and reopen the edit screen.');
    if(fingerprint(current[0])!==fingerprint(panel))return fail('This panel changed while the edit screen was open. Close and reopen it before changing sheet stock.');
    if(scope(panel)!==scope(input))return fail('Save changes to the project, order or sheet separately before changing sheet stock.');
    const affected=panels.filter(row=>scope(row)===scope(panel));
    if(affected.some(row=>row.status!=='pending'))return fail('Stock and size cannot change on a completed or partly completed sheet.');
    if(affected.some(row=>!row.id)||new Set(affected.map(row=>row.id)).size!==affected.length)return fail('This sheet has conflicting panel records. Refresh the tracker before editing it.');
    const type=stockType(input),items=type==='variant'?variants:type==='offcut'?offcuts:[],matches=items.filter(item=>item.id===stockId(input));
    if(matches.length!==1)return fail('Select an existing stock sheet or offcut for this sheet.');
    const stock=matches[0],width=Number(stock.width),height=Number(stock.height);
    if(!(Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0&&Number(stock.qty)>0))return fail('The selected stock is unavailable or has invalid dimensions.');
    if(fingerprint(dimensions(input))!==fingerprint([width,height].sort((a,b)=>b-a)))return fail('Sheet dimensions must match the selected stock. Select its stock record again.');
    const fields=['orderNumber','jobReference','sheetNumber','panelNumber','totalPanelArea','panelAreaScope','isRemake','isTemplate','remakeReason'];
    const rows=affected.map(before=>{
      const next={...before};
      if(before.id===panel.id)for(const key of fields)if(Object.hasOwn(input,key))next[key]=input[key];
      Object.assign(next,{stockItemType:type,stockItemId:stock.id,stockSku:stock.sku||'',sheetWidth:width,sheetHeight:height,pendingOffcuts:[],pendingOffcut:null});
      if(Object.hasOwn(next,'stockVariantId')){if(type==='variant')next.stockVariantId=stock.id;else delete next.stockVariantId;}
      return next;
    });
    const fromStock={type:stockType(panel),id:stockId(panel),sku:text(panel.stockSku),width:Number(panel.sheetWidth),height:Number(panel.sheetHeight)},toStock={type,id:stock.id,sku:stock.sku||'',width,height};
    const signature=fingerprint({version:1,scope:scope(panel),affected:[...affected].sort((a,b)=>String(a.id).localeCompare(String(b.id))),rows:[...rows].sort((a,b)=>String(a.id).localeCompare(String(b.id))),stock:toStock});
    return {...base,rows,affected,panelIds:affected.map(row=>row.id),signature,fromStock,toStock};
  }
  function Review({React,plan,confirmedSignature,onChange}){
    if(!plan?.stockChanged)return null;
    const h=React.createElement,format=stock=>stock?`${stock.sku||'Stock'} · ${Math.max(stock.width,stock.height)} × ${Math.min(stock.width,stock.height)} mm`:'—';
    if(plan.error)return h('p',{role:'alert',className:'rounded-lg bg-red-50 p-3 text-sm text-red-700'},plan.error);
    return h('section',{'aria-label':'Review sheet stock change',className:'rounded-lg border border-slate-300 bg-white p-4'},
      h('h3',{className:'text-sm font-semibold text-slate-700'},`Change stock for Sheet ${plan.sheetNumber}`),
      h('p',{className:'mt-2 text-sm text-slate-600'},`${format(plan.fromStock)} → ${format(plan.toStock)}`),
      h('p',{className:'mt-2 text-sm text-slate-600'},`${plan.affected.length} pending panels: ${plan.affected.map(row=>row.panelNumber||row.id).join(', ')}`),
      h('p',{className:'mt-2 text-sm text-slate-600'},'The old offcut estimates for this sheet will be cleared. Review the actual leftovers when completing the sheet. The other panels’ cutting m² and IDs stay as recorded.'),
      h('label',{className:'mt-3 flex items-start gap-2 text-sm text-slate-700'},h('input',{type:'checkbox',checked:confirmedSignature===plan.signature,'aria-label':`Confirm stock change for all panels on sheet ${plan.sheetNumber}`,onChange:event=>onChange(event.target.checked?plan.signature:'')}),`I confirm the cutting layout fits the selected stock and apply this stock and size to all ${plan.affected.length} pending panels on Sheet ${plan.sheetNumber}.`)
    );
  }
  const api={plan,hasStockChange,Review};if(typeof module==='object'&&module.exports)module.exports=api;else root.PanelStockCncSheetStockEdit=api;
})(typeof window==='object'?window:globalThis);
