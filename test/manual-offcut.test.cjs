const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const helper=source.slice(source.indexOf('  function cncOffcutError('),source.indexOf('  function CncSingleForm('));
test('offcut choice is optional and requires valid dimensions within stock',()=>{
 const c={};vm.runInNewContext(helper,c);
 const form={sheetWidth:2400,sheetHeight:1200};
 assert.equal(c.cncOffcutError(form),'');
 for(const [length,width] of [[0,20],[NaN,20],[Infinity,20],[2500,20],[1300,1300]])assert.ok(c.cncOffcutError({...form,pendingOffcut:{length,width}}));
 assert.equal(c.cncOffcutError({...form,pendingOffcut:{length:200,width:500}}),'');
});
test('manual form checkbox clears a declined offcut and records a pending proposal',()=>{
 const jsx=(tag,props)=>({tag,...props});const c={import_jsx_runtime:{jsx},CapitalizedInput:'input',CncStockPicker:'picker',CncPanelTypeFields:'types'};
 vm.runInNewContext(helper+source.slice(source.indexOf('  function CncSingleForm('),source.indexOf('  function CatalogSingleForm(')),c);
 let next;const form={orderNumber:'1',pendingOffcut:null};
 const tree=c.CncSingleForm({form,setForm:value=>next=value});
 const nodes=[];function walk(n){if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(walk);return;}nodes.push(n);walk(n.children);}walk(tree);
 const checkbox=nodes.find(n=>n.type==='checkbox');checkbox.onChange({target:{checked:true}});
 assert.equal(next.pendingOffcut.source,'manual');assert.equal(next.pendingOffcut.status,'pending');
 checkbox.onChange({target:{checked:false}});assert.equal(next.pendingOffcut,null);
});
