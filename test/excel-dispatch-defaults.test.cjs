const test=require('node:test'),assert=require('node:assert/strict');
const {createComponent}=require('../excel-order-actions.js');
const id='12345678-1234-4234-8234-123456789012';
const order={id,project:'Example',orderNumber:'007',status:'completed',ready:true,updatedAt:'v1'};
const tick=()=>new Promise(setImmediate);
function nodes(tree){if(!tree||typeof tree!=='object')return [];return Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.children)];}
function screen(fetcher){
 const hooks=[];let cursor=0,effects=[];
 const React={createElement:(tag,props,...children)=>({tag,props,children}),useState(initial){const i=cursor++;if(!hooks[i])hooks[i]={value:initial};return [hooks[i].value,next=>{hooks[i].value=typeof next==='function'?next(hooks[i].value):next;}];},useRef(initial){const i=cursor++;return hooks[i]||(hooks[i]={current:initial});},useEffect(effect,deps){const i=cursor++,prior=hooks[i];if(!prior||deps.some((value,j)=>value!==prior.deps[j])){effects.push(()=>{prior?.cleanup?.();hooks[i]={deps,cleanup:effect()};});}}};
 const client={username:'alex',apiFetch:fetcher},Component=createComponent(React,client,'https://api.example',{id,action:'dispatch'});
 return {client,render(){cursor=0;const tree=Component({username:client.username});const pending=effects;effects=[];pending.forEach(effect=>effect());return tree;}};
}
const field=(tree,label)=>nodes(nodes(tree).find(n=>n.tag==='label'&&n.children[0]===label)).find(n=>['input','select','textarea'].includes(n.tag));
const button=(tree,label)=>nodes(tree).find(n=>n.tag==='button'&&n.children.includes(label));
test('tracker refresh and failed dispatch preserve edited choices, labels, notes and retry ID',async()=>{
 let vehicle='Configured Ute',driver='sam';const bodies=[];
 const ui=screen(async(url,options)=>{if(options){bodies.push(JSON.parse(options.body));throw Error('Connection interrupted');}return Response.json({orders:[order],dispatchVehicles:[vehicle,'Truck'],dispatchDrivers:[{username:'sam',displayName:'Sam Driver'},{username:'alex',displayName:'Alex Driver'}],dispatchDefaultDriver:driver});});
 ui.render();await tick();let tree=ui.render();assert.equal(field(tree,'Vehicle / transport company').props.value,'vehicle:0');assert.equal(field(tree,'Driver').props.value,'user:sam');
 field(tree,'Vehicle / transport company').props.onChange({target:{value:'vehicle:1'}});tree=ui.render();field(tree,'Driver').props.onChange({target:{value:'user:alex'}});tree=ui.render();field(tree,'Notes (optional)').props.onChange({target:{value:'Keep dry'}});tree=ui.render();field(tree,'Site address').props.onChange({target:{value:'Site'}});
 vehicle='Changed while editing';driver='sam';button(ui.render(),'Refresh status').props.onClick();await tick();tree=ui.render();assert.equal(field(tree,'Driver').props.value,'user:alex');assert.equal(field(tree,'Vehicle / transport company').props.value,'vehicle:1');assert.equal(field(tree,'Notes (optional)').props.value,'Keep dry');
 for(let attempt=0;attempt<2;attempt++){nodes(ui.render()).find(n=>n.tag==='form').props.onSubmit({preventDefault(){}});await tick();}
 assert.equal(bodies.length,2);assert.deepEqual(bodies[0],bodies[1]);assert.equal(bodies[0].transport,'Truck');assert.equal(bodies[0].driver,'Alex Driver');assert.equal(bodies[0].notes,'Keep dry');assert.equal(bodies[0].driverChoice,undefined);
});
test('tracker external choices remain required and a changed account receives fresh defaults',async()=>{
 const ui=screen(async()=>Response.json({orders:[order],dispatchVehicles:[],dispatchDrivers:[]}));ui.render();await tick();let tree=ui.render();
 assert.equal(field(tree,'Vehicle / transport company').props.value,'external');assert.equal(field(tree,'Other vehicle / transport company').props.required,true);assert.equal(field(tree,'Other driver name').props.required,true);
 field(tree,'Other driver name').props.onChange({target:{value:'Old account driver'}});ui.client.username='new-account';ui.render();await tick();tree=ui.render();assert.equal(field(tree,'Other driver name').props.value,'');
});
