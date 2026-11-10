const {test}=require('node:test');
const assert=require('node:assert/strict');
const labels=require('../offcut-labels.js');
const jpeg=Uint8Array.from([255,216,0,128,255,217]);
const image=()=>({bytes:jpeg,width:1000,height:600});

test('downloaded labels have one exact 50 x 30 mm PDF page per physical label',()=>{
 const bytes=labels.buildPdfBytes([image(),image()]),source=Buffer.from(bytes).toString('latin1');
 assert.ok(bytes instanceof Uint8Array);assert.match(source,/^%PDF-1\.4/);
 assert.match(source,/\/Type \/Pages \/Count 2/);
 assert.equal((source.match(/\/Type \/Page /g)||[]).length,2);
 const boxes=[...source.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)];assert.equal(boxes.length,2);
 for(const [,width,height] of boxes){assert.ok(Math.abs(Number(width)*25.4/72-50)<.000001);assert.ok(Math.abs(Number(height)*25.4/72-30)<.000001);}
 assert.equal((source.match(/\/CropBox \[0 0 141\.732283 85\.039370\]/g)||[]).length,2);
 assert.match(source,/\/PrintScaling \/None/);assert.match(source,/\/PickTrayByPDFSize true/);
 assert.doesNotMatch(source,/595\.28|841\.89|A4/);
});
test('PDF binary image lengths and cross references are byte accurate',()=>{
 const bytes=labels.buildPdfBytes([image(),image()]),buffer=Buffer.from(bytes),source=buffer.toString('latin1');
 const start=Number(source.match(/startxref\n(\d+)/)[1]);assert.equal(source.slice(start,start+4),'xref');
 const rows=source.slice(start).split('\n');assert.equal(rows[1],'0 9');assert.equal(rows[2],'0000000000 65535 f ');
 for(let id=1;id<9;id++){const offset=Number(rows[id+2].slice(0,10));assert.equal(source.slice(offset,offset+(`${id} 0 obj`).length),`${id} 0 obj`);}
 const streams=[...source.matchAll(/\/DCTDecode \/Length (\d+) >>\nstream\n/g)];assert.equal(streams.length,2);
 for(const stream of streams){const start=stream.index+stream[0].length;assert.deepEqual(buffer.subarray(start,start+Number(stream[1])),Buffer.from(jpeg));}
});
test('invalid or missing PDF images fail without downloading an empty document',()=>{
 for(const value of [[],null])assert.throws(()=>labels.buildPdfBytes(value),/no offcut labels/);
 for(const patch of [{bytes:new Uint8Array(0)},{bytes:'bad'},{width:0},{height:-1},{width:1.5}])assert.throws(()=>labels.buildPdfBytes([{...image(),...patch}]),/could not be prepared/);
});
test('mobile preview offers an explicit exact-size PDF without forcing the phone print dialog',()=>{
 const html=labels.buildDocument({length:480,width:1200,dimensionOrder:'sheet',thickness:3,material:'Solid aluminium',color:'Milled'});
 assert.match(html,/id="download-labels">Download 50 × 30 mm PDF/);
 assert.match(html,/id="print-labels">Print from browser/);
 assert.match(html,/phone print dialog may default to A4/);
 assert.match(html,/Browser printing cannot set your printer paper size/);
 assert.match(html,/function buildPdfBytes/);assert.match(html,/application\/pdf/);
 assert.doesNotMatch(html,/window\.print\(\);<\/script>/);
});
