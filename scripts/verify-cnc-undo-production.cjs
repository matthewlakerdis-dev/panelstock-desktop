const assert=require('node:assert/strict');
async function verify(){
 const response=await fetch('https://web.panelstockhq.com/',{headers:{'Cache-Control':'no-cache'}});assert.equal(response.status,200);
 const html=await response.text();for(const text of ['function CncUndoCutDialog','async function undoCncCutRequest','Undo cut for panel','/cnc/undo-completion'])assert.ok(html.includes(text),'Published CNC undo control missing: '+text);
 const api=await fetch('https://panelstock-reports.matthewlakerdis.workers.dev/cnc/undo-completion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'preview',panelId:'release-verification-only'})});assert.equal(api.status,401,'Undo preview must require login');
 console.log('Verified published admin CNC undo UI and authenticated preview endpoint without changing stock or panels.');
}
(async()=>{for(let attempt=0;;attempt++){try{await verify();break;}catch(error){if(attempt===11)throw error;await new Promise(resolve=>setTimeout(resolve,5000));}}})().catch(error=>{console.error(error.message);process.exitCode=1;});
