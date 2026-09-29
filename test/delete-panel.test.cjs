const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../cad/cad.js'),'utf8');
function fixture(count,index){
 const elements=[];function element(){const e={append(){},before(){},focus(){},close(){},remove(){},showModal(){},replaceChildren(){},value:''};elements.push(e);return e;}
 const fields={};const c={projectIcon(button,label){button.title=label;},document:{createElement:element,body:element()},navigator:element(),busy:false,panelIndex:index,panels:Array.from({length:count},(_,i)=>({name:'P'+i})),spec:null,result:{old:true},previewURL:'old',URL:{revokeObjectURL(){}},quantityInput:element(),PanelMeasuredOutline:{show(){}},saved:0,rememberPanel(){},invalidate(){},updateNavigator(){},notice(){},$:id=>fields[id]||(fields[id]=element())};
 c.selectPanel=i=>{c.panelIndex=i;c.spec=c.panels[i].spec||null;};c.queueProjectSave=()=>c.saved++;
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('const deletePanelButton='),source.indexOf('let projectId='))+'\nglobalThis.button=deletePanelButton;',c);
 c.button.onclick();return {c,confirm:elements.find(e=>e.textContent==='Delete panel'&&e!==c.button),cancel:elements.find(e=>e.textContent==='Keep panel')};
}
test('deleting a middle panel selects its successor and saves',()=>{const {c,confirm}=fixture(3,1);confirm.onclick();assert.equal(c.panels.map(p=>p.name).join(','),'P0,P2');assert.equal(c.panelIndex,1);assert.equal(c.saved,1);assert.equal(c.result,null);});
test('deleting last panel clears selection and saves the empty project',()=>{const {c,confirm}=fixture(1,0);confirm.onclick();assert.equal(c.panels.length,0);assert.equal(c.panelIndex,-1);assert.equal(c.saved,1);assert.match(source,/!panels.length&&!uploadedSketchFiles.length&&!projectId/);});
test('cancel leaves the project untouched',()=>{const {c,cancel}=fixture(2,0);cancel.onclick();assert.equal(c.panels.length,2);assert.equal(c.saved,0);});
