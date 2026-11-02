const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('blank code is optional and does not lock a new item to another blank-code profile',()=>{
 const states=[];let cursor=0;
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:v=>{const i=cursor++;if(!(i in states))states[i]=typeof v==='function'?v():v;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useEffect(){},Fragment:'fragment'};
 const ctx={window:{},PanelStock:{username:'admin'},localStorage:{getItem:()=>null}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../workshop-stock.js'),'utf8'),ctx);
 const C=ctx.window.createWorkshopStock(React),walk=n=>!n||typeof n!=='object'?[]:[n,...(n.children||[]).flat(Infinity).flatMap(walk)],render=()=>{cursor=0;return walk(C({isAdmin:true}));};
 render();states[0]={items:[{id:'a',sku:'',name:'Existing',category:'fixings',unit:'each',qty:1,available:1}],movements:[]};
 let nodes=render();nodes.find(n=>n.type==='button'&&n.children.includes('Add stock item')).props.onClick();
 nodes=render();const field=key=>nodes.find(n=>n.type==='label'&&n.props.key===key).children.find(n=>n?.type==='input');
 assert.equal(field('sku').props.required,false);assert.equal(field('name').props.disabled,false);assert.equal(field('name').props.required,true);assert.equal(field('name').props.value,'');
 field('sku').props.onChange({target:{value:' '}});nodes=render();assert.equal(field('name').props.disabled,false);assert.equal(field('name').props.value,'');
});
