const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
test('Forgot PIN requests reset by username without requiring a PIN or accepting an email destination',async()=>{
 const start=html.indexOf('function requestPinReset()'),end=html.indexOf('async function handleLogin(',start);assert.ok(start>=0&&end>start);
 let body;const notices=[];const context={window:{confirm:()=>true},username:' Sam ',busy:false,setBusy(){},setError:value=>notices.push(value),callWorker:async(path,payload)=>{assert.equal(path,'/passcode-reset-request');body=payload;return{ok:true,message:'Check your email if your account has an address.'};}};
 const request=vm.runInNewContext(html.slice(start,end)+';requestPinReset',context);request();await new Promise(resolve=>setImmediate(resolve));assert.equal(JSON.stringify(body),JSON.stringify({username:'Sam'}));assert.equal(notices.at(-1),'Check your email if your account has an address.');
 body=null;context.window.confirm=()=>false;request();await new Promise(resolve=>setImmediate(resolve));assert.equal(body,null);context.window.confirm=()=>true;context.username=' ';request();await new Promise(resolve=>setImmediate(resolve));assert.equal(body,null);assert.equal(notices.at(-1),'Enter your username first.');
});
