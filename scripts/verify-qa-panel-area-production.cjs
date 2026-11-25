const assert=require('node:assert/strict');
async function verify(){
 const page=await fetch('https://web.panelstockhq.com/',{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});assert.equal(page.status,200);
 const html=await page.text();
 for(const label of ['Panel fabrication area','Panel length (mm)','Panel width (mm)','Shaped panel — manual m²','/qa/panels/area','expectedAreaRevision'])assert.ok(html.includes(label),'Published panel area control missing: '+label);
 const api=await fetch('https://panelstock-reports.matthewlakerdis.workers.dev/qa/panels/area',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'release-verification-only'}),signal:AbortSignal.timeout(20000)});assert.equal(api.status,401,'Panel area changes must require login');
 console.log('Verified published per-panel dimension/manual-area controls and unauthenticated write rejection; no QA or production records were changed.');
}
(async()=>{for(let attempt=0;;attempt++){try{await verify();break;}catch(error){if(attempt===11)throw error;await new Promise(resolve=>setTimeout(resolve,5000));}}})().catch(error=>{console.error(error.message);process.exitCode=1;});
