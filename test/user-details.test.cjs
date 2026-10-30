const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),start=source.indexOf('    async function saveDetails('),end=source.indexOf('    const detailField=',start);
function harness(){
 const calls=[],updates=[],context={profile:{username:'alice',displayName:'Updated Name',phone:'0411222333',email:'worker@example.com'},busy:false,profileAlive:{current:true},BAKED_WORKER_URL:'https://synthetic.example',PanelStock:{username:'alice',apiFetch:async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,body});return Response.json({profile:{username:'alice',...body,phone:'0411 222 333'}});}},setBusy:value=>context.busy=value,setNotice:value=>context.notice=value,setProfile:value=>context.profile=value,onProfileChange:value=>updates.push(value)};
 vm.runInNewContext(source.slice(start,end)+'globalThis.save=saveDetails;',context);return {context,calls,updates};
}
test('saving User details posts name, phone and email and publishes the authoritative account response',async()=>{
 const h=harness();let prevented=false;await h.context.save({preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.deepEqual(h.calls[0].body,{displayName:'Updated Name',email:'worker@example.com',phone:'0411222333'});assert.equal(h.context.profile.phone,'0411 222 333');assert.equal(h.updates[0],h.context.profile);assert.equal(h.context.notice,'User details saved.');assert.equal(h.context.busy,false);
});
test('a rejected save keeps the entered details available for correction and retry',async()=>{
 const h=harness(),original=h.context.profile;h.context.PanelStock.apiFetch=async()=>Response.json({error:'Phone is invalid'},{status:400});await h.context.save({preventDefault(){}});assert.equal(h.context.profile,original);assert.equal(h.updates.length,0);assert.equal(h.context.notice,'Phone is invalid');assert.equal(h.context.busy,false);
});
test('late saves cannot update a different login or an unmounted profile page',async()=>{
 for(const change of [h=>h.context.PanelStock.username='bob',h=>h.context.profileAlive.current=false]){
  const h=harness(),original=h.context.profile;let finish;h.context.PanelStock.apiFetch=()=>new Promise(resolve=>finish=resolve);const saving=h.context.save({preventDefault(){}});change(h);finish(Response.json({profile:{username:'alice',displayName:'Old login',phone:'0111'}}));await saving;assert.equal(h.context.profile,original);assert.equal(h.updates.length,0);assert.equal(h.context.notice,'');
 }
});
test('loading and in-flight forms cannot issue another save',async()=>{
 for(const options of [{profile:null},{busy:true}]){const h=harness();Object.assign(h.context,options);await h.context.save({preventDefault(){}});assert.equal(h.calls.length,0);}
});
