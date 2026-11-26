const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../scripts/build-production.cjs'),'utf8'),start=source.indexOf('const indexPath='),end=source.indexOf('fs.cpSync',start);
function published(css,labels='label js',handoff='handoff js',requests='request js',requestStyles='request css',reports='reports js',userImport='user import js',userImportStyles='user import css',materials='materials js',materialsStyles='materials css',orderIdReupload='order ID reupload js',qaReset='order QA reset js',stickerParser='sticker parser js',stickerReview='sticker review js'){
 let html='<script src="cnc-sticker-parser.js?v=old"></script><script src="cnc-sticker-review.js?v=old"></script><script src="cnc-order-qa-reset.js?v=old"></script><script src="cnc-order-id-reupload.js?v=old"></script><script src="order-materials.js?v=old"></script><link href="order-materials.css?v=old"><script src="org-chart.js?v=old"></script><link href="org-chart.css?v=old"><script src="user-bulk-import.js?v=old"></script><link href="user-bulk-import.css?v=old"><script src="reports-page.js?v=old"></script><script src="order-lead-times.js?v=old"></script><script src="order-production-plan.js?v=old"></script><script src="order-dispatch-progress.js?v=old"></script><script src="purchase-requests.js?v=old"></script><link href="purchase-requests.css?v=old"><script src="tracker-tab-handoff.js?v=old"></script><script src="offcut-labels.js?v=old"></script><link href="tailwind.css?v=old"><script src="workshop-stock.js?v=old"></script><link href="workshop-stock.css?v=old">';
 const files={'schedule-auto-refresh.js':'schedule auto refresh js','cnc-sticker-parser.js':stickerParser,'cnc-sticker-review.js':stickerReview,'cnc-order-qa-reset.js':qaReset,'cnc-order-id-reupload.js':orderIdReupload,'qa-panel-area-import.js':'panel area import js','order-materials.js':materials,'order-materials.css':materialsStyles,'schedule-move.js':'schedule move js','org-chart.js':'chart js','org-chart.css':'chart css','user-bulk-import.js':userImport,'user-bulk-import.css':userImportStyles,'reports-page.js':reports,'purchase-requests.js':requests,'purchase-requests.css':requestStyles,'order-dispatch-reversal.js':'reversal js','site-order-bulk-dispatch.js':'bulk js','dispatch-workspace.js':'dispatch workspace js','order-lead-times.js':'lead times js','order-production-plan.js':'production plan js','order-dispatch-progress.js':'dispatch progress js','active-orders-report.js':'report js','tracker-tab-handoff.js':handoff,'tailwind.css':css,'workshop-stock.js':'stock js','workshop-stock.css':'stock css','excel-order-actions.js':'action js','excel-order-actions.css':'action css','tab-workspace.js':'workspace js','panelstock-client.js':'client js','offcut-labels.js':labels};
 vm.runInNewContext(source.slice(start,end),{out:'/build',path,require,fs:{readFileSync:file=>path.basename(file)==='index.html'?html:files[path.basename(file)],writeFileSync:(file,value)=>{html=value;}}});return html;
}
test('published desktop stylesheet URL changes with CSS content so cached styles cannot hide validation errors',()=>{
 const old=published('before validation'),current=published('required fields red');assert.notEqual(old.match(/tailwind.css\?v=[^"]+/)[0],current.match(/tailwind.css\?v=[^"]+/)[0]);assert.equal(current,published('required fields red'));assert.doesNotMatch(current,/v=old/);
});

test('published offcut printer URL changes with sticker code updates',()=>{
 const before=published('same css','old labels'),after=published('same css','updated labels');
 assert.notEqual(before.match(/offcut-labels\.js\?v=[^"]+/)[0],after.match(/offcut-labels\.js\?v=[^"]+/)[0]);
});

test("published hand-off code gets its own asset version",()=>{const before=published("same","same","old handoff"),after=published("same","same","new handoff");assert.notEqual(before.match(/tracker-tab-handoff\.js\?v=[^"]+/)[0],after.match(/tracker-tab-handoff\.js\?v=[^"]+/)[0]);});

test('purchase request code and styles each receive a content version',()=>{
 const before=published('same','same','same','old request','old styles');
 assert.notEqual(before.match(/purchase-requests\.js\?v=[^"]+/)[0],published('same','same','same','new request','old styles').match(/purchase-requests\.js\?v=[^"]+/)[0]);
 assert.notEqual(before.match(/purchase-requests\.css\?v=[^"]+/)[0],published('same','same','same','old request','new styles').match(/purchase-requests\.css\?v=[^"]+/)[0]);
});

test('bulk user upload code and styles each receive a content version',()=>{
 const old=published('same','same','same','same','same','same','old import','old style'),code=published('same','same','same','same','same','same','new import','old style'),style=published('same','same','same','same','same','same','old import','new style');
 assert.notEqual(old.match(/user-bulk-import\.js\?v=[^\"]+/)[0],code.match(/user-bulk-import\.js\?v=[^\"]+/)[0]);
 assert.notEqual(old.match(/user-bulk-import\.css\?v=[^\"]+/)[0],style.match(/user-bulk-import\.css\?v=[^\"]+/)[0]);
});

test('materials list code and styles receive independent content versions',()=>{
 const before=published('same','same','same','same','same','same','same','same','old materials','old styles');
 const code=published('same','same','same','same','same','same','same','same','new materials','old styles');
 const styles=published('same','same','same','same','same','same','same','same','old materials','new styles');
 assert.notEqual(before.match(/order-materials\.js\?v=[^"]+/)[0],code.match(/order-materials\.js\?v=[^"]+/)[0]);
 assert.notEqual(before.match(/order-materials\.css\?v=[^"]+/)[0],styles.match(/order-materials\.css\?v=[^"]+/)[0]);
});

test('CNC order ID reupload receives its own stable content version',()=>{
 const before=published(...Array(10).fill('same'),'old order ID reupload'),after=published(...Array(10).fill('same'),'updated order ID reupload');
 const assetVersion=html=>html.match(/cnc-order-id-reupload\.js\?v=[^"]+/)[0];
 const expected=require('node:crypto').createHash('sha256').update('updated order ID reupload').digest('hex').slice(0,12);
 assert.notEqual(assetVersion(before),assetVersion(after));
 assert.equal(assetVersion(after),'cnc-order-id-reupload.js?v='+expected);
 assert.equal(after,published(...Array(10).fill('same'),'updated order ID reupload'));
 assert.equal(before.match(/tailwind\.css\?v=[^"]+/)[0],after.match(/tailwind\.css\?v=[^"]+/)[0]);
});

test('CNC order QA reset receives an independent content version',()=>{
 const before=published(...Array(11).fill('same'),'old QA reset'),after=published(...Array(11).fill('same'),'updated QA reset');
 const version=html=>html.match(/cnc-order-qa-reset\.js\?v=[^"]+/)[0];
 const expected=require('node:crypto').createHash('sha256').update('updated QA reset').digest('hex').slice(0,12);
 assert.notEqual(version(before),version(after));assert.equal(version(after),'cnc-order-qa-reset.js?v='+expected);
 assert.equal(after,published(...Array(11).fill('same'),'updated QA reset'));
 assert.equal(before.match(/cnc-order-id-reupload\.js\?v=[^"]+/)[0],after.match(/cnc-order-id-reupload\.js\?v=[^"]+/)[0]);
});

test('scheduled sticker parser and review get independent content versions',()=>{
 const before=published(...Array(12).fill('same'),'old parser','old review');
 const parser=published(...Array(12).fill('same'),'new parser','old review');
 const review=published(...Array(12).fill('same'),'old parser','new review');
 const version=(html,name)=>html.match(new RegExp(name.replaceAll('.', '\\.').replaceAll('-', '\u002d')+'\\?v=[^\x22]+'))[0];
 assert.notEqual(version(before,'cnc-sticker-parser.js'),version(parser,'cnc-sticker-parser.js'));
 assert.equal(version(before,'cnc-sticker-review.js'),version(parser,'cnc-sticker-review.js'));
 assert.notEqual(version(before,'cnc-sticker-review.js'),version(review,'cnc-sticker-review.js'));
 assert.equal(version(before,'cnc-sticker-parser.js'),version(review,'cnc-sticker-parser.js'));
 assert.equal(parser,published(...Array(12).fill('same'),'new parser','old review'));
});
