(function(root){
  'use strict';
  const MAX_BYTES=32*1024*1024,MAX_PAGES=300;
  const clean=value=>String(value??'').trim().replace(/\s+/g,' ');
  const normal=value=>clean(value).toLocaleLowerCase('en-AU');
  function parsePage(text,page){
    const result={page,labelId:`page-${page}-main`,caps:[],warnings:[]};
    const blocked=message=>({...result,error:message});
    if(!Number.isInteger(page)||page<1||page>MAX_PAGES)return blocked('Invalid PDF page number.');
    if(typeof text!=='string')return blocked('No readable panel ID and m² header — review this page manually.');
    const headers=[...text.matchAll(/\bORDER\s*:\s*([^]*?)\s*PANEL\s*ID\s*:\s*([^]*?)\s*DATE\s*:\s*([\d/-]+)\s*m\s*(?:2|²)\s*:\s*([^\s]+)/gi)];
    const starts=[...text.matchAll(/\bORDER\s*:/gi)];
    if(headers.length!==1||starts.length!==1)return blocked(headers.length>1||starts.length>1?'More than one panel header — review this page manually.':'No readable panel ID and m² header — review this page manually.');
    const [,orderText,referenceText,date,number]=headers[0],reference=clean(referenceText),order=clean(orderText),areaM2=Number(number),afterArea=text.slice(headers[0].index+headers[0][0].length);
    if(!/^\d+(?:\.\d+)?$/.test(number)||/^\s+(?:[.,]?\s*\d|[eE][+-]?\d)/.test(afterArea)||!Number.isFinite(areaM2)||areaM2<=0||areaM2>99999||!reference||reference.length>120||/[\u0000-\u001f\u007f]/.test(reference))
      return blocked('Invalid panel ID or m² — review this page manually.');
    if(!order||order.length>200||/[\u0000-\u001f\u007f]/.test(order))return blocked('Invalid printed order — review this page manually.');
    const project=clean(text.match(/\bProject\s*Name\s*:\s*([^]*?)\s*Measured\s*by\s*:/i)?.[1]||'');
    if(project.length>120||/[\u0000-\u001f\u007f]/.test(project))return blocked('Invalid printed project — review this page manually.');
    Object.assign(result,{reference,areaM2,project,order,date});
    if(!project)result.warnings.push('The printed project could not be read. Choose and confirm the target project.');
    // A repeated ID in a drawing is not another physical panel. Only the one
    // labelled header above supplies this row's combined fabrication area.
    // Cap names are suggestions with explicit END PLATE evidence, never a QA
    // decision: the scheduling review must confirm component relationships.
    const flat=clean(text),labels=[...flat.matchAll(/\bEP-([A-Za-z0-9]+)\s+END\s+PLATE\b/gi)],seen=new Set();
    for(const label of labels){
      const side=label[1].toUpperCase();
      if(!/^[LRBT]$/.test(side))return blocked('An end plate has an unsupported side label — review its component relationship manually.');
      const before=flat.slice(0,label.index).trimEnd(),parentReference=before.slice(-reference.length),boundary=before.length-reference.length;
      if(normal(parentReference)!==normal(reference)||boundary>0&&!/\s/.test(before[boundary-1]))
        return blocked('An end plate does not match this page’s main panel ID — review its component relationship manually.');
      const capReference=parentReference+' EP-'+side,key=normal(capReference);
      if(seen.has(key))return blocked('An end plate ID occurs more than once on this page — review it manually.');
      seen.add(key);
      result.caps.push({labelId:`page-${page}-cap-${side}`,reference:capReference,side,parentReference:reference,evidence:'end-plate-label'});
    }
    const endPlateCount=[...flat.matchAll(/\bEND\s+PLATE\b/gi)].length;
    if(endPlateCount>labels.length)result.warnings.push('Some end-plate text has no readable linked cap ID. Review caps manually.');
    if(!result.caps.length)result.warnings.push('No linked end-plate labels were detected. Confirm any caps manually.');
    return result;
  }
  async function extractPdf(file,base,onProgress){
    if(!file||typeof file.arrayBuffer!=='function'||Number(file.size)>MAX_BYTES)throw Error('Choose a PDF no larger than 32 MB.');
    const fileName=typeof file.name==='string'?file.name:'';
    if(!fileName||fileName.length>200||/[\u0000-\u001f\u007f/\\]/.test(fileName)||!fileName.toLowerCase().endsWith('.pdf'))throw Error('Choose a named PDF file.');
    const data=new Uint8Array(await file.arrayBuffer()),bytes=data.byteLength;
    if(bytes>MAX_BYTES)throw Error('Choose a PDF no larger than 32 MB.');
    if(bytes<5||String.fromCharCode(...data.subarray(0,5))!=='%PDF-')throw Error('Choose a valid PDF file.');
    if(!root.crypto?.subtle?.digest)throw Error('This browser cannot verify the PDF. Use an up-to-date browser.');
    // PDF.js can transfer and detach this buffer. Hash the actual uploaded bytes
    // before handing them to its worker; browser-supplied hashes are never read.
    const digest=await root.crypto.subtle.digest('SHA-256',data),sha256=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
    const source={fileName,sha256,bytes};
    if(typeof base!=='string'||!base)throw Error('The PDF reader is unavailable. Refresh and try again.');
    const reader=base.replace(/\/$/,'')+'/safety/pdf-reader/6.4.299/';
    const pdfjs=await import(reader+'pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=reader+'pdf.worker.mjs';
    const task=pdfjs.getDocument({data,standardFontDataUrl:reader,useSystemFonts:true,isEvalSupported:false,enableXfa:false});
    task.onPassword=()=>task.destroy();
    try{
      const pdf=await task.promise;
      if(!Number.isInteger(pdf.numPages)||pdf.numPages<1||pdf.numPages>MAX_PAGES)throw Error('Choose a PDF with between 1 and 300 pages.');
      const rows=[];
      for(let page=1;page<=pdf.numPages;page++){
        onProgress?.(`Reading page ${page} of ${pdf.numPages}…`);
        const documentPage=await pdf.getPage(page);
        try{
          const content=await documentPage.getTextContent();
          rows.push(parsePage(content.items.map(item=>typeof item.str==='string'?item.str:'').join('\n'),page));
        }finally{documentPage.cleanup();}
      }
      const groups=new Map();
      for(const row of rows)if(!row.error){
        const key=JSON.stringify([row.project,row.order,row.reference].map(normal)),group=groups.get(key)||[];group.push(row);groups.set(key,group);
      }
      for(const group of groups.values())if(group.length>1)for(const row of group)row.error='This main panel ID occurs on more than one page. Review physical copies before importing.';
      if(!rows.some(row=>!row.error))throw Error('No unambiguous labelled panel m² could be read. Scanned PDFs, duplicate labels and pages without a labelled area need review.');
      return {rows,source};
    }finally{await task.destroy();}
  }
  const api={parsePage,extractPdf};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.PanelStockCncStickerParser=api;
})(typeof window==='object'?window:globalThis);
