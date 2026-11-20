const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'../workshop-stock.js'),'utf8');
const walk=node=>!node||typeof node!=='object'?[]:[node,...(node.children||[]).flat(Infinity).flatMap(walk)];
const textOf=node=>walk(node).flatMap(n=>(n.children||[]).flat(Infinity).filter(child=>typeof child==='string')).join(' ');
const photo='data:image/png;base64,c3ludGhldGljLXByb2ZpbGUtcGhvdG8=';
const material=(id,name,dimensions)=>({id,name,sku:'SYN-'+id.toUpperCase(),category:'extrusions',unit:'lengths',qty:5,reserved:0,available:5,lengthMm:6500,dimensions,colour:'Mill Finish',supplier:'Example Metals',reservations:{}});
const fixture=()=>({revision:7,stockProfileReferenceVersion:1,movements:[],catalog:[],items:[material('shs','SHS','40 x 40 x 2 mm'),material('rhs','RHS','80 x 40 x 3 mm'),material('unknown','Custom extrusion','35 x 25 x 2 mm')],stocktakes:[{id:'count',name:'Workshop count',categories:['extrusions'],itemIds:['shs','rhs','unknown'],counts:{},status:'open'}]});

function harness({catalogueOnly=false,data=fixture()}={}){
 const states=[],effects=[],requests=[],exports=[],storage=new Map();let cursor=0;
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:value=>{const index=cursor++;if(!(index in states))states[index]=typeof value==='function'?value():value;return [states[index],value=>states[index]=typeof value==='function'?value(states[index]):value];},useEffect:fn=>effects.push(fn),Fragment:'fragment'};
 const context={window:{},TextEncoder,Blob,atob,crypto:{randomUUID:()=> 'profile-image-mutation'},PanelStock:{username:'tester',apiFetch:async(url,options)=>{if(options)requests.push(JSON.parse(options.body));return {ok:true,json:async()=>states[0]};}},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},document:{addEventListener(){},removeEventListener(){},createElement:()=>({click(){},remove(){}}),body:{appendChild(){}}},URL:{createObjectURL:()=> 'blob:reference-pdf',revokeObjectURL(){}},setTimeout(){}};
 vm.runInNewContext(source,context);const Component=context.window.createWorkshopStock(React),render=()=>{cursor=0;effects.length=0;return walk(Component({isAdmin:true,taskAccess:{'factory.stock':true},workerUrl:'/api',catalogueOnly}));};render();states[0]=data;
 const button=label=>render().find(node=>node.type==='button'&&node.children.includes(label));
 const node=label=>render().find(node=>node.props['aria-label']===label);
 const control=key=>walk(render().find(node=>node.type==='label'&&node.props.key===key)).find(node=>['input','select','textarea'].includes(node.type));
 return {context,states,requests,exports,render,button,node,control,set(key,value){control(key).props.onChange({target:{value}});},row(id){return render().find(node=>node.type==='tr'&&node.props.key===id);},card(id){return render().find(node=>node.props['data-material-id']===id);},editor(){return render().find(node=>node.props.className==='ws-image-editor');},async save(){await render().find(node=>node.type==='form').props.onSubmit({preventDefault(){}});return requests.at(-1);}};
}

const images=node=>walk(node).filter(child=>child.type==='img');
function svgSource(src){
 assert.match(src,/^data:image\/svg\+xml(?:;[^,]*)?,/);const comma=src.indexOf(',');return /;base64/.test(src.slice(0,comma))?Buffer.from(src.slice(comma+1),'base64').toString('utf8'):decodeURIComponent(src.slice(comma+1));
}

test('stock reference images recognize named SHS and RHS without inventing a profile from dimensions',()=>{
 const x=harness(),helper=x.context.window.stockProfileImages,before=structuredClone(x.states[0]);
 for(const [name,kind]of [['SHS','shs'],['Square hollow section','shs'],['RHS','rhs'],['Rectangular hollow section','rhs']]){const item=material('sample',name,'40 x 40 x 2 mm'),reference=helper.reference(item);assert.equal(helper.typeFor(item),kind);assert.equal(reference.kind,kind);assert.match(reference.label,/hollow section/i);assert.equal(helper.image(item),reference.src);const svg=svgSource(reference.src);assert.match(svg,new RegExp('data-profile-kind=["\']'+kind+'["\']'));assert.match(svg,/fill-rule=["']evenodd["']/);assert.match(svg,/<svg\b/);}
 const unknown=x.states[0].items[2];assert.equal(helper.typeFor(unknown),null);assert.equal(helper.reference(unknown),null);assert.equal(helper.image(unknown),'');assert.deepEqual(x.states[0],before);
});

test('SHS and RHS SVGs draw hollow square and rectangular sections with named reference labels',()=>{
 const helper=harness().context.window.stockProfileImages;
 const shape=kind=>{const reference=helper.reference(material('sample',kind.toUpperCase(),'40 x 40 x 2 mm')),svg=svgSource(reference.src),path=svg.match(/<path\b[^>]*\bd=["']([^"']+)/);assert.ok(path);const contour=path[1].match(/^M([\d.]+)\s+([\d.]+)H([\d.]+)V([\d.]+)H([\d.]+)Z/);assert.ok(contour);assert.match(path[1],/Z\s+M/);assert.match(svg,/fill-rule=["']evenodd["']/);assert.match(reference.label,kind==='shs'?/square hollow section/i:/rectangular hollow section/i);return {width:Math.abs(Number(contour[3])-Number(contour[1])),height:Math.abs(Number(contour[4])-Number(contour[2]))};};
 const square=shape('shs'),rectangle=shape('rhs');assert.ok(square.width>0);assert.equal(square.width,square.height);assert.ok(rectangle.width>rectangle.height);assert.ok(rectangle.height>0);
});

test('unrelated, panel and ambiguous stock does not receive a reference profile',()=>{
 const helper=harness().context.window.stockProfileImages;
 for(const patch of [{name:'Screw for RHS frame',category:'fixings',unit:'each'},{name:'Angle grinder disc',category:'consumables',unit:'each'},{name:'SHS',category:'panels',legacy:true,unit:'sheets',id:'variant:panel'},{name:'SHS',unit:'sheets'},{name:'RHS',category:'offcuts',id:'offcut:piece'},{name:'Angle / RHS'},{name:'Custom extrusion'}]){const item={...material('sample','Custom extrusion','40 x 40 x 2 mm'),...patch};assert.equal(helper.reference(item),null,patch.name);assert.equal(helper.image(item),'',patch.name);}
});

test('uploaded photos take priority and resolving reference images never mutates stock',()=>{
 const helper=harness().context.window.stockProfileImages,item={...material('shs','SHS','40 x 40 x 2 mm'),image:photo},before=structuredClone(item),reference=helper.reference(item);assert.equal(helper.image(item),photo);assert.ok(reference);assert.deepEqual(item,before);const removed={...item,image:''};assert.equal(helper.image(removed),reference.src);assert.equal(removed.image,'');assert.equal(helper.image({...removed,image:'   '}),reference.src);
});

test('SOH renders distinct SHS and RHS references, keeps unknown stock plain and opens the reference preview',()=>{
 const x=harness(),before=structuredClone(x.states[0]),helper=x.context.window.stockProfileImages,shs=helper.reference(x.states[0].items[0]),rhs=helper.reference(x.states[0].items[1]);assert.notEqual(shs.src,rhs.src);assert.equal(images(x.row('shs'))[0].props.src,shs.src);assert.equal(images(x.row('rhs'))[0].props.src,rhs.src);assert.equal(images(x.row('unknown')).length,0);
 walk(x.row('shs')).find(node=>node.type==='button'&&node.props['aria-label']==='View image for SHS').props.onClick();const preview=x.node('Stock image');assert.equal(images(preview).at(-1).props.src,shs.src);assert.match(textOf(preview),/Reference profile diagram.*not to scale/i);assert.deepEqual(x.states[0],before);assert.equal(x.requests.length,0);
});

test('material catalogue and metadata editor use references without adding images to saved records',async()=>{
 const x=harness({catalogueOnly:true}),before=structuredClone(x.states[0]),reference=x.context.window.stockProfileImages.reference(x.states[0].items[0]);assert.equal(images(x.card('shs'))[0].props.src,reference.src);assert.equal(images(x.card('rhs'))[0].props.src,x.context.window.stockProfileImages.reference(x.states[0].items[1]).src);assert.equal(images(x.card('unknown')).length,0);
 walk(x.card('shs')).find(node=>node.type==='button'&&node.children.includes('Edit material')).props.onClick();assert.equal(images(x.editor())[0].props.src,reference.src);assert.match(textOf(x.editor()),/Reference profile diagram.*not to scale/i);assert.equal(x.button('Remove image'),undefined);x.set('details','Reviewed stock details');const request=await x.save();assert.equal(request.action,'metadata');assert.equal(request.itemId,'shs');assert.equal(request.image,'');assert.ok(!JSON.stringify(request).includes('data:image/svg'));assert.deepEqual(x.states[0],before);
});

test('removing an uploaded photo reveals the reference and saves only the requested removal',async()=>{
 const data=fixture();data.items[0].image=photo;const x=harness({catalogueOnly:true,data}),before=structuredClone(data);assert.equal(images(x.card('shs'))[0].props.src,photo);walk(x.card('shs')).find(node=>node.type==='button'&&node.props['aria-label']==='View profile for SHS').props.onClick();assert.equal(images(x.node('Stock image')).at(-1).props.src,photo);assert.doesNotMatch(textOf(x.node('Stock image')),/Reference profile diagram/i);x.node('Close image').props.onClick();walk(x.card('shs')).find(node=>node.type==='button'&&node.children.includes('Edit material')).props.onClick();assert.equal(images(x.editor())[0].props.src,photo);assert.doesNotMatch(textOf(x.editor()),/Reference profile diagram/i);x.button('Remove image').props.onClick();assert.equal(images(x.editor())[0].props.src,x.context.window.stockProfileImages.reference(data.items[0]).src);assert.match(textOf(x.editor()),/Reference profile diagram.*not to scale/i);assert.equal(x.button('Remove image'),undefined);const request=await x.save();assert.equal(request.image,'');assert.ok(!JSON.stringify(request).includes('data:image/svg'));assert.deepEqual(data,before);
});

test('new-material editor updates references as the reviewed profile name changes without saving the SVG',async()=>{
 const x=harness({catalogueOnly:true});x.button('Add material').props.onClick();x.set('name','Custom extrusion');assert.equal(images(x.editor()).length,0);x.set('name','SHS');x.set('sku','SYN-NEW-SHS');const image=images(x.editor())[0];assert.ok(image);assert.match(svgSource(image.props.src),/data-profile-kind=["']shs["']/);assert.equal(x.button('Remove image'),undefined);const request=await x.save();assert.equal(request.action,'create');assert.equal(request.item.image,'');assert.equal(request.item.qty,0);assert.ok(!JSON.stringify(request).includes('data:image/svg'));
});

test('a new shared-profile variant uses its reference without persisting it as an uploaded image',async()=>{
 const x=harness({catalogueOnly:true}),before=structuredClone(x.states[0]);walk(x.card('shs')).find(node=>node.type==='button'&&node.children.includes('Add variant')).props.onClick();assert.equal(x.control('name').props.disabled,true);assert.equal(images(x.editor())[0].props.src,x.context.window.stockProfileImages.reference(x.states[0].items[0]).src);assert.equal(x.button('Remove image'),undefined);x.set('colour','Black');const request=await x.save();assert.equal(request.action,'create');assert.equal(request.item.sku,'SYN-SHS');assert.equal(request.item.colour,'Black');assert.equal(request.item.image,'');assert.ok(!JSON.stringify(request).includes('data:image/svg'));assert.deepEqual(x.states[0],before);
});

test('restocking shows the same reference images as stock on hand',()=>{
 const data=fixture();data.items.forEach(item=>item.reorderLevel=10);const x=harness({data});x.render().find(node=>node.type==='button'&&String(node.props.className||'').includes('ws-metric')&&/Needs restocking/.test(textOf(node))).props.onClick();const rows=x.render().filter(node=>node.props.className==='ws-restock-item');assert.equal(rows.length,3);for(const id of ['shs','rhs'])assert.equal(images(rows.find(node=>node.props.key===id))[0].props.src,x.context.window.stockProfileImages.reference(data.items.find(item=>item.id===id)).src);assert.equal(images(rows.find(node=>node.props.key==='unknown')).length,0);assert.equal(x.requests.length,0);
});

test('active stocktake rows use SHS and RHS reference images while unknown stock keeps its placeholder',()=>{
 const x=harness(),before=structuredClone(x.states[0]);x.button('Stocktake').props.onClick();x.button('Start count').props.onClick();const rows=x.render().filter(node=>String(node.props.className||'').split(' ').includes('ws-count-row'));assert.equal(rows.length,3);for(const id of ['shs','rhs']){const row=rows.find(node=>node.props.key===id);assert.equal(images(row)[0].props.src,x.context.window.stockProfileImages.reference(x.states[0].items.find(item=>item.id===id)).src);}assert.equal(images(rows.find(node=>node.props.key==='unknown')).length,0);assert.deepEqual(x.states[0],before);assert.equal(x.requests.length,0);
});

test('compact and dotted hollow-section names retain their references without matching substrings',()=>{
 const x=harness().context.window.stockProfileImages;
 for(const [name,kind]of [['SHS40x40x2','shs'],['40x40x2SHS','shs'],['RHS80x40x3','rhs'],['80x40x3RHS','rhs'],['S.H.S.','shs'],['R.H.S.','rhs'],['C.H.S.','chs']])assert.equal(x.typeFor({name,category:'extrusions'}),kind,name);
 for(const name of ['washs','rhsproject','Screw for RHS80x40x3 frame'])assert.equal(x.typeFor({name,category:'extrusions'}),null,name);
});

test('a selected reference overrides automatic recognition while None and Automatic remain explicit choices',()=>{
 const helper=harness().context.window.stockProfileImages,item=material('sample','Custom extrusion','35 x 25 x 2 mm'),before=structuredClone(item);
 for(const kind of ['shs','rhs','chs','angle','channel','flat-bar','round-bar','square-bar','tee','i-beam','zed','top-hat']){const selected={...item,category:'fixings',unit:'each',referenceProfile:kind};assert.equal(helper.reference(selected)?.kind,kind);assert.match(svgSource(helper.image(selected)),new RegExp('data-profile-kind=["\']'+kind+'["\']'));}
 const square=material('square','SHS','40 x 40 x 2 mm');assert.equal(helper.reference({...square,referenceProfile:'none'}),null);assert.equal(helper.image({...square,referenceProfile:'none'}),'');assert.equal(helper.reference({...square,referenceProfile:''}).kind,'shs');assert.equal(helper.image(square),helper.image({...square,referenceProfile:''}));
 assert.equal(helper.image({...square,image:photo,referenceProfile:'rhs'}),photo);assert.equal(helper.image({...square,image:photo,referenceProfile:'none'}),photo);assert.deepEqual(item,before);
 for(const legacy of [{...square,id:'variant:panel',category:'panels',unit:'sheets',legacy:true},{...square,id:'offcut:piece',category:'offcuts',unit:'sheets',legacy:true}])assert.equal(helper.reference({...legacy,referenceProfile:'rhs'}),null);
});

test('the metadata picker previews and saves a chosen profile ID without changing stock or storing the SVG',async()=>{
 const x=harness({catalogueOnly:true}),before=structuredClone(x.states[0]);walk(x.card('unknown')).find(node=>node.type==='button'&&node.children.includes('Edit material')).props.onClick();
 const picker=x.node('Reference profile');assert.ok(picker);assert.equal(picker.props.value,'');assert.equal(picker.props.disabled,false);assert.deepEqual(walk(picker).filter(node=>node.type==='option').map(node=>node.props.value).sort(),['','none','shs','rhs','chs','angle','channel','flat-bar','round-bar','square-bar','tee','i-beam','zed','top-hat'].sort());
 picker.props.onChange({target:{value:'rhs'}});assert.equal(x.node('Reference profile').props.value,'rhs');assert.match(svgSource(images(x.editor())[0].props.src),/data-profile-kind=["']rhs["']/);const request=await x.save();assert.equal(request.action,'metadata');assert.equal(request.itemId,'unknown');assert.equal(request.referenceProfile,'rhs');assert.equal(request.image,'');assert.ok(!JSON.stringify(request).includes('data:image/svg'));assert.deepEqual(x.states[0],before);
});

test('stored manual references and None survive unrelated edits and can be reset to Automatic',async()=>{
 for(const choice of ['rhs','none']){const data=fixture();data.items[0].referenceProfile=choice;const x=harness({catalogueOnly:true,data});walk(x.card('shs')).find(node=>node.type==='button'&&node.children.includes('Edit material')).props.onClick();assert.equal(x.node('Reference profile').props.value,choice);assert.equal(images(x.editor()).length,choice==='none'?0:1);x.set('details','Reviewed reference choice');assert.equal((await x.save()).referenceProfile,choice);}
 const data=fixture();data.items[0].referenceProfile='none';const x=harness({catalogueOnly:true,data});walk(x.card('shs')).find(node=>node.type==='button'&&node.children.includes('Edit material')).props.onClick();x.node('Reference profile').props.onChange({target:{value:''}});assert.match(svgSource(images(x.editor())[0].props.src),/data-profile-kind=["']shs["']/);assert.equal((await x.save()).referenceProfile,'');
});

test('choosing a diagram replaces an uploaded photo only on that explicit action',async()=>{
 for(const choice of ['', 'none']){const data=fixture();data.items[0].image=photo;const x=harness({catalogueOnly:true,data});walk(x.card('shs')).find(node=>node.type==='button'&&node.children.includes('Edit material')).props.onClick();assert.equal(images(x.editor())[0].props.src,photo);x.node('Reference profile').props.onChange({target:{value:choice}});assert.equal(images(x.editor())[0].props.src,photo);const request=await x.save();assert.equal(request.image,photo);assert.equal(request.referenceProfile,choice);}
 const data=fixture();data.items[0].image=photo;const before=structuredClone(data),x=harness({catalogueOnly:true,data});walk(x.card('shs')).find(node=>node.type==='button'&&node.children.includes('Edit material')).props.onClick();x.node('Reference profile').props.onChange({target:{value:'rhs'}});assert.match(svgSource(images(x.editor())[0].props.src),/data-profile-kind=["']rhs["']/);assert.equal(x.button('Remove image'),undefined);const request=await x.save();assert.equal(request.image,'');assert.equal(request.referenceProfile,'rhs');assert.deepEqual(data,before);
});

test('new material creation saves a chosen reference while shared variants inherit and lock their existing choice',async()=>{
 const x=harness({catalogueOnly:true});x.button('Add material').props.onClick();x.set('name','Custom extrusion');x.set('sku','SYN-CUSTOM');x.node('Reference profile').props.onChange({target:{value:'channel'}});const request=await x.save();assert.equal(request.item.referenceProfile,'channel');assert.equal(request.item.image,'');assert.equal(request.item.qty,0);assert.ok(!JSON.stringify(request).includes('data:image/svg'));
 for(const referenceProfile of ['rhs','none']){const data=fixture();data.items[0].referenceProfile=referenceProfile;const y=harness({catalogueOnly:true,data});walk(y.card('shs')).find(node=>node.type==='button'&&node.children.includes('Add variant')).props.onClick();const picker=y.node('Reference profile');assert.ok(!picker||picker.props.disabled);if(picker)assert.equal(picker.props.value,referenceProfile);assert.equal(images(y.editor()).length,referenceProfile==='none'?0:1);y.set('colour','Black');const variant=await y.save();assert.equal(variant.item.referenceProfile,referenceProfile);assert.equal(variant.item.image,'');}
});

test('attaching a new draft to an existing SKU inherits its saved reference instead of retaining the draft choice',async()=>{
 for(const referenceProfile of ['rhs','none']){const data=fixture();data.items[0].referenceProfile=referenceProfile;const x=harness({catalogueOnly:true,data});x.button('Add material').props.onClick();x.set('name','Custom extrusion');x.node('Reference profile').props.onChange({target:{value:'channel'}});x.set('sku','SYN-SHS');const picker=x.node('Reference profile');assert.ok(!picker||picker.props.disabled);if(picker)assert.equal(picker.props.value,referenceProfile);assert.equal(images(x.editor()).length,referenceProfile==='none'?0:1);x.set('colour','White');const request=await x.save();assert.equal(request.item.referenceProfile,referenceProfile);}
});

test('manual references and None are used consistently by SOH, catalogue, stocktakes and enlarged previews',()=>{
 const data=fixture();data.items[0].referenceProfile='rhs';data.items[1].referenceProfile='none';data.items[2].referenceProfile='shs';const x=harness({data});assert.match(svgSource(images(x.row('shs'))[0].props.src),/data-profile-kind=["']rhs["']/);assert.equal(images(x.row('rhs')).length,0);assert.match(svgSource(images(x.row('unknown'))[0].props.src),/data-profile-kind=["']shs["']/);walk(x.row('shs')).find(node=>node.props['aria-label']==='View image for SHS').props.onClick();assert.match(svgSource(images(x.node('Stock image')).at(-1).props.src),/data-profile-kind=["']rhs["']/);x.node('Close image').props.onClick();x.button('Stocktake').props.onClick();x.button('Start count').props.onClick();const rows=x.render().filter(node=>String(node.props.className||'').split(' ').includes('ws-count-row'));assert.match(svgSource(images(rows.find(node=>node.props.key==='shs'))[0].props.src),/data-profile-kind=["']rhs["']/);assert.equal(images(rows.find(node=>node.props.key==='rhs')).length,0);
 const catalogue=harness({catalogueOnly:true,data});assert.match(svgSource(images(catalogue.card('shs'))[0].props.src),/data-profile-kind=["']rhs["']/);assert.equal(images(catalogue.card('rhs')).length,0);assert.match(svgSource(images(catalogue.card('unknown'))[0].props.src),/data-profile-kind=["']shs["']/);
});

test('SOH PDF rasterizes the selected reference and omits an item whose default was disabled',async()=>{
 const data=fixture();data.items[0].referenceProfile='rhs';data.items[1].referenceProfile='none';const x=harness({data}),decoded=[];x.context.window.PanelStockStocktakeReport.soh={...x.context.window.PanelStockStocktakeReport.soh,pdf:snapshot=>{x.exports.push(snapshot);return new Blob(['pdf']);}};x.context.Image=class {constructor(){this.naturalWidth=160;this.naturalHeight=120;}set src(value){decoded.push(svgSource(value));this.onload();}};const originalCreate=x.context.document.createElement;x.context.document.createElement=tag=>tag==='canvas'?{getContext:()=>({fillRect(){},drawImage(){}}),toDataURL:()=> 'data:image/jpeg;base64,/9j/2Q=='}:originalCreate(tag);x.node('Export SOH').props.onClick();await x.button('Download PDF').props.onClick();assert.equal(decoded.length,1);assert.match(decoded[0],/data-profile-kind=["']rhs["']/);const snapshot=x.exports.at(-1);assert.ok(snapshot.rows.find(row=>row.itemId==='shs').thumbnail);assert.equal(snapshot.rows.find(row=>row.itemId==='rhs').thumbnail,undefined);assert.equal(data.items[0].image,undefined);
});

test('older backend views and legacy panels do not send a reference choice through unrelated saves',async()=>{
 const data=fixture();delete data.stockProfileReferenceVersion;data.items[0].referenceProfile='none';const x=harness({catalogueOnly:true,data});walk(x.card('shs')).find(node=>node.type==='button'&&node.children.includes('Edit material')).props.onClick();const picker=x.node('Reference profile');assert.ok(!picker||picker.props.disabled);x.set('details','Unrelated edit');assert.equal(Object.hasOwn(await x.save(),'referenceProfile'),false);
 const panel={...material('variant:panel','White panel','1200 x 2400 mm'),legacy:true,category:'panels',unit:'sheets',width:1200,height:2400,thickness:3,color:'White',material:'ACP',referenceProfile:'shs'};const panelData=fixture();panelData.items=[panel];const y=harness({data:panelData});y.node('Stock action for White panel').props.onChange({target:{value:'metadata'}});assert.equal(y.node('Reference profile'),undefined);y.set('location','Panel rack');assert.equal(Object.hasOwn(await y.save(),'referenceProfile'),false);
});

test('uncertain reference saves retain the exact selected diagram and photo removal for retry',async()=>{
 const data=fixture();data.items[0].image=photo;const x=harness({catalogueOnly:true,data});walk(x.card('shs')).find(node=>node.type==='button'&&node.children.includes('Edit material')).props.onClick();x.node('Reference profile').props.onChange({target:{value:'rhs'}});x.context.PanelStock.apiFetch=async(_url,options)=>{x.requests.push(JSON.parse(options.body));return {ok:false,status:503,json:async()=>({error:'Save not confirmed'})};};await x.save();const original=structuredClone(x.requests.at(-1));assert.equal(original.referenceProfile,'rhs');assert.equal(original.image,'');assert.equal(x.node('Reference profile').props.disabled,true);assert.ok(x.button('Retry save'));x.states[0]={...x.states[0],stockProfileReferenceVersion:0};const attempts=x.requests.length;await x.save();assert.equal(x.requests.length,attempts);x.states[0]={...x.states[0],stockProfileReferenceVersion:1};x.context.PanelStock.apiFetch=async(_url,options)=>{x.requests.push(JSON.parse(options.body));return {ok:true,json:async()=>x.states[0]};};await x.save();assert.deepEqual(x.requests.at(-1),original);assert.ok(!JSON.stringify(original).includes('data:image/svg'));
});
