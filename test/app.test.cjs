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
 assert.match(html,/ResizeObserver loop \(\?:limit exceeded\|completed with undelivered notifications\)/);
 assert.match(html,/saveUser\(editUser,true\)/);
 const cncPage=html.slice(html.indexOf('function CncPage('),html.indexOf('function OrdersPage('));
 assert.match(cncPage,/children: "Complete sheet"/);
 assert.match(html,/function CncDimensionBackfill/);
 assert.match(html,/fixed inset-0 z-50 flex flex-col bg-white/);
 assert.match(html,/children:"Adjust current photo"|"Adjust current photo"/);
 assert.match(html,/boxShadow:"0 0 0 9999px rgba\(0,0,0,\.5\)"/);
 assert.match(html,/function CncDimensionBackfill\([^)]*\) \{\s*const h = import_react\.createElement;/);
 const backfill=html.slice(html.indexOf('function CncDimensionBackfill'),html.indexOf('function CncPage'));
 assert.match(backfill,/key: group\.key/);
 assert.doesNotMatch(backfill,/\}, group\.key\)/);
 assert.match(cncPage,/const h = import_react\.createElement;/);
 assert.match(cncPage,/Add historical dimensions/);
 assert.match(html,/Original completion dates and users are preserved/);
 assert.doesNotMatch(cncPage,/children: "Complete panel"/);
 const filter=html.match(/const dispatches = transactions.filter\(([^;]+)\);/)[1];
 const result=vm.runInNewContext(`transactions.filter(${filter})`,{transactions:[{type:'dispatch',qty:2},{type:'dispatch',qty:5,voided:true}]});
 assert.equal(result.length,1);assert.equal(result[0].qty,2);
});

test('desktop loads Cloudflare analytics only once',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.equal((html.match(/static\.cloudflareinsights\.com\/beacon\.min\.js/g)||[]).length,1);
});

test('pending change recovery keeps review, retry, export and explicit discard controls',()=>{
 const client=fs.readFileSync(path.join(__dirname,'../panelstock-client.js'),'utf8');
 assert.match(client,/Review pending changes/);
 assert.match(client,/Retry sync now/);
 assert.match(client,/Export backup/);
 assert.match(client,/Discard local changes/);
 assert.match(client,/Previous-version pending changes must be reviewed before editing stock\./);
 assert.match(client,/format:'panelstock-pending-backup-v1'/);
});
