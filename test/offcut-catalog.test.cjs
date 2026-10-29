const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
for(const file of ['../index.html']){
 test(`offcut picker uses catalogue materials without stock variants: ${file}`,()=>{
  const source=fs.readFileSync(path.join(__dirname,file),'utf8');
  const code=source.slice(source.indexOf('function OffcutModal('),source.indexOf('function DamageLogModal('));
  let query='',updates=[];
  const jsx=(tag,props)=>({tag,...props});
  const context={useState:initial=>[initial===''?query:initial,value=>updates.push(value)],import_jsx_runtime:{jsx,jsxs:jsx},Modal:'modal',Scissors:'icon',Check:'check',X:'close',Field:'field',CapitalizedInput:'input',SheetMeasureGuide:'guide',inputCls:'',swatchColour:()=>'',_objectSpread:Object.assign,_slicedToArray:value=>value};
  vm.createContext(context);vm.runInContext(code,context);
  const catalog=[{id:'catalog-only',color:'Bronze',material:'ACP',thickness:4},{id:'duplicate',color:' bronze ',material:' acp ',thickness:'4.0'},{id:'other-size',color:'Bronze',material:'ACP',thickness:4,width:4000},{id:'different-thickness',color:'Bronze',material:'ACP',thickness:3}];
  function render(){const nodes=[];function walk(n){if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(walk);return;}nodes.push(n);walk(n.children);}walk(context.OffcutModal({catalog,onClose(){},onSubmit(){}}));return nodes;}
  let nodes=render();const buttons=nodes.filter(n=>n.tag==='button'&&n.children?.some?.(child=>child?.tag==='div'));
  assert.equal(buttons.length,2);
  buttons[0].onClick();assert.equal(updates[1].color,'Bronze');assert.equal(updates[1].thickness,'4');
  assert.ok(!JSON.stringify(buttons).includes(' SOH'));
  query='ACP';assert.ok(render().some(n=>n.tag==='button'&&Array.isArray(n.children)));
  query='absent';assert.ok(render().some(n=>n.children==='No matching materials.'));
 });
}
