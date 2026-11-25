const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {parsePage,matchRows}=require('../qa-panel-area-import.js');
const drawing=(id='A-1',area='0.859')=>`ORDER:\n Batch 2\nPANEL\nID:\n ${id}\nDATE:\n24-11-26\nm2:\n ${area}\nProject\nName:\nTest tower\nMeasured\nby:\nSITE\nEND PLATES A-1 EP-L A-1 EP-R\n999 x 999`;
const item=(id='a',extra={})=>({id,kind:'panel',project:'Test tower',orderNumber:'42',reference:'A-1',status:'awaiting',...extra});
test('sticker extraction takes the labelled main panel area and never assigns unlabelled end plate or bounding-box dimensions',()=>{
 assert.deepEqual(parsePage(drawing(),1),{page:1,reference:'A-1',areaM2:.859,order:'Batch 2',project:'Test tower',date:'24-11-26'});
 assert.equal(parsePage(drawing('Z5W1-4a','1.212').replace('m2:','m²:'),2).reference,'Z5W1-4a');
 for(const area of ['0','-1','NaN','Infinity','999999','0.859oops'])assert.ok(parsePage(drawing('A',area),1).error);
 assert.ok(parsePage('Scanned image / no text',1).error);assert.ok(parsePage(drawing()+drawing('B-1'),1).error);
});
test('matching is scoped to the chosen project and order, blocks duplicate references and leaves ambiguous remakes for manual review',()=>{
 const row=parsePage(drawing(),1),scope={project:'Test tower',orderNumber:'42'};
 assert.equal(matchRows([row],[item('wrong',{project:'Other tower'}),item()],scope,true)[0].item.id,'a');
 assert.equal(matchRows([row],[item('wrong',{orderNumber:'43'})],scope,true)[0].state,'blocked');
 assert.equal(matchRows([row],[item(),item('remake')],scope,true)[0].state,'blocked');
 assert.ok(matchRows([row,{...row,page:2}],[item()],scope,true).every(row=>row.state==='blocked'));
 assert.equal(matchRows([row],[item('case',{reference:'a-1'})],scope,true)[0].state,'ready');
});
test('existing areas are never silently overwritten and approved corrections require QA management',()=>{
 const row=parsePage(drawing(),1),scope={project:'Test tower',orderNumber:'42'};
 assert.equal(matchRows([row],[item('a',{panelArea:{areaM2:.859}})],scope,false)[0].state,'same');
 const approved=item('a',{status:'approved',panelArea:{areaM2:2}});
 assert.equal(matchRows([row],[approved],scope,false)[0].state,'blocked');assert.equal(matchRows([row],[approved],scope,true)[0].state,'replace');
 assert.equal(matchRows([row],[item('a',{status:'approved'})],scope,false)[0].state,'ready');
 for(const status of ['recut','not_required','replaced'])assert.equal(matchRows([row],[item('a',{status})],scope,true)[0].state,'blocked');
});
test('production packaging includes the importer and the QA Centre entry point',()=>{
 const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),build=fs.readFileSync(path.join(root,'scripts/build-production.cjs'),'utf8');
 assert.match(html,/qa-panel-area-import\.js\?v=/);assert.match(html,/Import panel m² PDF/);assert.match(build,/'qa-panel-area-import.js'/);
});
