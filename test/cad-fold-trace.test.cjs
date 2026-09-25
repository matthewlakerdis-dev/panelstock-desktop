const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const ctx=vm.createContext({window:{}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../cad/outline-correction.js'),'utf8'),ctx);
const pts=[{x:0,y:900},{x:900,y:900},{x:900,y:600},{x:900,y:330},{x:900,y:65},{x:0,y:65},{x:0,y:330},{x:0,y:600}];
const vals=[1280,300,270,265,1280,265,270,300].map((site,i)=>({site,code:i===0?'NT':i===4?'B':i<4?'RE':'S'}));
test('fold-to-fold measurements form perimeter and bottom-up folds',()=>{
 const r=ctx.window.PanelOutlineCorrection.sections(pts,vals);
 assert.deepEqual(JSON.parse(JSON.stringify(r.edges.map(e=>e.site))),[1280,835,1280,835]);
 assert.deepEqual(JSON.parse(JSON.stringify(r.siteFolds)),[300,570]);
 assert.equal(r.outlineSections.length,8);
});
test('section edits recompute inferred fold heights',()=>{
 const v=vals.map(e=>({...e}));v[1].site=310;v[3].site=255;v[5].site=255;v[7].site=310;
 const r=ctx.window.PanelOutlineCorrection.sections(pts,v);
 assert.deepEqual(JSON.parse(JSON.stringify(r.siteFolds)),[310,580]);
});
test('inconsistent opposite sections cannot silently generate a panel',()=>{
 const v=vals.map(e=>({...e}));v[1].site=320;
 assert.throws(()=>ctx.window.PanelOutlineCorrection.sections(pts,v),/do not close/);
});
