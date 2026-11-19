const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),lead=require('../order-lead-times.js'),start=source.indexOf('    const requestedLeadRule='),end=source.indexOf('    const field =',start);
function check(urgent,base={}){const panel={mode:'new',base,order:{orderType:'Fixings',requestedDeliveryDate:lead.today(),urgent}},context={panel,leadTimes:{days:{Fixings:5}},PanelStockOrderLeadTimes:lead};vm.runInNewContext(source.slice(start,end)+'globalThis.result={rule:requestedLeadRule,error:requestedLeadError};',context);return context.result;}
test('Urgent immediately clears the date restriction and removing it restores the configured working-day minimum',()=>{
 assert.ok(check(false).error);assert.equal(check(false).rule.days,5);assert.equal(check(true).error,'');assert.equal(check(true).rule.minimumDate,'');assert.ok(check(false,{urgent:true,orderType:'Fixings',requestedDeliveryDate:lead.today()}).error);
});
