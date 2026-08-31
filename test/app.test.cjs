const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('desktop scripts parse and do not contain the shared backend credential',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(match[1].trim())new vm.Script(match[1]);
 new vm.Script(fs.readFileSync(path.join(__dirname,'../panelstock-client.js'),'utf8'));
 assert.ok(!html.includes('BAKED_SHARED_SECRET'));assert.ok(!html.includes('.slice(0, 800)'));
 const filter=html.match(/const dispatches = transactions.filter\(([^;]+)\);/)[1];
 const result=vm.runInNewContext(`transactions.filter(${filter})`,{transactions:[{type:'dispatch',qty:2},{type:'dispatch',qty:5,voided:true}]});
 assert.equal(result.length,1);assert.equal(result[0].qty,2);
});

test('pending change recovery keeps review, retry, export and explicit discard controls',()=>{
 const client=fs.readFileSync(path.join(__dirname,'../panelstock-client.js'),'utf8');
 assert.match(client,/Review pending changes/);
 assert.match(client,/Retry sync now/);
 assert.match(client,/Export backup/);
 assert.match(client,/Discard local changes/);
 assert.match(client,/previous-version changes must be reviewed before editing stock/);
 assert.match(client,/format:'panelstock-pending-backup-v1'/);
});
