const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../cad/manual-holes.js'),'utf8');
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
