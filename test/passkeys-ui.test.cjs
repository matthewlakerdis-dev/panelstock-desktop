const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(fs.existsSync(path.join(__dirname,'../passkeys.js'))?path.join(__dirname,'../passkeys.js'):path.join(__dirname,'../site/passkeys.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness({available=true,cancel=false}={}){
 let document;class Element{constructor(tag){this.tagName=tag;this.style={};this.attributes={};this.children=[];this.textContent='';this.value='';this.disabled=false;}appendChild(node){node.parentNode=this;this.children.push(node);return node;}removeChild(node){this.children.splice(this.children.indexOf(node),1);node.parentNode=null;}setAttribute(key,value){this.attributes[key]=value;}get firstChild(){return this.children[0]||null;}focus(){document.activeElement=this;}querySelectorAll(){return walk(this).filter(node=>['button','input','select'].includes(node.tagName)&&!node.disabled);}}
 const body=new Element('body'),events={},walk=node=>[node,...node.children.flatMap(walk)];document={body,activeElement:body,createElement:tag=>new Element(tag),addEventListener:(name,fn)=>events[name]=fn,removeEventListener:name=>delete events[name]};let getOptions,createOptions,reloads=0;
 const binary=new Uint8Array([1]).buffer;
 const credential={id:'AQ',rawId:binary,type:'public-key',authenticatorAttachment:'cross-platform',response:{clientDataJSON:binary,authenticatorData:binary,signature:binary,userHandle:binary,attestationObject:binary,getTransports:()=>['hybrid']},getClientExtensionResults:()=>({})};
 const root={isSecureContext:true,PublicKeyCredential:available?function(){}:null,atob,btoa,location:{reload:()=>reloads++},navigator:{credentials:{get:async options=>{getOptions=options;if(cancel)throw Object.assign(Error('cancelled'),{name:'NotAllowedError'});return credential;},create:async options=>{createOptions=options;if(cancel)throw Object.assign(Error('cancelled'),{name:'NotAllowedError'});return credential;}}}};
 vm.runInNewContext(source,{window:root,document,console});return{api:root.PanelStockPasskeys,nodes:()=>walk(body),button:text=>walk(body).find(node=>node.tagName==='button'&&node.textContent===text),getOptions:()=>getOptions,createOptions:()=>createOptions,reloads:()=>reloads,events};
}
test('shared-device sign-in asks for a phone or security key and forwards only the signed browser response',async()=>{
 const h=harness(),calls=[];let signedIn;
 h.api.signIn(async(route,body)=>{calls.push([route,body]);return route.endsWith('/options')?{ok:true,requestId:'challenge',options:{challenge:'AQ',rpId:'panelstockhq.com',userVerification:'required'}}:{ok:true,username:'sam',token:'session'};},result=>signedIn=result,()=>assert.fail('unexpected error'));
 h.button('Continue').onclick();assert.equal(calls.length,0);
 h.nodes().find(node=>node.tagName==='select').value='shared';h.button('Continue').onclick();await tick();
 assert.equal(h.getOptions().publicKey.userVerification,'required');assert.deepEqual(Array.from(h.getOptions().publicKey.hints),['hybrid','security-key']);assert.equal(h.getOptions().publicKey.challenge.byteLength,1);
 assert.equal(calls[1][0],'/passkeys/authenticate/verify');assert.equal(calls[1][1].response.response.signature,'AQ');assert.equal(calls[1][1].response.response.userHandle,'AQ');assert.equal(signedIn.username,'sam');
});
test('passkey enrollment requires a device choice and current PIN, clears the PIN field, and uses verified options',async()=>{
 const h=harness(),calls=[];
 h.api.manage(async(route,body)=>{calls.push([route,body]);if(route==='/passkeys/list')return{ok:true,passkeys:[]};if(route.endsWith('/options'))return{ok:true,requestId:'register',options:{challenge:'AQ',user:{id:'AQ',name:'sam'},rp:{id:'panelstockhq.com',name:'PanelStock'},authenticatorSelection:{residentKey:'required',userVerification:'required',authenticatorAttachment:'cross-platform'}}};return{ok:true};});await tick();
 h.button('Add passkey').onclick();assert.equal(calls.filter(call=>call[0].endsWith('/options')).length,0);
 h.nodes().find(node=>node.tagName==='select').value='shared';const pin=h.nodes().find(node=>node.type==='password');pin.value='123456';h.button('Add passkey').onclick();assert.equal(pin.value,'');await tick();
 const request=calls.find(call=>call[0].endsWith('/options'));assert.equal(request[1].pin,'123456');assert.equal(request[1].deviceKind,'shared');assert.equal(h.createOptions().publicKey.authenticatorSelection.authenticatorAttachment,'cross-platform');assert.ok(calls.some(call=>call[0]==='/passkeys/register/verify'));
});
test('cancelling the device prompt never calls verification, and unsupported browsers retain PIN sign-in',async()=>{
 const h=harness({cancel:true}),calls=[];
 h.api.signIn(async route=>{calls.push(route);return{requestId:'challenge',options:{challenge:'AQ',rpId:'panelstockhq.com'}};},()=>assert.fail('cancelled sign-in'),()=>{});h.nodes().find(node=>node.tagName==='select').value='personal';h.button('Continue').onclick();await tick();assert.deepEqual(calls,['/passkeys/authenticate/options']);assert.equal(h.button('Close').disabled,false);
 let error;const unavailable=harness({available:false});unavailable.api.signIn(()=>assert.fail('API call from unsupported browser'),()=>{},message=>error=message);assert.match(error,/Sign in with your PIN/);
});
test('admin management cannot enroll credentials for another person',async()=>{
 const h=harness(),calls=[];h.api.manage(async(route,body)=>{calls.push([route,body]);return{ok:true,passkeys:[]};},'sam');await tick();assert.equal(calls[0][0],'/passkeys/admin/list');assert.equal(calls[0][1].targetUsername,'sam');assert.equal(h.button('Add passkey'),undefined);assert.equal(h.nodes().filter(node=>node.type==='password').length,0);
});
