const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
test('panel rows distinguish planned, partial and unplanned copies and reset stale plans',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../cad/sheet-planner.js'),'utf8');
 const helper=source.slice(source.indexOf('function updatePanelStatuses('),source.indexOf(' function clear(){'));
 const choices=[['A',1],['B',2],['C',1]].map(([name,quantity])=>({panel:{name,quantity,dxf:'drawing'},badge:{textContent:'',classList:{toggle(){}}}}));
 const context=vm.createContext({choices});
 vm.runInContext(helper,context);
 context.plan={sheets:[{number:1,panels:[{name:'A',copy:1},{name:'B',copy:1}]}]};
 vm.runInContext('updatePanelStatuses(plan)',context);
 assert.equal(choices[0].badge.textContent,'Planned - Sheet 1');
 assert.equal(choices[1].badge.textContent,'1 of 2 planned');
 assert.equal(choices[2].badge.textContent,'Needs planning');
 vm.runInContext('updatePanelStatuses()',context);
 assert.ok(choices.every(c=>c.badge.textContent==='Needs planning'));
});

test('copy labels appear only for panels with multiple requested copies',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../cad/sheet-planner.js'),'utf8');
 const helper=source.slice(source.indexOf('function panelCopyLabel('),source.indexOf(' function updatePanelStatuses('));
 const context=vm.createContext({panels:[{name:'A',quantity:1},{name:'B',quantity:3}]});
 vm.runInContext(helper,context);
 assert.equal(vm.runInContext("panelCopyLabel({name:'A',copy:1})",context),'A');
 assert.equal(vm.runInContext("panelCopyLabel({name:'B',copy:1})",context),'B (copy 1)');
 assert.equal(vm.runInContext("panelCopyLabel({name:'B',copy:3})",context),'B (copy 3)');
 assert.ok(source.includes('plan.unplaced.map(panelCopyLabel)'));
 assert.ok(source.includes('sheet.panels.map(panelCopyLabel)'));
});
