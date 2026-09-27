const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../cad/cad.js'),'utf8'),c={};vm.runInNewContext(source.slice(source.indexOf('function sortPanelRows('),source.indexOf('function filterPanelRows(')),c);
const rows=[{index:0,p:{spec:{panelId:'C10'}},reasons:[]},{index:1,p:{spec:{panelId:'C2'}},reasons:['review']},{index:2,p:{spec:{panelId:'C1'}},reasons:['generate']}];
test('natural ID sort preserves source order and panel indices',()=>{assert.equal(c.sortPanelRows(rows,'id').map(r=>r.index).join(','),'2,1,0');assert.equal(rows.map(r=>r.index).join(','),'0,1,2');});
test('attention sort preserves original order within groups',()=>{assert.equal(c.sortPanelRows(rows,'attention').map(r=>r.index).join(','),'1,2,0');assert.equal(c.sortPanelRows(rows,'original').map(r=>r.index).join(','),'0,1,2');});
