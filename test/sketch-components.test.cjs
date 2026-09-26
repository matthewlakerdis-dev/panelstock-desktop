const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const c={window:{}};for(const f of ['sketch-components.js','outline-correction.js'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../cad',f),'utf8'),c);
const api=c.window.PanelSketchComponents;
const pts=[{x:0,y:900},{x:800,y:900},{x:800,y:500},{x:600,y:200},{x:0,y:200}];
const vals=[{site:800,kind:'horizontal',code:'B'},{site:400,kind:'vertical',code:'RE'},{width:200,height:300,kind:'sloping',code:'B'},{site:600,kind:'horizontal',code:'B'},{site:700,kind:'vertical',code:'S'}];
test('standard trace retains slopes and uses written projected dimensions',()=>{assert.doesNotThrow(()=>c.window.PanelOutlineCorrection.directions(pts,true));const d=api.build(pts,vals);assert.equal(d.measuredEdges[2].dx,-200);assert.equal(d.measuredEdges[2].dy,300);});
test('non-scale sketch pixels do not change millimetres',()=>{const d=api.build(pts,vals),p=pts.map(p=>({x:p.x*.4,y:p.y*.8}));assert.equal(JSON.stringify(api.build(p,vals)),JSON.stringify(d));});
test('missing sloping dimension and unclosed outline require correction',()=>{assert.throws(()=>api.build(pts,vals.map((v,i)=>i===2?{...v,height:null}:v)),/section 3/);assert.throws(()=>api.build(pts,vals.map((v,i)=>i===2?{...v,height:310}:v)),/gap/);});
test('reopening preserves dimensions, fold endpoints and each separate tag',()=>{const d=api.build(pts,vals,[{from:3,to:4}],{rightAngles:[{fold:0,end:1,edge:4}]});const r=api.restore({...d,outlineSections:pts.map(start=>({start}))});const saved=api.build(r.points,r.values,r.folds,{rightAngles:d.rightAngles});assert.equal(JSON.stringify(saved),JSON.stringify(d));r.values[2].code='S';const edited=api.build(r.points,r.values,r.folds);assert.equal(edited.measuredEdges[2].dy,300);assert.equal(edited.measuredFolds.length,1);});
function calculationFixture(){return {p:[{x:0,y:900},{x:1000,y:900},{x:1000,y:260},{x:900,y:60},{x:980,y:60},{x:980,y:0},{x:0,y:0},{x:0,y:260}],v:[{kind:'sloping',width:1000,height:null,calculateheight:true},{kind:'vertical',site:620},{kind:'sloping',width:null,height:200,calculatewidth:true},{kind:'horizontal',site:80},{kind:'vertical',site:60},{kind:'horizontal',site:980},{kind:'vertical',site:260},{kind:'vertical',site:640}].map(v=>({...v,code:'B'}))};}
test('explicit Calculate finds missing across and shallow rise without pixel scaling',()=>{const {p,v}=calculationFixture(),before=JSON.stringify(v),r=api.resolve(p,v);assert.equal(r.values[0].height,20);assert.equal(r.values[2].width,100);assert.equal(JSON.stringify(v),before);assert.doesNotThrow(()=>api.build(p,r.values));});
test('two missing rises require a constraint and a marked right angle resolves both',()=>{const {p,v}=calculationFixture();v[2].calculateheight=true;assert.throws(()=>api.resolve(p,v),/More than one missing/);const r=api.resolve(p,v,[{from:2,to:7}],{rightAngles:[{fold:0,end:0,edge:1}]});assert.equal(r.values[0].height,20);assert.equal(r.values[2].height,200);});
test('Calculate never silently changes supplied measurements',()=>{const {p,v}=calculationFixture();v[0].calculateheight=false;v[0].height=0;const r=api.resolve(p,v);assert.equal(r.values[0].height,0);assert.throws(()=>api.build(p,r.values),/gap/);});
test('missing horizontal and vertical lengths infer independently from perimeter totals',()=>{const p=[{x:0,y:100},{x:100,y:100},{x:100,y:0},{x:0,y:0}],v=[{site:320},{site:null},{site:null},{site:180}].map(v=>({...v,code:'B'})),before=JSON.stringify(v),r=api.infer(p,v);assert.equal(r.values[1].site,180);assert.equal(r.values[2].site,320);assert.equal(JSON.stringify(v),before);});
test('ambiguous axis stays blank while independent axis is calculated',()=>{const p=[{x:0,y:100},{x:100,y:100},{x:100,y:0},{x:0,y:0}],v=[{site:null},{site:180},{site:null},{site:null}].map(v=>({...v,code:'B'})),r=api.infer(p,v);assert.equal(r.values[0].site,null);assert.equal(r.values[2].site,null);assert.equal(r.values[3].site,180);assert.equal(r.remaining,2);});
test('all blank slope components are calculated without opt-in flags',()=>{const {p,v}=calculationFixture();for(const e of v){delete e.calculatewidth;delete e.calculateheight;}const r=api.infer(p,v);assert.equal(r.values[0].height,20);assert.equal(r.values[2].width,100);assert.equal(r.remaining,0);});
test('legacy calculation flags never overwrite a supplied value during inference',()=>{const {p,v}=calculationFixture();v[0].height=21;const r=api.infer(p,v);assert.equal(r.values[0].height,21);});
test('inferred normal lengths update when supplied dimensions change',()=>{const p=[{x:0,y:100},{x:100,y:100},{x:100,y:0},{x:0,y:0}],v=[{site:320},{site:null},{site:null},{site:180}].map(v=>({...v,code:'B'}));const first=api.infer(p,v);first.values[0].site=450;first.values[3].site=210;const next=api.infer(p,first.values);assert.equal(next.values[2].site,450);assert.equal(next.values[1].site,210);next.values[2].site=460;assert.equal(api.infer(p,next.values).values[2].site,460);});
test('derived lengths become blank again if their source is cleared',()=>{const p=[{x:0,y:100},{x:100,y:100},{x:100,y:0},{x:0,y:0}],v=[{site:320},{site:null},{site:null},{site:180}].map(v=>({...v,code:'B'}));const first=api.infer(p,v);first.values[0].site=null;const next=api.infer(p,first.values);assert.equal(next.values[0].site,null);assert.equal(next.values[2].site,null);assert.equal(next.values[1].site,180);});

test('adding fold angles recalculates derived rise and uniquely resolves a shallow snapped edge',()=>{
 const {p,v}=calculationFixture();v[0]={kind:'horizontal',site:1000,code:'B'};v[2].height=null;
 const first=api.infer(p,v);assert.equal(first.values[2].height,220);
 const folds=[{from:2,to:7}],constraints={rightAngles:[{fold:0,end:0,edge:1}]};
 const next=api.infer(p,first.values,folds,constraints);
 assert.equal(next.values[0].kind,'sloping');assert.equal(next.values[0].width,1000);assert.equal(next.values[0].height,20);assert.equal(next.values[2].height,200);
 assert.equal(first.values[0].kind,'horizontal');assert.equal(first.values[2].height,220);
 const repeated=api.infer(p,next.values,folds,constraints);assert.equal(repeated.values[0].height,20);assert.equal(repeated.values[2].height,200);
 assert.doesNotThrow(()=>api.build(p,repeated.values,folds,constraints));
});
test('explicit section direction and marked outline corners cannot be relaxed',()=>{
 const {p,v}=calculationFixture();v[0]={kind:'horizontal',site:1000,code:'B'};v[2].height=null;
 const first=api.infer(p,v),folds=[{from:2,to:7}],constraints={rightAngles:[{fold:0,end:0,edge:1}]};
 assert.throws(()=>api.infer(p,first.values,folds,{...constraints,edgeRightAngles:[0]}),/conflict/);
 first.values[0].shapeExplicit=true;assert.throws(()=>api.infer(p,first.values,folds,constraints),/conflict/);
});
test('a manually entered sloping rise is never replaced with a derived rise',()=>{
 const {p,v}=calculationFixture();v[0]={kind:'horizontal',site:1000,code:'B'};v[2].height=null;
 const first=api.infer(p,v);first.values[2].height=230;
 const folds=[{from:2,to:7}],constraints={rightAngles:[{fold:0,end:0,edge:1}]};
 assert.throws(()=>api.infer(p,first.values,folds,constraints),/conflict/);assert.equal(first.values[2].height,230);
});

test('horizontal constraint resolves multiple missing sections and survives reopening',()=>{
 const p=[{x:0,y:100},{x:40,y:100},{x:100,y:100},{x:100,y:0},{x:0,y:0}],v=[{kind:'horizontal',site:null},{kind:'horizontal',site:null},{kind:'vertical',site:80},{kind:'horizontal',site:300},{kind:'vertical',site:80}].map(e=>({...e,code:'B'}));
 const constraints={measurementConstraints:[{from:0,to:1,axis:'x',value:120,direction:1}]};
 const r=api.infer(p,v,[],constraints);assert.equal(r.values[0].site,120);assert.equal(r.values[1].site,180);
 const d=api.build(p,r.values,[],constraints),restored=api.restore(d);assert.equal(d.measurementConstraints[0].value,120);assert.doesNotThrow(()=>api.build(restored.points,restored.values,[],{measurementConstraints:d.measurementConstraints}));
 constraints.measurementConstraints[0].value=140;const next=api.infer(p,r.values,[],constraints);assert.equal(next.values[0].site,140);assert.equal(next.values[1].site,160);
});
test('vertical constraints validate supplied dimensions and reject invalid references',()=>{
 const p=[{x:0,y:100},{x:100,y:100},{x:100,y:0},{x:0,y:0}],v=[{site:100},{site:null},{site:100},{site:null}].map(e=>({...e,code:'B'})),constraints={measurementConstraints:[{from:1,to:2,axis:'y',value:80,direction:1}]};
 const r=api.infer(p,v,[],constraints);assert.equal(r.values[1].site,80);assert.equal(r.values[3].site,80);
 r.values[1].site=90;assert.equal(api.infer(p,r.values,[],constraints).values[1].site,80);
 constraints.measurementConstraints[0].to=9;assert.throws(()=>api.infer(p,v,[],constraints),/constraint/);
});

test('reopening keeps cleared dimensions instead of restoring stale calculated values',()=>{
 const d=api.build(pts,vals);const sections=pts.map((start,i)=>({...vals[i],start}));
 sections[0].site=null;sections[0].manualMeasurements={site:true};
 const r=api.restore({...d,outlineSections:sections});assert.equal(r.values[0].site,null);
 const read=api.mergeReadMeasurements(r.values,[{site:40}]);assert.equal(read[0].site,null);
 assert.equal(api.infer(r.points,read).values[0].site,800);
});
test('reopening retains calculated provenance and recalculates changed sources',()=>{
 const p=[{x:0,y:100},{x:100,y:100},{x:100,y:0},{x:0,y:0}];
 const v=[{site:null},{site:100},{site:40},{site:100}].map(e=>({...e,code:'B'}));
 const first=api.infer(p,v).values,d=api.build(p,first);
 const sections=p.map((start,i)=>({...first[i],start}));sections[2].site=60;
 const r=api.restore({...d,outlineSections:sections});assert.equal(api.infer(r.points,r.values).values[0].site,60);
});
test('sketch reading records its source and preserves manual values',()=>{
 const r=api.mergeReadMeasurements([{site:null},{site:90},{site:null,manualMeasurements:{site:true}}],[{site:40},{site:40},{site:40}]);
 assert.equal(r[0].readMeasurements.site,40);assert.equal(r[1].site,90);assert.equal(r[2].site,null);
});

test('corner-to-fold distance resolves missing lengths and survives reopening',()=>{
 const p=[{x:30,y:100},{x:100,y:100},{x:100,y:50},{x:100,y:0},{x:0,y:0},{x:0,y:50},{x:0,y:100}];
 const v=[70,null,50,100,50,null,30].map(site=>({site,code:'B'})),folds=[{from:2,to:5}],c={measurementConstraints:[{from:0,fold:0,axis:'y',value:60,direction:1}]};
 const r=api.infer(p,v,folds,c);assert.equal(r.values[1].site,60);assert.equal(r.values[5].site,60);
 const d=api.build(p,r.values,folds,c),restored=api.restore({...d,outlineSections:p.map((start,i)=>({...r.values[i],start}))});
 assert.doesNotThrow(()=>api.build(restored.points,restored.values,restored.folds,{measurementConstraints:d.measurementConstraints}));
 const rotated=p.map(p=>({x:p.y,y:-p.x})),rc={measurementConstraints:[{from:0,fold:0,axis:'x',value:60,direction:-1}]};
 assert.equal(api.infer(rotated,v,folds,rc).values[1].site,60);
});
test('corner-to-fold constraints reject invalid references and conflicting distances',()=>{
 const p=[{x:0,y:100},{x:100,y:100},{x:100,y:50},{x:100,y:0},{x:0,y:0},{x:0,y:50}],v=[100,50,50,100,50,50].map(site=>({site,code:'B'})),folds=[{from:2,to:5}];
 assert.throws(()=>api.infer(p,v,folds,{measurementConstraints:[{from:0,fold:9,axis:'y',value:50,direction:1}]}),/constraint/);
 assert.throws(()=>api.infer(p,v,folds,{measurementConstraints:[{from:0,fold:0,axis:'y',value:60,direction:1}]}),/conflict/);
});

test('Z2-6a constraint preserves top 280 and calculates a tapered side',()=>{
 const p=[{x:0,y:100},{x:100,y:100},{x:419,y:100},{x:449,y:100},{x:449,y:60},{x:419,y:60},{x:380,y:60},{x:380,y:0},{x:100,y:0},{x:0,y:0}];
 const v=[100,319,30,1090,30,39,1735,280,100,2825].map((site,i)=>({site,code:'B',kind:[3,6,9].includes(i)?'vertical':'horizontal'}));
 v[5].inferredMeasurements={site:39};v[6].inferredMeasurements={site:1735};v[7].manualMeasurements={site:true};
 const folds=[{from:8,to:1},{from:5,to:2}],c={rightAngles:[{fold:0,edge:1,end:1}],measurementConstraints:[{from:6,fold:0,axis:'x',value:283,direction:-1}]};
 const r=api.infer(p,v,folds,c);assert.equal(r.values[7].site,280);assert.equal(r.values[6].kind,'sloping');assert.equal(r.values[6].width,3);assert.equal(r.values[6].xSign,-1);assert.equal(r.values[6].height,1735);assert.equal(r.values[5].site,36);assert.equal(r.values[1].site,319);assert.equal(v[7].site,280);
 assert.doesNotThrow(()=>api.build(p,r.values,folds,c));
 c.measurementConstraints[0].value=285;const next=api.infer(p,r.values,folds,c);assert.equal(next.values[7].site,280);assert.equal(next.values[6].width,5);assert.equal(next.values[5].site,34);
 c.measurementConstraints.push({from:6,fold:0,axis:'x',value:284,direction:-1});assert.throws(()=>api.infer(p,next.values,folds,c),/conflict/);
});

test('generation calculates missing measurements without reading the sketch',()=>{
 const d=api.build(pts,vals),sections=pts.map((start,i)=>({...vals[i],start}));sections[0].site=null;
 const request=api.prepareGeneration({...d,panelId:'TEST',reviewed:true,outlineSections:sections});
 assert.equal(request.measuredEdges[0].dx,800);assert.equal(request.outlineSections[0].inferredMeasurements.site,800);assert.equal(sections[0].site,null);assert.equal(request.reviewed,true);
});
test('generation explains unresolved values and requires an applied outline',()=>{
 const d=api.build(pts,vals),sections=pts.map((start,i)=>({...vals[i],start}));sections[0].site=null;sections[3].site=null;
 assert.throws(()=>api.prepareGeneration({...d,outlineSections:sections}),/another dimension or constraint/);
 assert.throws(()=>api.prepareGeneration({...d,correctionDraft:true}),/Apply/);
});

