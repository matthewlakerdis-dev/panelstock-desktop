const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const source=html.slice(html.indexOf('  function prepareCatalogBulkRows('),html.indexOf('  function CatalogAdmin('));
const prepare=vm.runInNewContext(source+';prepareCatalogBulkRows');
const shared={material:' Solid Aluminium ',color:' White '};
const line={thickness:'3',width:'1200',height:'2400',reorderPoint:''};
test('catalog bulk entry converts dimensions, trims shared fields and defaults reorder to zero',()=>{
 const result=prepare(shared,[line,{...line,width:'1500',reorderPoint:'10'},{}]);
 assert.equal(result.errors.length,0);assert.equal(result.rows.length,2);
 assert.deepEqual(JSON.parse(JSON.stringify(result.rows[0])),{material:'Solid Aluminium',color:'White',thickness:3,width:1200,height:2400,reorderPoint:0});
 assert.equal(result.rows[1].reorderPoint,10);
});
test('catalog bulk rejects incomplete dimensions, invalid reorder points and duplicates without partial rows',()=>{
 for(const bad of [{...line,width:''},{...line,height:'-1'},{...line,thickness:'Infinity'},{...line,reorderPoint:'1.5'},{...line,reorderPoint:'-1'}]){
  const result=prepare(shared,[line,bad]);assert.equal(result.rows.length,0);assert.ok(result.errors.length);
 }
 assert.ok(prepare({material:' ',color:'White'},[line]).errors.length);
 assert.ok(prepare(shared,[]).errors.length);
 assert.ok(prepare(shared,[line,{...line,width:'01200'}]).errors.length);
 assert.ok(prepare(shared,[line],[{material:'solid aluminium',color:'white',thickness:3,width:1200,height:2400}]).errors.length);
});
test('catalog batch creates linked catalog and zero-stock entries in one save without changing existing stock',()=>{
 const start=html.indexOf('    function addCatalogItemsBulk('),end=html.indexOf('    function removeCatalogItem(',start);
 const catalog=[{id:'old'}],variants=[{id:'stock',qty:27}];let saved=[],logs=[],id=0;
 const rows=prepare(shared,[line,{...line,width:'1500'}]).rows;
 vm.runInNewContext(html.slice(start,end)+';addCatalogItemsBulk(rows);',{rows,catalog,variants,uid:()=>String(++id),genSku:()=> 'SKU'+(++id),setCatalog(){},setVariants(){},persist:next=>saved.push(next),logTxn:tx=>logs.push(tx),showToast(){}});
 assert.equal(saved.length,1);assert.equal(logs.length,1);assert.equal(saved[0].variants[0],variants[0]);
 assert.equal(saved[0].catalog.length,3);assert.equal(saved[0].variants.length,3);
 for(let i=1;i<=2;i++){const c=saved[0].catalog[i],v=saved[0].variants[i];assert.equal(v.catalogId,c.id);assert.equal(v.sku,c.sku);assert.equal(v.qty,0);}
 assert.notEqual(saved[0].catalog[1].sku,saved[0].catalog[2].sku);
});
