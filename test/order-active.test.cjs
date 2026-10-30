const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const start=source.indexOf('    const activeStatuses'),end=source.indexOf('    const orderDate',start);
const code=source.slice(start,end)+'globalThis.result={counts,ids:shown.map(order=>order.id)};';
function view(orders,filter='active',orderSection='orders',searchStatus='all'){
  const context={orders,filter,orderSection,searchStatus,searchProject:'',orderSearch:''};
  vm.runInNewContext(code,context);return JSON.parse(JSON.stringify(context.result));
}
const order=(id,status)=>({id,status,project:'Test project',orderNumber:id,items:[]});
test('ready orders remain active until dispatch, while ready and dispatched filters stay distinct',()=>{
  const orders=['submitted','approved','ordered','in_stock','completed','dispatched','cancelled'].map(status=>order(status,status));
  const active=view(orders);
  assert.equal(active.counts.active,5);assert.equal(active.counts.completed,1);
  assert.deepEqual(active.ids,['submitted','approved','ordered','in_stock','completed']);
  assert.deepEqual(view(orders,'completed').ids,['completed']);
  orders.find(order=>order.id==='completed').status='dispatched';
  assert.equal(view(orders).counts.active,4);assert.equal(view(orders).counts.completed,0);
  assert.deepEqual(view(orders,'dispatched').ids,['completed','dispatched']);
  const unchanged=JSON.stringify(orders);view(orders);assert.equal(JSON.stringify(orders),unchanged,'filtering does not update orders');
});
test('search keeps ready orders searchable after they move from Active to Dispatched',()=>{
  const ready=order('ready','completed');assert.deepEqual(view([ready],'active','search','completed').ids,['ready']);
  ready.status='dispatched';assert.deepEqual(view([ready],'active','search','dispatched').ids,['ready']);
});

test('project grouping preserves order and keeps distinct project IDs separate',()=>{
  const start=source.indexOf('  function groupOrdersByProject('),end=source.indexOf('  function OrdersPage(',start);
  const orders=[
    {id:'a',projectId:'p1',project:'Shared project name'},
    {id:'b',projectId:'p2',project:'Shared project name'},
    {id:'c',projectId:'p1',project:'Shared project name'},
    {id:'d',project:'Legacy project'},
    {id:'e',project:'Legacy project'},
    {id:'f',project:''}
  ];
  const unchanged=JSON.stringify(orders),context={orders};
  vm.runInNewContext(source.slice(start,end)+'globalThis.groups=groupOrdersByProject(orders)',context);
  const groups=JSON.parse(JSON.stringify(context.groups));
  assert.deepEqual(groups.map(group=>group.orders.map(order=>order.id)),[['a','c'],['b'],['d','e'],['f']]);
  assert.equal(groups.at(-1).project,'No project');
  assert.equal(JSON.stringify(orders),unchanged);
  context.orders=[];vm.runInNewContext('globalThis.groups=groupOrdersByProject(orders)',context);
  assert.equal(context.groups.length,0);
});
