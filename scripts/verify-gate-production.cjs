const assert=require('node:assert/strict');
(async()=>{
 const headers={'Cache-Control':'no-cache','User-Agent':'PanelStock-release-verifier/1.0'};
 for(let attempt=0;;attempt++){
  try{
   const response=await fetch('https://web.panelstockhq.com/?page=gate-progress&release=gate-components-20261110',{headers});assert.equal(response.status,200);const html=await response.text();
   for(const marker of ['globalThis.PANELSTOCK_GATE_PROGRESS_ENABLED=true','function GateProgressPage','key:"gate-progress",label:"Gate Progress",target:"gate-progress"'])assert.ok(html.includes(marker),marker);
   console.log('Verified Gate Progress is enabled in the published production website.');break;
  }catch(error){if(attempt===11)throw error;await new Promise(resolve=>setTimeout(resolve,5000));}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
