const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c={window:{}};vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../cad/sheet-planner.js'),'utf8'),c);const {availableStock}=c.window.PanelSheetPlanner;
test('SOH availability excludes each scheduled CNC sheet once without stock changes',()=>{
 const item={id:'s',qty:3,width:100,height:200,material:'ACP',color:'White',thickness:4};const p={stockItemType:'variant',stockItemId:'s',sheetNumber:'1',status:'pending'};
 const data={variants:[item],offcuts:[{...item,id:'o',qty:1}],cncPanels:[p,{...p,panelNumber:'2'},{...p,sheetNumber:'2',status:'completed'}]};const before=JSON.stringify(data),r=availableStock(data);
 assert.equal(JSON.stringify(data),before);assert.equal(r.find(s=>s.id==='s').quantity,2);assert.equal(r.find(s=>s.id==='o').quantity,1);assert.equal(r[0].width,200);assert.equal(r[0].height,100);
});
test('unavailable or incomplete stock is excluded',()=>{assert.equal(availableStock({variants:[{id:'x',qty:0},{id:'y',qty:2,width:100,height:200}]}).length,0);});
