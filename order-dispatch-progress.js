(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PanelStockOrderDispatch=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 var labels={submitted:'Submitted',approved:'Approved',ordered:'Ordered',in_stock:'In stock',completed:'Ready for dispatch',part_dispatched:'Part dispatched',dispatched:'Dispatched',cancelled:'Cancelled'};
 function normal(value){return String(value||'').trim().replace(/\s+/g,' ').toLowerCase();}
 function number(value){var result=Number(value);return isFinite(result)&&result>0?Number(result.toPrecision(15)):0;}
 function matches(order,value){return normal(order.orderNumber)!==''&&normal(order.orderNumber)===normal(value.orderNumber)&&(order.projectId&&value.projectId?order.projectId===value.projectId:normal(order.project)!==''&&normal(order.project)===normal(value.project||value.jobReference));}
 // Shipping identity lets unrelated edits retain panel/component progress. A
 // changed status, item, or dispatch history always invalidates the projection.
 function identity(order){return JSON.stringify([order.status,normal(order.orderType),(order.items||[]).map(function(item){return [item.quantity,item.description];}),(order.dispatches||[]).map(function(trip){return [trip.mutationId,(trip.lines||[]).map(function(line){return [line.index,line.quantity];})];}),order.gateComponents?[(order.gateComponents.components||[]).map(function(part){return part.id;}),(order.gateComponents.shipments||[]).map(function(trip){return trip.componentIds;})]:null]);}
 function progress(order,context){
  order=order||{};context=context||{};
  var base=String(order.status||''),complete=base==='dispatched',items=order.items||[],source='items',units=[],sentIds={},i,j;
  if(order.gateComponents){
   source='gate_components';var model=order.gateComponents;
   for(i=0;i<(model.shipments||[]).length;i++)for(j=0;j<(model.shipments[i].componentIds||[]).length;j++)sentIds[model.shipments[i].componentIds[j]]=true;
   units=(model.components||[]).map(function(part){return {id:part.id,description:'Set '+part.set+' · '+part.label,dispatched:complete||sentIds[part.id]===true};});
  }else if(normal(order.orderType)==='panels'){
   source='panel_loads';var panels=(context.panels||[]).filter(function(panel){return matches(order,panel);}),loads=(context.loads||[]).filter(function(load){return matches(order,load);}),known={};
   for(i=0;i<loads.length;i++)if(loads[i].status==='dispatched_to_site')for(j=0;j<(loads[i].panelIds||[]).length;j++)sentIds[loads[i].panelIds[j]]=true;
   for(i=0;i<panels.length;i++){known[panels[i].id]=true;units.push({id:panels[i].id,description:'Panel '+(panels[i].panelNumber||panels[i].id),dispatched:complete||sentIds[panels[i].id]===true});}
   for(i=0;i<loads.length;i++)for(j=0;j<(loads[i].panelIds||[]).length;j++){var panelId=loads[i].panelIds[j];if(!known[panelId]){known[panelId]=true;units.push({id:panelId,description:'Panel '+panelId,dispatched:complete||sentIds[panelId]===true});}}
  }
  var anyUnitSent=units.some(function(unit){return unit.dispatched;}),trips=Array.isArray(order.dispatches)?order.dispatches:[],totals=items.map(function(){return 0;}),seen={};
  if(source==='items')for(i=0;i<trips.length;i++){
   var trip=trips[i],tripId=trip.mutationId;
   if(tripId&&seen[tripId])continue;if(tripId)seen[tripId]=true;
   for(j=0;j<(trip.lines||[]).length;j++){var line=trip.lines[j],index=line.index;if(typeof index==='number'&&Math.floor(index)===index&&index>=0&&index<totals.length)totals[index]+=number(line.quantity);}
  }
  var itemRows=items.map(function(item,index){
   var quantity=number(item.quantity),dispatched=complete?quantity:Math.min(quantity,number(totals[index])),remaining=number(quantity-dispatched),unknown=source!=='items'&&anyUnitSent&&!complete;
   var status=unknown?(items.length===1?'part_dispatched':'unallocated'):dispatched>0?(remaining>0?'part_dispatched':'dispatched'):'not_dispatched';
   var label=status==='dispatched'?'Dispatched':status==='part_dispatched'?'Part dispatched':status==='unallocated'?(source==='panel_loads'?'See panel dispatch':'See component dispatch'):'Not dispatched';
   return {index:index,description:item.description,quantity:quantity,dispatched:unknown?null:dispatched,remaining:unknown?null:remaining,status:status,statusLabel:label};
  });
  var anySent=source==='items'?itemRows.some(function(row){return row.dispatched>0;}):anyUnitSent;
  var partial=!complete&&base!=='cancelled'&&anySent&&(source!=='items'||itemRows.some(function(row){return row.remaining>0;}));
  var status=partial?'part_dispatched':base,sent=units.filter(function(unit){return unit.dispatched;}).length;
  return {dispatchKey:identity(order),baseStatus:base,orderUpdatedAt:order.updatedAt||order.createdAt||'',status:status,statusLabel:labels[status]||status,partial:partial,hasDispatched:complete||anySent,source:source,items:itemRows,units:units,totalUnits:units.length,dispatchedUnits:sent,remainingUnits:units.length-sent};
 }
 function get(order){var saved=order&&order.dispatchProgress;if(saved&&saved.dispatchKey===identity(order)&&saved.baseStatus===order.status)return saved;return progress(order);}
 function itemText(item){
  if(item.status==='dispatched')return 'Dispatched';
  if(item.status==='part_dispatched'&&item.dispatched!==null)return item.dispatched+' dispatched · '+item.remaining+' remaining';
  return item.statusLabel||'';
 }
 return {progress:progress,get:get,itemText:itemText,labels:labels};
});
