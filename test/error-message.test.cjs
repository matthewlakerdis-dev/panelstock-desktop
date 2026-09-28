const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
for(const [file,name,lookup] of [['cad.js','notice',true],['sheet-planner.js','setStatus',false]]){
 test(name+' marks errors and clears the warning on retry',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../cad',file),'utf8');
  const helper=source.match(new RegExp('function '+name+'\\(message,error=false\\)\\{[^\\n]+?\\}'))[0];
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
