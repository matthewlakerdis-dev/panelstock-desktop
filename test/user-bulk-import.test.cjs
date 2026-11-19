const test=require('node:test'),assert=require('node:assert/strict');
const {parseCSV,preview,counts,template,resultsCSV,loginNameFor,createController,createComponent,MAX_USERS,MAX_BYTES}=require('../user-bulk-import.js');
const roles=[{id:'11111111-1111-4111-8111-111111111111',name:'Factory Worker'},{id:'22222222-2222-4222-8222-222222222222',name:'Leading Hand'}];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(initial=[]){
 const accounts=new Map(initial.map(user=>[user.username,user])),calls=[],updates=[],created=[],client={username:'admin'};let currentRoles=roles;
 const f={accounts,calls,updates,created,client,roles:currentRoles,create:null,list:null};
 client.apiFetch=async(url,options)=>{
  const path=new URL(url).pathname,body=JSON.parse(options.body);calls.push({path,body});
  if(path==='/admin/users'){
   if(f.list)return f.list();
   return Response.json({ok:true,users:[...accounts.values()],roles:f.roles});
  }
  assert.equal(path,'/admin/create-user');
  if(f.create)return f.create(body);
  return save(body);
 };
 function save(body){
  if(accounts.has(body.targetUsername))return Response.json({ok:false,error:'Username is already in use'},{status:409});
  const user={...body,username:body.targetUsername,displayName:body.displayName,active:true,isAdmin:body.makeAdmin,mustChangePin:true};accounts.set(user.username,user);return Response.json({ok:true,user},{status:201});
 }
 f.save=save;f.controller=createController({client,baseUrl:'https://worker.example/',onChange:state=>updates.push(structuredClone(state)),onCreated:user=>created.push(user)});
 f.creates=()=>calls.filter(call=>call.path==='/admin/create-user');
 return f;
}

test('CSV reads UTF-8 BOM, quoted commas, escaped quotes, CRLF and embedded newlines',()=>{
 const rows=parseCSV('\uFEFFDisplay name,Username,Phone,Roles,Web,App,Site\r\n"Alice, ""AJ"" Example",aexample,0411222333,Factory Worker; Leading Hand,No,Yes,No\r\n"Ben\nExample",bexample,0400000000,Factory Worker,Yes,No,Yes\r\n\r\n');
 assert.equal(rows.length,2);assert.equal(rows[0].displayName,'Alice, "AJ" Example');assert.equal(rows[0].phone,'0411222333');assert.equal(rows[1].line,3);
 const planned=preview(rows,[],roles);assert.equal(planned[0].status,'ready');assert.deepEqual(planned[0].roleIds,roles.map(role=>role.id));assert.deepEqual(planned[0].appAccess,{web:false,app:true,site:false});assert.equal(planned[1].displayName,'Ben Example');
});
test('template has supported headings, and empty, malformed, duplicate and unknown headings fail clearly',()=>{
 assert.ok(template().startsWith('\uFEFFDisplay name,Username,'));
 for(const source of ['',template(),'Email\nalice@example.com','Name,Full name\nAlice,Alice','Name,Administrator\nAlice,Yes','Name,constructor\nAlice,value','Name\n"unclosed','Name\nAlice"Example','Name\n"Alice"x'])assert.throws(()=>parseCSV(source));
 assert.equal(parseCSV('Full Name,Login name,Email address,Phone number,Mobile app\nAlice Example,alice,alice@example.com,0411,yes')[0].targetUsername,'alice');
});
test('files are bounded by size and user count before any account requests',()=>{
 assert.throws(()=>parseCSV('x'.repeat(MAX_BYTES+1)),/under 1 MB/);
 assert.throws(()=>parseCSV('Name\n'+Array(MAX_USERS+1).fill('Alice').join('\n')),/100 users/);
 assert.equal(parseCSV('Name\n'+Array(MAX_USERS).fill('Alice').join('\n')).length,MAX_USERS);
});
test('username generation follows the normal initial-and-surname convention without silently suffixing duplicates',()=>{
 assert.equal(loginNameFor('  Élodie O’Neill '),'eoneill');assert.equal(loginNameFor('Admin'),'admin');
 const rows=preview(parseCSV('Name\nJohn Smith\nJane Smith'),[],roles);assert.equal(counts(rows).invalid,2);assert.ok(rows.every(row=>row.errors.some(error=>/repeated/.test(error))));
 const explicit=preview(parseCSV('Name,Username\nJohn Smith,jsmith\nJane Smith,jsmith2'),[],roles);assert.equal(counts(explicit).pending,2);
});
test('existing usernames are skipped case-insensitively while duplicates in the file must be corrected',()=>{
 const rows=preview(parseCSV('Name,Username\nAlice Example, AEXAMPLE \nBen Example,bexample'),[{username:'aexample'}],roles);
 assert.equal(rows[0].status,'existing');assert.equal(rows[1].status,'ready');
 assert.equal(counts(preview(parseCSV('Name,Username\nAlice,AEXAMPLE\nAlice,aexample'),[],roles)).invalid,2);
});
test('bad names, usernames, contact details, roles, app flags and extra cells are highlighted',()=>{
 for(const [header,record] of [
  ['Name,Username',',missingname'],['Name,Username','Alice,constructor'],['Name,Username','Alice,__proto__'],
  ['Name,Username','Alice,'+'a'.repeat(81)],['Name,Email','Alice,broken@address'],
  ['Name,Phone','Alice,'+'1'.repeat(41)],['Name,Title','Alice,'+'x'.repeat(101)],['Name,Location','Alice,'+'x'.repeat(161)],
  ['Name,Roles','Alice,Unknown role'],['Name,Web','Alice,maybe'],['Name','Alice,extra'],
  ['Name,Title','Alice,bad\u0000title']
 ])assert.equal(preview(parseCSV(header+'\n'+record),[],roles)[0].status,'invalid',record);
});
test('blank optional access values use normal defaults and role IDs are also accepted',()=>{
 const row=preview(parseCSV('Name,Roles,Phone\nAlice Example,'+roles[0].id+';Factory Worker,001122'),[],roles)[0];
 assert.deepEqual(row.roleIds,[roles[0].id]);assert.equal(row.phone,'001122');assert.deepEqual(row.appAccess,{web:true,app:true,site:true});
});
test('results CSV protects spreadsheet formulas and includes only account/result fields',()=>{
 const row=preview(parseCSV('Name,Username,Email\n"=HYPERLINK(""bad"")",safeuser,private@example.com'),[],roles)[0],csv=resultsCSV([row]);
 assert.match(csv,/"'=HYPERLINK\(""bad""\)"/);assert.doesNotMatch(csv,/private@example|password|pinHash|inviteToken/);
 assert.match(csv,/Username/);assert.match(csv,/Not created/);
});

test('preview makes no writes and confirmed upload creates standard pending-PIN accounts with reviewed access',async()=>{
 const f=fixture();await f.controller.loadCSV('Display name,Email,Phone,Roles,Web,App,Site\nAlice Example,alice@example.com,0411222333,Factory Worker,No,Yes,No');
 assert.equal(f.creates().length,0);assert.equal(f.controller.state.rows[0].status,'ready');
 assert.equal(await f.controller.run(),true);assert.equal(f.creates().length,1);
 const body=f.creates()[0].body;assert.equal(body.targetUsername,'aexample');assert.equal(body.makeAdmin,false);assert.equal(body.phone,'0411222333');assert.deepEqual(body.roleIds,[roles[0].id]);assert.deepEqual(body.appAccess,{web:false,app:true,site:false});
 assert.equal(f.created[0].mustChangePin,true);assert.equal(f.controller.state.rows[0].status,'created');assert.ok(f.calls.every(call=>['/admin/users','/admin/create-user'].includes(call.path)));assert.equal(Object.hasOwn(body,'pin'),false);
});
test('a file with any validation error cannot create even its valid rows',async()=>{
 const f=fixture();await f.controller.loadCSV('Name,Email\nAlice,not-an-email\nBen,ben@example.com');
 assert.equal(await f.controller.run(),false);assert.equal(f.creates().length,0);
});
test('existing accounts remain untouched and only new usernames are submitted',async()=>{
 const existing={username:'aexample',displayName:'Original Alice',isAdmin:true},f=fixture([existing]);await f.controller.loadCSV('Name,Username\nChanged Alice,aexample\nBen Example,bexample');
 assert.equal(await f.controller.run(),true);assert.equal(f.creates().length,1);assert.equal(f.accounts.get('aexample'),existing);assert.match(f.controller.state.rows[0].message,/Original Alice/);assert.equal(counts(f.controller.state.rows).existing,1);
});
test('a username added or a role removed after preview is checked again before creation',async()=>{
 const f=fixture();await f.controller.loadCSV('Name,Roles\nAlice Example,Factory Worker');f.accounts.set('aexample',{username:'aexample'});assert.equal(await f.controller.run(),true);assert.equal(f.creates().length,0);
 const changed=fixture();await changed.controller.loadCSV('Name,Roles\nBen Example,Factory Worker');changed.roles=[];assert.equal(await changed.controller.run(),false);assert.equal(changed.creates().length,0);assert.equal(changed.controller.state.rows[0].status,'invalid');
});
test('retry after a lost successful response checks existing usernames instead of creating duplicates',async()=>{
 const f=fixture();await f.controller.loadCSV('Name\nAlice Example\nBen Example');let lost=true;
 f.create=body=>{const response=f.save(body);if(lost){lost=false;throw TypeError('Connection lost');}return response;};
 assert.equal(await f.controller.run(),false);assert.equal(f.creates().length,1);assert.equal(f.controller.state.rows[0].status,'unconfirmed');
 assert.equal(await f.controller.run(),true);assert.deepEqual(f.creates().map(call=>call.body.targetUsername),['aexample','bexample']);assert.equal(f.accounts.size,2);assert.equal(counts(f.controller.state.rows).existing,1);
});
test('retry after a lost request that did not reach the server can create the missing user once',async()=>{
 const f=fixture();await f.controller.loadCSV('Name\nAlice Example');let lost=true;
 f.create=body=>{if(lost){lost=false;throw TypeError('Connection lost');}return f.save(body);};
 assert.equal(await f.controller.run(),false);assert.equal(f.accounts.size,0);
 assert.equal(await f.controller.run(),true);assert.equal(f.accounts.size,1);assert.equal(f.creates().length,2);
});
test('partial failure keeps confirmed users complete when retrying the remaining rows',async()=>{
 const f=fixture();await f.controller.loadCSV('Name\nAlice Example\nBen Example\nChris Example');let reject=true;
 f.create=body=>body.targetUsername==='bexample'&&reject?Response.json({ok:false,error:'Account details changed'},{status:400}):f.save(body);
 assert.equal(await f.controller.run(),false);assert.equal(counts(f.controller.state.rows).created,1);assert.equal(f.accounts.has('cexample'),false);
 reject=false;assert.equal(await f.controller.run(),true);assert.deepEqual(f.creates().map(call=>call.body.targetUsername),['aexample','bexample','bexample','cexample']);assert.equal(counts(f.controller.state.rows).created,3);
});
test('a concurrent duplicate is skipped without changing it and the upload continues',async()=>{
 const f=fixture();await f.controller.loadCSV('Name\nAlice Example\nBen Example');
 f.create=body=>{if(body.targetUsername==='aexample'){f.accounts.set('aexample',{username:'aexample',displayName:'Created elsewhere'});return Response.json({ok:false,error:'Username is already in use'},{status:409});}return f.save(body);};
 assert.equal(await f.controller.run(),true);assert.equal(f.accounts.get('aexample').displayName,'Created elsewhere');assert.equal(counts(f.controller.state.rows).created,1);assert.equal(counts(f.controller.state.rows).existing,1);
});
test('administrator permission failures block preview and stop an in-flight import',async()=>{
 const blocked=fixture();blocked.list=()=>Response.json({ok:false,error:'Admin access required'},{status:403});assert.equal(await blocked.controller.loadCSV('Name\nAlice'),false);assert.equal(await blocked.controller.run(),false);assert.equal(blocked.creates().length,0);
 const f=fixture();await f.controller.loadCSV('Name\nAlice Example\nBen Example\nChris Example');
 f.create=body=>body.targetUsername==='bexample'?Response.json({ok:false,error:'Admin access required'},{status:403}):f.save(body);
 assert.equal(await f.controller.run(),false);assert.equal(f.creates().length,2);assert.equal(f.accounts.has('cexample'),false);assert.equal(f.controller.state.rows[1].status,'failed');
});
test('a malformed response remains unconfirmed until a status check',async()=>{
 const f=fixture();await f.controller.loadCSV('Name\nAlice Example');
 f.create=body=>{f.save(body);return new Response('<html>upstream error</html>',{status:502});};
 assert.equal(await f.controller.run(),false);assert.equal(f.controller.state.rows[0].status,'unconfirmed');assert.equal(await f.controller.run(),true);assert.equal(f.creates().length,1);
});
test('double clicks and file replacement cannot start another import while a request is in flight',async()=>{
 const f=fixture();await f.controller.loadCSV('Name\nAlice Example');let release;f.create=body=>new Promise(resolve=>release=()=>resolve(f.save(body)));
 const running=f.controller.run();await tick();assert.equal(await f.controller.run(),false);assert.equal(await f.controller.loadCSV('Name\nBen'),false);assert.equal(f.creates().length,1);release();await running;
});
test('Stop finishes the current user and leaves the remaining users ready to continue',async()=>{
 const f=fixture();await f.controller.loadCSV('Name\nAlice Example\nBen Example');let release;f.create=body=>new Promise(resolve=>release=()=>resolve(f.save(body)));
 const running=f.controller.run();await tick();f.controller.stop();release();assert.equal(await running,false);assert.equal(f.creates().length,1);assert.equal(counts(f.controller.state.rows).pending,1);assert.match(f.controller.state.info,/stopped/);
 f.create=null;assert.equal(await f.controller.run(),true);assert.equal(f.accounts.size,2);
});
test('account changes and unmounting prevent late UI updates and further user creation',async()=>{
 for(const change of [f=>f.client.username='other-admin',f=>f.controller.dispose()]){
  const f=fixture();await f.controller.loadCSV('Name\nAlice Example\nBen Example');let release;f.create=body=>new Promise(resolve=>release=()=>resolve(f.save(body)));
  const running=f.controller.run();await tick();const before=f.updates.length;change(f);release();await running;assert.equal(f.creates().length,1);assert.equal(f.created.length,0);assert.equal(f.updates.length,before);
 }
});
test('a failed replacement file removes the old preview so it cannot be imported by accident',async()=>{
 const f=fixture();await f.controller.loadCSV('Name\nAlice Example');assert.equal(await f.controller.loadCSV('bad heading\nBen'),false);assert.equal(f.controller.state.rows.length,0);assert.equal(await f.controller.run(),false);assert.equal(f.creates().length,0);
});

function componentHarness(){
 const f=fixture(),states=[],refs=[],effects=[];let cursor=0,refCursor=0,effectCursor=0,tree,closed=0,pending=[];
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState(initial){const index=cursor++;if(!(index in states))states[index]=initial;return[states[index],next=>states[index]=typeof next==='function'?next(states[index]):next];},useRef(initial){return refs[refCursor++]||(refs[refCursor-1]={current:initial});},useEffect(callback,deps){const index=effectCursor++,previous=effects[index];if(!previous||deps.some((value,i)=>!Object.is(value,previous.deps[i])))pending.push(()=>{previous?.cleanup?.();effects[index]={callback,deps,cleanup:callback()};});}};
 const Component=createComponent(React),walk=node=>Array.isArray(node)?node.flatMap(walk):node&&typeof node==='object'?[node,...walk(node.children)]:[],text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.children):node==null||node===false?'':String(node);
 const render=()=>{cursor=refCursor=effectCursor=0;tree=Component({client:f.client,baseUrl:'https://worker.example',onClose:()=>closed++,onCreated:user=>f.created.push(user)});for(const effect of pending.splice(0))effect();return tree;};
 render();render();
 return {...f,render,nodes:()=>walk(tree),button:label=>walk(tree).find(node=>node.type==='button'&&text(node)===label),text:()=>text(tree),closeCount:()=>closed,dispose:()=>effects.forEach(effect=>effect.cleanup?.()),async file(source,name='users.csv',size=source.length){const input=walk(tree).find(node=>node.type==='input'&&node.props.type==='file');await input.props.onChange({target:{value:name,files:[{name,size,text:async()=>source}]}});render();}};
}
test('the upload screen offers a template, a review and an explicit create button',async()=>{
 const h=componentHarness();assert.ok(h.button('Download CSV template'));assert.ok(h.button('Back to users'));await h.file('Name,Roles,Web,App,Site\nAlice Example,Factory Worker,No,Yes,No');
 assert.match(h.text(),/Alice Example/);assert.match(h.text(),/Factory Worker/);assert.equal(h.button('Create 1 user').props.disabled,false);assert.equal(h.creates().length,0);
 await h.button('Create 1 user').props.onClick();h.render();assert.match(h.text(),/awaiting PIN setup/);assert.match(h.text(),/Send invite/);assert.equal(h.created.length,1);
 h.button('Back to users').props.onClick();assert.equal(h.closeCount(),1);h.dispose();
});
test('invalid rows disable creation and unsupported files clear the preview with guidance',async()=>{
 const h=componentHarness();await h.file('Name,Roles\nAlice Example,Missing role');assert.equal(h.button('Create 0 users').props.disabled,true);assert.match(h.text(),/Unknown or ambiguous role/);
 await h.file('Name\nAlice Example','users.xlsx');assert.match(h.text(),/CSV UTF-8/);assert.equal(h.nodes().some(node=>node.type==='table'),false);
 await h.file('Name\nAlice Example','users.csv',MAX_BYTES+1);assert.match(h.text(),/under 1 MB/);assert.equal(h.creates().length,0);h.dispose();
});

test('reading a replacement file clears the previous preview before the asynchronous file read',async()=>{
 const h=componentHarness();await h.file('Name\nAlice Example');const oldCreate=h.button('Create 1 user'),input=h.nodes().find(node=>node.type==='input');let finish;
 const reading=input.props.onChange({target:{value:'next.csv',files:[{name:'next.csv',size:30,text:()=>new Promise(resolve=>finish=resolve)}]}});h.render();assert.equal(h.nodes().some(node=>node.type==='table'),false);assert.equal(await oldCreate.props.onClick(),false);assert.equal(h.creates().length,0);finish('Name\nBen Example');await reading;h.render();assert.match(h.text(),/Ben Example/);h.dispose();
});
test('changing accounts while a file is reading releases the new account form and ignores old file data',async()=>{
 const h=componentHarness(),input=h.nodes().find(node=>node.type==='input');let finish;
 const reading=input.props.onChange({target:{value:'old.csv',files:[{name:'old.csv',size:30,text:()=>new Promise(resolve=>finish=resolve)}]}});h.render();assert.equal(h.nodes().find(node=>node.type==='input').props.disabled,true);
 h.client.username='next-admin';h.render();h.render();assert.equal(h.nodes().find(node=>node.type==='input').props.disabled,false);finish('Name\nOld Account');await reading;h.render();assert.equal(h.calls.length,0);assert.equal(h.nodes().some(node=>node.type==='table'),false);h.dispose();
});
