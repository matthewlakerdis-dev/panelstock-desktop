const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('duplicate preserves editable geometry independently and requires a fresh drawing',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../cad/cad.js'),'utf8'),c={structuredClone};vm.runInNewContext(source.slice(source.indexOf('function duplicatePanelDraft('),source.indexOf('duplicatePanelButton.onclick=')),c);
 const panel={spec:{panelId:'A',edges:[{site:100}],siteFolds:[20],manualHoles:[{x:10,y:15,diameter:3}],panelDirection:'left'},result:{dxf:'old'},quantity:5,file:{name:'sketch'}};
 const copy=c.duplicatePanelDraft(panel,[panel,{spec:{panelId:'A copy 1'}}]);assert.equal(copy.spec.panelId,'A copy 2');assert.equal(copy.result,null);assert.equal(copy.quantity,1);assert.equal(copy.file,panel.file);assert.equal(copy.spec.panelDirection,'left');assert.deepEqual(copy.spec.manualHoles,panel.spec.manualHoles);copy.spec.edges[0].site=200;assert.equal(panel.spec.edges[0].site,100);
});
