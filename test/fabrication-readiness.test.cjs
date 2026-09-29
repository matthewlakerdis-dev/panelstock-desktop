const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../cad/cad.js'),'utf8'),c={structuredClone,currentIssues:()=>[]};
vm.runInNewContext(source.slice(source.indexOf('function fabricationReadiness('),source.indexOf('const readinessButton=')),c);
const panel=()=>({generatedSpec:JSON.stringify({panelId:'A'}),spec:{panelId:'A'},reviewed:true,result:{dxf:'drawing',validation:{checks:['Passed'],fabricationTags:[],stiffeners:[]}}});
test('saved drawing status uses fabrication readiness and current geometry checks',()=>{
 const p=panel();delete p.generatedSpec;assert.equal(c.panelDrawingReadiness(p).ready,false);assert.match(c.fabricationReadiness(p).join(' '),/Regenerate to verify/);
 p.generatedSpec=c.drawingSpecKey(p.spec);assert.equal(c.panelDrawingReadiness(p).ready,true);
 p.spec.panelId='B';assert.equal(c.panelDrawingReadiness(p).ready,false);
 p.generatedSpec=c.drawingSpecKey(p.spec);c.currentIssues=()=>['Constraint conflict'];assert.equal(c.panelDrawingReadiness(p).ready,false);
 c.currentIssues=()=>{throw Error('Invalid geometry');};assert.equal(c.panelDrawingReadiness(p).ready,false);
 c.currentIssues=()=>[];p.result=null;assert.equal(c.panelDrawingReadiness(p).ready,false);
});
test('valid panels can have no tags or stiffeners',()=>assert.equal(c.fabricationReadiness(panel()).length,0));
test('changed dimensions flagged while review state is ignored',()=>{const p=panel();p.generatedSpec=c.drawingSpecKey(p.spec);p.spec.reviewed=false;assert.equal(c.fabricationReadiness(p).length,0);p.spec.panelId='B';assert.match(c.fabricationReadiness(p).join(' '),/changed since generation/);});
test('draft edits, conflicts, missing metadata and warnings remain visible',()=>{const p=panel();p.correctionRecovery={};p.reviewed=false;p.result.validation={warnings:['Hole omitted']};const text=c.fabricationReadiness(p,['Constraint conflict']).join(' ');for(const pattern of [/outline edits/,/Review the panel/,/Constraint conflict/,/fabrication tags/,/stiffener requirements/,/Hole omitted/])assert.match(text,pattern);});
test('invalid stiffener length and ungenerated panels need attention',()=>{const p=panel();p.result.validation.stiffeners=[{}];assert.match(c.fabricationReadiness(p).join(' '),/missing stiffener lengths/);p.result=null;delete p.generatedSpec;assert.match(c.fabricationReadiness(p).join(' '),/Generate a drawing/);});

test('general tooling notice does not flag a ready panel but panel warnings do',()=>{const p=panel();p.result.validation.warnings=['Test drawing: tooling width and depth remain unspecified.'];assert.equal(c.fabricationReadiness(p).length,0);p.result.validation.warnings.push('Hole omitted');assert.equal(c.fabricationReadiness(p).join(' '),'Hole omitted');});

test('spacing-rule omissions are informational while other hole warnings remain actionable',()=>{const p=panel();p.result.validation.warnings=['Holes omitted where required spacing cannot fit: sections 4.'];assert.equal(c.fabricationReadiness(p).length,0);p.result.validation.warnings.push('Hole intersects cut edge');assert.equal(c.fabricationReadiness(p).join(' '),'Hole intersects cut edge');});

