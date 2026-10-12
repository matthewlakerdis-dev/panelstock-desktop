const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(new URL('../index.html',`file://${__filename}`),'utf8');
const start=source.indexOf('    const navGroups = ['),end=source.indexOf('.filter(group=>group.items.length);',start);
const groups=source.slice(start,end)+'.filter(group=>group.items.length);';
const jsx=(type,props)=>({type,props}),worker='https://panelstock-reports.matthewlakerdis.workers.dev';
function context(isAdmin,taskAccess){
 const icons=Object.fromEntries([...groups.matchAll(/\(\w+,\{size:16\}\)/g)].map(m=>[m[0].slice(1,m[0].indexOf(',')),()=>{}]));
 return {...icons,isAdmin,taskAccess,can:task=>isAdmin||taskAccess[task]!==false,BAKED_WORKER_URL:worker,import_jsx_runtime:{jsx,jsxs:jsx}};
}
function toolbox(admin,tasks){const c=context(admin,tasks);vm.runInNewContext(groups+'globalThis.groups=navGroups;',c);return c.groups.flatMap(g=>g.items).find(item=>item.key==='toolbox');}
test('web toolbox requires explicit permission despite the existing fallback task predicate',()=>{
 assert.equal(toolbox(false,{}),undefined);assert.equal(toolbox(false,{'factory.toolbox':false}),undefined);
 assert.equal(toolbox(false,{'factory.toolbox':true}).href,worker+'/toolbox?app=web');assert.equal(toolbox(true,{}).label,'Toolbox Talks');
});
test('the Work group forwards the external URL and renders a safe link without selecting an internal page',()=>{
 const c=context(false,{'factory.toolbox':true});c.ChevronRight=()=>{};
 const functions=source.slice(source.indexOf('  function SideNavGroup('),source.indexOf('  function Toast('));vm.runInNewContext(functions+'globalThis.components={SideNavGroup,SideNavItem};',c);
 const item=toolbox(false,{'factory.toolbox':true}),selected=[],group=c.components.SideNavGroup({label:'Work',items:[item],activeKey:'schedule',onSelect:i=>selected.push(i.key),open:true,onToggle(){}});
 const descriptor=group.props.children[1].props.children[0];assert.equal(descriptor.props.href,item.href);
 const link=c.components.SideNavItem(descriptor.props);assert.equal(link.type,'a');assert.equal(link.props.href,item.href);assert.equal(link.props.target,'_blank');assert.equal(link.props.rel,'noopener noreferrer');assert.equal(link.props.onClick,undefined);
 const button=c.components.SideNavItem({label:'Schedule',onClick:()=>selected.push('schedule')});assert.equal(button.type,'button');button.props.onClick();assert.deepEqual(selected,['schedule']);
});
test('administrators can grant the toolbox permission through the shared user and role access controls',()=>{
 const start=source.indexOf('    const taskGroups=['),end=source.indexOf('    function TaskAccessGroups(',start),c={tasks:[{code:'factory.toolbox',label:'Run toolbox talks',app:'factory'}]};
 vm.runInNewContext(source.slice(start,end)+'globalThis.groups=taskGroups;',c);
 assert.equal(c.groups.length,1);assert.equal(c.groups[0].name,'Toolbox talks');assert.equal(c.groups[0].tasks[0].code,'factory.toolbox');
});
