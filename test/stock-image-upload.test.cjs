const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../workshop-stock.js'),'utf8');
const MiB=1024*1024,limit=2*MiB;
const walk=n=>!n||typeof n!=='object'?[]:[n,...(n.children||[]).flat(Infinity).flatMap(walk)];
const dataURL=(type,bytes)=>'data:'+type+';base64,'+Buffer.alloc(bytes,120).toString('base64');
const decodedSize=url=>Buffer.from(url.slice(url.indexOf(',')+1),'base64').length;

function harness({width=2400,height=1200,decodeError=false,deferDecode=false,encode=({type})=>dataURL(type,700*1024)}={}){
 const states=[],created=[],revoked=[],attempts=[],draws=[],requests=[],storage=new Map(),images=[];let cursor=0;
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:value=>{const i=cursor++;if(!(i in states))states[i]=typeof value==='function'?value():value;return [states[i],value=>states[i]=typeof value==='function'?value(states[i]):value];},useEffect(){},Fragment:'fragment'};
 class FakeImage{
  constructor(){this.naturalWidth=width;this.naturalHeight=height;images.push(this);}
  set src(value){this.url=value;if(!deferDecode)Promise.resolve().then(()=>this.finish());}
  finish(){decodeError?this.onerror():this.onload();}
 }
 const canvas={width:0,height:0,getContext:()=>({fillStyle:'',fillRect(){},drawImage(image,x,y,w,h){draws.push({width:w,height:h});}}),toDataURL(type,quality){const attempt={type,quality,width:this.width,height:this.height};attempts.push(attempt);return encode(attempt);}};
 const context={window:{},TextEncoder,Blob,atob,Image:FakeImage,crypto:{randomUUID:()=> 'image-mutation'},PanelStock:{username:'admin',apiFetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>states[0]};}},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},document:{addEventListener(){},createElement:type=>{assert.equal(type,'canvas');return canvas;}},URL:{createObjectURL:file=>{created.push(file);return 'blob:stock-image-'+created.length;},revokeObjectURL:url=>revoked.push(url)},setTimeout(){return 0;}};
 vm.runInNewContext(source,context);const C=context.window.createWorkshopStock(React),render=()=>{cursor=0;return walk(C({isAdmin:true,workerUrl:'/api'}));};render();
 states[0]={revision:4,movements:[],items:[{id:'angle',name:'Angle',sku:'ANGLE',category:'extrusions',unit:'lengths',qty:5,reserved:1,available:4,image:'data:image/png;base64,b2xk'}]};
 const node=label=>render().find(n=>n.props['aria-label']===label);node('Stock action for Angle').props.onChange({target:{value:'metadata'}});
 const preview=()=>render().find(n=>n.type==='img'&&n.props.alt==='Selected stock profile')?.props.src;
 return {states,render,node,created,revoked,attempts,draws,requests,preview,finishDecode(){images.at(-1).finish();},upload(file={type:'image/png',size:MiB}){const target={files:file?[file]:[],value:'selected-file'};return {target,done:node('Profile or item image').props.onChange({target})};},error:()=>render().find(n=>n.props.role==='alert')?.children.join('')||'',save:()=>render().find(n=>n.type==='button'&&n.props.type==='submit')};
}

function cleanFinished(x){assert.equal(x.node('Profile or item image').props.disabled,false);assert.equal(x.save().props.disabled,false);assert.equal(x.requests.length,0);assert.deepEqual(x.revoked,x.created.map((_,i)=>'blob:stock-image-'+(i+1)));}

test('a saved PNG above 500 KiB updates only the pending form and clears preparation state after decode',async()=>{
 const x=harness({deferDecode:true}),before=structuredClone(x.states[0]),old=x.preview(),upload=x.upload({type:'image/png',size:8*MiB});
 assert.equal(upload.target.value,'');assert.equal(x.node('Profile or item image').props.disabled,true);assert.equal(x.save().props.disabled,true);assert.equal(x.preview(),old);assert.equal(x.created.length,1);assert.equal(x.revoked.length,0);
 x.finishDecode();await upload.done;assert.equal(decodedSize(x.preview()),700*1024);assert.equal(x.error(),'');assert.deepEqual(x.draws,[{width:1600,height:800}]);assert.equal(x.attempts[0].type,'image/png');assert.deepEqual(x.states[0],before);cleanFinished(x);
});

test('the saved image limit is 2 MiB of decoded bytes rather than the larger base64 text length',async()=>{
 const image=dataURL('image/png',limit),x=harness({encode:()=>image});assert.ok(image.length>limit);await x.upload().done;assert.equal(x.preview(),image);assert.equal(decodedSize(x.preview()),limit);assert.equal(x.attempts.length,1);assert.equal(x.error(),'');cleanFinished(x);
});

test('images above the saved limit try alternate encodings and shrink dimensions by 25 percent until they fit',async()=>{
 const oversized=dataURL('image/png',limit+1),small=dataURL('image/png',900*1024),x=harness({encode:({width})=>width>=1200?oversized:small});
 await x.upload().done;assert.equal(x.preview(),small);assert.deepEqual(x.draws,[{width:1600,height:800},{width:1200,height:600},{width:900,height:450}]);
 for(const width of [1600,1200]){const formats=x.attempts.filter(a=>a.width===width);assert.deepEqual(formats.map(a=>a.type),['image/png','image/webp','image/webp','image/jpeg','image/jpeg']);assert.deepEqual(formats.map(a=>a.quality),[undefined,.9,.75,.85,.7]);}
 assert.equal(x.attempts.at(-1).width,900);assert.ok(decodedSize(x.preview())<=limit);assert.equal(x.error(),'');cleanFinished(x);
});

test('browsers that return PNG for unsupported WebP still fall through to a fitting JPEG',async()=>{
 const oversizedPNG=dataURL('image/png',limit+1),jpeg=dataURL('image/jpeg',800*1024),x=harness({encode:({type})=>type==='image/jpeg'?jpeg:oversizedPNG});
 await x.upload().done;assert.equal(x.preview(),jpeg);assert.ok(x.attempts.some(a=>a.type==='image/webp'));assert.ok(x.attempts.some(a=>a.type==='image/jpeg'));assert.deepEqual(x.draws,[{width:1600,height:800}]);assert.equal(x.error(),'');cleanFinished(x);
});

test('unsupported file types and files above the original 8 MiB limit are rejected before allocating an object URL',async()=>{
 for(const [file,message] of [[{type:'image/gif',size:1},/PNG, JPEG or WebP/],[{type:'image/png',size:8*MiB+1},/8 MB/]]){
  const x=harness(),old=x.preview(),before=structuredClone(x.states[0]);await x.upload(file).done;assert.match(x.error(),message);assert.equal(x.preview(),old);assert.equal(x.created.length,0);assert.equal(x.attempts.length,0);assert.deepEqual(x.states[0],before);cleanFinished(x);
 }
});

test('images above 40 megapixels and decode failures preserve the prior form image and release object URLs',async()=>{
 for(const [config,message] of [[{width:8001,height:5000},/40 megapixels/],[{decodeError:true},/could not be read/]]){
  const x=harness(config),old=x.preview(),before=structuredClone(x.states[0]);await x.upload().done;assert.match(x.error(),message);assert.equal(x.preview(),old);assert.equal(x.created.length,1);assert.equal(x.attempts.length,0);assert.deepEqual(x.states[0],before);cleanFinished(x);
 }
});

test('the 40-megapixel boundary remains allowed and a cancelled picker leaves the image unchanged',async()=>{
 const x=harness({width:8000,height:5000}),old=x.preview();await x.upload(null).done;assert.equal(x.preview(),old);assert.equal(x.created.length,0);assert.equal(x.error(),'');
 await x.upload({type:'image/jpeg',size:8*MiB}).done;assert.equal(x.error(),'');assert.deepEqual(x.draws,[{width:1600,height:1000}]);cleanFinished(x);
});

test('an image that cannot fit after compression is rejected without retaining a URL or an oversized form image',async()=>{
 const oversized=dataURL('image/png',limit+1),x=harness({encode:()=>oversized}),old=x.preview();await x.upload().done;assert.match(x.error(),/2 MB.*limit|try another image/i);assert.equal(x.preview(),old);assert.ok(x.attempts.length>5);cleanFinished(x);
});
