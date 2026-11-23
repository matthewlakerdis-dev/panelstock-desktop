const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'../workshop-stock.js'),'utf8');
const stockRequest=url=>{const parsed=new URL(url,'https://app.test');if(!parsed.pathname.endsWith('/workshop-stock'))return false;assert.equal(parsed.searchParams.get('images'),'deferred');return true;};
const walk=node=>!node||typeof node!=='object'?[]:[node,...(node.children||[]).flat(Infinity).flatMap(walk)];
const oldPhoto='data:image/png;base64,b2xkLXN5bnRoZXRpYy1waG90bw==';
const downloaded='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jrXkAAAAASUVORK5CYII=';
const prepared='data:image/png;base64,cHJlcGFyZWQtc3ludGhldGljLXBob3Rv';
const product={code:'E12345',title:'Example Capral angle',url:'https://www.capral.com.au/product/example/',images:[{url:'https://www.capral.com.au/uploads/example-angle.png',alt:'Example angle profile'}]};
const searchResult=()=>({code:'E12345',products:[product],warnings:[]});
const imageResult=()=>({code:'E12345',productUrl:product.url,title:product.title,image:{data:downloaded,mimeType:'image/png',name:'example-angle.png'}});
const fixture=()=>({revision:7,stockProfileReferenceVersion:1,capralReferenceLookupVersion:1,movements:[],catalog:[],items:[
 {id:'angle',name:'Angle',sku:'INTERNAL-1',category:'extrusions',unit:'lengths',qty:5,reserved:0,available:5,unitCost:12.34,lengthMm:6500,dimensions:'40 x 40 x 3 mm',colour:'Mill Finish',supplier:'Example Supplier',details:'E12345 profile, mill finish',image:oldPhoto,reservations:{}},
 {id:'other',name:'Channel',sku:'INTERNAL-2',category:'extrusions',unit:'lengths',qty:3,reserved:0,available:3,details:'Other profile',image:'',reservations:{}}
]});
const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};

function harness({data=fixture(),catalogueOnly=true,width=2400,height=1200,decodeError=false,deferDecode=false}={}){
 const states=[],requests=[],storage=new Map(),created=[],revoked=[],draws=[],decoders=[];let cursor=0,handler;
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:value=>{const index=cursor++;if(!(index in states))states[index]=typeof value==='function'?value():value;return [states[index],value=>states[index]=typeof value==='function'?value(states[index]):value];},useEffect(){},Fragment:'fragment'};
 class FakeImage{constructor(){this.naturalWidth=width;this.naturalHeight=height;decoders.push(this);}set src(value){this.value=value;if(!deferDecode)Promise.resolve().then(()=>this.finish());}finish(){decodeError?this.onerror():this.onload();}}
 const canvas={width:0,height:0,getContext:()=>({fillRect(){},drawImage(_image,_x,_y,w,h){draws.push([w,h]);}}),toDataURL:()=>prepared};
 const context={window:{},TextEncoder,Blob,Uint8Array,atob,Image:FakeImage,crypto:{randomUUID:()=> 'capral-image-save'},PanelStock:{username:'tester',apiFetch:async(url,options)=>{const body=options?.body?JSON.parse(options.body):undefined;requests.push({url,body});if(handler)return handler(url,body);if(url.endsWith('/stock-images/capral/search'))return response(searchResult());if(url.endsWith('/stock-images/capral/image'))return response(imageResult());return response(states[0]);}},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},document:{addEventListener(){},removeEventListener(){},createElement:tag=>{assert.equal(tag,'canvas');return canvas;}},URL:{createObjectURL:file=>{created.push(file);return 'blob:capral-image-'+created.length;},revokeObjectURL:url=>revoked.push(url)},setTimeout(){}};
 vm.runInNewContext(source,context);const Component=context.window.createWorkshopStock(React),render=()=>{cursor=0;return walk(Component({isAdmin:true,workerUrl:'/api',catalogueOnly}));};render();states[0]=data;
 const button=label=>render().find(node=>node.type==='button'&&node.children.includes(label));
 const node=label=>render().find(node=>node.props['aria-label']===label);
 const card=id=>render().find(node=>node.props['data-material-id']===id);
 const control=key=>walk(render().find(node=>node.type==='label'&&node.props.key===key)).find(node=>['input','select','textarea'].includes(node.type));
 const open=(id='angle')=>{const item=states[0].items.find(item=>item.id===id);if(catalogueOnly)walk(card(id)).find(node=>node.type==='button'&&node.children.includes('Edit material')).props.onClick();else node('Stock action for '+item.name).props.onChange({target:{value:'metadata'}});render();};
 const preview=()=>walk(render().find(node=>node.props.className==='ws-image-edit-preview')).find(node=>node.type==='img')?.props.src;
 return {states,requests,storage,created,revoked,draws,context,render,button,node,card,control,open,preview,finishDecode(){assert.ok(decoders.length);decoders.at(-1).finish();},setHandler(value){handler=value;},set(key,value){control(key).props.onChange({target:{value}});render();},code(value){node('Capral code').props.onChange({target:{value}});render();},async find(){await button('Find Capral image').props.onClick();render();},async use(){await button('Use image').props.onClick();render();},async save(){await render().find(node=>node.type==='form').props.onSubmit({preventDefault(){}});render();return requests.at(-1)?.body;}};
}

test('Capral lookup uses an editable profile code without changing the stock code',async()=>{
 const x=harness(),before=structuredClone(x.states[0]);x.open();assert.equal(x.node('Capral code').props.value,'E12345');x.code('EL76543');assert.equal(x.control('sku'),undefined);await x.find();assert.equal(x.requests[0].url,'/api/stock-images/capral/search');assert.deepEqual(x.requests[0].body,{code:'EL76543'});assert.deepEqual(x.states[0],before);assert.equal(x.preview(),oldPhoto);
});

test('search stages the official product and image without updating stock or the edited photo',async()=>{
 const x=harness(),before=structuredClone(x.states[0]);x.open();await x.find();assert.ok(x.button('Use image'));const link=x.render().find(node=>node.type==='a'&&node.props.href===product.url);assert.ok(link);assert.match(link.props.rel||'',/noopener/);assert.ok(x.render().some(node=>node.type==='img'&&node.props.src===product.images[0].url));assert.equal(x.preview(),oldPhoto);assert.equal(x.requests.length,1);assert.deepEqual(x.states[0],before);x.button('Cancel').props.onClick();x.open();assert.equal(x.button('Use image'),undefined);assert.equal(x.preview(),oldPhoto);
});

test('Use image prepares a bounded copy in the draft and Save writes only the image and existing stock fields',async()=>{
 const x=harness(),before=structuredClone(x.states[0]);x.open();await x.find();await x.use();assert.equal(x.requests[1].url,'/api/stock-images/capral/image');assert.deepEqual(x.requests[1].body,{code:'E12345',productUrl:product.url,imageUrl:product.images[0].url});assert.equal(x.preview(),prepared);assert.deepEqual(x.draws,[[1600,800]]);assert.equal(x.requests.length,2);assert.deepEqual(x.states[0],before);const saved=await x.save();assert.equal(saved.action,'metadata');assert.equal(saved.itemId,'angle');assert.equal(saved.image,prepared);assert.equal(saved.unitCost,12.34);assert.equal(Object.hasOwn(saved,'capralCode'),false);assert.equal(Object.hasOwn(saved,'productUrl'),false);assert.ok(!JSON.stringify(saved).includes('https://www.capral.com.au'));assert.deepEqual(x.states[0],before);assert.deepEqual(x.revoked,x.created.map((_,index)=>'blob:capral-image-'+(index+1)));
});

test('changing the lookup code discards both staged and late search results',async()=>{
 const x=harness();x.open();await x.find();x.code('E54321');assert.equal(x.button('Use image'),undefined);const wait=deferred();x.setHandler(url=>url.endsWith('/search')?wait.promise:response(x.states[0]));const pending=x.button('Find Capral image').props.onClick();x.render();x.code('E99999');wait.resolve(response({code:'E54321',products:[product],warnings:[]}));await pending;x.render();assert.equal(x.button('Use image'),undefined);assert.equal(x.preview(),oldPhoto);assert.equal(x.requests.filter(request=>stockRequest(request.url)).length,0);
});

test('editing the item or closing it discards a search result that belongs to the prior draft',async()=>{
 for(const close of [false,true]){const x=harness(),wait=deferred();x.open();x.setHandler(url=>url.endsWith('/search')?wait.promise:response(x.states[0]));const pending=x.button('Find Capral image').props.onClick();x.render();if(close){x.button('Cancel').props.onClick();x.open('other');}else x.set('dimensions','50 x 50 x 3 mm');wait.resolve(response(searchResult()));await pending;x.render();assert.equal(x.button('Use image'),undefined);assert.equal(x.preview(),close?x.context.window.stockProfileImages.image(x.states[0].items[1]):oldPhoto);assert.equal(x.requests.filter(request=>request.url.endsWith('/image')).length,0);}
});

test('download failures preserve the prior edited image and do not make a stock write',async()=>{
 const x=harness();x.open();await x.find();x.setHandler(url=>url.endsWith('/image')?response({error:'Image download unavailable'},502):response(x.states[0]));await x.use();assert.equal(x.preview(),oldPhoto);assert.equal(x.requests.filter(request=>stockRequest(request.url)).length,0);assert.ok(x.render().some(node=>node.props.role==='alert'&&node.children.join(' ').includes('Image download unavailable')));assert.equal(x.node('Profile or item image').props.disabled,false);
});

test('unsupported or oversized downloaded images never replace the existing photo',async()=>{
 for(const image of [{data:'data:image/svg+xml,<svg/>',mimeType:'image/svg+xml',name:'diagram.svg'},{data:'data:image/png;base64,'+'A'.repeat(Math.ceil((8*1024*1024+3)/3)*4),mimeType:'image/png',name:'oversized.png'}]){const x=harness();x.open();await x.find();x.setHandler(url=>url.endsWith('/image')?response({...imageResult(),image}):response(x.states[0]));await x.use();assert.equal(x.preview(),oldPhoto);assert.equal(x.created.length,0);assert.equal(x.requests.filter(request=>stockRequest(request.url)).length,0);}
});

test('downloaded images above the pixel limit or with decode failures preserve the original photo',async()=>{
 for(const config of [{width:8001,height:5000},{decodeError:true}]){const x=harness(config);x.open();await x.find();await x.use();assert.equal(x.preview(),oldPhoto);assert.equal(x.draws.length,0);assert.equal(x.requests.filter(request=>stockRequest(request.url)).length,0);assert.deepEqual(x.revoked,x.created.map((_,index)=>'blob:capral-image-'+(index+1)));}
});

test('Capral lookup is hidden for unsupported backends, legacy panels and shared-profile variants',()=>{
 const data=fixture();delete data.capralReferenceLookupVersion;const old=harness({data});old.open();assert.equal(old.node('Capral code'),undefined);assert.equal(old.button('Find Capral image'),undefined);
 const shared=harness();walk(shared.card('angle')).find(node=>node.type==='button'&&node.children.includes('Add variant')).props.onClick();assert.equal(shared.node('Capral code'),undefined);assert.equal(shared.button('Find Capral image'),undefined);
 const panelData=fixture();panelData.items=[{...panelData.items[0],id:'variant:panel',name:'White panel',legacy:true,category:'panels',unit:'sheets',color:'White',material:'ACP',width:1200,height:2400}];const panel=harness({data:panelData,catalogueOnly:false});panel.open('variant:panel');assert.equal(panel.node('Capral code'),undefined);assert.equal(panel.button('Find Capral image'),undefined);
});

test('an uncertain stock save retries the exact prepared image without downloading it again',async()=>{
 const x=harness();x.open();await x.find();await x.use();x.setHandler(url=>stockRequest(url)?response({error:'Save not confirmed'},503):response(x.states[0]));await x.save();const first=structuredClone(x.requests.at(-1).body);assert.equal(first.image,prepared);assert.ok(x.button('Retry save'));const downloads=x.requests.filter(request=>request.url.endsWith('/image')).length;x.setHandler(()=>response(x.states[0]));await x.save();assert.deepEqual(x.requests.at(-1).body,first);assert.equal(x.requests.filter(request=>request.url.endsWith('/image')).length,downloads);assert.equal(x.storage.size,0);
});

test('Capral code suggestions use named profile codes before the independent stock SKU',()=>{
 for(const [details,name,sku,expected]of [['EK4567 mill finish','Angle','INTERNAL-A','EK4567'],['EL76543 section','RHS','INTERNAL-B','EL76543'],['','Channel EP12345','INTERNAL-C','EP12345'],['No profile code','Angle','765432','765432']]){
  const data=fixture();Object.assign(data.items[0],{details,name,sku});const x=harness({data});x.open();assert.equal(x.node('Capral code').props.value,expected);assert.equal(x.states[0].items[0].sku,sku);
 }
});

test('compound Capral PDF codes suggest the leading product SKU and EN profiles remain searchable',()=>{
 for(const [details,sku,expected]of [['EN7492(ME9395) 6060 T5','815581 EN7492(ME9395)','815581'],['EN7492 section','INTERNAL-A','EN7492']]){
  const data=fixture();Object.assign(data.items[0],{details,sku});const x=harness({data});x.open();assert.equal(x.node('Capral code').props.value,expected);assert.equal(x.states[0].items[0].sku,sku);
 }
});

test('empty matches and search errors retain the current photo and only send a public lookup request',async()=>{
 for(const result of [response({code:'E12345',products:[],warnings:['No exact product match']}),response({error:'Capral search unavailable'},503)]){
  const x=harness(),before=structuredClone(x.states[0]);x.open();x.setHandler(()=>result);await x.find();assert.equal(x.button('Use image'),undefined);assert.equal(x.preview(),oldPhoto);assert.equal(x.requests.length,1);assert.deepEqual(x.requests[0].body,{code:'E12345'});assert.deepEqual(x.states[0],before);assert.equal(x.button('Find Capral image').props.disabled,false);
 }
});

test('cancelling a staged result keeps the edited photo and does not download the suggested image',async()=>{
 const x=harness();x.open();await x.find();assert.ok(x.button('Use image'));x.button('Cancel Capral lookup').props.onClick();x.render();assert.equal(x.button('Use image'),undefined);assert.equal(x.preview(),oldPhoto);assert.equal(x.requests.length,1);assert.equal(x.button('Find Capral image').props.disabled,false);
});

test('cancelling an in-flight download discards its late response before preparing or saving an image',async()=>{
 const x=harness(),wait=deferred();x.open();await x.find();x.setHandler(url=>url.endsWith('/image')?wait.promise:response(x.states[0]));const pending=x.button('Use image').props.onClick();x.render();assert.equal(x.node('Profile or item image').props.disabled,true);assert.equal(x.button('Cancel Capral lookup').props.disabled,false);x.button('Cancel Capral lookup').props.onClick();x.render();wait.resolve(response(imageResult()));await pending;x.render();assert.equal(x.preview(),oldPhoto);assert.equal(x.created.length,0);assert.equal(x.button('Use image'),undefined);assert.equal(x.node('Profile or item image').props.disabled,false);assert.equal(x.requests.filter(request=>stockRequest(request.url)).length,0);
});

test('cancelling while a downloaded image decodes discards the prepared result and releases its object URL',async()=>{
 const x=harness({deferDecode:true});x.open();await x.find();const pending=x.button('Use image').props.onClick();await new Promise(setImmediate);x.render();assert.equal(x.created.length,1);assert.equal(x.preview(),oldPhoto);x.button('Cancel Capral lookup').props.onClick();x.render();x.finishDecode();await pending;x.render();assert.equal(x.preview(),oldPhoto);assert.equal(x.button('Use image'),undefined);assert.equal(x.node('Profile or item image').props.disabled,false);assert.deepEqual(x.revoked,x.created.map((_,index)=>'blob:capral-image-'+(index+1)));assert.equal(x.requests.filter(request=>stockRequest(request.url)).length,0);
});

test('a search response for a missing or different code cannot stage a suggested image',async()=>{
 for(const code of [undefined,'E123456','E99999']){
  const x=harness(),before=structuredClone(x.states[0]);x.open();x.setHandler(()=>response({...searchResult(),code}));await x.find();assert.equal(x.button('Use image'),undefined);assert.equal(x.preview(),oldPhoto);assert.equal(x.requests.length,1);assert.ok(x.render().some(node=>node.props.role==='alert'&&node.children.join(' ').includes('different code')));assert.deepEqual(x.states[0],before);
 }
});

test('product suggestions require the exact requested code rather than a partial or different product code',async()=>{
 for(const exact of [false,true]){
  const x=harness();x.open();const wrong={...product,code:'E123456',title:'Wrong near-code product',url:'https://www.capral.com.au/product/wrong-example/',images:[{url:'https://www.capral.com.au/uploads/wrong.png',alt:'Wrong profile'}]};x.setHandler(()=>response({code:'E12345',products:exact?[wrong,product]:[wrong],warnings:[]}));await x.find();assert.equal(x.render().filter(node=>node.type==='button'&&node.children.includes('Use image')).length,exact?1:0);assert.equal(x.render().some(node=>node.type==='img'&&node.props.src===wrong.images[0].url),false);assert.equal(x.render().some(node=>node.type==='a'&&node.props.href===wrong.url),false);assert.equal(x.preview(),oldPhoto);
 }
});

test('a downloaded image for a missing or different code never enters preparation or replaces the current photo',async()=>{
 for(const code of [undefined,'E123456','E99999']){
  const x=harness(),before=structuredClone(x.states[0]);x.open();await x.find();x.setHandler(url=>url.endsWith('/image')?response({...imageResult(),code}):response(x.states[0]));await x.use();assert.equal(x.preview(),oldPhoto);assert.equal(x.created.length,0);assert.equal(x.draws.length,0);assert.equal(x.requests.filter(request=>stockRequest(request.url)).length,0);assert.ok(x.render().some(node=>node.props.role==='alert'&&node.children.join(' ').includes('different code')));assert.deepEqual(x.states[0],before);
 }
});

test('lookup normalizes case and all whitespace while preserving meaningful code hyphens',async()=>{
 for(const [entered,code]of [[' e 1 2 3 4 5 ','E12345'],[' ek- 12 34 ','EK-1234']]){
  const x=harness(),before=structuredClone(x.states[0]);x.open();x.code(entered);x.setHandler(url=>url.endsWith('/search')?response({code,products:[{...product,code}],warnings:[]}):url.endsWith('/image')?response({...imageResult(),code}):response(x.states[0]));await x.find();assert.deepEqual(x.requests[0].body,{code});assert.equal(x.node('Capral code').props.value,code);assert.ok(x.button('Use image'));await x.use();assert.equal(x.requests[1].body.code,code);assert.equal(x.preview(),prepared);assert.deepEqual(x.states[0],before);assert.equal(x.requests.filter(request=>stockRequest(request.url)).length,0);
 }
});


test('both review links and thumbnails accept only verified Capral hosts and the Capral CDN store',async()=>{
 const allowed='https://cdn11.bigcommerce.com/s-gwvwsryafm/images/stencil/1280x1280/products/3748/5097/angle.png';
 const x=harness();x.open();x.setHandler(()=>response({code:'E12345',products:[{...product,url:'https://shop.capral.com.au/943511/',images:[{url:allowed,alt:'Angle'},{url:allowed.replace('s-gwvwsryafm','s-anotherstore'),alt:'Foreign store'},{url:'https://evil.test/image.png',alt:'Foreign image'}]},{...product,url:'https://unknown.capral.com.au/product/'}],warnings:[]}));
 await x.find();assert.equal(x.render().filter(node=>node.type==='button'&&node.children.includes('Use image')).length,1);assert.ok(x.render().some(node=>node.type==='img'&&node.props.src===allowed));assert.ok(!x.render().some(node=>node.type==='img'&&node.props.src?.includes('s-anotherstore')));
});

test('the verified gallery photo is offered first, can be selected, and excludes other stores and private paths',async()=>{
 const photo='https://store-gwvwsryafm.mybigcommerce.com/content/product/ANGLE_6.jpg',diagram='https://cdn11.bigcommerce.com/s-gwvwsryafm/images/stencil/1280x1280/products/635/4337/angles_diagram.png',official={...product,url:'https://shop.capral.com.au/813740/',images:[{url:photo,alt:'Product photo'},{url:diagram,alt:'Profile diagram'},{url:photo.replace('gwvwsryafm','otherstore'),alt:'Foreign store'},{url:photo.replace('/content/product/','/private/'),alt:'Private path'}]},x=harness();x.open();
 x.setHandler(url=>url.endsWith('/search')?response({code:'E12345',products:[official],warnings:[]}):url.endsWith('/image')?response({...imageResult(),productUrl:official.url}):response(x.states[0]));await x.find();
 const images=x.render().filter(node=>node.type==='img'&&[photo,diagram].includes(node.props.src));assert.deepEqual(images.map(node=>node.props.src),[photo,diagram]);assert.equal(x.render().filter(node=>node.type==='button'&&node.children.includes('Use image')).length,2);assert.ok(!x.render().some(node=>node.props.src?.includes('otherstore')||node.props.src?.includes('/private/')));
 await x.use();assert.equal(x.requests.at(-1).body.imageUrl,photo);assert.equal(x.preview(),prepared);const saved=await x.save();assert.equal(saved.image,prepared);assert.equal(saved.unitCost,12.34);assert.equal(x.states[0].items[0].qty,5);assert.equal(x.states[0].items[0].sku,'INTERNAL-1');
});


// Supplier choices stay in the editor draft, independently of stock metadata.

const expansionSources=['knotwood','baker-packaging','gabbabolt','sculptform'];
const expansionLabel=source=>({capral:'Capral',rondo:'Rondo','gyprock-trade':'Gyprock Trade',knotwood:'Knotwood',sculptform:'Sculptform'}[source]);
const expansionQueryLabel=source=>source==='gyprock-trade'?'Gyprock product name':source==='sculptform'?'Sculptform name or code':expansionLabel(source)+' code';
const expansionProduct=source=>source==='knotwood'?{source,code:'KEB2550M-03',title:'KEB2550M-03 bracket',url:'https://knotwood.com/au/profiles/battens/',images:[{url:'https://knotwood.com/au/wp-content/uploads/sites/2/2022/09/KEB2550M-03.png'}]}:source==='sculptform'?{source,code:'L Profile Base Trim',title:'L Profile Base Trim — product-name reference (not an exact SKU)',url:'https://sculptform.com/aluminium-click-on-battens-tech-specs/',images:[{url:'https://sculptform.com/hs-fs/hubfs/L-base-profile.jpg?width=300&height=300&name=L-base-profile.jpg'}]}:null;
const supplierProduct=source=>expansionProduct(source)||(source==='rondo'?{source,code:'129',title:'129 Furring Channel',url:'https://www.rondo.com.au/products/ceilings/key-lock/129-furring-channel',images:[{url:'https://www.rondo.com.au/media/1349/furring_channel_129-26.jpg'}]}:{source,code:'Easy Tape',title:'Easy Tape',url:'https://www.gyprock.com.au/products/jointing-tapes/easy-tape',images:[{url:'https://www.csrassetlibrary.com/celum/30755_yConnect_Original_Easytape%20Gyprock.png'}]});
function supplierHarness(source){
 const data=fixture();data.supplierReferenceLookupVersion=1;data.supplierReferenceSources=expansionSources;const x=harness({data});
 const old=x.context.URL;x.context.URL=class extends URL{};x.context.URL.createObjectURL=old.createObjectURL;x.context.URL.revokeObjectURL=old.revokeObjectURL;
 x.open();x.node('Image source').props.onChange({target:{value:source}});x.render();const p=supplierProduct(source);
 x.node(expansionQueryLabel(source)).props.onChange({target:{value:p.code}});x.render();
 x.setHandler(url=>response(url.endsWith('/search')?{source,code:p.code,products:[p],warnings:[]}:url.endsWith('/image')?{source,code:p.code,productUrl:p.url,image:{data:downloaded,mimeType:'image/png'}}:x.states[0]));
 return {...x,product:p,find:async()=>{await x.button('Find '+expansionLabel(source)+' image').props.onClick();x.render();}};
}
for(const source of ['rondo','gyprock-trade','knotwood','sculptform']){
 test(source+' stock lookup selects explicitly then saves only the image with existing fields',async()=>{
  const x=supplierHarness(source),before=structuredClone(x.states[0]);await x.find();assert.equal(x.preview(),oldPhoto);assert.equal(x.requests[0].url,'/api/stock-images/'+source+'/search');await x.use();assert.equal(x.requests.length,2);assert.equal(x.preview(),prepared);assert.deepEqual(x.states[0],before);const saved=await x.save();assert.equal(saved.image,prepared);assert.equal(saved.unitCost,12.34);assert.equal(saved.supplier,'Example Supplier');assert.equal(saved.qty,0);assert.equal(before.items[0].qty,5);assert.ok(!JSON.stringify(saved).includes(x.product.url));assert.equal(saved.source,undefined);
 });
 test(source+' switching sources discards late searches and downloads',async()=>{
  for(const phase of ['search','image']){
   const x=supplierHarness(source),wait=deferred();if(phase==='image')await x.find();x.setHandler(()=>wait.promise);
   const pending=phase==='image'?x.use():x.find();x.render();x.node('Image source').props.onChange({target:{value:'capral'}});x.render();
   wait.resolve(response(phase==='image'?{source,code:x.product.code,productUrl:x.product.url,image:{data:downloaded,mimeType:'image/png'}}:{source,code:x.product.code,products:[x.product],warnings:[]}));await pending;x.render();assert.equal(x.button('Use image'),undefined);assert.equal(x.preview(),oldPhoto);assert.equal(x.requests.some(r=>stockRequest(r.url)),false);
  }
 });
 test(source+' rejects wrong-source products, private URLs and mismatched image responses',async()=>{
  const x=supplierHarness(source),p=x.product;x.setHandler(()=>response({source,code:p.code,products:[{...p,source:'capral'},{...p,url:'https://evil.test/products/example'},{...p,images:[{url:'https://www.csrassetlibrary.com/private/image.png'}]}],warnings:[]}));await x.find();assert.equal(x.button('Use image'),undefined);
  const y=supplierHarness(source);await y.find();y.setHandler(()=>response({source:'capral',code:p.code,productUrl:p.url,image:{data:downloaded,mimeType:'image/png'}}));await y.use();assert.equal(y.preview(),oldPhoto);assert.equal(y.created.length,0);
 });
}
test('older workers expose only the compatible Capral source',()=>{const x=harness();x.open();assert.deepEqual(walk(x.node('Image source')).filter(n=>n.type==='option').map(n=>n.props.value),['capral']);});


test('stock image source defaults to the saved material supplier and uses its existing code or name',()=>{
 for(const [supplier,source,label,expected] of [['Rondo','rondo','Rondo code','559'],['Rondo Building Services Pty Ltd','rondo','Rondo code','559'],['Capral Limited','capral','Capral code','559'],['CSR Gyprock','gyprock-trade','Gyprock product name','Easy Tape'],['Gyprock Trade','gyprock-trade','Gyprock product name','Easy Tape']]){
  const data=fixture();data.supplierReferenceLookupVersion=1;Object.assign(data.items[0],{supplier,sku:'559',name:'Easy Tape',details:''});const before=structuredClone(data),x=harness({data});x.open();assert.equal(x.node('Image source').props.value,source);assert.equal(x.node(label).props.value,expected);assert.deepEqual(x.states[0],before);assert.equal(x.requests.length,0);
 }
});
test('manual source choice persists until the material supplier changes',()=>{
 const data=fixture();data.supplierReferenceLookupVersion=1;Object.assign(data.items[0],{supplier:'Rondo',name:'Easy Tape'});const x=harness({data});x.open();x.node('Image source').props.onChange({target:{value:'capral'}});x.set('dimensions','40 x 40');assert.equal(x.node('Image source').props.value,'capral');x.set('supplier','CSR Gyprock');assert.equal(x.node('Image source').props.value,'gyprock-trade');assert.equal(x.node('Gyprock product name').props.value,'Easy Tape');assert.equal(x.states[0].items[0].supplier,'Rondo');assert.equal(x.preview(),oldPhoto);
});
test('changing the material supplier discards a late lookup and keeps the current photo',async()=>{
 const data=fixture();data.supplierReferenceLookupVersion=1;Object.assign(data.items[0],{supplier:'Rondo',sku:'129'});const x=harness({data}),wait=deferred();x.open();x.setHandler(()=>wait.promise);const pending=x.button('Find Rondo image').props.onClick();x.render();x.set('supplier','CSR Gyprock');wait.resolve(response({source:'rondo',code:'129',products:[supplierProduct('rondo')],warnings:[]}));await pending;x.render();assert.equal(x.node('Image source').props.value,'gyprock-trade');assert.equal(x.button('Use image'),undefined);assert.equal(x.preview(),oldPhoto);
});
test('an older backend retains its supported Capral source for a saved Rondo supplier',()=>{
 const data=fixture();data.items[0].supplier='Rondo';const x=harness({data});x.open();assert.equal(x.node('Image source').props.value,'capral');
});

test('expanded defaults require backend support and distinguish Woolloongabba from other bolt businesses',()=>{
 for(const [supplier,expected] of [['Knotwood','knotwood'],['Baker Packaging Pty Ltd','baker-packaging'],['Sculptform','sculptform'],['Nut & Bolt Factory WOOLLOONGABBA','gabbabolt'],['gabbabolt.com.au','gabbabolt'],['Nut & Bolt Factory Yatala','capral'],['Nut & Bolt Factory Toowoomba','capral'],['Nut & Bolt Factory','capral'],['Knotwood / Sculptform','capral']]){
  const data=fixture();Object.assign(data,{supplierReferenceLookupVersion:1,supplierReferenceSources:expansionSources});Object.assign(data.items[0],{supplier,sku:'38.041',name:'L Profile Base Trim'});const before=structuredClone(data),x=harness({data});x.open();assert.equal(x.node('Image source').props.value,expected,supplier);assert.deepEqual(x.states[0],before);assert.equal(x.requests.length,0);
  delete data.supplierReferenceSources;const old=harness({data});old.open();assert.equal(old.node('Image source').props.value,'capral',supplier+' on old backend');
 }
});
test('unverified supplier queries preserve punctuation and cannot offer guessed product images',async()=>{
 for(const [source,label] of [['baker-packaging','Baker Packaging'],['gabbabolt','Nut & Bolt Factory Woolloongabba']]){
  const data=fixture();Object.assign(data,{supplierReferenceLookupVersion:1,supplierReferenceSources:expansionSources});const x=harness({data});x.open();x.node('Image source').props.onChange({target:{value:source}});x.render();x.node(label+' code').props.onChange({target:{value:'038.041'}});x.render();x.setHandler(()=>response({source,code:'038.041',products:[],warnings:['Mapping unverified. Upload a verified item photo.']}));await x.button('Find '+label+' image').props.onClick();x.render();assert.equal(x.requests[0].body.code,'038.041');assert.equal(x.button('Use image'),undefined);assert.equal(x.preview(),oldPhoto);assert.equal(x.requests.length,1);
 }
});

test('Sculptform reviewed track codes prefill without changing supplier, SKU or existing image',async()=>{
 for(const code of ['cosmt45251b','cosmt45252b']){
  const data=fixture();Object.assign(data,{supplierReferenceLookupVersion:1,supplierReferenceSources:expansionSources});Object.assign(data.items[0],{supplier:'Sculptform',sku:code,name:'Balustrade Mounting Track'});const before=structuredClone(data),x=harness({data});
  const old=x.context.URL;x.context.URL=class extends URL{};x.context.URL.createObjectURL=old.createObjectURL;x.context.URL.revokeObjectURL=old.revokeObjectURL;
  x.open();assert.equal(x.node('Sculptform name or code').props.value,code);
  const p={source:'sculptform',code,title:'45 × 25 mm split track — assembly reference (both parts and clip shown)',url:'https://sculptform.com/aluminium-click-on-screens-tech-specs/',images:[{url:'https://sculptform.com/hs-fs/hubfs/COS-split-track-45x25mm.png?width=1948&name=COS-split-track-45x25mm.png'}],matchType:'assembly-reference'};
  x.setHandler(url=>response(url.endsWith('/search')?{source:'sculptform',code,products:[p],warnings:['Assembly reference only: both track parts and clip; finish unverified.']}:url.endsWith('/image')?{source:'sculptform',code,productUrl:p.url,image:{data:downloaded,mimeType:'image/png'}}:x.states[0]));
  await x.button('Find Sculptform image').props.onClick();x.render();assert.equal(x.preview(),oldPhoto);assert.ok(x.button('Use image'));assert.ok(x.render().some(n=>n.children.includes(p.title)));assert.deepEqual(x.states[0],before);
  await x.use();assert.equal(x.preview(),prepared);assert.equal(x.requests.some(r=>stockRequest(r.url)),false);const saved=await x.save();assert.equal(saved.image,prepared);assert.equal(saved.supplier,'Sculptform');assert.equal(saved.unitCost,12.34);assert.deepEqual(x.states[0],before);
 }
});
