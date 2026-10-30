const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
test('admin username changes submit the entered name after confirmation',async()=>{
 const start=html.indexOf('async function standardiseLogin('),end=html.indexOf('async function toggleActive(',start);let sent,confirmed=false,selected;
 const context={editUser:{newUsername:'  New.Login  '},username:'admin',PanelStock:{confirm:async()=>{confirmed=true;return true;}},setBusy(){},setStatus(){},callWorker:async(path,body)=>{assert.ok(confirmed);assert.equal(path,'/admin/rename-user');sent=body;return{ok:true,user:{username:'new.login'}};},setUsers:callback=>callback([{username:'old.login'}]),setAccessUser:value=>selected=value,setEditUser(){},onLogTxn(){}};
 const rename=vm.runInNewContext(html.slice(start,end)+';standardiseLogin',context);await rename({username:'old.login',displayName:'User'});
 assert.equal(sent.newUsername,'new.login');assert.equal(sent.targetUsername,'old.login');assert.equal(sent.confirmedSynced,true);assert.equal(selected,'new.login');
});
test('canceling a username change sends no request',async()=>{
 const start=html.indexOf('async function standardiseLogin('),end=html.indexOf('async function toggleActive(',start);
 const rename=vm.runInNewContext(html.slice(start,end)+';standardiseLogin',{editUser:{newUsername:'new.login'},PanelStock:{confirm:async()=>false},callWorker(){assert.fail('request after cancellation');}});
 await rename({username:'old.login',displayName:'User'});
});