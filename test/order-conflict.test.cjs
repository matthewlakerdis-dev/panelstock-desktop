const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
test('conflict review preserves edited fields and takes newer untouched fields without saving',()=>{
 const start=source.indexOf('    const orderEditFields='),end=source.indexOf('    async function saveOrder(event)',start);
 let panel={base:{status:'submitted',phone:'old',items:[{quantity:1,description:'A'}]},order:{status:'ordered',phone:'old',items:[{quantity:1,description:'A'}]},conflict:{status:'completed',phone:'new',items:[{quantity:1,description:'A'}],updatedAt:'new-version'}};
 const ctx={setPanel:fn=>panel=fn(panel),setNotice:()=>{}};vm.createContext(ctx);vm.runInContext(source.slice(start,end)+'globalThis.review=reviewOrderConflict;',ctx);ctx.review(true);
 assert.equal(panel.order.status,'ordered');assert.equal(panel.order.phone,'new');assert.equal(panel.order.updatedAt,'new-version');assert.equal(panel.conflict,null);
 panel.conflict={status:'cancelled',updatedAt:'newer'};ctx.review(false);assert.equal(panel.order.status,'cancelled');
});
test('order saves and quick status edits send an expected version and preserve failed edits',()=>{
 assert.match(source,/expectedUpdatedAt:panel.order.updatedAt/);assert.match(source,/expectedUpdatedAt:order.updatedAt/);assert.match(source,/setPanel\(current=>\(\{\.\.\.current,conflict:result.order\}\)\)/);
});
