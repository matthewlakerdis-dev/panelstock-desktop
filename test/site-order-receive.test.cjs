const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start=source.indexOf('  const deliveryTotals='),end=source.indexOf('  const deliveryBodyLines=',start);
const context={PanelStock:{username:'site'}};vm.createContext(context);vm.runInContext(source.slice(start,end)+'globalThis.canReceive=canReceiveSiteOrder;',context);
test('Receive offers only dispatched outstanding orders to their requester or an order manager',()=>{
 const order={status:'dispatched',requestedBy:'site',items:[{quantity:5}],receipts:[]};
 for(const status of ['submitted','approved','ordered','in_stock','completed','cancelled'])assert.equal(context.canReceive({...order,status},true,false,false),false,status);
 assert.equal(context.canReceive(order,true,false,false),true);assert.equal(context.canReceive({...order,requestedBy:'other'},true,false,false),false);
 assert.equal(context.canReceive({...order,requestedBy:'other'},false,true,false),true);assert.equal(context.canReceive(order,false,false,true),true);
 assert.equal(context.canReceive({...order,receipts:[{lines:[{index:0,accepted:5}]}]},true,false,false),false);
 assert.equal(context.canReceive({...order,receipts:[{lines:[{index:0,accepted:2}]}]},true,false,false),true);
});
