const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../workshop-stock.js'),'utf8');
const requestPath=url=>new URL(url,'https://app.test').pathname;
const walk=n=>!n||typeof n!=='object'?[]:[n,...(n.children||[]).flat(Infinity).flatMap(walk)];
const stock=()=>({revision:7,materialImportPricingVersion:1,categories:{extrusions:'Extrusions',fixings:'Fixings',consumables:'Consumables',other:'Other',panels:'Panels',offcuts:'Offcuts'},stockReferences:[],items:[{id:'angle',name:'Warehouse angle',sku:'OUR-ANGLE',category:'extrusions',unit:'lengths',qty:7,reserved:2,available:5,colour:'Black',lengthMm:6000,dimensions:'30 x 30',unitCost:12},{id:'variant:sheet',name:'Sheet',category:'panels',legacy:true,unit:'sheets',qty:4},{id:'cut',name:'Offcut',category:'offcuts',unit:'lengths',qty:1}]});
const documentResult=()=>({ok:true,supplier:'Metals supplier',warnings:['Check the tape unit.'],lines:[{sku:'SUP-ANGLE',description:'Black angle',colour:'Black',dimensions:'30 x 30',lengthMm:6000,unit:'lengths',category:'extrusions',supplier:''},{sku:'TAPE',description:'Protective tape',colour:'',dimensions:'',lengthMm:null,unit:'rolls',category:'consumables',supplier:''},{sku:'IGNORE',description:'Excluded item',colour:'',dimensions:'',lengthMm:null,unit:'each',category:'other',supplier:''}]});
const capralPng='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jrXkAAAAASUVORK5CYII=';
const capralProduct={code:'815581',title:'EN7492(ME9395) 6060 T5 6.5m MF',url:'https://shop.capral.com.au/815581/',images:[{url:'https://cdn11.bigcommerce.com/s-gwvwsryafm/images/stencil/1280x1280/products/748/4449/angle.png',alt:'Angle profile'}]};
const capralSearch=()=>({code:'815581',products:[capralProduct],warnings:[]});
const capralImage=()=>({code:'815581',productUrl:capralProduct.url,image:{data:capralPng,mimeType:'image/png'}});
const ok=value=>({ok:true,json:async()=>value});
const waiting=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function harness({saved=null,admin=true,result=documentResult(),data=stock(),deferDecode=false}={}){
 const states=[],effects=[],requests=[],store=new Map(saved?[['panelstock:material-import-pending:/api:tester',JSON.stringify(saved)]]:[]),callbacks=[];let cursor=0,view=data;const decoders=[],revoked=[];class FakeImage{constructor(){this.naturalWidth=132;this.naturalHeight=113;decoders.push(this);}set src(value){if(!deferDecode)Promise.resolve().then(()=>this.onload());}}
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:value=>{const i=cursor++;if(!(i in states))states[i]=typeof value==='function'?value():value;return [states[i],value=>states[i]=typeof value==='function'?value(states[i]):value];},useEffect:fn=>effects.push(fn),Fragment:'fragment'};
 const context={window:{},TextEncoder,Blob,atob,Uint8Array,Image:FakeImage,URL:{createObjectURL:()=> 'blob:synthetic-capral',revokeObjectURL:value=>revoked.push(value)},document:{addEventListener(){},removeEventListener(){},createElement:()=>({getContext:()=>({fillRect(){},drawImage(){}}),toDataURL:()=>capralPng})},crypto:{randomUUID:()=> 'material-import-12345678'},PanelStock:{username:'tester'},FileReader:class{readAsDataURL(){this.result='data:application/pdf;base64,JVBERi0xLjc=';this.onload();}},localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)}};
 let handler=async(url,body)=>({ok:true,json:async()=>requestPath(url).endsWith('/analyse')?result:{...view,revision:8,importSummary:{created:1,matched:1}}});
 context.PanelStock.apiFetch=async(url,options)=>{const body=options?JSON.parse(options.body):undefined;if(requestPath(url).endsWith('/workshop-stock'))assert.equal(new URL(url,'https://app.test').searchParams.get('images'),'deferred');requests.push({url,body});return handler(url,body);};
 vm.runInNewContext(source,context);const C=context.window.createMaterialCatalogueImport(React),render=()=>{cursor=0;effects.length=0;return walk(C({workerUrl:'/api',isAdmin:admin,data:view,onSaved:value=>callbacks.push(value),onClose:()=>callbacks.push('close')}));};render();effects[1]();await tick();
 const row=key=>render().find(n=>n.props['data-import-row']===String(key)),button=label=>render().find(n=>n.type==='button'&&n.children.includes(label)),field=(key,label)=>walk(row(key)).find(n=>n.type==='label'&&n.children.includes(label)),control=(key,label)=>walk(field(key,label)).find(n=>['input','select','textarea'].includes(n.type));
 return {context,requests,store,callbacks,states,render,row,button,control,decoders,revoked,setHandler:value=>handler=value,choose(key,mode){control(key,'Action').props.onChange({target:{value:mode}});},set(key,label,value){control(key,label).props.onChange({target:{value}});},check(key,label,checked=true){control(key,label).props.onChange({target:{checked}});},confirm(){render().find(n=>n.props.className==='ws-po-import-confirm').children[0].props.onChange({target:{checked:true}});},async upload(name='materials.pdf',size=8){await render().find(n=>n.type==='input'&&n.props.type==='file').props.onChange({target:{files:[{name,size}],value:''}});},async submit(){await button(saved?'Retry saved import':'Import reviewed materials').props.onClick();}};
}
function prepare(x){
 walk(x.row(0)).find(n=>n.props.className==='ws-po-suggestion').props.onClick();
 x.choose(1,'create');x.choose(2,'skip');x.confirm();
}
const screenshotResult=()=>({supplier:'Capral Limited',warnings:[],lines:[{sku:'815581 EN7492(ME9395)',description:'815581 EN7492(ME9395) 6060 T5 6.5m MF ANGLE 70X40X1.6',name:'Angle',colour:'Mill Finish',dimensions:'70X40X1.6',lengthMm:6500,unit:'EA',stockUnit:'lengths',category:'extrusions',unitCost:29.59,priceUnit:'each',currency:'AUD',taxBasis:'exGST'}]});
const rowButton=(x,key,label)=>walk(x.row(key)).find(node=>node.type==='button'&&node.children.includes(label));
async function capralHarness(options={}){
 const x=await harness({result:screenshotResult(),data:{...stock(),capralReferenceLookupVersion:1},...options});await x.upload();x.choose(0,'create');
 x.setHandler(async(url)=>ok(url.endsWith('/search')?capralSearch():url.endsWith('/image')?capralImage():{...stock(),revision:8}));return x;
}
const findCapral=x=>rowButton(x,0,'Find Capral image').props.onClick();
const useCapral=x=>rowButton(x,0,'Use image').props.onClick();

test('PDF import suggests the exact numeric Capral SKU from the compound code without changing source or price',async()=>{
 const x=await capralHarness(),before=JSON.stringify(x.states[1]);assert.equal(x.control(0,'Capral code').props.value,'815581');await findCapral(x);
 assert.deepEqual(x.requests[1],{url:'/api/stock-images/capral/search',body:{code:'815581'}});assert.equal(JSON.stringify(x.states[1]),before);assert.ok(rowButton(x,0,'Use image'));assert.equal(x.control(0,'Stock code').props.value,'815581 EN7492(ME9395)');assert.equal(Number(x.control(0,'Unit cost (AUD ex GST, optional)').props.value),29.59);assert.equal(x.requests.some(r=>r.body?.action==='catalogue_import'),false);
});
test('a selected Capral photo stays in the PDF draft until explicit reviewed import and preserves code, zero stock and price',async()=>{
 const x=await capralHarness();await findCapral(x);x.confirm();await useCapral(x);assert.equal(x.states[1][0].item.image,capralPng);assert.equal(x.requests.length,3);assert.equal(x.button('Import reviewed materials').props.disabled,true);assert.ok(walk(x.row(0)).some(n=>n.type==='img'&&n.props.src===capralPng));x.confirm();await x.submit();
 const row=x.requests.at(-1).body.rows[0];assert.equal(row.item.image,capralPng);assert.equal(row.item.sku,'815581 EN7492(ME9395)');assert.equal(row.source.sku,row.item.sku);assert.equal(row.item.qty,0);assert.equal(row.item.unitCost,29.59);assert.equal(row.item.lengthMm,6500);assert.equal(row.item.dimensions,'70 x 40 x 1.6 mm');assert.equal(row.item.colour,'Mill Finish');assert.ok(!JSON.stringify(row).includes('https://'));assert.deepEqual(x.revoked,['blob:synthetic-capral']);
});
test('editing a PDF row or lookup code discards late search results and import waits for active lookup',async()=>{
 for(const edit of ['Capral code','Stock code','Colour / finish']){
  const x=await capralHarness(),wait=waiting();x.setHandler(()=>wait.promise);const pending=findCapral(x);x.render();x.confirm();assert.equal(x.button('Import reviewed materials').props.disabled,true);await x.submit();assert.equal(x.requests.length,2);x.set(0,edit,'CHANGED');wait.resolve(ok(capralSearch()));await pending;x.render();assert.equal(rowButton(x,0,'Use image'),undefined);assert.equal(x.states[1][0].item.image||'','');assert.equal(x.requests.some(r=>r.body?.action==='catalogue_import'),false);
 }
});
test('changing mode, replacing the PDF or closing import invalidates late image downloads',async()=>{
 for(const action of ['mode','replace','close']){
  const x=await capralHarness();await findCapral(x);const wait=waiting();x.setHandler(()=>wait.promise);const pending=useCapral(x);x.render();if(action==='mode')x.choose(0,'skip');else if(action==='replace'){x.setHandler(()=>Promise.resolve(ok(screenshotResult())));await x.upload('replacement.pdf');}else x.button('Close').props.onClick();wait.resolve(ok(capralImage()));await pending;x.render();assert.equal(x.states[1].some(row=>row.item?.image),false);assert.equal(x.requests.some(r=>r.body?.action==='catalogue_import'),false);
 }
});
test('cancelling image decoding releases its object URL without staging a PDF photo',async()=>{
 const x=await capralHarness({deferDecode:true});await findCapral(x);const pending=useCapral(x);await tick();x.render();assert.equal(x.decoders.length,1);rowButton(x,0,'Cancel Capral lookup').props.onClick();x.render();x.decoders[0].onload();await pending;x.render();assert.equal(x.states[1][0].item.image||'','');assert.deepEqual(x.revoked,['blob:synthetic-capral']);assert.equal(rowButton(x,0,'Use image'),undefined);
});
test('wrong-code, wrong-product and failed downloads leave the prior PDF photo and price intact',async()=>{
 for(const result of [ok({...capralImage(),code:'815582'}),ok({...capralImage(),productUrl:'https://shop.capral.com.au/815582/'}),{ok:false,status:503,json:async()=>({error:'Download unavailable'})}]){
  const x=await capralHarness();await findCapral(x);await useCapral(x);await findCapral(x);const before=JSON.stringify(x.states[1]);x.setHandler(()=>Promise.resolve(result));await useCapral(x);assert.equal(JSON.stringify(x.states[1]),before);assert.ok(walk(x.row(0)).some(n=>n.props.role==='alert'));assert.equal(x.requests.some(r=>r.body?.action==='catalogue_import'),false);
 }
});
test('import image search filters untrusted hosts and wrong product codes before displaying results',async()=>{
 const x=await capralHarness();x.setHandler(()=>Promise.resolve(ok({...capralSearch(),products:[{...capralProduct,code:'815582'},{...capralProduct,url:'https://evil.test/815581/'},{...capralProduct,images:[{url:'https://cdn11.bigcommerce.com/s-other/images/stencil/angle.png'}]},capralProduct]})));await findCapral(x);assert.equal(walk(x.row(0)).filter(n=>n.type==='button'&&n.children.includes('Use image')).length,1);assert.ok(!walk(x.row(0)).some(n=>n.props.src?.includes('s-other')||n.props.href?.includes('evil.test')));
});
test('PDF lookup requires the backend capability and is absent for matched or existing shared profiles',async()=>{
 const old=await capralHarness({data:stock()});assert.equal(rowButton(old,0,'Find Capral image'),undefined);
 const match=await capralHarness();match.choose(0,'match');assert.equal(rowButton(match,0,'Find Capral image'),undefined);
 const shared=await capralHarness();shared.set(0,'Stock code','OUR-ANGLE');assert.equal(rowButton(shared,0,'Find Capral image'),undefined);
});
test('removing or reassigning a selected PDF photo never changes the row price',async()=>{
 const x=await capralHarness();await findCapral(x);await useCapral(x);rowButton(x,0,'Remove selected image').props.onClick();assert.equal(x.states[1][0].item.image,'');await findCapral(x);await useCapral(x);x.set(0,'Stock code','NEW-CODE');assert.equal(x.states[1][0].item.image,'');assert.equal(Number(x.control(0,'Unit cost (AUD ex GST, optional)').props.value),29.59);
});
test('an uncertain PDF import retries the same selected image and mutation without downloading again',async()=>{
 const x=await capralHarness();await findCapral(x);await useCapral(x);x.confirm();x.setHandler(async()=>({ok:false,status:503,json:async()=>({error:'Save unconfirmed'})}));await x.submit();const original=structuredClone(x.requests.at(-1).body);assert.equal(original.rows[0].item.image,capralPng);assert.ok(x.button('Retry saved import'));x.setHandler(async()=>ok({...stock(),revision:8}));await x.button('Retry saved import').props.onClick();assert.deepEqual(x.requests.at(-1).body,original);assert.equal(x.requests.filter(r=>r.url.endsWith('/image')).length,1);assert.equal(x.store.size,0);
});
test('new PDF variants share a selected profile photo while each retains its own colour, length and price',async()=>{
 const result=screenshotResult();result.lines.push({...result.lines[0],colour:'Black',description:'Black angle',unitCost:31.20});
 const x=await capralHarness({result});x.choose(1,'create');await findCapral(x);await useCapral(x);assert.ok(x.states[1].every(row=>row.item.image===capralPng));assert.equal(x.states[1][0].item.colour,'Mill Finish');assert.equal(x.states[1][1].item.colour,'Black');assert.equal(Number(x.states[1][0].item.unitCost),29.59);assert.equal(Number(x.states[1][1].item.unitCost),31.20);
 rowButton(x,1,'Remove selected image').props.onClick();assert.ok(x.states[1].every(row=>row.item.image===''));
});
test('editing a different PDF row does not discard another row’s active Capral lookup',async()=>{
 const result=screenshotResult();result.lines.push({...result.lines[0],sku:'OTHER',description:'Other angle'});
 const x=await capralHarness({result});x.choose(1,'create');const wait=waiting();x.setHandler(()=>wait.promise);const pending=findCapral(x);x.render();x.set(1,'Colour / finish','White');wait.resolve(ok(capralSearch()));await pending;assert.ok(rowButton(x,0,'Use image'));assert.equal(rowButton(x,1,'Use image'),undefined);
});

test('PDF import offers the gallery photo before the diagram and imports only the explicit photo selection',async()=>{
 const photo='https://store-gwvwsryafm.mybigcommerce.com/content/product/ANGLE_6.jpg',diagram=capralProduct.images[0].url,official={...capralProduct,images:[{url:photo,alt:'Product photo'},{url:diagram,alt:'Profile diagram'}]},x=await capralHarness();
 x.setHandler(url=>Promise.resolve(ok(url.endsWith('/search')?{...capralSearch(),products:[official]}:url.endsWith('/image')?capralImage():{...stock(),revision:8})));await findCapral(x);
 assert.deepEqual(walk(x.row(0)).filter(node=>node.type==='img'&&[photo,diagram].includes(node.props.src)).map(node=>node.props.src),[photo,diagram]);assert.equal(walk(x.row(0)).filter(node=>node.type==='button'&&node.children.includes('Use image')).length,2);
 await useCapral(x);assert.equal(x.requests.at(-1).body.imageUrl,photo);assert.equal(x.requests.some(r=>r.body?.action==='catalogue_import'),false);x.confirm();await x.submit();const item=x.requests.at(-1).body.rows[0].item;assert.equal(item.image,capralPng);assert.equal(item.qty,0);assert.equal(item.unitCost,29.59);assert.equal(item.sku,'815581 EN7492(ME9395)');
});
test('PDF review matches existing stock, creates selected zero-stock materials and skips unchecked rows',async()=>{
 const x=await harness();await x.upload();assert.equal(x.requests.length,1);assert.equal(x.requests[0].url,'/api/material-catalogue/analyse');assert.deepEqual(Object.keys(x.requests[0].body),['name','data']);
 assert.equal(x.button('Import reviewed materials').props.disabled,true);prepare(x);assert.equal(x.button('Import reviewed materials').props.disabled,false);
 await x.submit();const body=x.requests[1].body;assert.equal(body.action,'catalogue_import');assert.equal(body.expectedRevision,7);assert.equal(body.rows.length,2);assert.equal(body.rows[0].itemId,'angle');assert.equal(body.rows[0].remember,true);assert.equal(body.rows[0].source.sku,'SUP-ANGLE');assert.equal(body.rows[0].item,undefined);assert.equal(body.rows[0].priceUpdate,undefined);assert.equal(body.rows[1].mode,'create');assert.equal(body.rows[1].item.qty,0);assert.equal(body.rows[1].item.unit,'rolls');assert.equal(body.rows[1].item.unitCost,undefined);assert.ok(!JSON.stringify(body).includes('JVBER'));assert.equal(x.callbacks.length,1);assert.equal(x.store.size,0);
});
test('PDF type/size and read-only permissions reject before the reader request',async()=>{
 const x=await harness();await x.upload('wrong.xlsx');await x.upload('large.pdf',5*1024*1024+1);assert.equal(x.requests.length,0);
 const reader=await harness({admin:false});assert.ok(reader.render().some(n=>n.props.role==='alert'));assert.ok(!reader.render().some(n=>n.type==='input'));assert.equal(reader.requests.length,0);
});
test('matching search spans stock fields and excludes panels/offcuts',async()=>{
 const x=await harness();await x.upload();x.choose(0,'match');x.set(0,'Find current stock','Warehouse Black');const options=walk(x.control(0,'Current stock item')).filter(n=>n.type==='option');assert.ok(options.some(n=>n.props.value==='angle'));assert.ok(!options.some(n=>['variant:sheet','cut'].includes(n.props.value)));
});
test('supplier changes clear prior selections and review while unknown units must be chosen',async()=>{
 const result=documentResult();result.lines[1].unit='';const x=await harness({result});await x.upload();prepare(x);assert.equal(x.button('Import reviewed materials').props.disabled,true);x.set(1,'Stock unit','rolls');x.confirm();assert.equal(x.button('Import reviewed materials').props.disabled,false);
 const field=x.render().find(n=>n.type==='label'&&n.children.includes('Default supplier'));walk(field).find(n=>n.type==='input').props.onChange({target:{value:'Other supplier'}});assert.equal(x.control(0,'Action').props.value,'review');assert.equal(x.render().find(n=>n.props.className==='ws-po-import-confirm').children[0].props.checked,false);
});
test('duplicate stock variants and duplicate source rows require review before any save',async()=>{
 const result=documentResult();result.lines[1]={...result.lines[0]};const x=await harness({result});await x.upload();x.choose(0,'create');x.choose(1,'create');x.choose(2,'skip');x.confirm();assert.equal(x.button('Import reviewed materials').props.disabled,true);assert.ok(x.render().some(n=>n.children.includes('This supplier row is repeated in the PDF. Skip the duplicate row.')));assert.equal(x.requests.length,1);
});
test('an uncertain save retains and retries the exact original import once',async()=>{
 const x=await harness();await x.upload();prepare(x);x.setHandler(async()=>({ok:false,status:503,json:async()=>({error:'Unavailable'})}));await x.submit();const original=x.requests[1].body;assert.ok(x.button('Retry saved import'));assert.equal(x.store.size,1);
 x.setHandler(async()=>({ok:true,json:async()=>({...stock(),revision:8})}));await x.button('Retry saved import').props.onClick();assert.deepEqual(x.requests[2].body,original);assert.equal(x.store.size,0);assert.equal(x.callbacks.length,1);
});
test('stock conflict clears confirmation and requires a fresh review without silently resubmitting',async()=>{
 const x=await harness();await x.upload();prepare(x);x.setHandler(async()=>({ok:false,status:409,json:async()=>({error:'Stock changed'})}));await x.submit();assert.equal(x.store.size,0);assert.equal(x.button('Import reviewed materials').props.disabled,true);assert.ok(x.button('Refresh stock matches'));
 x.setHandler(async()=>({ok:true,json:async()=>({...stock(),revision:8})}));await x.button('Refresh stock matches').props.onClick();assert.equal(x.control(0,'Action').props.value,'review');assert.equal(x.requests.filter(r=>r.body?.action==='catalogue_import').length,1);assert.equal(x.button('Import reviewed materials').props.disabled,true);
});
test('saved imports recover after reopening and malformed recovery stays blocked',async()=>{
 const saved={action:'catalogue_import',fileName:'materials.pdf',expectedRevision:7,mutationId:'saved-material-import-1',rows:[{key:'0',mode:'match',source:{sku:'SUP',description:'Angle'},itemId:'angle'}]};const x=await harness({saved});assert.ok(x.button('Retry saved import'));await x.submit();assert.deepEqual(x.requests[0].body,saved);
 const corrupt=await harness({saved:{action:'catalogue_import'}});assert.ok(corrupt.render().some(n=>n.children.some(c=>typeof c==='string'&&c.includes('saved import could not be recovered'))));assert.equal(corrupt.requests.length,0);assert.equal(corrupt.render().find(n=>n.type==='input'&&n.props.type==='file').props.disabled,true);
});
test('existing supplier alias versions are sent with a confirmed match',async()=>{
 const x=await harness();const sourceRow=documentResult().lines[0],key=x.context.window.purchaseOrderStockKey('Metals supplier',sourceRow);x.states[0].stockReferences=[{key,source:sourceRow,supplier:'Metals supplier',itemId:'angle',itemIdentity:x.context.window.purchaseOrderItemIdentity(x.states[0].items[0]),version:3}];await x.upload();x.choose(1,'skip');x.choose(2,'skip');x.confirm();await x.submit();assert.equal(x.requests[1].body.rows[0].expectedReferenceVersion,3);assert.equal(x.requests[1].body.rows[0].expectedItemIdentity,x.context.window.purchaseOrderItemIdentity(stock().items[0]));
});

test('existing profiles keep shared definitions and require a distinct variant for creation',async()=>{
 const result=documentResult();result.lines[0].sku='OUR-ANGLE';const x=await harness({result});await x.upload();x.choose(0,'create');x.choose(1,'skip');x.choose(2,'skip');x.confirm();assert.equal(x.button('Import reviewed materials').props.disabled,true);assert.ok(x.render().some(n=>n.children.includes('This code, colour and length already exists. Match the current stock item.')));
 assert.equal(x.control(0,'Material name').props.value,'Warehouse angle');for(const label of ['Material name','Category','Stock unit','Dimensions / profile'])assert.equal(x.control(0,label).props.disabled,true);
 x.set(0,'Colour / finish','White');x.confirm();assert.equal(x.button('Import reviewed materials').props.disabled,false);await x.submit();assert.equal(x.requests[1].body.rows[0].item.name,'Warehouse angle');assert.equal(x.requests[1].body.rows[0].item.qty,0);
});

test('blank source rows and conflicting new profiles are blocked before saving',async()=>{
 const result=documentResult();result.lines[0]={...result.lines[0],sku:'',description:''};const x=await harness({result});await x.upload();x.choose(0,'create');x.set(0,'Material name','Manually named material');x.choose(1,'skip');x.choose(2,'skip');x.confirm();assert.equal(x.button('Import reviewed materials').props.disabled,true);assert.ok(x.render().some(n=>n.children.includes('No code or description was read. Skip this row and add it manually.')));
 const repeated=documentResult();repeated.lines[0].sku='NEW';repeated.lines[1].sku='NEW';const y=await harness({result:repeated});await y.upload();y.choose(0,'create');y.choose(1,'create');y.choose(2,'skip');y.confirm();assert.ok(y.render().some(n=>n.children.includes('New variants with this code must use the same material name, category, stock unit and profile dimensions.')));assert.equal(y.requests.length,1);
});

const pdfPriceLabel='Use PDF price for this existing material';
const unitCostLabel='Unit cost (AUD ex GST, optional)';
const pricedResult=(patch={})=>({ok:true,supplier:'Example Metals',warnings:[],lines:[{sku:'SYN-ANGLE-32',description:'ANGLE 32x20x1.6 6500 mm Mill Finish — full supplier description',colour:'Mill Finish',dimensions:'32x20x1.6',lengthMm:6500,unit:'EA',category:'extrusions',supplier:'',name:'Angle',stockUnit:'lengths',unitCost:12.02,priceUnit:'EA',currency:'AUD',taxBasis:'exGST',...patch}]});
const pricedStock=(patch={})=>({...stock(),stocktakeSettings:{revision:2,cosGroups:[{id:'materials',label:'Materials',accountCode:'410'}]},items:[{...stock().items[0],colour:'Mill Finish',lengthMm:6500,dimensions:'32 x 20 x 1.6 mm',supplier:'Warehouse supplier',details:'Existing warehouse notes',xeroGroup:'materials',costBasis:'unit',...patch}]});
async function selectPriceMatch(options={}){const x=await harness({result:pricedResult(),data:pricedStock(),...options});await x.upload();x.choose(0,'match');x.set(0,'Current stock item','angle');return x;}

test('converter suggestions populate editable new-material fields while keeping raw PDF evidence',async()=>{
 const result=pricedResult(),x=await harness({result,data:pricedStock()});await x.upload();x.choose(0,'create');
 assert.equal(x.control(0,'Material name').props.value,'Angle');assert.equal(x.control(0,'Stock unit').props.value,'lengths');assert.equal(x.control(0,'Colour / finish').props.value,'Mill Finish');assert.equal(x.control(0,'Length (mm)').props.value,6500);assert.equal(x.control(0,'Dimensions / profile').props.value,'32 x 20 x 1.6 mm');
 assert.equal(x.control(0,'Additional notes').type,'textarea');assert.equal(x.control(0,'Additional notes').props.value,result.lines[0].description);assert.equal(x.control(0,'Xero stock group').props.value,'');assert.equal(Number(x.control(0,unitCostLabel).props.value),12.02);
 assert.ok(walk(x.control(0,'Xero stock group')).some(n=>n.type==='option'&&n.props.value==='materials'));for(const label of ['Material name','Stock unit','Colour / finish','Length (mm)','Dimensions / profile','Additional notes','Xero stock group',unitCostLabel])assert.equal(x.control(0,label).props.disabled,false,label);
 x.set(0,'Additional notes','Reviewed supplier notes');x.set(0,'Xero stock group','materials');x.confirm();assert.equal(x.button('Import reviewed materials').props.disabled,false);await x.submit();
 const row=x.requests[1].body.rows[0];assert.equal(row.item.name,'Angle');assert.equal(row.item.unit,'lengths');assert.equal(row.item.unitCost,12.02);assert.equal(row.item.lengthMm,6500);assert.equal(row.item.qty,0);assert.equal(row.item.details,'Reviewed supplier notes');assert.equal(row.item.xeroGroup,'materials');assert.equal(row.item.dimensions,'32 x 20 x 1.6 mm');
 for(const key of ['sku','description','colour','dimensions','lengthMm','unit','category','name','stockUnit','unitCost','priceUnit','currency','taxBasis'])assert.deepEqual(row.source[key],result.lines[0][key],key);assert.equal(row.source.unit,'EA');assert.equal(row.priceUpdate,undefined);
});

test('existing profile creation keeps shared identity and inherits its Xero stock group',async()=>{
 const x=await harness({result:pricedResult({sku:'OUR-ANGLE',colour:'White'}),data:pricedStock()});await x.upload();x.choose(0,'create');
 assert.equal(x.control(0,'Material name').props.value,'Warehouse angle');assert.equal(x.control(0,'Xero stock group').props.value,'materials');for(const label of ['Material name','Category','Stock unit','Dimensions / profile'])assert.equal(x.control(0,label).props.disabled,true,label);
 x.set(0,'Additional notes','New colour variant');x.confirm();assert.equal(x.button('Import reviewed materials').props.disabled,false);await x.submit();const item=x.requests[1].body.rows[0].item;assert.equal(item.name,'Warehouse angle');assert.equal(item.sku,'OUR-ANGLE');assert.equal(item.category,'extrusions');assert.equal(item.unit,'lengths');assert.equal(item.dimensions,'32 x 20 x 1.6 mm');assert.equal(item.xeroGroup,'materials');assert.equal(item.unitCost,12.02);assert.equal(item.qty,0);
});

test('a PDF profile that conflicts with an existing stock code requires review before creation',async()=>{
 const x=await harness({result:pricedResult({sku:'OUR-ANGLE'}),data:stock()});await x.upload();x.choose(0,'create');assert.equal(x.control(0,'Material name').props.value,'Warehouse angle');assert.equal(x.control(0,'Dimensions / profile').props.value,'30 x 30');assert.equal(x.control(0,unitCostLabel).props.value,'');x.confirm();assert.equal(x.button('Import reviewed materials').props.disabled,true);await x.submit();assert.equal(x.requests.length,1);
});

test('changing a conflicting shared stock code restores PDF identity and keeps reviewed variant fields',async()=>{
 const data=pricedStock({dimensions:'30 x 30',category:'consumables',unit:'rolls'});data.stocktakeSettings.cosGroups.push({id:'reviewed',label:'Reviewed materials',accountCode:'420'});const x=await harness({result:pricedResult({sku:'OUR-ANGLE'}),data});await x.upload();x.choose(0,'create');x.confirm();assert.equal(x.button('Import reviewed materials').props.disabled,true);assert.equal(x.control(0,'Dimensions / profile').props.value,'30 x 30');
 x.set(0,'Additional notes','Checked against the supplier list');x.set(0,'Xero stock group','reviewed');x.set(0,'Colour / finish','mill finish');x.set(0,'Length (mm)','6500');x.set(0,'Stock code','NEW-SKU');
 assert.equal(x.control(0,'Material name').props.value,'Angle');assert.equal(x.control(0,'Category').props.value,'extrusions');assert.equal(x.control(0,'Stock unit').props.value,'lengths');assert.equal(x.control(0,'Dimensions / profile').props.value,'32 x 20 x 1.6 mm');assert.equal(Number(x.control(0,unitCostLabel).props.value),12.02);for(const label of ['Material name','Category','Stock unit','Dimensions / profile'])assert.equal(x.control(0,label).props.disabled,false,label);
 assert.equal(x.control(0,'Additional notes').props.value,'Checked against the supplier list');assert.equal(x.control(0,'Xero stock group').props.value,'reviewed');assert.equal(x.control(0,'Colour / finish').props.value,'mill finish');assert.equal(x.control(0,'Length (mm)').props.value,'6500');x.confirm();assert.equal(x.button('Import reviewed materials').props.disabled,false);await x.submit();const item=x.requests[1].body.rows[0].item;assert.equal(item.sku,'NEW-SKU');assert.equal(item.name,'Angle');assert.equal(item.dimensions,'32 x 20 x 1.6 mm');assert.equal(item.unitCost,12.02);assert.equal(item.details,'Checked against the supplier list');assert.equal(item.xeroGroup,'reviewed');assert.equal(item.colour,'mill finish');assert.equal(item.lengthMm,6500);
});

test('leaving a conflicting shared profile preserves manual finish and length without carrying over the PDF price',async()=>{
 const x=await harness({result:pricedResult({sku:'OUR-ANGLE'}),data:pricedStock({dimensions:'30 x 30'})});await x.upload();x.choose(0,'create');x.set(0,'Colour / finish','White');x.set(0,'Length (mm)','7000');x.set(0,'Additional notes','Variant reviewed separately');x.set(0,'Xero stock group','');x.set(0,'Stock code','NEW-SKU');assert.equal(x.control(0,'Dimensions / profile').props.value,'32 x 20 x 1.6 mm');assert.equal(x.control(0,'Colour / finish').props.value,'White');assert.equal(x.control(0,'Length (mm)').props.value,'7000');assert.equal(x.control(0,'Additional notes').props.value,'Variant reviewed separately');assert.equal(x.control(0,'Xero stock group').props.value,'');assert.equal(x.control(0,unitCostLabel).props.value,'');x.confirm();assert.equal(x.button('Import reviewed materials').props.disabled,false);await x.submit();const row=x.requests[1].body.rows[0];assert.equal(row.item.colour,'White');assert.equal(row.item.lengthMm,7000);assert.equal(row.item.unitCost,undefined);assert.equal(row.source.colour,'Mill Finish');assert.equal(row.source.lengthMm,6500);
});

test('reviewers can correct new-material dimensions while the PDF price and source remain separate',async()=>{
 const x=await harness({result:pricedResult({sku:'OUR-ANGLE'}),data:stock()});await x.upload();x.choose(0,'create');x.confirm();assert.equal(x.button('Import reviewed materials').props.disabled,true);assert.equal(x.control(0,'Dimensions / profile').props.value,'30 x 30');x.set(0,'Stock code','NEW-SKU');assert.equal(x.control(0,'Dimensions / profile').props.value,'32 x 20 x 1.6 mm');x.set(0,'Dimensions / profile','40 x 40 x 3 mm');assert.equal(x.control(0,unitCostLabel).props.value,'');x.confirm();assert.equal(x.button('Import reviewed materials').props.disabled,false);await x.submit();const row=x.requests[1].body.rows[0];assert.equal(row.item.dimensions,'40 x 40 x 3 mm');assert.equal(row.item.unitCost,undefined);assert.equal(row.source.dimensions,'32x20x1.6');
});

test('shortening a legacy PDF material name keeps its full description in notes without remembering the supplier',async t=>{
 for(const mode of ['missing','blank'])await t.test(mode,async()=>{const result=pricedResult({name:'',description:'ANGLE 32x20x1.6 6500 mm Mill Finish. Full supplier description includes the surface specification, profile description and handling information for manual review.'});if(mode==='missing')delete result.lines[0].name;const x=await harness({result});await x.upload();x.choose(0,'create');x.set(0,'Material name','Angle');x.check(0,'Remember supplier details against this stock item',false);assert.equal(x.control(0,'Additional notes').props.value,result.lines[0].description);x.confirm();assert.equal(x.button('Import reviewed materials').props.disabled,false);await x.submit();const row=x.requests[1].body.rows[0];assert.equal(row.remember,false);assert.equal(row.item.name,'Angle');assert.equal(row.item.details,result.lines[0].description);assert.equal(row.source.description,result.lines[0].description);});
});

test('unknown currency, tax and quantity basis leave new materials unpriced',async t=>{
 for(const [label,patch,targetUnit]of [['unknown currency',{currency:''}],['foreign currency',{currency:'USD'}],['GST included',{taxBasis:'incGST'}],['unknown tax',{taxBasis:'unknown'}],['metre price for a length',{priceUnit:'metres'}],['no price unit',{priceUnit:''}],['EA price without a full-length stock suggestion',{stockUnit:''},'lengths'],['no full-length measurement',{lengthMm:null}],['length price without a measured full length',{unit:'lengths',priceUnit:'lengths',lengthMm:null}],['no price',{unitCost:null}]])await t.test(label,async()=>{
  const x=await harness({result:pricedResult(patch)});await x.upload();x.choose(0,'create');if(targetUnit)x.set(0,'Stock unit',targetUnit);assert.equal(x.control(0,unitCostLabel).props.value,'');x.confirm();assert.equal(x.button('Import reviewed materials').props.disabled,false);await x.submit();assert.equal(x.requests[1].body.rows[0].item.unitCost,undefined);
 });
});

test('zero PDF price is valid and changing stock basis only clears the suggested price',async()=>{
 const free=await harness({result:pricedResult({unitCost:0})});await free.upload();free.choose(0,'create');assert.equal(Number(free.control(0,unitCostLabel).props.value),0);assert.notEqual(free.control(0,unitCostLabel).props.value,'');free.confirm();await free.submit();assert.equal(free.requests[1].body.rows[0].item.unitCost,0);
 const x=await harness({result:pricedResult()});await x.upload();x.choose(0,'create');x.set(0,'Stock unit','metres');assert.equal(x.control(0,unitCostLabel).props.value,'');x.set(0,'Stock unit','lengths');assert.equal(Number(x.control(0,unitCostLabel).props.value),12.02);x.set(0,unitCostLabel,'4.50');x.set(0,'Stock unit','metres');assert.equal(x.control(0,unitCostLabel).props.value,'4.50');x.set(0,'Stock unit','lengths');assert.equal(x.control(0,unitCostLabel).props.value,'4.50');x.confirm();await x.submit();assert.equal(x.requests[1].body.rows[0].item.unitCost,4.5);
});

test('matching existing stock leaves price unchanged until the PDF price checkbox is selected',async()=>{
 const x=await selectPriceMatch();assert.equal(x.control(0,pdfPriceLabel).props.checked,false);assert.equal(x.control(0,pdfPriceLabel).props.disabled,false);x.confirm();await x.submit();const unchanged=x.requests[1].body.rows[0];assert.equal(unchanged.priceUpdate,undefined);assert.equal(unchanged.item,undefined);
 const y=await selectPriceMatch();y.check(0,pdfPriceLabel);y.confirm();await y.submit();const row=y.requests[1].body.rows[0];assert.deepEqual(row.priceUpdate,{unitCost:12.02,expectedUnitCost:12});assert.equal(row.itemId,'angle');assert.equal(row.expectedItemIdentity,y.context.window.purchaseOrderItemIdentity(pricedStock().items[0]));for(const key of ['item','qty','name','details','xeroGroup'])assert.equal(row[key],undefined,key);assert.equal(row.source.description,pricedResult().lines[0].description);assert.equal(row.source.unit,'EA');
});

test('matching price updates require the server pricing capability',async()=>{
 const data=pricedStock();delete data.materialImportPricingVersion;const x=await selectPriceMatch({data}),checkbox=x.control(0,pdfPriceLabel);assert.ok(!checkbox||checkbox.props.disabled);x.confirm();assert.equal(x.button('Import reviewed materials').props.disabled,false);await x.submit();assert.equal(x.requests[1].body.rows[0].priceUpdate,undefined);
});

test('a zero price with an explicit each basis can be selected for a matching full length',async()=>{
 const x=await selectPriceMatch({result:pricedResult({unitCost:0,priceUnit:'each'})});assert.equal(x.control(0,pdfPriceLabel).props.disabled,false);assert.equal(x.control(0,pdfPriceLabel).props.checked,false);x.check(0,pdfPriceLabel);x.confirm();await x.submit();assert.deepEqual(x.requests[1].body.rows[0].priceUpdate,{unitCost:0,expectedUnitCost:12});
});

test('a matching full bar already stocked as each can use its printed each price',async()=>{
 const data=pricedStock({unit:'each'}),x=await selectPriceMatch({data});assert.equal(x.control(0,pdfPriceLabel).props.disabled,false);x.check(0,pdfPriceLabel);x.confirm();await x.submit();const row=x.requests[1].body.rows[0];assert.deepEqual(row.priceUpdate,{unitCost:12.02,expectedUnitCost:12});assert.equal(row.source.unit,'EA');assert.equal(row.source.stockUnit,'lengths');assert.equal(row.expectedItemIdentity,x.context.window.purchaseOrderItemIdentity(data.items[0]));assert.equal(row.item,undefined);assert.equal(row.qty,undefined);assert.equal(data.items[0].unit,'each');
});

test('unpriced existing materials send an explicit null expected price',async t=>{
 for(const mode of ['null','missing'])await t.test(mode,async()=>{const data=pricedStock({unitCost:null});if(mode==='missing')delete data.items[0].unitCost;const x=await selectPriceMatch({data});x.check(0,pdfPriceLabel);x.confirm();await x.submit();assert.deepEqual(x.requests[1].body.rows[0].priceUpdate,{unitCost:12.02,expectedUnitCost:null});});
});

test('an uncertain price update retries the original reviewed price and expected price',async()=>{
 const x=await selectPriceMatch();x.check(0,pdfPriceLabel);x.confirm();x.setHandler(async()=>({ok:false,status:503,json:async()=>({error:'Unavailable'})}));await x.submit();const original=x.requests[1].body;assert.deepEqual(original.rows[0].priceUpdate,{unitCost:12.02,expectedUnitCost:12});assert.equal(x.store.size,1);x.setHandler(async()=>({ok:true,json:async()=>({...pricedStock({unitCost:12.02}),revision:8})}));await x.button('Retry saved import').props.onClick();assert.deepEqual(x.requests[2].body,original);assert.equal(x.store.size,0);assert.equal(x.callbacks.length,1);
});

test('matched PDF prices are unavailable for uncertain prices and conflicting stock bases',async t=>{
 for(const [label,patch,sourcePatch={}]of [['pack cost',{costBasis:'pack',packCost:30,packSize:3}],['area cost',{costBasis:'area'}],['different stock unit',{unit:'metres'}],['different full length',{lengthMm:6000}],['different profile dimensions',{dimensions:'25 x 25 x 3 mm'}],['different finish',{colour:'White'}],['unknown currency',{}, {currency:''}],['GST included',{}, {taxBasis:'incGST'}],['metre price for a length',{}, {priceUnit:'metres'}],['length price without a measured source full length',{}, {unit:'lengths',priceUnit:'lengths',lengthMm:null}],['length price without a measured stock full length',{lengthMm:null}, {unit:'lengths',priceUnit:'lengths'}],['each stock without a measured source full length',{unit:'each'}, {lengthMm:null}],['each stock without a measured stock full length',{unit:'each',lengthMm:null}]])await t.test(label,async()=>{
  const x=await selectPriceMatch({data:pricedStock(patch),result:pricedResult(sourcePatch)}),checkbox=x.control(0,pdfPriceLabel);assert.ok(!checkbox||checkbox.props.disabled,label);x.confirm();assert.equal(x.button('Import reviewed materials').props.disabled,false);await x.submit();assert.equal(x.requests[1].body.rows[0].priceUpdate,undefined);
 });
});

test('changing match context requires a fresh PDF price selection',async t=>{
 const supplierField=x=>walk(x.render().find(n=>n.type==='label'&&n.children.includes('Default supplier'))).find(n=>n.type==='input');
 for(const [label,change]of [['row supplier',x=>x.set(0,'Row supplier','Other Metals')],['default supplier',x=>supplierField(x).props.onChange({target:{value:'Other Metals'}})],['selected item',x=>{x.set(0,'Current stock item','');x.set(0,'Current stock item','angle');}],['row action',x=>{x.choose(0,'skip');x.choose(0,'match');x.set(0,'Current stock item','angle');}]])await t.test(label,async()=>{
  const x=await selectPriceMatch();x.check(0,pdfPriceLabel);x.confirm();change(x);assert.equal(x.render().find(n=>n.props.className==='ws-po-import-confirm').children[0].props.checked,false);if(x.control(0,'Action').props.value!=='match'){x.choose(0,'match');x.set(0,'Current stock item','angle');}assert.equal(x.control(0,pdfPriceLabel).props.checked,false);x.confirm();await x.submit();assert.equal(x.requests[1].body.rows[0].priceUpdate,undefined);
 });
});

test('stock conflict refresh clears any prior PDF price approval',async()=>{
 const x=await selectPriceMatch();x.check(0,pdfPriceLabel);x.confirm();x.setHandler(async()=>({ok:false,status:409,json:async()=>({error:'Stock changed'})}));await x.submit();assert.equal(x.store.size,0);x.setHandler(async()=>({ok:true,json:async()=>({...pricedStock({unitCost:18}),revision:8})}));await x.button('Refresh stock matches').props.onClick();x.choose(0,'match');x.set(0,'Current stock item','angle');assert.equal(x.control(0,pdfPriceLabel).props.checked,false);x.check(0,pdfPriceLabel);x.confirm();await x.submit();assert.deepEqual(x.requests[3].body.rows[0].priceUpdate,{unitCost:12.02,expectedUnitCost:18});
});

test('replacing the PDF clears price approval and requires review of the new amount',async()=>{
 const x=await selectPriceMatch();x.check(0,pdfPriceLabel);x.confirm();x.setHandler(async url=>({ok:true,json:async()=>requestPath(url).endsWith('/analyse')?pricedResult({unitCost:9.25}):{...pricedStock(),revision:8}}));await x.upload('revised-materials.pdf');x.choose(0,'match');x.set(0,'Current stock item','angle');assert.equal(x.control(0,pdfPriceLabel).props.checked,false);assert.equal(x.render().find(n=>n.props.className==='ws-po-import-confirm').children[0].props.checked,false);x.check(0,pdfPriceLabel);x.confirm();await x.submit();assert.deepEqual(x.requests[2].body.rows[0].priceUpdate,{unitCost:9.25,expectedUnitCost:12});
});



const expansionSources=['knotwood','baker-packaging','gabbabolt','sculptform'];
const expansionLabel=source=>({capral:'Capral',rondo:'Rondo','gyprock-trade':'Gyprock Trade',knotwood:'Knotwood',sculptform:'Sculptform'}[source]);
const expansionQueryLabel=source=>source==='gyprock-trade'?'Gyprock product name':source==='sculptform'?'Sculptform name or code':expansionLabel(source)+' code';
const expansionProduct=source=>source==='knotwood'?{source,code:'KEB2550M-03',title:'KEB2550M-03 bracket',url:'https://knotwood.com/au/profiles/battens/',images:[{url:'https://knotwood.com/au/wp-content/uploads/sites/2/2022/09/KEB2550M-03.png'}]}:source==='sculptform'?{source,code:'L Profile Base Trim',title:'L Profile Base Trim — product-name reference (not an exact SKU)',url:'https://sculptform.com/aluminium-click-on-battens-tech-specs/',images:[{url:'https://sculptform.com/hs-fs/hubfs/L-base-profile.jpg?width=300&height=300&name=L-base-profile.jpg'}]}:null;
const importSupplierProduct=source=>expansionProduct(source)||(source==='rondo'?{source,code:'129',title:'129 Furring Channel',url:'https://www.rondo.com.au/products/ceilings/key-lock/129-furring-channel',images:[{url:'https://www.rondo.com.au/media/1349/furring_channel_129-26.jpg'}]}:{source,code:'Easy Tape',title:'Easy Tape',url:'https://www.gyprock.com.au/products/jointing-tapes/easy-tape',images:[{url:'https://www.csrassetlibrary.com/celum/30755_yConnect_Original_Easytape%20Gyprock.png'}]});
async function importSupplierHarness(source){
 const x=await capralHarness({data:{...stock(),capralReferenceLookupVersion:1,supplierReferenceSources:expansionSources,supplierReferenceLookupVersion:1}}),p=importSupplierProduct(source);
 const old=x.context.URL;x.context.URL=class extends URL{};x.context.URL.createObjectURL=old.createObjectURL;x.context.URL.revokeObjectURL=old.revokeObjectURL;
 x.set(0,'Image source',source);x.set(0,expansionQueryLabel(source),p.code);
 x.setHandler(async url=>ok(url.endsWith('/search')?{source,code:p.code,products:[p],warnings:[]}:url.endsWith('/image')?{source,code:p.code,productUrl:p.url,image:{data:capralPng,mimeType:'image/png'}}:{...stock(),revision:8}));
 return {...x,product:p,find:()=>rowButton(x,0,'Find '+expansionLabel(source)+' image').props.onClick()};
}
for(const source of ['rondo','gyprock-trade','knotwood','sculptform']){
 test(source+' PDF image is an explicit reviewed draft and preserves raw code, price and zero stock',async()=>{
  const x=await importSupplierHarness(source),before=JSON.stringify(x.states[1]);await x.find();assert.equal(JSON.stringify(x.states[1]),before);await useCapral(x);assert.equal(x.states[1][0].item.image,capralPng);assert.equal(x.requests.some(r=>r.body?.action==='catalogue_import'),false);assert.equal(x.button('Import reviewed materials').props.disabled,true);x.confirm();await x.submit();const row=x.requests.at(-1).body.rows[0];assert.equal(row.item.sku,'815581 EN7492(ME9395)');assert.equal(row.item.unitCost,29.59);assert.equal(row.item.qty,0);assert.equal(row.item.image,capralPng);assert.equal(row.source.sku,row.item.sku);assert.equal(row.item.source,undefined);assert.ok(!JSON.stringify(row).includes(x.product.url));
 });
 test(source+' PDF source/query/replacement/close invalidate late downloads',async()=>{
  for(const action of ['source','query','replace','close']){
   const x=await importSupplierHarness(source);await x.find();const wait=waiting();x.setHandler(()=>wait.promise);const pending=useCapral(x);x.render();
   if(action==='source')x.set(0,'Image source','capral');else if(action==='query')x.set(0,expansionQueryLabel(source),'Changed');else if(action==='close')x.button('Close').props.onClick();else {x.setHandler(async()=>ok(screenshotResult()));await x.upload('replacement.pdf');}
   wait.resolve(ok({source,code:x.product.code,productUrl:x.product.url,image:{data:capralPng,mimeType:'image/png'}}));await pending;x.render();assert.equal(x.states[1].some(row=>row.item?.image),false);assert.equal(x.requests.some(r=>r.body?.action==='catalogue_import'),false);
  }
 });
 test(source+' PDF switching source invalidates a late search',async()=>{
  const x=await importSupplierHarness(source),wait=waiting();x.setHandler(()=>wait.promise);const pending=x.find();x.render();x.set(0,'Image source','capral');wait.resolve(ok({source,code:x.product.code,products:[x.product],warnings:[]}));await pending;x.render();assert.equal(rowButton(x,0,'Use image'),undefined);
 });
}


async function matchedImageHarness(source='rondo',options={}){
 const data={...stock(),capralReferenceLookupVersion:1,supplierReferenceSources:expansionSources,supplierReferenceLookupVersion:1,materialImportImageVersion:1};data.items[0].image='data:image/png;base64,b2xk';
 const x=await harness({result:screenshotResult(),data,...options});await x.upload();x.choose(0,'match');x.set(0,'Current stock item','angle');
 const old=x.context.URL;x.context.URL=class extends URL{};x.context.URL.createObjectURL=old.createObjectURL;x.context.URL.revokeObjectURL=old.revokeObjectURL;
 const p=source==='capral'?capralProduct:importSupplierProduct(source);x.set(0,'Image source',source);x.set(0,expansionQueryLabel(source),p.code);
 x.setHandler(async url=>ok(url.endsWith('/search')?{source,code:p.code,products:[p],warnings:[]}:url.endsWith('/image')?{source,code:p.code,productUrl:p.url,image:{data:capralPng,mimeType:'image/png'}}:{...data,revision:8}));
 return {...x,product:p,find:()=>rowButton(x,0,'Find '+expansionLabel(source)+' image').props.onClick()};
}
for(const source of ['capral','rondo','gyprock-trade','knotwood','sculptform']){
 test(source+' matched PDF row exposes image selection, requires review and sends an image-only update',async()=>{
  const x=await matchedImageHarness(source),before=JSON.stringify(x.states[0].items);await x.find();assert.equal(x.states[1][0].selectedImage,undefined);x.confirm();await useCapral(x);assert.equal(x.states[1][0].selectedImage,capralPng);assert.equal(JSON.stringify(x.states[0].items),before);assert.ok(x.button('Import reviewed materials').props.disabled);assert.ok(rowButton(x,0,'Undo selected image'));x.confirm();await x.submit();
  const row=x.requests.at(-1).body.rows[0];assert.equal(row.mode,'match');assert.equal(row.itemId,'angle');assert.equal(row.imageUpdate.image,capralPng);assert.equal(row.item,undefined);assert.equal(row.priceUpdate,undefined);assert.equal(row.source.sku,'815581 EN7492(ME9395)');assert.equal(JSON.stringify(x.states[0].items),before);
 });
 test(source+' switching matched target, source, query, mode, PDF or closing rejects late images',async()=>{
  for(const action of ['target','source','query','mode','replace','close']){
   const x=await matchedImageHarness(source);await x.find();const wait=waiting();x.setHandler(()=>wait.promise);const pending=useCapral(x);x.render();
   if(action==='target')x.set(0,'Current stock item','cut');else if(action==='source')x.set(0,'Image source',source==='capral'?'rondo':'capral');else if(action==='query')x.set(0,expansionQueryLabel(source),'OTHER');else if(action==='mode')x.choose(0,'skip');else if(action==='close')x.button('Close').props.onClick();else{x.setHandler(async()=>ok(screenshotResult()));await x.upload('replaced.pdf');}
   wait.resolve(ok({source,code:x.product.code,productUrl:x.product.url,image:{data:capralPng,mimeType:'image/png'}}));await pending;x.render();assert.ok(!x.states[1].some(row=>row.selectedImage));assert.equal(x.requests.some(r=>r.body?.action==='catalogue_import'),false);
  }
 });
}
test('undoing a matched image keeps its existing photo and sends no image update',async()=>{
 const x=await matchedImageHarness();await x.find();await useCapral(x);rowButton(x,0,'Undo selected image').props.onClick();x.confirm();await x.submit();assert.equal(x.requests.at(-1).body.rows[0].imageUpdate,undefined);assert.equal(x.states[0].items[0].image,'data:image/png;base64,b2xk');
});
test('matched image selection is hidden for an older backend and retry retains the exact image',async()=>{
 const old=await matchedImageHarness();old.states[0].materialImportImageVersion=undefined;assert.equal(rowButton(old,0,'Find Rondo image'),undefined);
 const x=await matchedImageHarness();await x.find();await useCapral(x);x.confirm();x.setHandler(async()=>({ok:false,status:503,json:async()=>({error:'Save not confirmed'})}));await x.submit();const original=structuredClone(x.requests.at(-1).body);assert.equal(original.rows[0].imageUpdate.image,capralPng);x.setHandler(async()=>ok({...stock(),revision:8}));await x.button('Retry saved import').props.onClick();assert.deepEqual(x.requests.at(-1).body,original);assert.equal(x.requests.filter(r=>r.url.endsWith('/image')).length,1);
});


test('matched rows for one shared profile stage one photo and send one explicit update',async()=>{
 const x=await matchedImageHarness(),item={...x.states[0].items[0],id:'angle-long',lengthMm:7000};x.states[0].items.push(item);
 x.states[1].push({...x.states[1][0],key:'1',source:{...x.states[1][0].source,sku:'SYNTHETIC-SECOND'},itemId:item.id});
 await x.find();await useCapral(x);assert.ok(x.states[1].every(row=>row.selectedImage===capralPng));x.confirm();await x.submit();const rows=x.requests.at(-1).body.rows;assert.equal(rows.filter(row=>row.imageUpdate).length,1);assert.equal(rows.length,2);
});


test('matched PDF rows default to the material supplier instead of the invoice supplier',async()=>{
 for(const [supplier,source] of [['Rondo','rondo'],['Capral Aluminium','capral'],['CSR Gyprock','gyprock-trade']]){
  const data={...stock(),capralReferenceLookupVersion:1,supplierReferenceSources:expansionSources,supplierReferenceLookupVersion:1,materialImportImageVersion:1};Object.assign(data.items[0],{supplier,sku:'559'});const x=await harness({data,result:screenshotResult()});await x.upload();x.choose(0,'match');x.set(0,'Current stock item','angle');assert.equal(x.control(0,'Image source').props.value,source);assert.equal(x.states[0].items[0].supplier,supplier);assert.equal(x.states[1][0].source.sku,'815581 EN7492(ME9395)');assert.equal(x.requests.length,1);
 }
});
test('changing the matched material resets a manual image source to the new material supplier',async()=>{
 const data={...stock(),capralReferenceLookupVersion:1,supplierReferenceSources:expansionSources,supplierReferenceLookupVersion:1,materialImportImageVersion:1};data.items[0].supplier='Rondo';data.items.push({...data.items[0],id:'tape',sku:'TAPE',name:'Easy Tape',supplier:'CSR Gyprock'});const x=await harness({data,result:screenshotResult()});await x.upload();x.choose(0,'match');x.set(0,'Current stock item','angle');assert.equal(x.control(0,'Image source').props.value,'rondo');x.set(0,'Image source','capral');x.set(0,'Current stock item','tape');assert.equal(x.control(0,'Image source').props.value,'gyprock-trade');assert.equal(x.control(0,'Gyprock product name').props.value,'Easy Tape');assert.equal(x.states[1][0].selectedImage,undefined);
});
test('new PDF materials follow their row supplier and keep lookup source independent',async()=>{
 const data={...stock(),capralReferenceLookupVersion:1,supplierReferenceSources:expansionSources,supplierReferenceLookupVersion:1};const x=await harness({data,result:screenshotResult()});await x.upload();x.choose(0,'create');assert.equal(x.control(0,'Image source').props.value,'capral');x.set(0,'Row supplier','Rondo');assert.equal(x.control(0,'Image source').props.value,'rondo');x.set(0,'Image source','gyprock-trade');assert.equal(x.control(0,'Row supplier').props.value,'Rondo');assert.equal(x.states[1][0].item.sku,'815581 EN7492(ME9395)');x.set(0,'Row supplier','CSR Gyprock');assert.equal(x.control(0,'Image source').props.value,'gyprock-trade');
});

test('all new supplier defaults follow matched stock independently from the PDF supplier',async()=>{
 for(const [supplier,expected] of [['Knotwood','knotwood'],['Baker Packaging','baker-packaging'],['Sculptform','sculptform'],['Nut & Bolt Factory Woolloongabba','gabbabolt']]){
  const data={...stock(),capralReferenceLookupVersion:1,materialImportImageVersion:1,supplierReferenceLookupVersion:1,supplierReferenceSources:expansionSources};Object.assign(data.items[0],{supplier,sku:'38.041'});const x=await harness({data,result:screenshotResult()});await x.upload();x.choose(0,'match');x.set(0,'Current stock item','angle');assert.equal(x.control(0,'Image source').props.value,expected);assert.equal(x.states[0].items[0].supplier,supplier);assert.equal(x.states[1][0].source.sku,'815581 EN7492(ME9395)');assert.equal(x.requests.length,1);
  x.set(0,'Image source','rondo');assert.equal(x.states[0].items[0].supplier,supplier);x.choose(0,'create');x.set(0,'Row supplier',supplier);assert.equal(x.control(0,'Image source').props.value,expected);assert.equal(x.states[1][0].item.sku,'815581 EN7492(ME9395)');
 }
});

test('Sculptform track-code references work for new and matched PDF rows with explicit reviewed import',async()=>{
 for(const mode of ['create','match'])for(const code of ['cosmt45251b','cosmt45252b']){
  const data={...stock(),capralReferenceLookupVersion:1,materialImportImageVersion:1,supplierReferenceLookupVersion:1,supplierReferenceSources:expansionSources};Object.assign(data.items[0],{supplier:'Sculptform',sku:code,image:'data:image/png;base64,b2xk'});const x=await harness({data,result:screenshotResult()});await x.upload();x.choose(0,mode);if(mode==='match')x.set(0,'Current stock item','angle');else x.set(0,'Row supplier','Sculptform');
  const old=x.context.URL;x.context.URL=class extends URL{};x.context.URL.createObjectURL=old.createObjectURL;x.context.URL.revokeObjectURL=old.revokeObjectURL;
  if(mode==='match')assert.equal(x.control(0,'Sculptform name or code').props.value,code);else x.set(0,'Sculptform name or code',code);
  const p={source:'sculptform',code,title:'45 × 25 mm split track — assembly reference (both parts and clip shown)',url:'https://sculptform.com/aluminium-click-on-screens-tech-specs/',images:[{url:'https://sculptform.com/hs-fs/hubfs/COS-split-track-45x25mm.png?width=1948&name=COS-split-track-45x25mm.png'}]};const before=JSON.stringify(x.states[0].items);
  x.setHandler(async url=>ok(url.endsWith('/search')?{source:'sculptform',code,products:[p],warnings:['Assembly reference only.']}:url.endsWith('/image')?{source:'sculptform',code,productUrl:p.url,image:{data:capralPng,mimeType:'image/png'}}:{...data,revision:8}));
  await rowButton(x,0,'Find Sculptform image').props.onClick();await useCapral(x);assert.equal(JSON.stringify(x.states[0].items),before);assert.ok(x.button('Import reviewed materials').props.disabled);assert.equal(x.requests.some(r=>r.body?.action==='catalogue_import'),false);x.confirm();await x.submit();const row=x.requests.at(-1).body.rows[0];assert.equal(row.priceUpdate,undefined);if(mode==='match'){assert.equal(row.imageUpdate.image,capralPng);assert.equal(row.item,undefined);}else{assert.equal(row.item.image,capralPng);assert.equal(row.item.qty,0);assert.equal(row.item.sku,'815581 EN7492(ME9395)');}assert.equal(row.source.sku,'815581 EN7492(ME9395)');
 }
});
