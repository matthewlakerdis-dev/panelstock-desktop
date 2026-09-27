const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../cad/measured-outline.js'),'utf8'),c={};
vm.runInNewContext(source.slice(source.indexOf('function dimensionPlacement('),source.indexOf('function draw(')),c);
test('all edge directions and lengths use the same perpendicular gap and centred text',()=>{
 for(const b of [[55,0],[0,100],[-230,0],[0,-613],[30,40]]){
  const a=[0,0],p=c.dimensionPlacement(a,b),length=Math.hypot(...b);
  for(const q of [p.start,p.end,p.center])assert.ok(Math.abs(Math.abs((b[0]*q[1]-b[1]*q[0])/length)-26)<1e-9);
  assert.ok(Math.abs(p.center[0]-(p.start[0]+p.end[0])/2)<1e-9);
  assert.ok(Math.abs(p.center[1]-(p.start[1]+p.end[1])/2)<1e-9);
 }
});
