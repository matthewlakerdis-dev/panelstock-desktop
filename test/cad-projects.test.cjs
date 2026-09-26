const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const records=new Map();let fail=false;
const indexedDB={open(){const request={};queueMicrotask(()=>{request.result={close(){},transaction(){const tx={objectStore:()=>({put(value){const r={};queueMicrotask(()=>{if(fail){tx.error=Error('Storage full');tx.onerror();}else{records.set(value.id,structuredClone(value));tx.oncomplete();}});return r;},getAll(){const r={};queueMicrotask(()=>{r.result=structuredClone([...records.values()]);tx.oncomplete();});return r;}})};return tx;}};request.onsuccess();});return request;}};
const c={window:{},structuredClone,indexedDB};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../cad/cad-projects.js'),'utf8'),c);const api=c.window.PanelCadProjects;
test('project saves preserve sketches, generated drawings and unfinished corrections without credentials',async()=>{
 const panels=[{name:'P1',spec:{panelId:'P1'},result:{dxf:'drawing',svg:'preview'},file:new Blob(['image']),correctionRecovery:{traceClosed:false},token:'not for storage'}];
 const snapshot=api.snapshot(panels,0,'Job A');panels[0].spec.panelId='changed';
 assert.equal(snapshot.panels[0].spec.panelId,'P1');assert.equal(snapshot.panels[0].token,undefined);
 await api.save('owner-a','1',snapshot);const [saved]=await api.list('owner-a');
 assert.equal(saved.panels[0].result.dxf,'drawing');assert.equal(await saved.panels[0].file.text(),'image');assert.equal(saved.panels[0].correctionRecovery.traceClosed,false);
 assert.equal((await api.list('owner-b')).length,0);
});
test('accounts and environments have distinct storage keys',()=>{
 assert.notEqual(api.ownerKey('staging','a'),api.ownerKey('production','a'));assert.notEqual(api.ownerKey('staging','a'),api.ownerKey('staging','b'));
});
test('failed saves reject so the UI cannot report a successful save',async()=>{
 fail=true;try{await assert.rejects(api.save('owner-a','1',api.snapshot([],0,'failed')),/Storage full/);}finally{fail=false;}
 assert.equal((await api.list('owner-a'))[0].name,'Job A');
});

