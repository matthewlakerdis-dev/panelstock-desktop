const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const scriptPath=path.resolve(__dirname,'../scripts/styles.cjs');
const source=fs.readFileSync(scriptPath,'utf8').replace(/main\(\)\.catch\([\s\S]*$/,'globalThis.run=main;');
test('stylesheet freshness check rejects stale CSS without overwriting it',async()=>{
 const realRequire=createRequire(scriptPath);let wrote=false;
 const fakeFs={...fs,readFileSync:(file,...args)=>String(file).endsWith('tailwind.css')?'stale css':fs.readFileSync(file,...args),writeFileSync:()=>{wrote=true;}};
 const context={__dirname:path.dirname(scriptPath),process:{argv:['node',scriptPath,'--check']},console,require:name=>name==='node:fs'?fakeFs:realRequire(name)};
 vm.runInNewContext(source,context);
 await assert.rejects(context.run(),/tailwind.css is stale/);assert.equal(wrote,false);
});

