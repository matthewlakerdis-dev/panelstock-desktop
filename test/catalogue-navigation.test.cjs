const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const name='SettingsPage',start=source.indexOf('  function '+name+'('),end=source.indexOf('  var container',start);
const componentSource=source.slice(start,end);
const flatten=node=>Array.isArray(node)?node.flatMap(flatten):node&&typeof node==='object'?[node,...flatten(node.children),...flatten(node.action)]:[];
const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.children):node==null||node===false?'':String(node);
function harness(props={}){
 let states=[],cursor=0,nodes,properties={isAdmin:true,reasons:[],catalog:[],username:'admin',workerUrl:'https://configured.example',...props};
 const jsx=(tag,properties,key)=>({tag,...properties,key}),context={import_jsx_runtime:{jsx,jsxs:jsx},BAKED_WORKER_URL:'https://baked.example',PanelStock:{revision:17},
  useState:initial=>{const index=cursor++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;return [states[index],value=>states[index]=typeof value==='function'?value(states[index]):value];},useEffect(){},
  WorkshopStock:'material-catalogue',StocktakeSettings:'stocktake-settings',PageHeading:'page-heading',SectionTitle:'section-title',Settings2:'settings-icon',NotificationPreferences:'notifications',PushNotificationControl:'push',EmailReportsAdmin:'email-reports',CatalogAdmin:'panel-catalogue',FileSpreadsheet:'excel',Printer:'printer',AlertTriangle:'warning',ChevronRight:'chevron',ClipboardList:'clipboard',CapitalizedInput:'capitalized',Trash2:'trash',Plus:'plus',BackupRestore:'backup',StocktakeReset:'reset',FullReset:'full-reset',QaSettingsPage:'qa-settings',ScheduleSettingsPanel:'schedule-settings',Mail:'mail',Save:'save'};
 vm.runInNewContext(componentSource,context);
 const render=next=>{properties={...properties,...next};cursor=0;nodes=flatten(context[name](properties));return nodes;};
 const button=label=>nodes.find(node=>node.tag==='button'&&text(node).trim().startsWith(label));
 render();return {render,button,nodes:()=>nodes,catalogue:()=>nodes.find(node=>node.tag==='material-catalogue')};
}
test('desktop Settings opens separate panel and material catalogues backed by the existing APIs',()=>{
 const h=harness();assert.ok(h.button('Panel Catalogue'));assert.ok(h.button('Material Catalogue'));
 h.button('Panel Catalogue').onClick();h.render();assert.ok(h.nodes().some(n=>n.tag==='panel-catalogue'));
 h.button('Material Catalogue').onClick();h.render();assert.equal(h.catalogue().catalogueOnly,true);assert.equal(h.catalogue().workerUrl,'https://configured.example');assert.equal(h.catalogue().isAdmin,true);assert.equal(h.catalogue().stockRevision,17);
 h.button('General').onClick();h.render();assert.equal(h.catalogue(),undefined);
});
test('desktop material catalogue requires stock access and passes read-only user permissions through',()=>{
 const h=harness({isAdmin:false,taskAccess:{'factory.stock':true},initialSection:'material-catalogue'});
 assert.ok(h.button('Material Catalogue'));assert.equal(h.button('Panel Catalogue'),undefined);assert.equal(h.catalogue().isAdmin,false);assert.equal(h.catalogue().taskAccess['factory.stock'],true);
 h.render({taskAccess:{'factory.stock':false}});assert.equal(h.catalogue(),undefined);assert.equal(h.button('Material Catalogue'),undefined);
});
test('desktop material catalogue falls back to the baked API and keeps panel storage identifiers',()=>{
 const h=harness({workerUrl:'',initialSection:'material-catalogue'});assert.equal(h.catalogue().workerUrl,'https://baked.example');
 assert.match(source,/key: "catalog", label: "Panel Catalogue"/);assert.match(source,/PanelStock \\u2014 Panel Catalogue/);assert.match(source,/catalog: "panelstock:catalog"/);
});
