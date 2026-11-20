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
const fixture=()=>({revision:7,movements:[],catalog:[],items:[material('shs','SHS','40 x 40 x 2 mm'),material('rhs','RHS','80 x 40 x 3 mm'),material('unknown','Custom extrusion','35 x 25 x 2 mm')],stocktakes:[{id:'count',name:'Workshop count',categories:['extrusions'],itemIds:['shs','rhs','unknown'],counts:{},status:'open'}]});

function harness({catalogueOnly=false,data=fixture()}={}){
 const states=[],effects=[],requests=[],storage=new Map();let cursor=0;
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:value=>{const index=cursor++;if(!(index in states))states[index]=typeof value==='function'?value():value;return [states[index],value=>states[index]=typeof value==='function'?value(states[index]):value];},useEffect:fn=>effects.push(fn),Fragment:'fragment'};
 const context={window:{},TextEncoder,Blob,atob,crypto:{randomUUID:()=> 'profile-image-mutation'},PanelStock:{username:'tester',apiFetch:async(url,options)=>{if(options)requests.push(JSON.parse(options.body));return {ok:true,json:async()=>states[0]};}},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},document:{addEventListener(){},removeEventListener(){}},setTimeout(){}};
 vm.runInNewContext(source,context);const Component=context.window.createWorkshopStock(React),render=()=>{cursor=0;effects.length=0;return walk(Component({isAdmin:true,taskAccess:{'factory.stock':true},workerUrl:'/api',catalogueOnly}));};render();states[0]=data;
 const button=label=>render().find(node=>node.type==='button'&&node.children.includes(label));
 const node=label=>render().find(node=>node.props['aria-label']===label);
 const control=key=>walk(render().find(node=>node.type==='label'&&node.props.key===key)).find(node=>['input','select','textarea'].includes(node.type));
 return {context,states,requests,render,button,node,control,set(key,value){control(key).props.onChange({target:{value}});},row(id){return render().find(node=>node.type==='tr'&&node.props.key===id);},card(id){return render().find(node=>node.props['data-material-id']===id);},editor(){return render().find(node=>node.props.className==='ws-image-editor');},async save(){await render().find(node=>node.type==='form').props.onSubmit({preventDefault(){}});return requests.at(-1);}};
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
