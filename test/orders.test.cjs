const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('desktop web exposes permission-aware order management',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const client=fs.readFileSync(path.join(__dirname,'../panelstock-client.js'),'utf8');
 assert.match(html,/function OrdersPage\(\{ canCreate, canManage \}\)/);
 assert.match(html,/site\.orders\.view/);
 assert.match(html,/site\.orders\.create/);
 assert.match(html,/site\.orders\.manage/);
 assert.match(html,/Submitted \/ Ordered/);
 assert.match(html,/Create order/);
 assert.match(html,/Save changes/);
 assert.match(html,/\/pdf-link/);
 assert.match(html,/"xlsx"/);
 assert.match(html,/window\.open\("about:blank", "_blank"\)/);
 assert.match(html,/Promise\.all\(\[ticket\(\), ticket\(\)\]\)/);
 assert.match(html,/\?download=1&ticket=/);
 assert.match(client,/taskAccess:result\.taskAccess\|\|\{\}/);
});
