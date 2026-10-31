const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(new URL('../index.html',`file://${__filename}`),'utf8');
const start=source.indexOf('    const navGroups = ['),end=source.indexOf('.filter(group=>group.items.length);',start);
const groups=source.slice(start,end)+'.filter(group=>group.items.length);';
const safetyStart=source.indexOf('    const safetyNavItem='),safety=source.slice(safetyStart,start);
const jsx=(type,props)=>({type,props}),worker='https://panelstock-reports.matthewlakerdis.workers.dev';
function context(isAdmin,taskAccess){
 const icons=Object.fromEntries([...groups.matchAll(/\(\w+,\{size:16\}\)/g)].map(m=>[m[0].slice(1,m[0].indexOf(',')),()=>{}]));
 return {...icons,isAdmin,taskAccess,can:task=>isAdmin||taskAccess[task]!==false,BAKED_WORKER_URL:worker,import_jsx_runtime:{jsx,jsxs:jsx}};
}
function safetyItem(admin,tasks){const c=context(admin,tasks);vm.runInNewContext(safety+'globalThis.item=safetyNavItem;',c);return c.item;}
test('standalone Safety requires explicit permission despite the existing fallback task predicate',()=>{
 assert.equal(safetyItem(false,{}),null);assert.equal(safetyItem(false,{'factory.toolbox':false}),null);
 assert.equal(safetyItem(false,{'factory.toolbox':true}).href,worker+'/toolbox?app=web');assert.equal(safetyItem(true,{}).label,'Safety');
 const c=context(true,{});vm.runInNewContext(groups+'globalThis.groups=navGroups;',c);
 assert.equal(c.groups.flatMap(group=>group.items).some(item=>item.toolbox),false);
 const navStart=source.indexOf('"nav", { className: "flex-1'),navEnd=source.indexOf('label:"My Profile"',navStart),nav=source.slice(navStart,navEnd);
 assert.ok(nav.indexOf('safetyNavItem &&')>nav.indexOf('group.key!=="stockGroup"'));
 assert.ok(nav.indexOf('safetyNavItem &&')<nav.indexOf('label:"Support"'));
});
test('Safety announces a new tab and uses the existing authenticated external launcher',()=>{
 let launches=0;const c=context(false,{'factory.toolbox':true});c.ChevronRight=()=>{};c.window={PanelStockToolbox:{open(){launches++}}};
 const functions=source.slice(source.indexOf('  function SideNavGroup('),source.indexOf('  function Toast('));vm.runInNewContext(functions+'globalThis.components={SideNavGroup,SideNavItem};',c);
 const item=safetyItem(false,{'factory.toolbox':true}),selected=[];
 const link=c.components.SideNavItem(item);assert.equal(link.type,'a');assert.equal(link.props.href,item.href);assert.equal(link.props.target,'_blank');assert.equal(link.props.rel,'noopener noreferrer');assert.equal(link.props['aria-label'],'Safety (opens in a new tab)');assert.equal(link.props.title,'Safety (opens in a new tab)');link.props.onClick({preventDefault(){}});assert.equal(launches,1);
 const children=link.props.children;assert.equal(children[2].props.children[1].props.children,'Opens in a new tab');assert.equal(children[3].type,'svg');assert.equal(children[3].props['aria-hidden'],true);
 const button=c.components.SideNavItem({label:'Schedule',onClick:()=>selected.push('schedule')});assert.equal(button.type,'button');button.props.onClick();assert.deepEqual(selected,['schedule']);
});
test('administrators can grant the toolbox permission through the shared user and role access controls',()=>{
 const start=source.indexOf('    const taskGroups=['),end=source.indexOf('    function TaskAccessGroups(',start),c={tasks:[{code:'factory.toolbox',label:'Run toolbox talks',app:'factory'}]};
 vm.runInNewContext(source.slice(start,end)+'globalThis.groups=taskGroups;',c);
 assert.equal(c.groups.length,1);assert.equal(c.groups[0].name,'Toolbox talks');assert.equal(c.groups[0].tasks[0].code,'factory.toolbox');
});

test('PanelCAD is hidden even for admins or users with CAD access',()=>{
 for(const [admin,tasks]of [[true,{}],[false,{'factory.cad':true}]]){
  const c=context(admin,tasks);vm.runInNewContext(groups+'globalThis.groups=navGroups;',c);
  assert.equal(c.groups.flatMap(g=>g.items).some(item=>item.key==='cad'),false);
 }
 const a=source.indexOf('const permittedPages ='),b=source.indexOf('].filter(',a);assert.ok(a>=0&&b>a);assert.equal(source.slice(a,b).includes("['cad',"),false);
});
