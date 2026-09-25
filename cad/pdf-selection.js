/* Select only the sketch regions the user wants to read. */
(()=>{
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
function rectangle(a,b){return {x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y)};}
window.PanelPdfSelection={rectangle,open:async function(files,capacity){
 if(capacity<1)throw Error('This workspace already has 30 panels.');
 const pdfjs=await import('./pdfjs/pdf.min.mjs');
 pdfjs.GlobalWorkerOptions.workerSrc=new URL('./pdfjs/pdf.worker.min.mjs',location.href).href;
 const dialog=document.createElement('dialog');dialog.className='pdf-picker';
 dialog.innerHTML=`<div class="pdf-picker-head"><div><h2>Select your panels</h2><p>Drag a box around each panel, including its dimensions, edge codes and ID.</p></div><button type="button" data-action="cancel" aria-label="Close PDF selection">✕</button></div><div class="pdf-picker-toolbar"><button type="button" data-action="prev" aria-label="Previous PDF page">←</button><select aria-label="PDF page"></select><button type="button" data-action="next" aria-label="Next PDF page">→</button><button type="button" data-action="whole">Select whole page</button><button type="button" data-action="remove">Remove selected area</button></div><p class="pdf-picker-status" role="status" aria-live="polite">Opening PDF…</p><div class="pdf-picker-scroll"><div class="pdf-picker-paper"><canvas></canvas><div class="pdf-picker-overlay" aria-label="Draw panel selection boxes"></div></div></div><div class="pdf-picker-foot"><span>Drag a box to move it; drag its corner to resize. Arrow keys move a focused box; Shift + arrows resize; Delete removes it.</span><button type="button" class="primary" data-action="accept">Read selected panels</button></div>`;
 document.body.append(dialog);dialog.showModal();
 const el=s=>dialog.querySelector(s),button=a=>el(`[data-action="${a}"]`),status=el('[role="status"]'),overlay=el('.pdf-picker-overlay'),canvas=el('canvas'),select=el('select');
 const docs=[],pages=[],boxes=[];let current=0,active=null,working=true,gesture=null,serial=0,done=false;
 let resolve;const answer=new Promise(r=>resolve=r);
 function count(){return boxes.length;}
 function controls(){select.disabled=working;for(const a of ['prev','next','whole','remove','accept'])button(a).disabled=working;
 if(!working){button('prev').disabled=current===0;button('next').disabled=current===pages.length-1;button('whole').disabled=count()>=capacity;button('remove').disabled=!active;button('accept').disabled=!count();}
 button('accept').textContent=`Read ${count()||''} selected panel${count()===1?'':'s'}`;}
 function paint(){overlay.replaceChildren();for(const box of boxes.filter(b=>b.page===current)){
 const node=document.createElement('div');node.className='pdf-selection'+(box===active?' selected':'');node.tabIndex=0;node.setAttribute('role','button');node.setAttribute('aria-label','Panel area '+(boxes.indexOf(box)+1)+'. Use arrow keys to move, Shift and arrows to resize.');node.dataset.id=box.id;
 Object.assign(node.style,{left:box.x*100+'%',top:box.y*100+'%',width:box.w*100+'%',height:box.h*100+'%'});
 const label=document.createElement('span');label.textContent='Panel '+(boxes.indexOf(box)+1);node.append(label);const handle=document.createElement('i');handle.dataset.resize='1';node.append(handle);overlay.append(node);
 }controls();}
 function remove(){if(working||!active)return;boxes.splice(boxes.indexOf(active),1);active=null;paint();}
 async function render(){working=true;gesture=null;active=null;controls();overlay.replaceChildren();status.textContent='Loading page…';
 try{const entry=pages[current],page=await entry.doc.getPage(entry.number),base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(2,1800/Math.max(base.width,base.height))});
 canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d'),viewport,background:'white'}).promise;
 select.value=String(current);status.textContent=entry.name+' · page '+entry.number+' · '+count()+' areas selected';
 }catch(e){status.textContent='Could not display this PDF page. '+e.message;}finally{working=false;paint();}}
 function point(e){const r=overlay.getBoundingClientRect();return{x:clamp((e.clientX-r.left)/r.width),y:clamp((e.clientY-r.top)/r.height)};}
 overlay.onpointerdown=e=>{if(working||e.button!==0)return;e.preventDefault();const hit=e.target.closest('[data-id]');const start=point(e);
 if(hit){active=boxes.find(b=>b.id===hit.dataset.id);gesture={mode:e.target.dataset.resize?'resize':'move',start,original:{...active}};}
 else{if(count()>=capacity){status.textContent='Maximum '+capacity+' selected panels for the remaining workspace slots.';return;}active={id:String(++serial),page:current,x:start.x,y:start.y,w:0,h:0};boxes.push(active);gesture={mode:'new',start};}
 overlay.setPointerCapture(e.pointerId);paint();};
 overlay.onpointermove=e=>{if(!gesture)return;const p=point(e),g=gesture;if(g.mode==='new')Object.assign(active,rectangle(g.start,p));else if(g.mode==='move'){active.x=clamp(g.original.x+p.x-g.start.x,0,1-active.w);active.y=clamp(g.original.y+p.y-g.start.y,0,1-active.h);}else{active.w=clamp(g.original.w+p.x-g.start.x,.01,1-active.x);active.h=clamp(g.original.h+p.y-g.start.y,.01,1-active.y);}paint();};
 function end(){if(!gesture)return;gesture=null;if(active.w<.01||active.h<.01){boxes.splice(boxes.indexOf(active),1);active=null;}paint();status.textContent=count()+' panel areas selected. Include all measurement labels inside each box.';}
 overlay.onpointerup=end;overlay.onpointercancel=end;
 overlay.onkeydown=e=>{const hit=e.target.closest('[data-id]');if(!hit||working)return;active=boxes.find(b=>b.id===hit.dataset.id);if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove();return;}if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const dx=e.key==='ArrowLeft'?-.005:e.key==='ArrowRight'?.005:0,dy=e.key==='ArrowUp'?-.005:e.key==='ArrowDown'?.005:0;if(e.shiftKey){active.w=clamp(active.w+dx,.01,1-active.x);active.h=clamp(active.h+dy,.01,1-active.y);}else{active.x=clamp(active.x+dx,0,1-active.w);active.y=clamp(active.y+dy,0,1-active.h);}const id=active.id;paint();overlay.querySelector(`[data-id="${id}"]`).focus();};
 button('remove').onclick=remove;
 button('whole').onclick=()=>{if(working||count()>=capacity)return;active={id:String(++serial),page:current,x:0,y:0,w:1,h:1};boxes.push(active);paint();};
 button('prev').onclick=()=>{if(!working&&current>0){current--;render();}};button('next').onclick=()=>{if(!working&&current<pages.length-1){current++;render();}};select.onchange=()=>{if(!working){current=Number(select.value);render();}};
 function finish(value){if(done)return;done=true;dialog.close();resolve(value);}
 button('cancel').onclick=()=>{if(!working)finish([]);};dialog.oncancel=e=>{e.preventDefault();if(!working)finish([]);};
 button('accept').onclick=async()=>{if(working||!count())return;working=true;controls();button('cancel').disabled=true;
 try{const output=[];for(const [i,box]of boxes.entries()){
 status.textContent='Preparing panel '+(i+1)+' of '+count()+'…';const entry=pages[box.page],page=await entry.doc.getPage(entry.number),base=page.getViewport({scale:1}),scale=Math.min(12,2400/Math.max(base.width*box.w,base.height*box.h)),viewport=page.getViewport({scale});const crop=document.createElement('canvas');crop.width=Math.ceil(viewport.width*box.w);crop.height=Math.ceil(viewport.height*box.h);
 await page.render({canvasContext:crop.getContext('2d'),viewport,transform:[1,0,0,1,-viewport.width*box.x,-viewport.height*box.y],background:'white'}).promise;
 const blob=await new Promise(r=>crop.toBlob(r,'image/png'));if(!blob||blob.size>6*1024*1024)throw Error('Selected area is too large. Select a smaller area and try again.');output.push(new File([blob],entry.name.replace(/\.pdf$/i,'')+' - page '+entry.number+' - panel '+(i+1)+'.png',{type:'image/png'}));crop.width=crop.height=0;
 }finish(output);}catch(e){status.textContent=e.message;working=false;controls();button('cancel').disabled=false;}};
 controls();try{for(const file of files){const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),cMapUrl:new URL('./pdfjs/cmaps/',location.href).href,cMapPacked:true,standardFontDataUrl:new URL('./pdfjs/standard_fonts/',location.href).href,wasmUrl:new URL('./pdfjs/wasm/',location.href).href,isEvalSupported:false});docs.push(task);const locked=new Promise((resolve,reject)=>{task.onPassword=()=>reject(Error('This PDF is password-protected. Upload an unlocked copy.'));});const doc=await Promise.race([task.promise,locked]);if(doc.numPages>200)throw Error('Use PDFs with no more than 200 pages.');for(let number=1;number<=doc.numPages;number++){pages.push({doc,number,name:file.name});const option=document.createElement('option');option.value=String(pages.length-1);option.textContent=file.name+' · page '+number;select.append(option);}}
 await render();return await answer;
 }finally{dialog.remove();for(const doc of docs)await doc.destroy();}
}};
})();

