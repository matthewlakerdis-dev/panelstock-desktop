const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');

test('catalog creation returns one material definition without creating a sized stock row',()=>{
 const start=html.indexOf('    function addCatalogItem('),end=html.indexOf('    function addCatalogItemsBulk(',start);
 const writes=[];let id=0;
 const item=vm.runInNewContext(html.slice(start,end)+';addCatalogItem({color:"Silver",material:"ACP",thickness:4,width:1200,height:2400});',{
  uid:()=>String(++id),genSku:()=> 'TEST-NEW',catalog:[],catalogKey:item=>`${item.color}|${item.material}|${item.thickness}`,setCatalog(){},persist:v=>writes.push(v),logTxn(){},showToast(){}
 });
 assert.equal(writes.length,1);assert.equal(item.id,writes[0].catalog[0].id);assert.equal(writes[0].variants,undefined);assert.equal(item.width,0);assert.equal(item.height,0);
});

test('receive page only accepts approved catalogue selections',()=>{
 const start=html.indexOf('  function ReceivePage('),end=html.indexOf('  function DispatchPage(',start);
 const receivePage=html.slice(start,end);
 assert.match(receivePage,/function ReceivePage\(\{ catalog, variants, onSubmit \}\)/);
 assert.match(receivePage,/onSubmit\(\{ catalogId: selected\.id/);
});
