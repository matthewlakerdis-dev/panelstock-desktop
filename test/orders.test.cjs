const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('desktop web exposes permission-aware order management',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const client=fs.readFileSync(path.join(__dirname,'../panelstock-client.js'),'utf8');
 assert.match(html,/function OrdersPage\(\{ canCreate, canManage, isAdmin \}\)/);
 assert.match(html,/Add project/);
 assert.match(html,/\/projects/);
 assert.match(html,/Project details/);
 assert.match(html,/Project notes/);
 assert.match(html,/Delete project/);
 assert.match(html,/async function deleteProject/);
 assert.match(html,/google\.com\/maps\/search\/\?api=1&query=/);
 assert.match(html,/Open in Google Maps/);
 assert.match(html,/Open address in Google Maps/);
 assert.match(html,/GoogleMapsButtonIcon/);
 assert.match(html,/address/);
 assert.match(html,/projectRecords/);
 assert.match(html,/method: "DELETE"/);
 assert.match(html,/Delete Order/);
 assert.match(html,/changeStatus\(order, event\.target\.value\)/);
 assert.match(html,/Select a project/);
 assert.match(html,/Project order numbering/);
 assert.match(html,/Select an active project/);
 assert.match(html,/"Active project"/);
 assert.doesNotMatch(html,/order-sequence-projects/);
 assert.match(html,/\/order-sequences/);
 assert.match(html,/New projects start at Order 1/);
 assert.match(html,/site\.orders\.view/);
 assert.match(html,/site\.orders\.create/);
 assert.match(html,/site\.orders\.manage/);
 assert.match(html,/Submitted \/ Ordered/);
 assert.match(html,/Create order/);
 assert.match(html,/Save changes/);
 assert.match(html,/\/pdf-link/);
 assert.match(html,/"xlsx"/);
 assert.match(html,/window\.open\("about:blank", "_blank"\)/);
 assert.match(html,/Promise\.all\(\[ticket\(\), ticket\(\)\]\)/);
 assert.match(html,/\?download=1&ticket=/);
 assert.match(client,/taskAccess:result\.taskAccess\|\|\{\}/);
});

test('desktop dispatch uses the same material sorting as stock and damage',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const dispatch=html.slice(html.indexOf('function DispatchPage'),html.indexOf('function DamagePage'));
 assert.match(dispatch,/ItemPicker[^\n]+sortLikeSoh: true/);
});

test('web manages the shared schedule',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.match(html,/function SchedulePage\(\{ canManage \}\)/);
 assert.match(html,/function ScheduleCalendarIcon/);
 assert.match(html,/New schedule entry/);
 assert.match(html,/Save schedule/);
 assert.match(html,/schedule\.view/);
 assert.match(html,/schedule\.manage/);
 assert.match(html,/BAKED_WORKER_URL\+"\/schedule"/);
 assert.match(html,/Select a person/);
 assert.match(html,/All people/);
 assert.match(html,/Orientation/);
 assert.match(html,/horizontalTimeline/);
 assert.match(html,/viewMode==="day"/);
});
