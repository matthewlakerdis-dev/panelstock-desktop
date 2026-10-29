const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8'),start=source.indexOf('    async function uploadOrderFiles('),end=source.indexOf('    async function saveOrderFiles()',start);
const order={id:'order-one',attachments:[]},files=[{id:'file-one',name:'drawing.pdf',file:{data:'PDF'}},{id:'file-two',name:'photo.jpg',file:{data:'PHOTO'}}];
function fixture(){
 const calls=[],uploaded=new Map(),context={crypto:require('node:crypto').webcrypto,orderFileEmail:{current:null},pendingFiles:structuredClone(files),fileData:async file=>Buffer.from(file.data).toString('base64'),Response,BAKED_WORKER_URL:'https://synthetic.example',panel:{order},PanelStock:{apiFetch:async(url,options)=>{if(!options?.method){calls.push({url,body:null});return Response.json({order:{...order,attachments:[...uploaded.values()]}});}const body=JSON.parse(options.body);calls.push({url,body});if(url.endsWith('/attachments')){uploaded.set(body.id,{id:body.id,name:body.name});return Response.json({attachments:[...uploaded.values()]});}return Response.json({ok:true});}}};
 context.setPendingFiles=fn=>{context.pendingFiles=typeof fn==='function'?fn(context.pendingFiles):fn;};context.setPanel=fn=>{context.panel=fn(context.panel);};vm.runInNewContext(source.slice(start,end)+'globalThis.upload=uploadOrderFiles;',context);return {context,calls,uploaded};
}
test('desktop finalizes the full batch only after uploads and keeps the original creation batch ID',async()=>{
 const h=fixture();await h.context.upload(order,'initial-batch');assert.equal(h.calls.length,4);assert.ok(h.calls.slice(1,3).every(call=>call.url.endsWith('/attachments')));assert.deepEqual(h.calls[3].body,{batchId:'initial-batch',attachmentIds:['file-one','file-two'],omittedAttachmentIds:[]});assert.equal(h.context.pendingFiles.length,0);assert.equal(h.context.orderFileEmail.current,null);
});
test('a lost email confirmation retains uploaded files and retries only finalization with the same batch ID',async()=>{
 const h=fixture(),api=h.context.PanelStock.apiFetch;let lose=true;h.context.PanelStock.apiFetch=async(url,options)=>{const result=await api(url,options);if(url.endsWith('/email-attachments')&&lose){lose=false;throw Error('Lost confirmation');}return result;};
 await assert.rejects(h.context.upload(order,'original-batch'),/Lost confirmation/);assert.ok(h.context.pendingFiles.every(file=>file.uploaded));assert.equal(h.context.orderFileEmail.current.batchId,'original-batch');await h.context.upload(h.context.panel.order);assert.equal(h.calls.filter(call=>call.url.endsWith('/attachments')).length,2);assert.equal(h.calls.filter(call=>call.url.endsWith('/email-attachments')).length,2);assert.equal(h.calls.at(-1).body.batchId,'original-batch');
});

test('switching accounts during an upload cannot finalize the previous account email batch',async()=>{
 const h=fixture();h.context.PanelStock.username='alice';let finish;h.context.PanelStock.apiFetch=()=>new Promise(resolve=>finish=resolve);const saving=h.context.upload(order,'batch');await new Promise(resolve=>setImmediate(resolve));h.context.PanelStock.username='bob';finish(Response.json({order}));await assert.rejects(saving,/account changed/);assert.equal(h.context.pendingFiles.some(file=>file.uploaded),false);
});

test('a lost upload response is reconciled from the saved order without uploading the file twice',async()=>{
 const h=fixture(),api=h.context.PanelStock.apiFetch;let lose=true;h.context.PanelStock.apiFetch=async(url,options)=>{const result=await api(url,options);if(url.endsWith('/attachments')&&lose){lose=false;throw Error('Lost file response');}return result;};await assert.rejects(h.context.upload(order,'initial'),/Lost file response/);await h.context.upload(h.context.panel.order);assert.equal(h.calls.filter(call=>call.url.endsWith('/attachments')&&call.body.id==='file-one').length,1);assert.deepEqual(h.calls.at(-1).body.attachmentIds,['file-one','file-two']);
});
