const {test}=require('node:test');
const assert=require('node:assert/strict');
const labels=require('../offcut-labels.js');

const stock={
 variants:[{id:'source',sku:'SHEET-WHITE',material:'Solid aluminium',color:'White satin',thickness:3,qty:6}],
 offcuts:[{id:'retained',sku:'ACTUAL-OC',material:'Changed live material',color:'Changed live colour',thickness:8,width:999,height:888,qty:2}]
};
const proposal=(patch={})=>({length:480,width:1200,dimensionOrder:'sheet',source:'manual',status:'pending',approved:true,labelSku:'PLANNED-OC',labelOffcutId:'planned',...patch});
const panel=(patch={})=>({id:'panel-a',jobReference:'College',orderNumber:'00838',sheetNumber:'01',panelNumber:'A',status:'pending',stockItemType:'variant',stockItemId:'source',stockSku:'SHEET-WHITE',pendingOffcuts:[proposal()],...patch});
const saved=(patch={})=>({length:450,width:1200,dimensionOrder:'sheet',material:'Recorded aluminium',color:'Recorded champagne',thickness:4,labelSku:'PLANNED-OC',stockSku:'ACTUAL-OC',...patch});
const completed=(patch={})=>panel({status:'completed',offcutOutcome:'confirmed',savedOffcuts:[saved()],offcutDetails:saved(),...patch});
function freeze(value){
 if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}
 return value;
}

test('CNC reprints count physical offcuts by job, order, sheet and piece index, rather than SKU or panel',()=>{
 const pieces=[proposal(),proposal()];
 const rows=[panel({pendingOffcuts:pieces}),panel({id:'panel-b',panelNumber:'B',jobReference:' COLLEGE ',pendingOffcuts:pieces}),panel({jobReference:'Another project',pendingOffcuts:pieces}),panel({orderNumber:'00839',pendingOffcuts:pieces}),panel({sheetNumber:'1',pendingOffcuts:pieces})];
 const result=labels.collectForCnc(rows,stock);
 assert.equal(result.length,8);
 assert.deepEqual(result.map(label=>label.proposalIndex),[0,1,0,1,0,1,0,1]);
 assert.ok(result.every(label=>label.sku==='PLANNED-OC'));
 assert.equal(new Set(result.map(label=>JSON.stringify([label.job.toLowerCase(),label.order,label.sheet]))).size,4);
 assert.ok(result.every(label=>label.provisional===true));
 assert.deepEqual([result[0].length,result[0].width,result[0].dimensionOrder],[480,1200,'sheet']);
 assert.equal(labels.countForCnc(rows,stock),8);
});

test('pending reprints exclude cancelled, declined and rejected retention decisions and explicit rejection',()=>{
 for(const status of ['cancelled','canceled','declined','rejected']){
  assert.equal(labels.collectForCnc([panel({pendingOffcuts:[proposal({status})]})],stock).length,0,status);
 }
 assert.equal(labels.collectForCnc([panel({pendingOffcuts:[proposal({approved:false})]})],stock).length,0);
 assert.equal(labels.collectForCnc([panel({pendingOffcuts:[],pendingOffcut:proposal()})],stock).length,0,'an explicit empty array withdraws the legacy proposal');
 assert.equal(labels.collectForCnc([panel({pendingOffcuts:[proposal({status:undefined})]})],stock).length,1,'older approved proposals need not have an explicit status');
});

test('completed reprints use actual saved dimensions, axes, material and inventory SKU instead of planned or live values',()=>{
 const rows=[completed(),completed({id:'panel-b',panelNumber:'B'})];
 const result=labels.collectForCnc(rows,stock);
 assert.equal(result.length,1);
 const label=result[0];
 assert.deepEqual([label.length,label.width,label.dimensionOrder],[450,1200,'sheet']);
 assert.deepEqual([label.material,label.color,label.thickness],['Recorded aluminium','Recorded champagne',4]);
 assert.equal(label.sku,'ACTUAL-OC');
 assert.equal(label.provisional,false);
 assert.deepEqual([label.job,label.order,label.sheet],['College','00838','01']);
 assert.equal(labels.collectScheduled(rows,stock).length,0,'automatic scheduling collection still excludes completed work');
 const html=labels.buildDocument(result);
 assert.match(html,/@page\{size:50mm 30mm;margin:0\}/);
 assert.match(html,/450 × 1200 mm/);
 assert.match(html,/4 mm · Recorded aluminium/);
 assert.match(html,/Recorded champagne/);
 assert.doesNotMatch(html,/Changed live material|White satin/);
});

test('equal-size saved pieces sharing one stock SKU each get a label while sibling panels do not duplicate them',()=>{
 const pieces=[saved(),saved()];
 const rows=[completed({savedOffcuts:pieces}),completed({id:'panel-b',panelNumber:'B',savedOffcuts:pieces})];
 const result=labels.collectForCnc(rows,{variants:[],offcuts:[]});
 assert.equal(result.length,2);
 assert.deepEqual(result.map(label=>label.proposalIndex),[0,1]);
 assert.ok(result.every(label=>label.sku==='ACTUAL-OC'&&label.provisional===false));
 assert.equal((labels.buildDocument(result).match(/<article class="label"/g)||[]).length,2);
});

test('recorded completion decisions override stale proposals on pending siblings regardless of row order',()=>{
 const pending=panel({id:'pending-sibling',panelNumber:'B'}),retained=completed();
 for(const rows of [[pending,retained],[retained,pending]]){
  const result=labels.collectForCnc(rows,stock);
  assert.equal(result.length,1);
  assert.equal(result[0].length,450);
  assert.equal(result[0].sku,'ACTUAL-OC');
  assert.equal(result[0].provisional,false);
 }
 const none=completed({offcutOutcome:'none',savedOffcuts:[],offcutDetails:null});
 for(const rows of [[pending,none],[none,pending]])assert.equal(labels.collectForCnc(rows,stock).length,0,'an operator decision not to retain an offcut cannot resurrect its proposal');
});

test('completed work needs recorded retention and an explicit empty saved list overrides stale legacy details',()=>{
 const invalid=[
  completed({offcutOutcome:'none'}),
  completed({offcutOutcome:undefined,savedOffcuts:undefined,offcutDetails:null}),
  completed({savedOffcuts:[]}),
  completed({savedOffcuts:undefined,offcutDetails:null}),
  completed({savedOffcuts:[saved({length:0})]})
 ];
 for(const row of invalid)assert.equal(labels.collectForCnc([row],stock).length,0,JSON.stringify(row));
 assert.equal(labels.countForCnc(invalid,stock),0);
});

test('legacy single saved offcuts reprint from historical snapshots after their source stock has gone',()=>{
 const row=completed({savedOffcuts:undefined,offcutDetails:saved({dimensionOrder:undefined,labelSku:undefined,stockSku:undefined})});
 const result=labels.collectForCnc([row],{variants:[],offcuts:[]});
 assert.equal(result.length,1);
 assert.deepEqual([result[0].length,result[0].width],[1200,450],'legacy unordered dimensions retain longest-first formatting');
 assert.deepEqual([result[0].material,result[0].color,result[0].thickness],['Recorded aluminium','Recorded champagne',4]);
 assert.notEqual(result[0].sku,'PLANNED-OC','an unrecorded final SKU must not be copied from the original proposal');
 assert.equal(result[0].provisional,false);
});

test('historical saved snapshots establish retention when the outcome flag was not recorded',()=>{
 for(const row of [completed({offcutOutcome:undefined}),completed({offcutOutcome:undefined,savedOffcuts:undefined})]){
  const result=labels.collectForCnc([row],{variants:[],offcuts:[]});
  assert.equal(result.length,1);
  assert.equal(result[0].sku,'ACTUAL-OC');
  assert.equal(result[0].length,450);
  assert.equal(result[0].provisional,false);
 }
});

test('an individually completed panel without a retention result does not cancel its pending sibling proposal',()=>{
 const pending=panel(),individual=panel({id:'panel-b',panelNumber:'B',status:'completed',offcutOutcome:undefined,savedOffcuts:undefined,offcutDetails:undefined});
 for(const rows of [[pending,individual],[individual,pending]]){
  const result=labels.collectForCnc(rows,stock);
  assert.equal(result.length,1);
  assert.equal(result[0].length,480);
  assert.equal(result[0].sku,'PLANNED-OC');
  assert.equal(result[0].provisional,true);
 }
});

test('pending historical proposals can use their recorded material when linked stock is unavailable',()=>{
 const row=panel({pendingOffcuts:[proposal({material:'Recorded ACM',color:'Black',thickness:4})]});
 const result=labels.collectForCnc([row],{variants:[],offcuts:[]});
 assert.equal(result.length,1);
 assert.deepEqual([result[0].material,result[0].color,result[0].thickness,result[0].sku],['Recorded ACM','Black',4,'PLANNED-OC']);
 assert.deepEqual([result[0].length,result[0].width],[480,1200]);
});

test('reprinting and counting never generate identities or mutate inventory, proposals or completion snapshots',()=>{
 const rows=freeze([panel(),completed({sheetNumber:'02'})]);
 const source=freeze(JSON.parse(JSON.stringify(stock)));
 const before=JSON.stringify({rows,source});
 const options={...source,uid(){throw Error('Reprints must not create IDs');},genSku(){throw Error('Reprints must not create SKUs');}};
 assert.equal(labels.collectForCnc(rows,options).length,2);
 assert.equal(labels.countForCnc(rows,options),2);
 assert.equal(JSON.stringify({rows,source}),before);
});
