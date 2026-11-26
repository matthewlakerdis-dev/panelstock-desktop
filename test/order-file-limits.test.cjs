const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('async function chooseOrderFiles(event){'),html.indexOf('    const fileData=file=>'));
function fixture(existing=[]){
 let pending=[],notice='';
 const context={panel:{mode:'view',order:{orderType:'Panels',attachments:existing}},pendingFiles:pending,isAdmin:false,canManage:false,canCreate:false,PanelStock:{username:'viewer'},isPanelOrder:()=>true,crypto:require('node:crypto'),setNotice:value=>{notice=value;},setPendingFiles:fn=>{pending=fn(pending);context.pendingFiles=pending;}};
 vm.createContext(context);vm.runInContext(source,context);
 return {choose:files=>context.chooseOrderFiles({target:{files,dataset:{pdfOnly:'true'},value:'selected'}}),pending:()=>pending,notice:()=>notice};
}
test('Panel viewers can select 6 MB and 10 MB PDFs while file, total, count and PDF restrictions remain enforced',async()=>{
 for(const size of [6*1024*1024,10*1024*1024]){const h=fixture();await h.choose([{name:'drawing.pdf',size}]);assert.equal(h.pending().length,1);assert.equal(h.notice(),'');}
 for(const files of [[{name:'large.pdf',size:10*1024*1024+1}],Array.from({length:11},()=>({name:'drawing.pdf',size:1})),[{name:'photo.jpg',size:1}]]){const h=fixture();await h.choose(files);assert.equal(h.pending().length,0);assert.ok(h.notice());}
 const h=fixture([{size:20*1024*1024}]);await h.choose([{name:'drawing.pdf',size:6*1024*1024}]);assert.equal(h.pending().length,0);assert.match(h.notice(),/25 MB/);
});
