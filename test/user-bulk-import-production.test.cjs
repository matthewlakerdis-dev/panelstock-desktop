const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {verify}=require('../scripts/verify-user-bulk-import-production.cjs');
const root=path.join(__dirname,'..'),base='https://web.panelstockhq.com/';
function deployed(change={}){
 const calls=[],files=['user-bulk-import.js','user-bulk-import.css'].map(name=>({name,text:fs.readFileSync(path.join(root,name),'utf8')})),html=files.map(file=>(file.name.endsWith('.js')?'<script src="':'<link href="')+(change.external?'https://other.example/':'')+file.name+'?v='+(change.old?'old':crypto.createHash('sha256').update(file.text).digest('hex').slice(0,12))+'">').join('')+'PanelStockUserBulkImport.createComponent';
 return {calls,fetch:async(url,options)=>{calls.push({url:String(url),options});if(String(url).startsWith(base+'?'))return new Response(html);const file=files.find(file=>new URL(url).pathname==='/'+file.name);return new Response(change.content?'stale code':file.text);}};
}
test('production verification checks versioned upload assets with GETs and no account access',async()=>{
 const f=deployed();await verify(f.fetch,async()=>{});assert.equal(f.calls.length,3);assert.ok(f.calls.every(call=>!call.options.method));assert.ok(f.calls.every(call=>!call.url.includes('/admin/')));assert.ok(f.calls.every(call=>!call.options.headers.Authorization));
});
test('production verification rejects stale versions, stale content and unexpected asset hosts',async()=>{
 for(const options of [{old:true},{content:true},{external:true}]){const f=deployed(options);await assert.rejects(verify(f.fetch,async()=>{}));}
});
