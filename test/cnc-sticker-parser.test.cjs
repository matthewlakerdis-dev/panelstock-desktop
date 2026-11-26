const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createHash}=require('node:crypto');
const {parsePage,extractPdf}=require('../cnc-sticker-parser.js');

const drawing=({reference='P7-8b',area='0.859',project='Sample project',order='BATCH 2',date='-',sides=['L','R']}={})=>[
  'DRAFTING QA','ORDER:',order,'PANEL','ID:',reference,'DATE:',date,'m2:',area,
  'Project','Name:',project,'Measured','by:','Site','CAD PANEL DRAWING',reference,
  ...sides.flatMap(side=>[reference+' EP-'+side,'END PLATE'+(side==='B'?' - BOTTOM (DRAIN)':side==='T'?' - TOP':''),'3mm - INSIDE THE LIPS']),
  'ORIGINAL PANEL ORDER DRAWING',reference,'QTY: 99'
].join('\n');

test('one labelled combined area and exact cap relationships survive repeated drawing IDs',()=>{
  const row=parsePage(drawing(),1);
  assert.equal(row.error,undefined);assert.equal(row.reference,'P7-8b');assert.equal(row.areaM2,.859);
  assert.equal(row.project,'Sample project');assert.equal(row.order,'BATCH 2');assert.equal(row.date,'-');
  assert.equal(row.page,1);assert.equal(row.labelId,'page-1-main');assert.equal(Object.hasOwn(row,'quantity'),false);
  assert.deepEqual(row.caps,[
    {labelId:'page-1-cap-L',reference:'P7-8b EP-L',side:'L',parentReference:'P7-8b',evidence:'end-plate-label'},
    {labelId:'page-1-cap-R',reference:'P7-8b EP-R',side:'R',parentReference:'P7-8b',evidence:'end-plate-label'}
  ]);
  assert.deepEqual(row.warnings,[]);
});

test('top/bottom caps and blank PDF.js spacer items retain lowercase main suffixes',()=>{
  const text=drawing({sides:['B','T']}).replace(/\n/g,'\n \n').replace(/END PLATE/g,'END\n \nPLATE');
  const row=parsePage(text,12);
  assert.equal(row.error,undefined);assert.deepEqual(row.caps.map(cap=>cap.reference),['P7-8b EP-B','P7-8b EP-T']);
  assert.deepEqual(row.caps.map(cap=>cap.labelId),['page-12-cap-B','page-12-cap-T']);
});

test('split parent and suffix text items still require the exact main parent',()=>{
  const row=parsePage(drawing().replace(/P7-8b EP-/g,'P7-8b\n \nEP-'),2);
  assert.equal(row.error,undefined);assert.equal(row.caps.length,2);
  for(const text of [drawing().replace('P7-8b EP-L','Other-1 EP-L'),drawing().replace('P7-8b EP-L','Other-P7-8b EP-L')])
    assert.match(parsePage(text,1).error,/does not match/);
});

test('unknown sides and repeated child identities block the page instead of inventing cap counts',()=>{
  assert.match(parsePage(drawing({sides:['X','R']}),1).error,/unsupported side/);
  assert.match(parsePage(drawing({sides:['L','L']}),1).error,/more than once/);
  assert.match(parsePage(drawing().replace('P7-8b EP-R','p7-8B EP-l'),1).error,/more than once/);
});

test('suffix-only notes, machining cap routes and dimensions do not create cap relationships',()=>{
  const text=drawing({sides:[]})+'\nEP-B AT THE BOTTOM\nCR CAP ROUTE\n553 x 204\nEND PLATE detail not labelled';
  const row=parsePage(text,3);
  assert.equal(row.error,undefined);assert.deepEqual(row.caps,[]);assert.ok(row.warnings.some(value=>/Review caps manually/.test(value)));
});

test('missing cap labels or printed project require review while retaining a valid main area',()=>{
  let row=parsePage(drawing({sides:[]}),1);assert.equal(row.error,undefined);assert.equal(row.caps.length,0);assert.ok(row.warnings.length);
  row=parsePage(drawing({project:''}),1);assert.equal(row.error,undefined);assert.equal(row.project,'');assert.ok(row.warnings.some(value=>/printed project/.test(value)));
});

test('multiple headers, unreadable pages and invalid printed areas are blocked',()=>{
  assert.match(parsePage(drawing()+'\n'+drawing({reference:'P7-9'}),1).error,/More than one/);
  for(const text of ['', 'Scanned drawing without readable text',drawing().replace('ORDER:','UNLABELLED:')])assert.match(parsePage(text,1).error,/No readable/);
  for(const area of ['0','-1','NaN','Infinity','1,234','1e3','100000','1.2.3','1 234','0 .859','1 e3'])assert.ok(parsePage(drawing({area}),1).error,area);
  for(const page of [0,301,1.5,undefined])assert.match(parsePage(drawing(),page).error,/Invalid PDF page/);
});

test('same areas on separate IDs stay separate and hostile text remains plain data',()=>{
  const one=parsePage(drawing(),1),two=parsePage(drawing({reference:'P7-9'}),2);
  assert.equal(one.areaM2,two.areaM2);assert.notEqual(one.reference,two.reference);assert.notEqual(one.labelId,two.labelId);
  globalThis.__stickerParserExecuted=false;
  const hostile='<img src=x onerror="globalThis.__stickerParserExecuted=true">';
  const row=parsePage(drawing({reference:hostile,sides:[]}),1);assert.equal(row.reference,hostile);assert.equal(globalThis.__stickerParserExecuted,false);
  delete globalThis.__stickerParserExecuted;
});

async function withReader(pages,callback,{numPages=pages.length,textError=false,detach=false}={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'panelstock-sticker-test-')),readerDir=path.join(dir,'safety/pdf-reader/6.4.299');
  fs.mkdirSync(readerDir,{recursive:true});const marker='stickerReader-'+path.basename(dir),modulePath=path.join(readerDir,'pdf.mjs');
  fs.writeFileSync(modulePath,`export const GlobalWorkerOptions={};export function getDocument(options){return globalThis[${JSON.stringify(marker)}](options);}`);
  const state={opened:0,destroyed:0,cleaned:0,read:0,options:null};
  globalThis[marker]=options=>{
    state.opened++;state.options=options;
    if(detach)structuredClone(options.data,{transfer:[options.data.buffer]});
    return {promise:Promise.resolve({numPages,getPage:async number=>{state.read++;return {
      getTextContent:async()=>{if(textError)throw Error('Unreadable page content');return {items:pages[number-1].split('\n').flatMap(str=>[{str},{str:' '},{str:''}])};},
      cleanup:()=>{state.cleaned++;}
    };}}),destroy:async()=>{state.destroyed++;}};
  };
  try{return await callback(pathToFileURL(dir).href,state,modulePath);}
  finally{delete globalThis[marker];fs.rmSync(dir,{recursive:true,force:true});}
}
const bytes=Buffer.from('%PDF-1.7\nsynthetic data for transport tests\n');
const file=(extra={})=>({name:'sample-stickers.pdf',size:bytes.length,arrayBuffer:async()=>Uint8Array.from(bytes).buffer,...extra});

test('PDF extraction hashes actual bytes before transfer and returns reviewed rows plus source metadata',async()=>{
  await withReader([drawing(),drawing({reference:'P7-9',sides:['B','T']})],async(base,state,modulePath)=>{
    const progress=[],result=await extractPdf(file({sha256:'forged-browser-hash'}),base,value=>progress.push(value));
    assert.deepEqual(result.source,{fileName:'sample-stickers.pdf',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    assert.equal(result.rows.length,2);assert.equal(result.rows.reduce((sum,row)=>sum+row.areaM2,0),1.718);
    assert.equal(state.opened,1);assert.equal(state.cleaned,2);assert.equal(state.destroyed,1);assert.equal(progress.length,2);
    assert.equal(state.options.isEvalSupported,false);assert.equal(state.options.enableXfa,false);assert.equal(state.options.useSystemFonts,true);
    const reader=await import(pathToFileURL(modulePath).href);assert.equal(reader.GlobalWorkerOptions.workerSrc,base+'/safety/pdf-reader/6.4.299/pdf.worker.mjs');
  },{detach:true});
});

test('invalid file names, signatures and both declared and actual sizes fail before opening the reader',async()=>{
  await withReader([drawing()],async(base,state)=>{
    for(const name of ['', '../stickers.pdf','bad\u0000.pdf','stickers.txt','a'.repeat(201)+'.pdf'])await assert.rejects(()=>extractPdf(file({name}),base),/named PDF/);
    await assert.rejects(()=>extractPdf(file({size:32*1024*1024+1}),base),/32 MB/);
    await assert.rejects(()=>extractPdf(file({size:1,arrayBuffer:async()=>new ArrayBuffer(32*1024*1024+1)}),base),/32 MB/);
    await assert.rejects(()=>extractPdf(file({arrayBuffer:async()=>Buffer.from('not a PDF').buffer.slice(0,0)}),base),/valid PDF/);
    assert.equal(state.opened,0);
  });
});

test('unreadable or excessive-page PDFs clean up and never return fabricated rows',async()=>{
  await withReader(['image only'],async(base,state)=>{await assert.rejects(()=>extractPdf(file(),base),/No unambiguous/);assert.equal(state.cleaned,1);assert.equal(state.destroyed,1);});
  await withReader([],async(base,state)=>{await assert.rejects(()=>extractPdf(file(),base),/between 1 and 300/);assert.equal(state.read,0);assert.equal(state.destroyed,1);},{numPages:301});
  await withReader([drawing()],async(base,state)=>{await assert.rejects(()=>extractPdf(file(),base),/Unreadable page/);assert.equal(state.cleaned,1);assert.equal(state.destroyed,1);},{textError:true});
});

test('a readable PDF retains blocked pages for review and repeated main labels cannot count twice',async()=>{
  await withReader([drawing(),drawing(),'image only',drawing({reference:'P7-9'})],async(base,state)=>{
    const {rows}=await extractPdf(file(),base);assert.equal(rows.length,4);
    assert.match(rows[0].error,/more than one page/);assert.match(rows[1].error,/more than one page/);assert.match(rows[2].error,/No readable/);assert.equal(rows[3].error,undefined);
    assert.equal(state.destroyed,1);
  });
  await withReader([drawing(),drawing()],async(base)=>{await assert.rejects(()=>extractPdf(file(),base),/No unambiguous/);});
});

test('a browser without CommonJS receives the documented global API',()=>{
  const vm=require('node:vm'),context={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../cnc-sticker-parser.js'),'utf8'),context);
  assert.equal(typeof context.PanelStockCncStickerParser.parsePage,'function');assert.equal(typeof context.PanelStockCncStickerParser.extractPdf,'function');
});
