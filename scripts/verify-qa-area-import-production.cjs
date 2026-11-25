const assert=require('node:assert/strict');
async function verify(){
 const origin='https://web.panelstockhq.com',base='https://panelstock-reports.matthewlakerdis.workers.dev',headers={'Cache-Control':'no-cache','User-Agent':'PanelStock-release-verifier/1.0'};
 const page=await fetch(origin+'/',{headers,signal:AbortSignal.timeout(20000)});assert.equal(page.status,200);const html=await page.text();assert.ok(html.includes('Import panel m² PDF'),'Published QA PDF import button is missing');
 const source=html.match(/<script src="(qa-panel-area-import\.js\?v=[^"]+)"/);assert.ok(source,'Versioned importer script is missing');
 const script=await fetch(origin+'/'+source[1],{headers,signal:AbortSignal.timeout(20000)});assert.equal(script.status,200);const text=await script.text();for(const label of ['Import panel m² from PDF','/qa/panels/area-import','Review latest matches','expectedAttemptId','Tick the confirmation below','secure save reference'])assert.ok(text.includes(label),'Importer missing: '+label);
 const reader=await fetch(base+'/safety/pdf-reader/6.4.299/pdf.mjs',{headers:{...headers,Origin:origin},signal:AbortSignal.timeout(20000)});assert.equal(reader.status,200);assert.equal(reader.headers.get('Access-Control-Allow-Origin'),origin,'PDF reader must allow the website origin');assert.match(reader.headers.get('Content-Type'),/javascript/);assert.ok((await reader.text()).length>10000,'PDF reader was incomplete');
 const write=await fetch(base+'/qa/panels/area-import',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({importId:'release-verification-only'}),signal:AbortSignal.timeout(20000)});assert.equal(write.status,401,'PDF area imports must require login');
 console.log('Verified published PDF importer, cross-origin PDF reader and login enforcement. No QA or production records were changed.');
}
(async()=>{for(let attempt=0;;attempt++){try{await verify();break;}catch(error){if(attempt===11)throw error;await new Promise(resolve=>setTimeout(resolve,5000));}}})().catch(error=>{console.error(error.message);process.exitCode=1;});
