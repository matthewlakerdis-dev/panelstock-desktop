const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const isDesktop=source.includes('  function SettingsPage('),componentName=isDesktop?'SettingsPage':'SettingsTab';
const start=source.indexOf('  function '+componentName+'('),end=source.indexOf('  var container',start);
const componentSource=source.slice(start,end);
const factorySource=source.split('\n').find(line=>line.includes('const StocktakeSettings = window.createStocktakeSettings('));
const flatten=node=>Array.isArray(node)?node.flatMap(flatten):node&&typeof node==='object'?[node,...flatten(node.children),...flatten(node.action)]:[];
const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.children):node==null||node===false?'':String(node);

function harness(props={}){
 let states=[],cursor=0,tree,nodes,properties={isAdmin:true,reasons:[],catalog:[],username:'admin',workerUrl:'https://worker.example',initialSection:'general',...props},calls=[];
 const jsx=(tag,properties,key)=>({tag,...properties,key}),react={marker:'parent React'};
 const context={import_react:{default:react},import_jsx_runtime:{jsx,jsxs:jsx},BAKED_WORKER_URL:'https://baked.example',
  window:{createStocktakeSettings:React=>{calls.push(React);return 'stocktake-settings-component';}},
  useState:initial=>{const index=cursor++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;return [states[index],value=>states[index]=typeof value==='function'?value(states[index]):value];},useEffect(){},
  PageHeading:'page-heading',SectionTitle:'section-title',Settings2:'settings-icon',NotificationPreferences:'notifications',PushNotificationControl:'push',EmailReportsAdmin:'email-reports',CatalogAdmin:'catalogue',FileSpreadsheet:'excel',Printer:'printer',AlertTriangle:'warning',ChevronRight:'chevron',ClipboardList:'clipboard',CapitalizedInput:'capitalized',Trash2:'trash',Plus:'plus',BackupRestore:'backup',StocktakeReset:'reset',FullReset:'full-reset',QaSettingsPage:'qa-settings',ScheduleSettingsPanel:'schedule-settings',Mail:'mail',Save:'save'
 };
 vm.runInNewContext(factorySource+'\n'+componentSource,context);
 const render=next=>{properties={...properties,...next};cursor=0;tree=context[componentName](properties);nodes=flatten(tree);return nodes;};
 const button=label=>nodes.find(node=>node.tag==='button'&&(text(node).trim()===label||label==='Stocktake'&&text(node).startsWith('Stocktake')));
 render();return {render,button,nodes:()=>nodes,calls,react,settings:()=>nodes.find(node=>node.tag==='stocktake-settings-component')};
}

test('parent binds the stocktake settings factory to its existing React instance',()=>{
 const h=harness();assert.equal(h.calls.length,1);assert.equal(h.calls[0],h.react);assert.equal(h.settings(),undefined);
});

test('administrator can open Stocktake from Settings with the configured worker address',()=>{
 const h=harness();assert.ok(h.button('Stocktake'));h.button('Stocktake').onClick();h.render();
 assert.equal(h.settings().workerUrl,'https://worker.example');assert.equal(h.settings().isAdmin,true);
 if(isDesktop){assert.ok(h.button('General'));h.button('General').onClick();}
 else {assert.ok(h.button('Back to settings'));h.button('Back to settings').onClick();}
 h.render();assert.equal(h.settings(),undefined);assert.ok(h.button('Stocktake'));
});

test('stocktake settings stay unavailable to non-administrators',()=>{
 const h=harness({isAdmin:false,initialSection:'stocktake'});assert.equal(h.button('Stocktake'),undefined);assert.equal(h.settings(),undefined);
 const admin=harness();admin.button('Stocktake').onClick();admin.render();assert.ok(admin.settings());
 admin.render({isAdmin:false});assert.equal(admin.settings(),undefined);assert.equal(admin.button('Stocktake'),undefined);
});

test('stocktake settings use the baked worker address when no configured address is supplied',()=>{
 const h=harness({workerUrl:''});h.button('Stocktake').onClick();h.render();assert.equal(h.settings().workerUrl,'https://baked.example');
});

test('existing settings destinations remain available after adding Stocktake',()=>{
 const h=harness();
 if(isDesktop){for(const label of ['General','Notifications','Dispatch','Schedule','Material Catalogue','Damage Reasons','Email Reports','Backup & Reset'])assert.ok(h.button(label),label);}
 else {for(const tag of ['notifications','push','email-reports','catalogue','backup','reset','full-reset'])assert.ok(h.nodes().some(node=>node.tag===tag),tag);}
});
