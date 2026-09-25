/* PDF splitting stays in the browser; only individual pages are sent for reading. */
async function splitPanelPdf(file, capacity, library = globalThis.PDFLib) {
 if(!library)throw Error('PDF tools did not load. Refresh and try again.');
 let document;
 try{document=await library.PDFDocument.load(await file.arrayBuffer());}
 catch{throw Error(file.name+': cannot open this PDF. Use an unlocked, readable PDF.');}
 const count=document.getPageCount();
 if(!count)throw Error(file.name+': this PDF contains no pages.');
 if(count>capacity)throw Error('Use up to 30 panel pages in one workspace. This PDF has '+count+' pages.');
 const pages=[];
 for(let i=0;i<count;i++){
  const output=await library.PDFDocument.create();
  const [page]=await output.copyPages(document,[i]);output.addPage(page);
  const bytes=await output.save();
  if(bytes.length>6*1024*1024)throw Error(file.name+': page '+(i+1)+' exceeds 6 MB. Reduce the PDF size first.');
  pages.push({bytes,name:file.name.replace(/\.pdf$/i,'')+' - page '+(i+1)+'.pdf'});
 }
 return pages;
}
if(typeof module!=='undefined')module.exports={splitPanelPdf};
