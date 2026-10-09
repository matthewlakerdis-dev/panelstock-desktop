const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../index.html','utf8');
test('setup and reset sharing create the correct link without sending a temporary PIN',async()=>{
 for(const reset of [false,true]){
  const state=[],calls=[];let index=0;
  const context={import_react:{createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)})},useState:value=>{const i=index++;if(!(i in state))state[i]=value;return[state[i],value=>state[i]=value];},navigator:{userAgent:'test'},PanelStock:{apiFetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return{ok:true,json:async()=>({ok:true,url:'https://example.test/#private-token',expiresAt:Date.now()+3600000})};}}};
  vm.createContext(context);vm.runInContext(source.slice(source.indexOf('  function UserInvite('),source.indexOf('  function AdminPanel('))+'globalThis.view=UserInvite;',context);
  const render=()=>{index=0;return context.view({user:{username:'alex',displayName:'Alex',phone:'0400000000'},workerUrl:'https://example.test',onClose(){},reset});};
  const nodes=node=>node&&typeof node==='object'?[node,...node.children.flatMap(nodes)]:[];
  let tree=render();const generate=nodes(tree).find(node=>node.type==='button'&&node.children.includes(reset?'Create reset link':'Create invite link'));await generate.props.onClick();
  assert.equal(calls[0].url,'https://example.test/admin/'+(reset?'reset-pin':'create-invite'));assert.deepEqual(calls[0].body,{targetUsername:'alex'});
  tree=render();const message=nodes(tree).find(node=>node.type==='textarea').props.value;assert.match(message,reset?/Reset your PanelStock PIN/:/Set up your account/);assert.match(message,/private-token/);assert.doesNotMatch(message,/temporary PIN/i);
 }
});
