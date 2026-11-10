const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const labels=require('../offcut-labels.js');
const stock={variants:[{id:'v1',material:'Solid aluminium',color:'White satin',thickness:3}],offcuts:[{id:'o1',material:'ACM',color:'Black',thickness:4}]};
const row=(patch={})=>({jobReference:'College',orderNumber:'838',sheetNumber:'1',panelNumber:'F1',status:'pending',stockItemType:'variant',stockItemId:'v1',pendingOffcut:{length:1500,width:2065,status:'pending',source:'cnc-pdf'},...patch});

test('scheduled labels describe one physical sheet, scoped by job, order and sheet',()=>{
 const rows=[row(),row({panelNumber:'F2'}),row({jobReference:'Other job'}),row({orderNumber:'839'}),row({sheetNumber:'2'})];
 const before=JSON.stringify(rows),result=labels.collectScheduled(rows,stock);
 assert.equal(result.length,4);assert.equal(JSON.stringify(rows),before);
 assert.deepEqual([result[0].length,result[0].width,result[0].material,result[0].color,result[0].thickness],[2065,1500,'Solid aluminium','White satin',3]);
 assert.equal(result[0].provisional,true);assert.equal(result[0].sku,'CNC / College / 838 / 1');
 assert.equal(labels.collectScheduled([row(),row({jobReference:'  COLLEGE '})],stock).length,1);
});
test('rejected, completed and invalid offcuts cannot enter the print batch',()=>{
 const invalid=[0,-1,NaN,Infinity,1000001];
 const rows=invalid.map(length=>row({pendingOffcut:{length,width:50}}));
 rows.push(row({pendingOffcut:{length:50,width:50,approved:false}}),row({status:'completed'}),row({pendingOffcut:null}),row({orderNumber:''}));
 assert.equal(labels.collectScheduled(rows,stock).length,0);
 assert.equal(labels.collectScheduled([...rows,row()],stock).length,1);
});
test('scheduled labels look up offcut stock and use the proposed label SKU',()=>{
 const result=labels.collectScheduled([row({stockItemType:'offcut',stockItemId:'offcut:o1',pendingOffcut:{length:500,width:200,labelSku:'OC-123'}})],stock)[0];
 assert.equal(result.sku,'OC-123');assert.equal(result.material,'ACM');assert.equal(result.thickness,4);
});
test('schedule preparation stamps once per sheet and reuses identity when reimporting',()=>{
 let sku=0,id=0;const options={uid:()=>`id-${++id}`,genSku:()=>`OC-${++sku}`};
 const input=[row(),row({panelNumber:'F2'}),row({jobReference:'Other job'})],before=JSON.stringify(input);
 const prepared=labels.prepareScheduled(input,[],options);
 assert.equal(JSON.stringify(input),before);assert.equal(sku,2);assert.equal(id,2);
 assert.equal(prepared[0].pendingOffcut.labelSku,prepared[1].pendingOffcut.labelSku);
 assert.notEqual(prepared[0].pendingOffcut.labelSku,prepared[2].pendingOffcut.labelSku);
 assert.equal(prepared[0].pendingOffcut.status,'pending');assert.equal(prepared[0].pendingOffcut.approved,true);
 assert.equal(prepared[0].pendingOffcut.source,'cnc-pdf');
 const next=labels.prepareScheduled([row(),row({panelNumber:'F3'})],prepared,options);
 assert.equal(next[0].pendingOffcut.labelSku,prepared[0].pendingOffcut.labelSku);assert.equal(sku,2);
 assert.equal(next[0].pendingOffcut.labelOffcutId,prepared[0].pendingOffcut.labelOffcutId);
 assert.equal(labels.prepareScheduled(prepared,[],options)[0].pendingOffcut.labelSku,prepared[0].pendingOffcut.labelSku);assert.equal(sku,2);
 const revised=labels.prepareScheduled([row({pendingOffcut:{length:700,width:300,status:'pending',source:'cnc-pdf'}})],prepared,options);
 assert.notEqual(revised[0].pendingOffcut.labelSku,prepared[0].pendingOffcut.labelSku);assert.equal(revised[0].pendingOffcut.length,700);
 const completed=prepared.map(panel=>({...panel,status:'completed'}));
 assert.notEqual(labels.prepareScheduled([row()],completed,options)[0].pendingOffcut.labelSku,prepared[0].pendingOffcut.labelSku);
});
test('conflicting proposals on one physical sheet fail before any identity is generated',()=>{
 let generated=0;const options={uid:()=>String(++generated),genSku:()=>String(++generated)};
 assert.throws(()=>labels.prepareScheduled([row(),row({panelNumber:'F2',pendingOffcut:{length:700,width:200}})],[],options),/Conflicting offcut dimensions.*Order 838.*Sheet 1/);
 assert.equal(generated,0);
 assert.equal(labels.prepareScheduled([row(),row({pendingOffcut:{length:2065,width:1500}})],[],options).length,2);
});
test('manual offcut dimensions become numeric values before server validation',()=>{
 const prepared=labels.prepareScheduled([row({pendingOffcut:{length:'400',width:'800',source:'manual',status:'pending'}})],[],{uid:()=> 'manual-id',genSku:()=> 'MANUAL-1'});
 assert.equal(prepared[0].pendingOffcut.length,400);assert.equal(prepared[0].pendingOffcut.width,800);assert.equal(prepared[0].pendingOffcut.dimensionOrder,'sheet');
 assert.equal(typeof prepared[0].pendingOffcut.length,'number');assert.equal(typeof prepared[0].pendingOffcut.width,'number');
});
test('one approved proposal propagates to every unspecified sibling on the physical sheet',()=>{
 let generated=0;const options={uid:()=>`id-${++generated}`,genSku:()=>`OC-${++generated}`};
 const input=[row({panelNumber:'F0',pendingOffcut:null}),row({pendingOffcut:{length:'400',width:'800',status:'pending',source:'manual',note:'Keep this piece'}}),row({panelNumber:'F2',pendingOffcut:undefined})];
 const before=JSON.stringify(input),prepared=labels.prepareScheduled(input,[],options);
 assert.equal(JSON.stringify(input),before);assert.equal(generated,2);
 for(const panel of prepared){assert.deepEqual(panel.pendingOffcut,prepared[1].pendingOffcut);assert.equal(panel.pendingOffcut.length,400);assert.equal(panel.pendingOffcut.width,800);}
 assert.equal(labels.collectScheduled(prepared,stock).length,1);
});
test('explicit conflicting retention decisions reject the sheet before generating identities',()=>{
 let generated=0;const options={uid:()=>String(++generated),genSku:()=>String(++generated)};
 const approved=row(),declined=row({panelNumber:'F2',pendingOffcut:{approved:false}});
 for(const input of [[approved,declined],[declined,approved]])assert.throws(()=>labels.prepareScheduled(input,[],options),/Conflicting offcut retention decisions.*Order 838.*Sheet 1/);
 assert.equal(generated,0);
});
test('all-null proposals withdraw the sheet approval and leave existing stock and identities untouched',()=>{
 const input=[row({pendingOffcut:null}),row({panelNumber:'F2',pendingOffcut:undefined})];
 const existing=[row({pendingOffcut:{length:800,width:400,labelSku:'OLD-1',labelOffcutId:'old-id'}})];
 const prepared=labels.prepareScheduled(input,existing,{});
 assert.deepEqual(prepared,input);assert.equal(prepared[0],input[0]);assert.equal(prepared[1],input[1]);
 assert.equal(labels.collectScheduled(prepared,stock).length,0);assert.equal(existing[0].pendingOffcut.labelSku,'OLD-1');
});
test('each retained proposal gets a label even for equal-size pieces, deduplicated by physical sheet and index',()=>{
 const pieces=[{length:500,width:1500,dimensionOrder:'sheet',source:'cnc-pdf'},{length:500,width:1500,dimensionOrder:'sheet',source:'cnc-pdf'}];
 const rows=[row({pendingOffcuts:pieces}),row({panelNumber:'F2',pendingOffcuts:pieces}),row({jobReference:'Other job',pendingOffcuts:pieces})];
 const result=labels.collectScheduled(rows,stock);
 assert.equal(result.length,4);assert.deepEqual(result.map(label=>label.proposalIndex),[0,1,0,1]);
 assert.deepEqual([result[0].length,result[0].width],[500,1500]);assert.equal(result[0].dimensionOrder,'sheet');
 assert.notEqual(result[0].sku,result[1].sku);assert.match(result[0].sku,/Piece 1$/);assert.match(result[1].sku,/Piece 2$/);
});
test('equal-spec physical pieces share their planned stock identity while printing separate labels',()=>{
 let generated=0;const options={...stock,uid:()=>`ID-${++generated}`,genSku:()=>`OC-${++generated}`};
 const pieces=[{length:500,width:1500,dimensionOrder:'sheet',source:'cnc-pdf'},{length:500,width:1500,dimensionOrder:'sheet',source:'cnc-pdf'}];
 const input=[row({pendingOffcuts:pieces}),row({panelNumber:'F2',pendingOffcuts:[]})],before=JSON.stringify(input);
 const prepared=labels.prepareScheduled(input,[],options);
 assert.equal(JSON.stringify(input),before);assert.equal(generated,2);
 assert.equal(prepared[0].pendingOffcuts.length,2);assert.deepEqual(prepared[0].pendingOffcuts,prepared[1].pendingOffcuts);
 assert.equal(prepared[0].pendingOffcut,prepared[0].pendingOffcuts[0]);
 assert.equal(prepared[0].pendingOffcuts[0].labelSku,prepared[0].pendingOffcuts[1].labelSku);
 assert.equal(prepared[0].pendingOffcuts[0].labelOffcutId,prepared[0].pendingOffcuts[1].labelOffcutId);
 assert.equal(labels.collectScheduled(prepared,stock).length,2);
});
test('matching inventory stock identity wins without changing its quantity or transposing ordered axes',()=>{
 const inventory={id:'existing-piece',sku:'EXISTING-1',qty:7,color:'White satin',material:'Solid aluminium',thickness:3,width:500,height:1500,dimensionOrder:'sheet'};
 const options={variants:stock.variants,offcuts:[inventory],uid(){throw Error('Should reuse inventory ID');},genSku(){throw Error('Should reuse inventory SKU');}};
 const pieces=[{length:500,width:1500,dimensionOrder:'sheet',source:'cnc-pdf'},{length:500,width:1500,dimensionOrder:'sheet',source:'cnc-pdf'}];
 const prepared=labels.prepareScheduled([row({pendingOffcuts:pieces})],[],options);
 assert.equal(inventory.qty,7);assert.equal(prepared[0].pendingOffcuts.length,2);
 assert.ok(prepared[0].pendingOffcuts.every(piece=>piece.labelSku==='EXISTING-1'&&piece.labelOffcutId==='existing-piece'));
 const result=labels.collectScheduled(prepared,options);assert.equal(result.length,2);assert.ok(result.every(label=>label.sku==='EXISTING-1'));
 const item=labels.fromItem(inventory);assert.deepEqual([item.length,item.width],[500,1500]);assert.match(labels.buildDocument(item),/500 × 1500 mm/);
 assert.deepEqual([labels.fromItem({...inventory,dimensionOrder:undefined}).length,labels.fromItem({...inventory,dimensionOrder:undefined}).width],[1500,500]);
});
test('array proposals take precedence over legacy fallback and support at most twenty physical pieces',()=>{
 const stale=row({pendingOffcuts:[]});assert.equal(labels.collectScheduled([stale],stock).length,0);
 const withdrawn=labels.prepareScheduled([stale],[],{});assert.deepEqual(withdrawn[0].pendingOffcuts,[]);assert.equal(withdrawn[0].pendingOffcut,null);
 const pieces=Array.from({length:20},()=>({length:100,width:200,source:'cnc-pdf'}));
 assert.equal(labels.collectScheduled([row({pendingOffcuts:pieces})],stock).length,20);
 pieces.push(pieces[0]);assert.throws(()=>labels.collectScheduled([row({pendingOffcuts:pieces})],stock),/at most 20/);
 assert.throws(()=>labels.prepareScheduled([row({pendingOffcuts:pieces})],[],{}),/at most 20/);
});
test('PDF revisions refresh changed proposal identities and preserve explicit sheet axes',()=>{
 let n=0;const options={uid:()=>`ID-${++n}`,genSku:()=>`OC-${++n}`};
 const input=row({pendingOffcuts:[{length:500,width:1500,dimensionOrder:'sheet'},{length:300,width:2000,dimensionOrder:'sheet'}]});
 const prepared=labels.prepareScheduled([input],[],options);
 assert.notEqual(prepared[0].pendingOffcuts[0].labelSku,prepared[0].pendingOffcuts[1].labelSku);
 const updated=labels.prepareScheduled([row({pendingOffcuts:[{length:'450',width:'1500',dimensionOrder:'sheet'},{length:'250',width:'2000',dimensionOrder:'sheet'}]})],prepared,options);
 assert.equal(n,8);assert.notEqual(updated[0].pendingOffcuts[0].labelSku,prepared[0].pendingOffcuts[0].labelSku);assert.notEqual(updated[0].pendingOffcuts[1].labelSku,prepared[0].pendingOffcuts[1].labelSku);
 assert.deepEqual(updated[0].pendingOffcuts.map(piece=>[piece.length,piece.width]),[[450,1500],[250,2000]]);
 assert.equal(labels.formatDimensions(480,1200,'sheet'),'480 × 1,200 mm');
});
test('revising one grouped piece gives it a fresh identity and keeps the unchanged piece stable',()=>{
 let n=0;const options={...stock,uid:()=>`ID-${++n}`,genSku:()=>`OC-${++n}`};
 const piece={length:500,width:1200,dimensionOrder:'sheet',source:'cnc-pdf'};
 const prepared=labels.prepareScheduled([row({pendingOffcuts:[{...piece},{...piece}]})],[],options);
 assert.equal(prepared[0].pendingOffcuts[0].labelOffcutId,prepared[0].pendingOffcuts[1].labelOffcutId);
 const revised=prepared[0].pendingOffcuts.map((item,index)=>index?{...item}:{...item,length:450});
 const updated=labels.prepareScheduled([row({pendingOffcuts:revised})],prepared,options)[0].pendingOffcuts;
 assert.notEqual(updated[0].labelOffcutId,updated[1].labelOffcutId);assert.notEqual(updated[0].labelSku,updated[1].labelSku);
 assert.equal(updated[1].labelOffcutId,prepared[0].pendingOffcuts[1].labelOffcutId);assert.equal(updated[1].labelSku,prepared[0].pendingOffcuts[1].labelSku);
});
test('stale embedded inventory IDs cannot be reused for changed sizes with or without existing schedule rows',()=>{
 let n=0;const inventory={id:'existing-cut',sku:'EXISTING-1',qty:3,color:'White satin',material:'Solid aluminium',thickness:3,width:500,height:1200,dimensionOrder:'sheet'};
 const options={variants:stock.variants,offcuts:[inventory],uid:()=>`ID-${++n}`,genSku:()=>`OC-${++n}`};
 const prepared=labels.prepareScheduled([row({pendingOffcuts:[{length:500,width:1200,dimensionOrder:'sheet',source:'cnc-pdf'}]})],[],options);
 const embedded={...prepared[0].pendingOffcuts[0],length:450};
 for(const existing of [prepared,[]]){
  const updated=labels.prepareScheduled([row({pendingOffcuts:[embedded]})],existing,options)[0].pendingOffcuts[0];
  assert.notEqual(updated.labelOffcutId,inventory.id);assert.notEqual(updated.labelSku,inventory.sku);
 }
 const stable=labels.prepareScheduled(prepared,prepared,options)[0].pendingOffcuts[0];assert.equal(stable.labelOffcutId,inventory.id);assert.equal(stable.labelSku,inventory.sku);assert.equal(inventory.qty,3);
});
test('inventory labels support sheet offcuts and workshop profiles without multiplying quantity',()=>{
 const item={id:'o',sku:'OC-9',material:'Aluminium',color:'Silver',thickness:3,width:200,height:600,qty:17,sourceOrderNumber:'838',sourceSheetNumber:'1'};
 const before=JSON.stringify(item),label=labels.fromItem(item),html=labels.buildDocument(label);
 assert.equal(JSON.stringify(item),before);assert.equal(label.provisional,false);assert.equal(label.order,'838');
 assert.equal((html.match(/<article /g)||[]).length,1);
 assert.equal((labels.buildDocument(label,{copies:2}).match(/<article /g)||[]).length,2);
 const profile=labels.fromItem({id:'profile',name:'F16 extrusion',colour:'Black',lengthMm:1800,dimensions:'50 × 25 mm',qty:6});
 assert.equal(profile.dimensionText,'1,800 mm long · 50 × 25 mm');assert.equal(profile.material,'F16 extrusion');
 assert.match(labels.buildDocument(profile),/1,800 mm long · 50 × 25 mm/);
 for(const copies of [0,-1,1.5,101,Infinity])assert.throws(()=>labels.buildDocument(label,{copies}),/copies/);
 assert.equal(labels.fromItem({width:0,height:500}),null);
});
test('compact output centres three essential lines and escapes supplied descriptions',()=>{
 const dangerous='</script><img src=x onerror="alert(1)"> & \'test\'';
 const html=labels.buildDocument({length:500,width:200,material:dangerous,color:dangerous,sku:dangerous,job:dangerous,order:dangerous,sheet:dangerous,provisional:true});
 assert.match(html,/@page\{size:50mm 30mm;margin:0\}/);assert.match(html,/width:50mm;height:30mm/);
 assert.match(html,/50 × 30 mm/);assert.match(html,/justify-content:center;align-items:center/);assert.match(html,/text-align:center/);
 assert.match(html,/500 × 200 mm/);assert.doesNotMatch(html,/<img src=x/);assert.match(html,/&lt;\/script&gt;&lt;img/);
 assert.match(html,/font-size:17pt/);assert.match(html,/font-size:12.4pt/);assert.match(html,/font-size:13pt/);assert.equal(labels.formatDimensions(200,500),'500 × 200 mm');
 assert.equal(labels.formatDimensions(0,500),'');assert.equal(labels.escapeHtml('<&"\''),'&lt;&amp;&quot;&#39;');
});
test('popup blocking returns a useful fallback and printing keeps a user-operated toolbar',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../offcut-labels.js'),'utf8');
 let warning='',printed=0,written='',preference='';
 const popup={document:{open(){},write(value){written=value;},close(){}},focus(){},print(){printed++;}};
 const host={open:()=>null,alert:message=>{warning=message;},localStorage:{getItem:()=>null,setItem:(key,value)=>{preference=value;}}};
 vm.runInNewContext(source,{window:host});
 const item={length:200,width:50,sku:'OC-1'};
 assert.equal(host.PanelStockOffcutLabels.print(item).reason,'popup-blocked');assert.match(warning,/Allow pop-ups/);
 host.open=()=>popup;assert.equal(host.PanelStockOffcutLabels.print(item).ok,true);
 assert.equal(printed,0);assert.equal(preference,'50x30');assert.match(written,/id="print-labels"/);assert.match(written,/id="download-labels"/);
 host.PanelStockOffcutLabels.print(item,{autoPrint:false});assert.equal(printed,0);
 host.PanelStockOffcutLabels.print(item,{autoPrint:true});assert.equal(printed,1);
 assert.equal(host.PanelStockOffcutLabels.getDefaultSize(),'50x30');
});

test('printed labels contain no brand, inventory identity, project references or verification footer',()=>{
 const html=labels.buildDocument({length:2065,width:1500,material:'Solid aluminium',color:'Monument satin',thickness:3,sku:'SECRET-ID',job:'PRIVATE-JOB',order:'PRIVATE-ORDER',sheet:'PRIVATE-SHEET',provisional:true});
 const printed=html.match(/<article[^>]*>([\s\S]*?)<\/article>/)[1];
 assert.equal((printed.match(/class="label-line /g)||[]).length,3);
 assert.match(printed,/2065 × 1500 mm/);assert.match(printed,/3 mm · Solid aluminium/);assert.match(printed,/Monument satin/);
 for(const removed of ['LENNOX','FACADES','SECRET-ID','PRIVATE-JOB','PRIVATE-ORDER','PRIVATE-SHEET','Verify','Confirm','OFFCUT ID','<footer','<header'])assert.ok(!printed.includes(removed),removed);
 assert.equal(labels.setDefaultSize('50 × 30'),'50x30');assert.throws(()=>labels.setDefaultSize('A5'),/50 × 30/);
});
test('long descriptions stop at eight points and truncate explicitly while retaining preview text',()=>{
 const original='Architectural aluminium description '.repeat(30);
 const node={textContent:original,style:{},attributes:{},clientWidth:174,get scrollWidth(){return this.textContent.length*parseFloat(this.style.fontSize||'22')*.55;},setAttribute(key,value){this.attributes[key]=value;}};
 const document={querySelectorAll:()=>[node],defaultView:{getComputedStyle:()=>({fontSize:'22.6667px'})}};
 labels.fitLabels(document);
 assert.ok(parseFloat(node.style.fontSize)>=8*96/72);assert.ok(node.scrollWidth<=node.clientWidth+.5);assert.ok(node.textContent.endsWith('…'));assert.equal(node.attributes.title,original);
 const first=node.textContent;labels.fitLabels(document);assert.equal(node.textContent,first);assert.equal(node.attributes.title,original);
});
