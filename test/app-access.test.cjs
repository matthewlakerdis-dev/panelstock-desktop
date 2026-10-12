const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const source=name=>{const start=html.indexOf('  function '+name+'('),end=html.indexOf('\n  function ',start+1);return html.slice(start,end);};
const element=(type,props,...children)=>({tag:type,...props,children:children.flat(Infinity)});
const nodes=node=>node&&typeof node==='object'?[node,...(Array.isArray(node.children)?node.children:[node.children]).flatMap(nodes)]:[];
test('app access controls work independently of roles and show admins with all apps',()=>{
 const controls=vm.runInNewContext(source('AppAccessControls')+';AppAccessControls',{import_react:{createElement:element}});
 const changes=[];let tree=controls({access:{web:false,app:true,site:false},onToggle:(...args)=>changes.push(args)});
 const inputs=nodes(tree).filter(node=>node.tag==='input');assert.deepEqual(inputs.map(node=>node.checked),[false,true,false]);
 inputs[0].onChange({target:{checked:true}});assert.deepEqual(changes,[['web',true]]);
 tree=controls({access:{web:false,app:false,site:false},isAdmin:true,onToggle(){}});
 assert.ok(nodes(tree).filter(node=>node.tag==='input').every(node=>node.checked&&node.disabled));
});
test('Web login identifies the app and displays its access denial message',async()=>{
 const state=[];let index=0,body;
 const message='You do not have access to the Web app. Contact an administrator to request access.';
 const context={useState:value=>{const i=index++;if(!(i in state))state[i]=value;return[state[i],value=>state[i]=value];},import_jsx_runtime:{jsx:(type,props)=>({tag:type,...props}),jsxs:(type,props)=>({tag:type,...props})},Field:'field',inputCls:'',PanelStock:{apiFetch:async(_url,options)=>{body=JSON.parse(options.body);return{json:async()=>({ok:false,code:'APP_ACCESS_DENIED',error:message})};}}};
 const login=vm.runInNewContext(source('LoginScreen')+';LoginScreen',context);
 const render=()=>{index=0;return login({workerUrl:'https://example.test',defaultUsername:'',onLoggedIn(){assert.fail('denied login must not sign in');}});};
 render();state[2]='restricted';state[4]='123456';
 const button=nodes(render()).find(node=>node.tag==='button'&&node.children==='Log in');await button.onClick();
 assert.equal(body.app,'web');assert.equal(state[8],message);assert.ok(nodes(render()).some(node=>node.children===message));
});
