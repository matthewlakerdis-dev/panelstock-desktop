(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PanelStockOrderLeadTimes=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 function today(now){return new Date((now===undefined?Date.now():new Date(now).getTime())+36000000).toISOString().slice(0,10);}
 function dateValue(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  var date=new Date(value+'T00:00:00.000Z');return isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?date:null;
 }
 function daysFor(settings,type){
  var days=settings&&settings.days||{},key=String(type||'').trim().replace(/\s+/g,' ').toLowerCase(),names=Object.keys(days);
  for(var i=0;i<names.length;i++)if(names[i].toLowerCase()===key){var count=days[names[i]];return typeof count==='number'&&count>=0&&count<=365&&Math.floor(count)===count?count:0;}
  return 0;
 }
 function minimumDate(settings,type,start){
  var remaining=daysFor(settings,type),date=dateValue(start||today());if(!remaining||!date)return '';
  while(remaining){date.setUTCDate(date.getUTCDate()+1);if(date.getUTCDay()!==0&&date.getUTCDay()!==6)remaining--;}
  return date.toISOString().slice(0,10);
 }
 function rule(settings,type,start){
  var days=daysFor(settings,type),minimum=minimumDate(settings,type,start),unit='working';
  return {days:days,minimumDate:minimum,message:days?String(type)+' requires at least '+days+' '+unit+' day'+(days===1?'':'s')+' lead time. Earliest requested delivery: '+minimum+'.':''};
 }
 function error(settings,type,date,start){var current=rule(settings,type,start);return current.days&&(!dateValue(date)||date<current.minimumDate)?current.message:'';}
 return {today:today,dateValue:dateValue,daysFor:daysFor,minimumDate:minimumDate,rule:rule,error:error};
});
