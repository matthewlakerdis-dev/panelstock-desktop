const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('workshop stock is reachable through authorised desktop navigation',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.match(html,/\['workshop','factory.stock'\]/);assert.match(html,/tab === "workshop" && can\("factory.stock"\)/);assert.match(html,/src="workshop-stock.js\?v=1"/);
 const script=fs.readFileSync(path.join(__dirname,'../workshop-stock.js'),'utf8');new vm.Script(script);
 assert.match(script,/localStorage.setItem\(pendingKey,JSON.stringify\(payload\)\)/);assert.match(script,/mutationId:crypto.randomUUID\(\)/);
});
