const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
function saveContext(failFile=false){
 const calls=[],context={saving:false,canCreate:true,panel:{mode:'new',idempotencyKey:'draft-id',order:{project:'',items:[{quantity:'',description:''}]}},pendingFiles:[{id:'file-1',name:'photo.jpg',file:{}},{id:'file-2',name:'plan.pdf',file:{}}],fileData:async()=> 'data',draftRequest:async(path,body)=>{calls.push({path,body});if(failFile&&calls.length===3)throw Error('Upload failed');return {draft:{updatedAt:'version-'+calls.length}};},loadDrafts:async()=>{},setSaving:()=>{},setNotice:value=>context.notice=value,setPanel:value=>{context.panel=typeof value==='function'?value(context.panel):value;},setPendingFiles:value=>context.pendingFiles=value,setOrderSection:value=>context.section=value};
 const start=html.indexOf('    async function saveDraft()'),end=html.indexOf('    async function openDraft(',start);
 vm.runInNewContext(html.slice(start,end),context);return {context,calls};
}
test('saving an incomplete draft persists files with the latest version and opens Drafts',async()=>{
 const {context,calls}=saveContext();await context.saveDraft();
 assert.equal(calls.length,3);assert.equal(calls[0].body.order.project,'');assert.equal(calls[0].path,'/draft-id');
 assert.equal(calls[1].body.expectedUpdatedAt,'version-1');assert.equal(calls[2].body.expectedUpdatedAt,'version-2');
 assert.equal(context.panel,null);assert.equal(context.pendingFiles.length,0);assert.equal(context.section,'drafts');
 assert.equal(calls.some(call=>call.path==='/orders'),false);
});
test('partial draft upload failure keeps the editor, files and latest saved version for retry',async()=>{
 const {context,calls}=saveContext(true);await context.saveDraft();
 assert.equal(calls.length,3);assert.equal(context.panel.draftId,'draft-id');assert.equal(context.panel.draftVersion,'version-2');
 assert.equal(context.pendingFiles.length,2);assert.equal(context.notice,'Upload failed');
});
