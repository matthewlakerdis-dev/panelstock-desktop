const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(fs.existsSync(path.join(__dirname,'../passkeys.js'))?path.join(__dirname,'../passkeys.js'):path.join(__dirname,'../site/passkeys.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness({available=true,cancel=false}={}){
 let document;class Element{constructor(tag){this.tagName=tag;this.style={};this.attributes={};this.children=[];this.textContent='';this.value='';this.disabled=false;}appendChild(node){node.parentNode=this;this.children.push(node);return node;}removeChild(node){this.children.splice(this.children.indexOf(node),1);node.parentNode=null;}setAttribute(key,value){this.attributes[key]=value;}get firstChild(){return this.children[0]||null;}focus(){document.activeElement=this;}querySelectorAll(){return walk(this).filter(node=>['button','input','select'].includes(node.tagName)&&!node.disabled);}}
 const body=new Element('body'),events={},walk=node=>[node,...node.children.flatMap(walk)];document={body,activeElement:body,createElement:tag=>new Element(tag),addEventListener:(name,fn)=>events[name]=fn,removeEventListener:name=>delete events[name]};let getOptions,createOptions,reloads=0;
 const binary=new Uint8Array([1]).buffer;
 const credential={id:'AQ',rawId:binary,type:'public-key',authenticatorAttachment:'cross-platform',response:{clientDataJSON:binary,authenticatorData:binary,signature:binary,userHandle:binary,attestationObject:binary,getTransports:()=>['hybrid']},getClientExtensionResults:()=>({})};
 const root={isSecureContext:true,PublicKeyCredential:available?function(){}:null,atob,btoa,location:{reload:()=>reloads++},navigator:{credentials:{get:async options=>{getOptions=options;if(cancel)throw Object.assign(Error('cancelled'),{name:'NotAllowedError'});return credential;},create:async options=>{createOptions=options;if(cancel)throw Object.assign(Error('cancelled'),{name:'NotAllowedError'});return credential;}}}};
 vm.runInNewContext(source,{window:root,document,console});return{root:root,api:root.PanelStockPasskeys,nodes:()=>walk(body),button:text=>walk(body).find(node=>node.tagName==='button'&&node.textContent===text),getOptions:()=>getOptions,createOptions:()=>createOptions,reloads:()=>reloads,events};
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

test('closing a passkey flow on sign-out prevents a late response from starting device verification',async()=>{
 const h=harness();let resolveOptions;const calls=[];
 h.api.signIn(route=>{calls.push(route);return new Promise(resolve=>resolveOptions=resolve);},()=>assert.fail('closed flow signed in'),()=>{});
 h.nodes().find(node=>node.tagName==='select').value='personal';h.button('Continue').onclick();h.api.close();resolveOptions({requestId:'old',options:{challenge:'AQ',rpId:'panelstockhq.com'}});await tick();assert.equal(h.getOptions(),undefined);assert.deepEqual(calls,['/passkeys/authenticate/options']);
});

function optInHarness(){const h=harness(),saved=new Map();h.root.localStorage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)};h.root.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable=async()=>true;h.saved=saved;return h;}
test('first PIN sign-in offers opt-in and enrolls only on the personal device after explicit consent',async()=>{
 const h=optInHarness(),calls=[];
 const request=async(route,body)=>{calls.push([route,body]);if(route==='/passkeys/list')return{ok:true,passkeys:[{id:'AQ'}]};if(route.endsWith('/options'))return{ok:true,requestId:'register',options:{challenge:'AQ',user:{id:'AQ',name:'sam'},rp:{id:'example.test',name:'PanelStock'},authenticatorSelection:{residentKey:'required',userVerification:'required',authenticatorAttachment:'platform'},hints:['client-device']}};return{ok:true};};
 const offered=h.api.offerAfterPin(request,'sam','123456');await tick();assert.equal(calls.length,0);assert.ok(h.button('Enable on my personal device'));
 h.button('Enable on my personal device').onclick();await offered;
 assert.equal(calls[0][1].pin,'123456');assert.equal(calls[0][1].deviceKind,'personal');assert.equal(h.createOptions().publicKey.authenticatorSelection.authenticatorAttachment,'platform');assert.equal(h.api.signInLabel(),'Use fingerprint / Face ID');assert.ok(!JSON.stringify(Array.from(h.saved)).includes('123456'));
 await h.api.offerAfterPin(request,'sam','123456');assert.equal(h.button('Enable on my personal device'),undefined);assert.equal(calls.at(-1)[0],'/passkeys/list');
 let signedIn=false;h.api.signIn(async route=>route.endsWith('/options')?{requestId:'login',options:{challenge:'AQ',rpId:'example.test',userVerification:'required'}}:{ok:true},()=>signedIn=true,()=>{});await tick();assert.equal(h.nodes().some(node=>node.tagName==='select'),false);assert.deepEqual(Array.from(h.getOptions().publicKey.hints),['client-device']);assert.equal(signedIn,true);
});
test('Not now and shared-device choices never enroll credentials or keep prompting',async()=>{
 const h=optInHarness();let offered=h.api.offerAfterPin(()=>assert.fail('request before opt-in'),'sam','123456');await tick();h.button('Not now').onclick();await offered;await h.api.offerAfterPin(()=>assert.fail('request after decline'),'sam','123456');assert.equal(h.button('Enable on my personal device'),undefined);
 offered=h.api.offerAfterPin(()=>assert.fail('request on shared device'),'other','123456');await tick();h.button('This is a shared device').onclick();await offered;await h.api.offerAfterPin(()=>assert.fail('request on shared device'),'third','123456');assert.equal(h.button('Enable on my personal device'),undefined);
});
test('devices without a platform authenticator continue PIN sign-in without an enrollment prompt',async()=>{
 const h=optInHarness();h.root.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable=async()=>false;await h.api.offerAfterPin(()=>assert.fail('unexpected request'),'sam','123456');assert.equal(h.button('Enable on my personal device'),undefined);
});

test('credential manager failure explains recovery and leaves PIN sign-in available without saving enrollment',async()=>{
 const h=optInHarness(),calls=[];h.root.navigator.credentials.create=async()=>{throw Object.assign(Error('An unknown error occurred while talking to the credential manager.'),{name:'UnknownError'});};
 const offered=h.api.offerAfterPin(async route=>{calls.push(route);return{requestId:'setup',options:{challenge:'AQ',user:{id:'AQ',name:'sam'},rp:{id:'example.test',name:'PanelStock'}}};},'sam','123456');await tick();h.button('Enable on my personal device').onclick();await tick();
 assert.deepEqual(calls,['/passkeys/register/options']);assert.ok(h.nodes().some(node=>node.textContent.includes('password/passkey provider')));assert.equal(h.saved.size,0);assert.equal(h.button('Continue with PIN').disabled,false);h.button('Continue with PIN').onclick();await offered;assert.equal(h.api.signInLabel(),'Sign in with passkey');
});

test('failed device enrollment can be retried with a password manager after separate consent',async()=>{
 const h=optInHarness(),calls=[],create=h.root.navigator.credentials.create;let attempts=0;
 h.root.navigator.credentials.create=async options=>{if(++attempts===1)throw Object.assign(Error('provider unavailable'),{name:'NotReadableError'});return create(options);};
 const request=async(route,body)=>{calls.push([route,body]);if(route.endsWith('/options'))return{requestId:'setup-'+calls.length,options:{challenge:'AQ',rp:{id:'example.test',name:'PanelStock'},user:{id:'AQ',name:'sam'},authenticatorSelection:{residentKey:'required',userVerification:'required',...(body.setupMethod==='password-manager'?{}:{authenticatorAttachment:'platform'})}}};return{ok:true};};
 const offered=h.api.offerAfterPin(request,'sam','123456');await tick();assert.equal(calls.length,0);
 h.button('Enable on my personal device').onclick();assert.equal(h.button('Use my password manager').disabled,true);await tick();
 assert.equal(attempts,1);assert.equal(calls.length,1);assert.equal(h.saved.size,0);assert.equal(h.button('Use my password manager').disabled,false);
 h.button('Use my password manager').onclick();await offered;
 assert.equal(calls[1][1].setupMethod,'password-manager');assert.equal(calls[1][1].deviceKind,'personal');assert.equal(calls[1][1].pin,'123456');
 assert.equal(h.createOptions().publicKey.authenticatorSelection.authenticatorAttachment,undefined);assert.equal(h.createOptions().publicKey.authenticatorSelection.userVerification,'required');assert.equal(calls[2][0],'/passkeys/register/verify');
 assert.equal(h.api.signInLabel(),'Use saved passkey');assert.ok(!JSON.stringify(Array.from(h.saved)).includes('123456'));
 let signedIn=false;h.api.signIn(async route=>route.endsWith('/options')?{requestId:'login',options:{challenge:'AQ',rpId:'example.test',hints:['client-device'],userVerification:'required'}}:{ok:true},()=>signedIn=true,()=>assert.fail('unexpected error'));await tick();assert.equal(h.getOptions().publicKey.hints,undefined);assert.equal(signedIn,true);
});

test('password-manager enrollment remains unsuccessful when the server rejects verification',async()=>{
 const h=optInHarness();const offered=h.api.offerAfterPin(async route=>{if(route.endsWith('/verify'))throw Error('Passkey setup could not be verified');return{requestId:'setup',options:{challenge:'AQ',rp:{id:'example.test',name:'PanelStock'},user:{id:'AQ',name:'sam'}}};},'sam','123456');await tick();
 h.button('Use my password manager').onclick();await tick();assert.equal(h.saved.size,0);assert.equal(h.api.signInLabel(),'Sign in with passkey');assert.equal(h.button('Continue with PIN').disabled,false);h.button('Continue with PIN').onclick();await offered;
});

test('profile setup offers password-manager registration with current PIN and provider-neutral options',async()=>{
 const h=optInHarness(),calls=[];
 h.api.manage(async(route,body)=>{calls.push([route,body]);if(route==='/passkeys/list')return{passkeys:[]};if(route.endsWith('/options'))return{requestId:'profile',options:{challenge:'AQ',rp:{id:'example.test',name:'PanelStock'},user:{id:'AQ',name:'sam'},authenticatorSelection:{userVerification:'required',residentKey:'required'}}};return{ok:true};});await tick();
 const select=h.nodes().find(node=>node.tagName==='select');assert.ok(select.children.some(option=>option.value==='password-manager'));select.value='password-manager';h.nodes().find(node=>node.type==='password').value='123456';h.button('Add passkey').onclick();await tick();
 const body=calls.find(call=>call[0].endsWith('/options'))[1];assert.equal(body.setupMethod,'password-manager');assert.equal(body.deviceKind,'personal');assert.equal(body.pin,'123456');assert.equal(h.createOptions().publicKey.authenticatorSelection.authenticatorAttachment,undefined);assert.equal(h.api.signInLabel(),'Use saved passkey');
});

test('an opted-in device can retry sign-in with its configured password manager without attachment hints',async()=>{
 const h=optInHarness(),get=h.root.navigator.credentials.get,calls=[];let attempts=0,signedIn=false;h.saved.set('panelstock:device-unlock-kind:v1','personal');
 h.root.navigator.credentials.get=async options=>{if(++attempts===1)throw Object.assign(Error('provider unavailable'),{name:'NotReadableError'});return get(options);};
 h.api.signIn(async route=>{calls.push(route);return route.endsWith('/options')?{requestId:'login-'+calls.length,options:{challenge:'AQ',rpId:'example.test',hints:['client-device'],userVerification:'required'}}:{ok:true};},()=>signedIn=true,()=>{});await tick();assert.equal(signedIn,false);assert.deepEqual(calls,['/passkeys/authenticate/options']);
 h.button('Use my password manager').onclick();await tick();assert.equal(h.getOptions().publicKey.hints,undefined);assert.equal(h.getOptions().publicKey.userVerification,'required');assert.equal(signedIn,true);assert.equal(h.api.signInLabel(),'Use saved passkey');
});
