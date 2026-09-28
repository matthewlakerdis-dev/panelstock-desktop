const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
for(const [file,name,lookup] of [['cad.js','notice',true],['sheet-planner.js','setStatus',false]]){
 test(name+' marks errors and clears the warning on retry',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../cad',file),'utf8');
  const helper=source.match(new RegExp('function '+name+'\\(message,error=false(?:,warning=false)?\\)\\{[^\\n]+?\\}'))[0];
  const classes=new Set(),attributes={};
  const box={textContent:'',classList:{toggle:(key,on)=>on?classes.add(key):classes.delete(key)},setAttribute:(key,value)=>attributes[key]=value};
  const context=vm.createContext(lookup?{$:()=>box}:{status:box});
  vm.runInContext(helper+';'+name+'("Missing direction arrow",true)',context);
  assert.equal(box.textContent,'Missing direction arrow');
  assert.equal(classes.has('cad-error-message'),true);
  assert.equal(attributes.role,'alert');
  vm.runInContext(name+'("Working...")',context);
  assert.equal(classes.has('cad-error-message'),false);
  assert.equal(attributes.role,'status');
 });
}

test('unplaced panels use a warning that clears on retry or error',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../cad/sheet-planner.js'),'utf8');
 const helper=source.match(/function setStatus\(message,error=false,warning=false\)\{[^\n]+?\}/)[0];
 const classes=new Set(),attributes={};
 const status={textContent:'',classList:{toggle:(key,on)=>on?classes.add(key):classes.delete(key)},setAttribute:(key,value)=>attributes[key]=value};
 const context=vm.createContext({status});
 vm.runInContext(helper+';setStatus("2 panel copies could not fit",false,true)',context);
 assert.equal(status.textContent,'Warning: 2 panel copies could not fit');
 assert.ok(classes.has('cad-warning-message'));
 assert.equal(attributes.role,'alert');
 vm.runInContext('setStatus("Working...")',context);
 assert.equal(classes.has('cad-warning-message'),false);
 assert.equal(status.textContent,'Working...');
 vm.runInContext('setStatus("Failed",true)',context);
 assert.ok(classes.has('cad-error-message'));
 assert.equal(classes.has('cad-warning-message'),false);
 assert.ok(source.includes('false,plan.unplaced.length>0)'));
});
