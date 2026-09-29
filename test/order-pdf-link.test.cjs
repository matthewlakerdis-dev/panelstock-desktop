const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(__dirname+'/../panelstock-client.js','utf8');
test('order PDF requires a session and exchanges the order ID for a PDF ticket',async()=>{
 const calls=[],destinations=[],id='12345678-1234-1234-1234-123456789012';
 const c={URL,session:null,workerUrl:'https://example.test',root:{location:{href:'https://web.panelstockhq.com/?page=orders&orderPdf='+id,assign:url=>destinations.push(url)},addEventListener(){}},apiFetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({pdfToken:'ticket-value'})};}};
 vm.runInNewContext(source.slice(source.indexOf('  let orderPdfOpening='),source.indexOf("  root.addEventListener('online',()=>{void root.PanelStock.flush();});")),c);
 await c.openLinkedOrderPdf();assert.equal(calls.length,0);
 c.session={username:'user'};await c.openLinkedOrderPdf();assert.equal(calls[0].url,'https://example.test/orders/'+id+'/pdf-link');assert.equal(calls[0].options.method,'POST');assert.equal(destinations[0],'https://example.test/orders/'+id+'/pdf?ticket=ticket-value');
});
