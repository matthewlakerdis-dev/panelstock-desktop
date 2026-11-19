(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PanelStockUserBulkImport=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const MAX_USERS=100,MAX_BYTES=1024*1024;
 const columns=['Display name','Username','Email','Phone','Title','Location','Roles','Web','App','Site'];
 const aliases={displayname:'displayName',name:'displayName',fullname:'displayName',username:'targetUsername',loginname:'targetUsername',email:'email',emailaddress:'email',phone:'phone',phonenumber:'phone',title:'title',location:'location',roles:'roles',role:'roles',web:'web',webaccess:'web',app:'app',mobile:'app',mobileapp:'app',appaccess:'app',site:'site',siteaccess:'site'};
 const clean=value=>String(value||'').trim(),key=value=>clean(value).replace(/\s+/g,' ').toLowerCase(),usernameKey=value=>clean(value).toLowerCase();
 function loginNameFor(name){
  const parts=clean(name).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').split(/\s+/).map(part=>part.replace(/[^a-zA-Z0-9]/g,'')).filter(Boolean);
  return parts.length?(parts.length===1?parts[0]:parts[0][0]+parts[parts.length-1]).toLowerCase().slice(0,36):'';
 }
 function parseCSV(text){
  if(typeof text!=='string'||text.length>MAX_BYTES)throw Error('Choose a CSV file under 1 MB.');
  text=text.replace(/^\uFEFF/,'');
  const records=[];let cells=[],field='',quoted=false,closed=false,line=1,startLine=1;
  function finishField(){cells.push(field);field='';closed=false;}
  function finishRow(){finishField();if(cells.some(value=>value.trim()))records.push({line:startLine,cells});cells=[];}
  for(let i=0;i<text.length;i++){
   const c=text[i];
   if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else{field+=c;if(c==='\n')line++;}continue;}
   if(closed&&c!==','&&c!=='\r'&&c!=='\n'){if(c===' '||c==='\t')continue;throw Error('Unexpected text after a closing quote on line '+line+'.');}
   if(c==='"'){if(field.trim())throw Error('Unexpected quote on line '+line+'.');field='';quoted=true;}
   else if(c===',')finishField();
   else if(c==='\r'||c==='\n'){finishRow();if(c==='\r'&&text[i+1]==='\n')i++;line++;startLine=line;}
   else field+=c;
  }
  if(quoted)throw Error('A quoted field is not closed. Check the CSV file.');
  if(field||cells.length||closed)finishRow();
  if(!records.length)throw Error('The CSV is empty. Download the template to get started.');
  const headers=records.shift().cells.map(value=>{const columnKey=key(value).replace(/[^a-z0-9]/g,''),fieldName=Object.hasOwn(aliases,columnKey)?aliases[columnKey]:null;if(!fieldName)throw Error('Unknown column "'+clean(value)+'". Use the CSV template columns.');return fieldName;});
  if(new Set(headers).size!==headers.length)throw Error('Each column may appear only once.');
  if(!headers.includes('displayName'))throw Error('A Display name column is required.');
  if(!records.length)throw Error('Add at least one user below the column headings.');
  if(records.length>MAX_USERS)throw Error('Upload up to '+MAX_USERS+' users at a time.');
  return records.map(record=>({...Object.fromEntries(headers.map((header,i)=>[header,clean(record.cells[i])])),line:record.line,extraCells:record.cells.length>headers.length}));
 }
 function preview(records,users=[],roles=[]){
  const existing=new Map(users.map(user=>[usernameKey(user.username),user])),names=new Map();
  const rows=records.map(record=>{
   const errors=[],displayName=clean(record.displayName).replace(/\s+/g,' '),targetUsername=usernameKey(record.targetUsername)||loginNameFor(displayName);
   if(!displayName||displayName.length>100)errors.push('Display name is required and must be at most 100 characters.');
   if(!/^[a-z0-9][a-z0-9 ._@-]{0,79}$/.test(targetUsername)||['constructor','prototype','__proto__'].includes(targetUsername))errors.push('Choose a valid username using letters, numbers, spaces, dots, dashes, underscores or @ (up to 80 characters).');
   const email=clean(record.email).toLowerCase(),phone=clean(record.phone),title=clean(record.title),location=clean(record.location);
   if(email.length>160||email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))errors.push('Email address is invalid.');
   if(phone.length>40)errors.push('Phone number must be at most 40 characters.');
   if(title.length>100)errors.push('Title must be at most 100 characters.');
   if(location.length>160)errors.push('Location must be at most 160 characters.');
   if(record.extraCells)errors.push('There are more values than column headings.');
   if(Object.values(record).some(value=>typeof value==='string'&&/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)))errors.push('Remove unsupported control characters.');
   const roleIds=[],roleNames=[];
   for(const label of clean(record.roles).split(';').map(clean).filter(Boolean)){
    const found=roles.filter(role=>key(role.name)===key(label)||key(role.id)===key(label));
    if(found.length!==1){errors.push('Unknown or ambiguous role: '+label+'.');continue;}
    if(!roleIds.includes(found[0].id)){roleIds.push(found[0].id);roleNames.push(found[0].name);}
   }
   if(roleIds.length>20)errors.push('Choose at most 20 roles.');
   const appAccess={};
   for(const app of ['web','app','site']){
    const value=key(record[app]);
    if(['','yes','y','true','1'].includes(value))appAccess[app]=true;
    else if(['no','n','false','0'].includes(value))appAccess[app]=false;
    else{appAccess[app]=false;errors.push(app.toUpperCase()+' must be Yes or No.');}
   }
   const row={line:record.line,targetUsername,displayName,email,phone,title,location,roleIds,roleNames,appAccess,errors,status:existing.has(targetUsername)?'existing':'ready',message:existing.has(targetUsername)?'Existing account: '+(existing.get(targetUsername).displayName||targetUsername)+' ('+targetUsername+'). Skipped.':''};
   if(targetUsername)names.set(targetUsername,[...(names.get(targetUsername)||[]),row]);
   return row;
  });
  for(const duplicates of names.values())if(duplicates.length>1)for(const row of duplicates)row.errors.push('Username is repeated in this file. Give each person a different username.');
  return rows.map(row=>({...row,status:row.errors.length?'invalid':row.status}));
 }
 function counts(rows){return {created:rows.filter(row=>row.status==='created').length,existing:rows.filter(row=>row.status==='existing').length,invalid:rows.filter(row=>row.status==='invalid').length,pending:rows.filter(row=>['ready','failed','unconfirmed','creating'].includes(row.status)).length};}
 function csvCell(value){let text=String(value??'');if(/^\s*[=+@-]|^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
 function resultsCSV(rows){return '\uFEFF'+[['CSV line','Display name','Username','Result','Details'],...rows.map(row=>[row.line,row.displayName,row.targetUsername,({ready:'Not created',creating:'In progress',created:'Created',existing:'Existing - skipped',invalid:'Needs correction',failed:'Failed',unconfirmed:'Check status'})[row.status],row.errors.join(' ')||row.message||''])].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';}
 const template=()=>'\uFEFF'+columns.join(',')+'\r\n';
 function createController({client,baseUrl,onChange=()=>{},onCreated=()=>{}}){
  const owner=client.username,created=new Map();let alive=true,locked=false,stopRequested=false,records=null;
  const state={phase:'empty',busy:false,rows:[],roles:[],fileName:'',error:'',info:''};
  const current=()=>alive&&client.username===owner;
  const publish=patch=>{if(current()){Object.assign(state,patch);onChange({...state});}};
  async function request(path,body={}){
   if(!current())throw Error('Your account changed. Reopen bulk upload.');
   const response=await client.apiFetch(baseUrl.replace(/\/$/,'')+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   let data;try{data=await response.json();}catch{throw Object.assign(Error('The response could not be confirmed. Check status before continuing.'),{uncertain:true});}
   if(!current())throw Error('Your account changed. Reopen bulk upload.');
   if(!response.ok||data.ok!==true)throw Object.assign(Error(data.error||'The request could not be confirmed.'),{status:response.status,uncertain:response.status>=500||response.status<400});
   return data;
  }
  async function snapshot(){const result=await request('/admin/users');if(!Array.isArray(result.users)||!Array.isArray(result.roles))throw Error('Account details could not be checked. Try again.');return result;}
  function fail(message){if(locked||!current())return;records=null;created.clear();publish({phase:'empty',rows:[],fileName:'',error:message,info:''});}
  async function loadCSV(text,fileName='users.csv'){
   if(locked||!current())return false;locked=true;created.clear();records=null;publish({busy:true,phase:'checking',rows:[],fileName,error:'',info:''});
   try{const parsed=parseCSV(text),latest=await snapshot();if(!current())return false;records=parsed;publish({phase:'review',rows:preview(records,latest.users,latest.roles),roles:latest.roles});return true;}
   catch(error){publish({phase:'empty',error:error.message});return false;}
   finally{locked=false;publish({busy:false});}
  }
  async function run(){
   if(locked||!current()||!records||counts(state.rows).invalid||!counts(state.rows).pending)return false;
   locked=true;stopRequested=false;publish({busy:true,phase:'running',error:'',info:''});
   let complete=false;
   try{
    const latest=await snapshot();if(!current())return false;
    const rows=preview(records,latest.users,latest.roles).map(row=>created.has(row.targetUsername)?{...created.get(row.targetUsername)}:row);
    publish({rows,roles:latest.roles});
    if(counts(rows).invalid){publish({phase:'review',error:'Account details changed. Correct the marked rows and upload the file again.'});return false;}
    for(const row of rows){
     if(!current()||stopRequested)break;
     if(row.status!=='ready')continue;
     row.status='creating';row.message='Creating account…';publish({rows:[...rows]});
     try{
      const result=await request('/admin/create-user',{username:owner,targetUsername:row.targetUsername,displayName:row.displayName,email:row.email,phone:row.phone,title:row.title,location:row.location,roleIds:row.roleIds,appAccess:row.appAccess,makeAdmin:false});
      if(!result.user||result.user.username!==row.targetUsername)throw Object.assign(Error('The response could not be confirmed. Check status before continuing.'),{uncertain:true});
      row.status='created';row.message='Created; awaiting PIN setup.';created.set(row.targetUsername,{...row});
      if(current()){try{onCreated(result.user);}catch{}}
     }catch(error){
      if(!current())return false;
      if(error.status===409){
       try{const checked=await snapshot();if(checked.users.some(user=>usernameKey(user.username)===row.targetUsername)){row.status='existing';row.message='Username now exists; skipped.';publish({rows:[...rows]});continue;}}catch{}
      }
      row.status=error.uncertain||!error.status?'unconfirmed':'failed';row.message=error.message;publish({rows:[...rows],error:row.message});break;
     }
     publish({rows:[...rows]});
    }
    complete=counts(rows).pending===0;
    publish({phase:complete?'complete':'review',info:stopRequested?'Upload stopped. You can check and continue the remaining users.':complete?'Account creation finished. Use Send invite in User Access for PIN setup.':''});
    return complete;
   }catch(error){publish({phase:'review',error:error.message});return false;}
   finally{locked=false;publish({busy:false,phase:complete?'complete':'review'});}
  }
  return {state,current,loadCSV,run,fail,stop(){stopRequested=true;publish({info:'Stopping after the current user…'});},dispose(){alive=false;stopRequested=true;}};
 }
 function createComponent(React){
  const h=React.createElement;
  function download(contents,filename){const url=URL.createObjectURL(new Blob([contents],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return function UserBulkUpload({client,baseUrl,onClose,onCreated}){
   const [state,setState]=React.useState({phase:'empty',busy:false,rows:[],roles:[],fileName:'',error:'',info:''}),[reading,setReading]=React.useState(false),controller=React.useRef(null),callbacks=React.useRef({onCreated});
   callbacks.current={onCreated};
   React.useEffect(()=>{const next=createController({client,baseUrl,onChange:setState,onCreated:user=>callbacks.current.onCreated?.(user)});controller.current=next;setState({...next.state});setReading(false);return()=>next.dispose();},[client,baseUrl,client.username]);
   async function read(event){
    const file=event.target.files?.[0];event.target.value='';if(!file||!controller.current||reading||state.busy)return;
    const active=controller.current;
    if(file.size>MAX_BYTES||!/\.csv$/i.test(file.name)){active.fail('Choose a .csv file under 1 MB. In Excel, save as CSV UTF-8.');return;}
    active.fail('');setReading(true);
    try{const text=await file.text();if(active.current())await active.loadCSV(text,file.name);}
    catch{active.fail('The file could not be read. Save it as CSV UTF-8 and try again.');}
    finally{if(active.current())setReading(false);}
   }
   const count=counts(state.rows),busy=state.busy||reading,attempted=state.rows.some(row=>['created','failed','unconfirmed'].includes(row.status));
   const labels={ready:'Ready',existing:'Existing — skipped',invalid:'Needs correction',creating:'Creating…',created:'Created',failed:'Failed',unconfirmed:'Check status'};
   return h('section',{className:'ps-user-import'},
    h('header',{className:'ps-user-import-heading'},h('div',null,h('h2',null,'Bulk upload users'),h('p',null,'Upload a CSV file, review the accounts, then create up to '+MAX_USERS+' users.')),h('button',{type:'button',disabled:busy,onClick:onClose},'Back to users')),
    h('div',{className:'ps-user-import-card'},h('div',{className:'ps-user-import-controls'},h('label',{className:'ps-user-import-file'},'Choose CSV file',h('input',{type:'file',accept:'.csv,text/csv',disabled:busy,onChange:read,'aria-label':'Upload users CSV'})),h('button',{type:'button',onClick:()=>download(template(),'panelstock-users-template.csv')},'Download CSV template')),h('p',null,'Excel: save the completed template as CSV UTF-8. Existing usernames are skipped; duplicate usernames within the file must be corrected.'),
     h('details',null,h('summary',null,'CSV columns and access settings'),h('dl',null,
      h('dt',null,'Display name'),h('dd',null,'Required. Username is optional; a blank username uses the first initial and surname. If that username belongs to someone else, enter a different Username in the CSV.'),
      h('dt',null,'Email, Phone, Title, Location'),h('dd',null,'Optional. Keep phone numbers as text to preserve leading zeros.'),
      h('dt',null,'Roles'),h('dd',null,'Optional. Separate existing role names with a semicolon (;). A blank value uses the normal default task access.'),
      h('dt',null,'Web, App, Site'),h('dd',null,'Use Yes or No for each app. Blank values allow access. Review the Apps column before creation.')),
      h('p',null,'Uploads create standard accounts. Administrator access can be granted later through Edit.')),
     h('p',{className:'ps-user-import-help'},'Each new user chooses their own PIN through the usual Send invite option after upload.'),
     reading&&h('p',{role:'status'},'Reading file…'),state.phase==='checking'&&h('p',{role:'status'},'Checking current accounts and roles…')),
    state.error&&h('p',{role:'alert',className:'ps-user-import-error'},state.error),
    state.info&&h('p',{role:'status',className:'ps-user-import-info'},state.info),
    state.rows.length>0&&h('div',{className:'ps-user-import-card'},
     h('div',{className:'ps-user-import-summary','aria-live':'polite'},h('strong',null,state.fileName),h('span',null,count.pending+' to create · '+count.existing+' existing · '+count.invalid+' to correct · '+count.created+' created')),
     h('p',null,'Available roles: '+(state.roles.map(role=>role.name).join(' · ')||'No roles configured. Blank Roles uses default task access.')),
     h('div',{className:'ps-user-import-table-wrap'},h('table',null,
      h('thead',null,h('tr',null,['CSV line','Account','Contact','Title / location','Roles','Apps','Result'].map(title=>h('th',{key:title,scope:'col'},title)))),
      h('tbody',null,state.rows.map(row=>h('tr',{key:row.line,className:'is-'+row.status},
       h('td',null,row.line),h('td',null,h('strong',null,row.displayName||'—'),h('small',null,row.targetUsername||'No username')),
       h('td',null,row.email||'—',h('small',null,row.phone||'')),h('td',null,row.title||'—',h('small',null,row.location||'')),
       h('td',null,row.roleNames.join(', ')||'Default task access'),
       h('td',null,['web','app','site'].filter(app=>row.appAccess[app]).map(app=>({web:'Web',app:'Mobile',site:'Site'})[app]).join(', ')||'No apps'),
       h('td',null,h('strong',{className:'ps-user-import-result is-'+row.status},labels[row.status]),row.errors.length?row.errors.map((error,index)=>h('small',{key:index,className:'ps-user-import-error-text'},error)):h('small',null,row.message))))))),
     h('footer',null,h('button',{type:'button',disabled:busy,onClick:()=>download(resultsCSV(state.rows),'panelstock-users-upload-results.csv')},'Download results'),
      state.busy&&state.phase==='running'?h('button',{type:'button',onClick:()=>controller.current?.stop()},'Stop after current user'):
      h('button',{type:'button',className:'ps-user-import-primary',disabled:busy||!!count.invalid||!count.pending,onClick:()=>controller.current?.run()},state.phase==='complete'?'Upload complete':attempted?'Check & retry '+count.pending+' remaining':'Create '+count.pending+(count.pending===1?' user':' users')))));
  };
 }
 return {MAX_USERS,MAX_BYTES,parseCSV,preview,counts,loginNameFor,template,resultsCSV,createController,createComponent};
});
