const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),start=html.indexOf('    function renderOrderRow(order)'),end=html.indexOf('    const receiveOrders=',start),shipping=require('../order-dispatch-progress.js');
const order={id:'a',orderNumber:'25',project:'Tower',orderType:'Consumables',status:'completed',items:[{quantity:1,description:'SILICON'},{quantity:3,description:'SEALANT'}],dispatches:[{lines:[{index:0,quantity:1}]}]};
function render(value=order,canManage=true){
 const e=(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity).filter(x=>x!==false&&x!==null&&x!==undefined)}),noop=()=>{},context={e,window:{PanelStockOrderDispatch:shipping},expandedOrders:{a:true},orderListTitle:o=>'#'+o.orderNumber,groupByProject:false,canBulkDispatch:true,bulkSelected:[],saving:false,statusSaving:false,bulkDispatchOpen:false,selectBulkOrder:noop,setExpandedOrders:noop,canManage,isPanelOrder:o=>o.orderType==='Panels',isGateOrder:o=>o.orderType==='Bin Gate',statusChoices:{},setStatusChoices:noop,changeStatus:noop,openPanel:noop,Pencil:'Pencil',setProductionPlanOrder:noop,canAddSchedule:true,scheduleTrigger:{},setScheduleOrder:noop,downloadOrder:noop,isAdmin:canManage,deleteOrder:noop,Trash2:'Trash2',productionPlans:{},orderDate:v=>v,orderPlacedDate:o=>'',orderDisplayStatus:o=>shipping.get(o).statusLabel,orderStatusLabel:status=>shipping.labels[status]};
 vm.runInNewContext(html.slice(start,end)+'globalThis.render=renderOrderRow;',context);return context.render(value);
}
function all(node,predicate){return !node||typeof node!=='object'?[]:[...(predicate(node)?[node]:[]),...node.children.flatMap(child=>all(child,predicate))];}
const text=node=>typeof node==='object'?node.children.map(text).join(''):String(node??'');
test('order toolbar follows the requested sequence and excludes retired row controls',()=>{
 const tree=render({...order,status:'submitted',dispatches:[]}),toolbar=all(tree,n=>n.props.className==='ps-order-toolbar')[0];
 assert.deepEqual(all(toolbar,n=>n.type==='button').map(text),['View','Edit','Production plan','Schedule entry','PDF','']);assert.equal(all(toolbar,n=>n.type==='select').length,1);assert.ok(text(toolbar).startsWith('Status'));
 for(const forbidden of ['Apply','Excel','Schedule delivery','View order','Add schedule entry'])assert.ok(!all(toolbar,n=>n.type==='button').some(n=>text(n)===forbidden));
 assert.match(html,/<script src="order-dispatch-progress.js/);
});
test('expanded item table and order badge reflect saved partial shipments without changing readiness',()=>{
 const tree=render(),rows=all(tree,n=>n.type==='tr');assert.equal(text(all(tree,n=>n.props.className==='ps-order-badge')[0]),'Part dispatched');
 assert.deepEqual(rows.slice(1).map(n=>n.children.map(text)),[['1','SILICON','1','0','Dispatched'],['3','SEALANT','0','3','Not dispatched']]);assert.equal(order.status,'completed');
 const viewer=render(order,false);assert.equal(all(viewer,n=>n.type==='select').length,0);assert.ok(!all(viewer,n=>n.type==='button').some(n=>text(n)==='Edit'));
});
