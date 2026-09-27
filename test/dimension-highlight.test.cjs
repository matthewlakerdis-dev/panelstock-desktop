const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../cad/measured-outline.js'),'utf8'),c={};
vm.runInNewContext(source.slice(source.indexOf('function bindDimensionHighlight('),source.indexOf('function draw(')),c);
function setup(){const label={setAttribute(k,v){this[k]=v;}},edge={setAttribute(k,v){this[k]=v;}};c.bindDimensionHighlight(label,edge);return {label,edge};}
test('click selection survives pointer exit and clears on a second click',()=>{const {label,edge}=setup();label.onmouseenter();label.onclick();label.onmouseleave();assert.equal(edge.opacity,1);assert.equal(label['aria-pressed'],'true');label.onclick();assert.equal(edge.opacity,0);});
test('keyboard selection survives blur and Escape clears selection',()=>{const {label,edge}=setup();let prevented=false;label.onfocus();label.onkeydown({key:' ',preventDefault(){prevented=true;}});label.onblur();assert.ok(prevented);assert.equal(edge.opacity,1);label.onkeydown({key:'Escape'});assert.equal(edge.opacity,0);assert.equal(label['aria-pressed'],'false');});
test('hover and focus are independent',()=>{const {label,edge}=setup();label.onfocus();label.onmouseenter();label.onmouseleave();assert.equal(edge.opacity,1);label.onblur();assert.equal(edge.opacity,0);});
