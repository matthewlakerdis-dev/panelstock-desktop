const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../cad/manual-holes.js'),'utf8');
test('Add hole starts at reference zero then copies the last hole offsets',()=>{
 const {api,nodes}=setup();let saved;
 api.open({layout:{origin:[10,15],cut:[[10,15],[210,15],[210,115],[10,115]],face:[[10,15],[210,15],[210,115],[10,115]]},onApply:h=>saved=h});
 const reference=nodes.find(n=>n.attributes['aria-label']==='Hole offset reference');reference.value='corner-2';reference.onchange();
 const add=nodes.find(n=>n.textContent==='Add hole'),fields=nodes.filter(n=>n.tag==='input');add.onclick();
 assert.equal(fields[0].value,0);assert.equal(fields[1].value,0);
 fields[0].value='-30';fields[0].oninput();fields[1].value='-25';fields[1].oninput();add.onclick();
 assert.equal(fields[0].value,-30);assert.equal(fields[1].value,-25);
 nodes.find(n=>n.textContent==='Apply and generate').onclick();assert.equal(saved.length,2);assert.equal(saved[0].x,saved[1].x);assert.equal(saved[0].y,saved[1].y);assert.equal(saved[1].reference,'corner-2');
});
test('corner and fold references change displayed offsets without moving the hole',()=>{
 const {api,nodes}=setup();let saved;
 api.open({layout:{origin:[10,15],cut:[[10,15],[210,15],[210,115],[10,115]],face:[[10,15],[210,15],[210,115],[10,115],[10,15]],folds:[[[10,65],[210,65]]]},holes:[{x:50,y:40,diameter:3}],onApply:h=>saved=h});
 const reference=nodes.find(n=>n.attributes['aria-label']==='Hole offset reference'),fields=nodes.filter(n=>n.tag==='input');
 reference.value='corner-2';reference.onchange();assert.equal(fields[0].value,-150);assert.equal(fields[1].value,-60);
 reference.value='fold-0-0';reference.onchange();assert.equal(fields[0].value,50);assert.equal(fields[1].value,-10);
 fields[1].value='20';fields[1].oninput();nodes.find(n=>n.textContent==='Apply and generate').onclick();
 assert.deepEqual(JSON.parse(JSON.stringify(saved)),[{x:50,y:70,diameter:3,reference:'fold-0-0'}]);
});
function setup(){
 const nodes=[];
 function element(tag){const node={tag,children:[],style:{},attributes:{},append(...x){this.children.push(...x);},prepend(...x){this.children.unshift(...x);},replaceChildren(...x){this.children=x;},add(x){this.children.push(x);},setAttribute(k,v){this.attributes[k]=v;},focus(){},showModal(){},close(){},remove(){},getScreenCTM(){return {inverse(){return {};}};}};nodes.push(node);return node;}
 const context={document:{activeElement:null,body:element('body'),createElement:element,createElementNS:(ns,tag)=>element(tag)},Option:function(text,value){return {text,value};},DOMPoint:class {constructor(x,y){this.x=x;this.y=y;}matrixTransform(){return this;}}};vm.runInNewContext(code,context);return {api:context.PanelManualHoles,nodes};
}
test('click placement, exact edits and apply preserve the input until confirmed',()=>{
 const {api,nodes}=setup(),input=[{x:20,y:30,diameter:3}];let saved;
 api.open({layout:{origin:[10,15],cut:[[0,0],[200,0],[200,100],[0,100]],routes:[],automaticHoles:[]},holes:input,onApply:holes=>saved=holes});
 const svg=nodes.find(n=>n.tag==='svg');svg.onclick({clientX:60,clientY:-55});
 const fields=nodes.filter(n=>n.tag==='input');fields[2].value='8';fields[2].oninput();
 assert.deepEqual(input,[{x:20,y:30,diameter:3}]);
 nodes.find(n=>n.textContent==='Apply and generate').onclick();
 assert.deepEqual(JSON.parse(JSON.stringify(saved)),[{x:20,y:30,diameter:3},{x:50,y:40,diameter:8}]);
});
test('invalid diameter blocks apply and cancel does not save',()=>{
 const {api,nodes}=setup();let saved=false;
 api.open({layout:{origin:[0,0],cut:[[0,0],[100,0],[100,100],[0,100]]},holes:[{x:20,y:20,diameter:3}],onApply:()=>saved=true});
 const fields=nodes.filter(n=>n.tag==='input');fields[2].value='0';fields[2].oninput();
 const apply=nodes.find(n=>n.textContent==='Apply and generate');assert.equal(apply.disabled,true);apply.onclick();assert.equal(saved,false);
 nodes.find(n=>n.textContent==='Cancel').onclick();assert.equal(saved,false);
});
