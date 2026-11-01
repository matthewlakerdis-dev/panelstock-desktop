const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../workshop-stock.js'),'utf8');
const sample={name:'November count',categories:['Extrusions'],supplier:'Supplier & Co',completedAt:'2026-11-01T22:00:00Z',rows:[{itemId:'a',name:'Angle <black>',sku:'=1+1',unit:'lengths',expectedQty:10,quantity:0,variance:-10,user:'Worker',at:'2026-11-01T22:00:00Z'}]};
function setup(){const context={window:{},TextEncoder,Blob};vm.runInNewContext(source,context);return context.window.PanelStockStocktakeReport;}
test('exports create a real branded XLSX with numeric counts and formula-safe text',async()=>{
 const bytes=Buffer.from(await setup().xlsx(sample).arrayBuffer());let offset=0,files={};
 while(bytes.readUInt32LE(offset)===0x04034b50){assert.equal(bytes.readUInt16LE(offset+8),0);const size=bytes.readUInt32LE(offset+18),length=bytes.readUInt16LE(offset+26),name=bytes.subarray(offset+30,offset+30+length).toString();files[name]=bytes.subarray(offset+30+length,offset+30+length+size).toString();offset+=30+length+size;}
 assert.ok(files['[Content_Types].xml']);assert.match(files['xl/worksheets/sheet1.xml'],/LENNOX FACADES/);assert.match(files['xl/worksheets/sheet1.xml'],/&lt;black&gt;/);assert.match(files['xl/worksheets/sheet1.xml'],/=1\+1/);assert.doesNotMatch(files['xl/worksheets/sheet1.xml'],/<f>/);assert.match(files['xl/worksheets/sheet1.xml'],/t="n"><v>0<\/v>/);assert.match(files['xl/styles.xml'],/FF155E75/);
});
test('branded PDF paginates with repeated headers and valid cross-reference offsets',async()=>{
 const report={...sample,rows:Array.from({length:23},()=>sample.rows[0])};const pdf=await setup().pdf(report).text();assert.ok(pdf.startsWith('%PDF-1.4'));assert.match(pdf,/\/Count 3/);assert.equal((pdf.match(/STOCKTAKE REPORT/g)||[]).length,3);assert.match(pdf,/LENNOX/);assert.match(pdf,/Page 3 of 3/);
 const offset=Number(pdf.match(/startxref\n(\d+)/)[1]);assert.equal(pdf.slice(offset,offset+4),'xref');
});
test('completed stocktake report can be reopened and final submission opens it automatically',async()=>{
 const states=[];let cursor=0;
 const data={revision:1,items:[{id:'a',name:'Angle',sku:'A',category:'extrusions',qty:10,available:10,unit:'lengths'}],movements:[],stocktakes:[{id:'c',name:sample.name,categories:['extrusions'],itemIds:['a'],counts:{},status:'open'}]};
 const completed={...data,stocktakes:[{...data.stocktakes[0],status:'completed',counts:{a:{quantity:0}},report:sample}]};
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:v=>{const i=cursor++;if(!(i in states))states[i]=typeof v==='function'?v():v;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useEffect(){},Fragment:'fragment'};
 const context={window:{},TextEncoder,Blob,crypto:{randomUUID:()=> 'unique'},PanelStock:{username:'worker',apiFetch:async(url,options)=>({ok:true,json:async()=>options?completed:data})},localStorage:{getItem:()=>null,setItem(){},removeItem(){}}};vm.runInNewContext(source,context);
 const C=context.window.createWorkshopStock(React),walk=n=>!n||typeof n!=='object'?[]:[n,...(n.children||[]).flat(Infinity).flatMap(walk)];const render=()=>{cursor=0;return walk(C({taskAccess:{'factory.stock':true}}));};
 render();states[0]=data;let nodes=render();nodes.find(n=>n.type==='button'&&n.children.includes('Stocktake')).props.onClick();nodes=render();nodes.find(n=>n.type==='button'&&n.children.includes('Start count')).props.onClick();nodes=render();nodes.find(n=>n.props['data-count-input']).props.onChange({target:{value:'0'}});nodes=render();nodes.find(n=>n.children.includes('Review counts')).props.onClick();nodes=render();await nodes.find(n=>n.type==='button'&&n.children.includes('Submit stocktake')).props.onClick();nodes=render();assert.ok(nodes.some(n=>n.props['aria-label']==='Completed stocktake report'));assert.ok(nodes.some(n=>n.children.includes('Download PDF')));
 nodes.find(n=>n.type==='button'&&n.children.includes('Back to stocktakes')).props.onClick();nodes=render();nodes.find(n=>n.type==='button'&&n.children.includes('View report')).props.onClick();assert.ok(render().some(n=>n.props['aria-label']==='Completed stocktake report'));
});
