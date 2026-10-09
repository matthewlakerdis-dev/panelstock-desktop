const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../cad/cad.js'),'utf8');
const start=source.indexOf(' add.onclick=async()=>',source.indexOf('automaticPackButton.onclick='));
const handler=source.slice(start,source.indexOf('\n document.body.append(dialog)',start));
for(const outcome of ['success','save failure','import failure'])test('import restores navigation after '+outcome,async()=>{
 const panels=[{name:'Existing'}],buttons={previous:{},next:{}};
 const context={importing:false,applied:false,busy:false,confirmed:{checked:true},status:{},add:{},close:{},projectId:'order',projectOwner:()=> 'owner',rememberPanel(){},pdf:{files:[{}]},dxfs:{files:[{}]},api(){},panels,panelIndex:0,uploadedSketchFiles:[],queueProjectSave(){},notice(){},dialog:{close(){},remove(){}},
  PanelAutomaticPack:{async importFiles(){if(outcome==='import failure')throw Error('Invalid DXF');return [{name:'First'},{name:'Second'}];}},
  async saveProject(){if(outcome==='save failure')throw Error('Offline');},
  selectPanel(index){context.panelIndex=index;context.updateNavigator();},
  updateNavigator(){buttons.previous.disabled=context.busy||context.panelIndex<=0;buttons.next.disabled=context.busy||context.panelIndex>=panels.length-1;}
 };
 vm.runInNewContext(handler,context);await context.add.onclick();
 assert.equal(context.busy,false);assert.equal(context.importing,false);
 assert.equal(buttons.previous.disabled,outcome==='import failure');
 assert.equal(buttons.next.disabled,outcome==='import failure');
 assert.equal(context.close.disabled,false);
});
