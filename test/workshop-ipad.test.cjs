const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../workshop-stock.js'),'utf8');

test('stocktake opens and records a zero count without Object.hasOwn',()=>{
 const states=[];let cursor=0;
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:v=>{const i=cursor++;if(!(i in states))states[i]=typeof v==='function'?v():v;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useEffect(){},Fragment:'fragment'};
 const context=vm.createContext({window:{},PanelStock:{username:'ipad',apiFetch:async()=>({ok:true,json:async()=>states[0]})},localStorage:{getItem:()=>null,setItem(){}}});
 vm.runInContext('Object.hasOwn=undefined',context);
 vm.runInContext(source,context);
 const Component=context.window.createWorkshopStock(React),render=()=>{cursor=0;return Component({isAdmin:false,taskAccess:{'factory.stock':true}});};
 const walk=n=>!n||typeof n!=='object'?[]:[n,...(n.children||[]).flat(Infinity).flatMap(walk)];
 render();states[0]={items:[{id:'a',name:'Angle',sku:'A',category:'extrusions',qty:2,available:2,unit:'lengths'},{id:'b',name:'Bolt',sku:'B',category:'fixings',qty:1,available:1,unit:'each'}],movements:[],stocktakes:[{id:'count',name:'Count',categories:['extrusions','fixings'],itemIds:['a','b'],counts:{b:{quantity:1}},status:'open'}]};
 let nodes=walk(render());nodes.find(n=>n.type==='button'&&n.children.includes('Stocktake')).props.onClick();
 nodes=walk(render());nodes.find(n=>n.type==='button'&&n.children.includes('Continue count')).props.onClick();
 nodes=walk(render());let inputs=nodes.filter(n=>n.props['data-count-input']);assert.equal(inputs.length,1);
 inputs[0].props.onChange({target:{value:'0'}});
 nodes=walk(render());assert.equal(nodes.find(n=>n.props['data-count-input']).props.value,'0');
 nodes.find(n=>n.type==='button'&&n.children.includes('Review counts')).props.onClick();
 assert.ok(walk(render()).some(n=>n.type==='button'&&n.children.includes('Submit stocktake')));
});
