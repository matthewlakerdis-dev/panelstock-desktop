const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(new URL('../index.html',`file://${__filename}`),'utf8');

function productionFunction(name){
 const match=new RegExp('(?:^|\\n)([ \\t]*)function '+name+'\\(').exec(html);
 assert.ok(match,'Production navigation function exists: '+name);
 const start=match.index+(html[match.index]==='\n'?1:0);
 const next=new RegExp('\\n'+match[1]+'function [\\w$]+\\(','g');
 next.lastIndex=start+match[0].length;
 return html.slice(start,next.exec(html)?.index??html.length);
}
function components(){
 const jsx=(type,props,key)=>({type,props:props||{},key});
 const launches=[];
 const context={location:{pathname:'/index.html'},import_jsx_runtime:{jsx,jsxs:jsx},ChevronRight:'chevron',BAKED_WORKER_URL:'https://worker.example',window:{PanelStockToolbox:{open:(...args)=>launches.push(args)}}};
 vm.runInNewContext(['panelstockPageHref','followPanelStockLink','SideNavGroup','SideNavItem'].map(productionFunction).join('\n')+'\nglobalThis.navigation={panelstockPageHref,followPanelStockLink,SideNavGroup,SideNavItem};',context);
 return {...context.navigation,context,launches};
}
function nodes(tree){return !tree||typeof tree!=='object'?[]:[tree,...[tree.props?.children].flat(Infinity).flatMap(nodes)];}
function click(changes={}){let prevented=0;const event={button:0,defaultPrevented:false,ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,preventDefault(){prevented++;},...changes};return {event,get prevented(){return prevented;}};}

test('sidebar destinations expose same-origin page URLs for the browser context menu',()=>{
 const c=components(),selected=[];
 const items=[{key:'workshop',target:'workshop',label:'SOH'},{key:'cnc',target:'cnc',label:'CNC Tracker'},{key:'orders',target:'orders',label:'Site Orders'},{key:'schedule',target:'schedule',label:'Schedule'},{key:'settings',target:'settings',section:'general',label:'Settings'}];
 const tree=c.SideNavGroup({label:'Work',items,activeKey:'cnc',open:true,onSelect:item=>selected.push(item),onToggle(){}});
 const destinations=nodes(tree).filter(node=>node.type===c.SideNavItem);
 assert.equal(destinations.length,items.length);
 for(let i=0;i<items.length;i++){
  const link=c.SideNavItem(destinations[i].props);
  assert.equal(link.type,'a');assert.equal(link.props.href,'/index.html?page='+items[i].key);
  assert.equal(link.props.target,undefined,'ordinary navigation stays in its current tab');
  assert.equal(link.props.onContextMenu,undefined,'the native Open link in new tab menu stays available');
  assert.equal(link.props.onAuxClick,undefined,'middle clicks remain browser navigation');
  assert.ok(!String(link.props['aria-label']||'').includes('opens in a new tab'),'a normal link does not announce a forced new tab');
 }
 assert.equal(selected.length,0);
 assert.ok(nodes(tree).some(node=>node.type==='button'&&node.props['aria-expanded']===true),'the group heading remains a disclosure control');
});

test('ordinary clicks use the existing in-page navigation exactly once',()=>{
 const c=components(),selected=[],native=click();
 const link=c.SideNavItem({label:'CNC Tracker',href:c.panelstockPageHref('cnc'),internal:true,onClick:()=>selected.push('cnc')});
 link.props.onClick(native.event);
 assert.equal(native.prevented,1);assert.deepEqual(selected,['cnc']);
 const keyboard=click({detail:0});link.props.onClick(keyboard.event);
 assert.equal(keyboard.prevented,1);assert.deepEqual(selected,['cnc','cnc'],'keyboard activation follows the same page navigation');
});

test('Ctrl, Cmd, Shift, Alt and non-primary clicks keep their native tab/window behaviour',()=>{
 const c=components();
 for(const changes of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1},{button:2},{defaultPrevented:true}]){
  const native=click(changes);let selected=0;
  const link=c.SideNavItem({label:'Site Orders',href:c.panelstockPageHref('orders'),internal:true,onClick:()=>selected++});
  link.props.onClick(native.event);
  assert.equal(native.prevented,0,JSON.stringify(changes));assert.equal(selected,0,JSON.stringify(changes));
 }
});

test('destination URLs respect the application path and safely encode page names',()=>{
 const c=components();
 assert.equal(c.panelstockPageHref('cnc-settings'),'/index.html?page=cnc-settings');
 c.context.location.pathname='/factory/index.html';
 assert.equal(c.panelstockPageHref('orders'),'/factory/index.html?page=orders');
 assert.equal(c.panelstockPageHref('orders&open=access'),'/factory/index.html?page=orders%26open%3Daccess');
});

test('existing external destinations keep their new-tab and authenticated-launch behaviour',()=>{
 const c=components();
 const report=c.SideNavItem({label:'Production Tracker',href:'https://cnc.example/report'});
 assert.equal(report.type,'a');assert.equal(report.props.target,'_blank');assert.equal(report.props.rel,'noopener noreferrer');assert.equal(report.props.onClick,undefined);
 const safety=c.SideNavItem({label:'Safety',href:'https://worker.example/toolbox?app=web',toolbox:true});
 const native=click();safety.props.onClick(native.event);
 assert.equal(native.prevented,1);assert.deepEqual(c.launches,[['https://worker.example','web']]);
});

function boot(search,permittedPages=['workshop','cnc','orders','schedule','profile'],tab='workshop'){
 const start=html.indexOf('useEffect(()=>{if(!username)return;const params=new URLSearchParams(location.search)');
 assert.ok(start>=0,'The real URL navigation boot effect is present');
 const suffix='},[username,isAdmin,taskAccess]);',end=html.indexOf(suffix,start);
 assert.ok(end>start);
 const observed={listeners:new Map()};
 const context={URLSearchParams,username:'Coordinator',isAdmin:false,taskAccess:{},permittedPages,tab,location:{pathname:'/index.html',search},navGroups:[],
  setTab:value=>observed.tab=value,setNavSelection:value=>observed.selection=value,setOpenNavGroup:value=>observed.group=value,setPreviewNavGroup(){},setSettingsSection(){},
  history:{replaceState:(state,unused,url)=>{observed.state=state;observed.url=url;}},
  addEventListener:(type,callback)=>observed.listeners.set(type,callback),removeEventListener(){},useEffect:callback=>callback()};
 vm.runInNewContext(html.slice(start,end+suffix.length),context);
 return observed;
}

test('opening a navigation link in a fresh tab selects its permitted target page',()=>{
 for(const target of ['workshop','cnc','orders','schedule','profile']){
  const opened=boot('?page='+target);
  assert.equal(opened.tab,target);assert.equal(opened.selection,target);assert.equal(opened.url,'/index.html?page='+target);
  assert.equal(opened.state.target,target);assert.ok(opened.listeners.has('popstate'));
 }
 assert.equal(boot('?open=stock').tab,'workshop','existing stock bookmarks retain their alias');
});

test('a new tab cannot use a direct link to bypass the existing page permissions',()=>{
 const opened=boot('?page=access',['workshop','cnc','profile']);
 assert.equal(opened.tab,'workshop');assert.equal(opened.url,'/index.html?page=workshop');
 const unavailable=boot('?page=orders',['profile'],'orders');
 assert.equal(unavailable.tab,'profile');assert.equal(unavailable.selection,'profile');
 const before=opened.tab;
 opened.listeners.get('popstate')({state:{panelstock:true,target:'access',key:'access'}});
 assert.equal(opened.tab,before,'browser history also cannot activate a forbidden page');
});

test('Support, My Profile and the notification bell use the same native-link behaviour',()=>{
 const c=components(),selected=[];
 Object.assign(c.context,{navGroups:[],openNavGroup:null,previewNavGroup:null,navSelection:'workshop',safetyNavItem:null,signInRegisterNavItem:null,productionTrackerShare:null,username:'Coordinator',PanelStock:{username:'Coordinator'},
  SupportHeadsetIcon:'headset',User:'user',Bell:'bell',notificationCount:2,setOpenNavGroup(){},setPreviewNavGroup(){},navigate:key=>selected.push(key)});
 const start=html.indexOf('(0, import_jsx_runtime.jsxs)("nav", { className: "flex-1');
 const end=html.indexOf('\n        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "px-4 py-5',start);
 assert.ok(start>=0&&end>start);
 const expression=html.slice(start,end).trim().replace(/,$/,'');
 vm.runInNewContext('globalThis.directNav='+expression,c.context);
 const destinations=nodes(c.context.directNav).filter(node=>node.type===c.SideNavItem);
 assert.equal(destinations.length,2);
 for(const [i,key] of ['support','profile'].entries()){
  const link=c.SideNavItem(destinations[i].props);
  assert.equal(link.type,'a');assert.equal(link.props.href,'/index.html?page='+key);
  const modified=click({ctrlKey:true});link.props.onClick(modified.event);assert.equal(modified.prevented,0);assert.equal(selected.length,i);
  const normal=click();link.props.onClick(normal.event);assert.equal(normal.prevented,1);assert.equal(selected.at(-1),key);
 }
 const bellStart=html.indexOf('(0,import_jsx_runtime.jsxs)("a",{href:panelstockPageHref("notifications")');
 const bellEnd=html.indexOf('\n        ] }),',bellStart);
 assert.ok(bellStart>=0&&bellEnd>bellStart);
 vm.runInNewContext('globalThis.bellLink='+html.slice(bellStart,bellEnd).trim(),c.context);
 const bell=c.context.bellLink;
 assert.equal(bell.type,'a');assert.equal(bell.props.href,'/index.html?page=notifications');assert.equal(bell.props['aria-label'],'2 unread notifications');
 const modified=click({metaKey:true});bell.props.onClick(modified.event);assert.equal(modified.prevented,0);assert.equal(selected.length,2);
 const normal=click();bell.props.onClick(normal.event);assert.equal(normal.prevented,1);assert.equal(selected.at(-1),'notifications');
});
