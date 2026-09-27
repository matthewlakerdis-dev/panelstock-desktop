const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../cad/cad.js'),'utf8'),c={};
vm.runInNewContext(source.slice(source.indexOf('function nextAttentionPanel('),source.indexOf('function filterPanelRows(')),c);
const rows=[{index:0,reasons:['review']},{index:1,reasons:[]},{index:2,reasons:['generate']}];
test('next attention skips ready panels and wraps',()=>{assert.equal(c.nextAttentionPanel(rows,0).index,2);assert.equal(c.nextAttentionPanel(rows,2).index,0);});
test('no next when current is the only unresolved panel',()=>{assert.equal(c.nextAttentionPanel([rows[0],rows[1]],0),null);assert.equal(c.nextAttentionPanel([],0),null);});
