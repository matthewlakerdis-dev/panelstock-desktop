const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../scripts/build-production.cjs'),'utf8'),start=source.indexOf('const indexPath='),end=source.indexOf('fs.cpSync',start);
function published(css,labels='label js',handoff='handoff js'){
 let html='<script src="tracker-tab-handoff.js?v=old"></script><script src="offcut-labels.js?v=old"></script><link href="tailwind.css?v=old"><script src="workshop-stock.js?v=old"></script><link href="workshop-stock.css?v=old">';
 const files={'tracker-tab-handoff.js':handoff,'tailwind.css':css,'workshop-stock.js':'stock js','workshop-stock.css':'stock css','excel-order-actions.js':'action js','excel-order-actions.css':'action css','tab-workspace.js':'workspace js','panelstock-client.js':'client js','offcut-labels.js':labels};
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
