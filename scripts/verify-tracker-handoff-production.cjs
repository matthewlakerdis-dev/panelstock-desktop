const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
(async()=>{
 const expected=fs.readFileSync(require('node:path').join(__dirname,'../tracker-tab-handoff.js'),'utf8'),release=crypto.createHash('sha256').update(expected).digest('hex').slice(0,12);
 const base='https://web.panelstockhq.com/',headers={'Cache-Control':'no-cache','User-Agent':'PanelStock-release-verifier/1.0'};
 for(let attempt=0;;attempt++){
  try{
   const page=await fetch(base+'?release=tracker-focus-'+release,{headers});assert.equal(page.status,200);const html=await page.text();
   const source=html.match(/src="([^"]*tracker-tab-handoff\.js\?v=[^"]+)"/);assert.ok(source,'Published handoff script');
   const asset=new URL(source[1],base);assert.equal(asset.origin,new URL(base).origin);assert.equal(asset.searchParams.get('v'),release);
   const response=await fetch(asset,{headers});assert.equal(response.status,200);assert.equal(await response.text(),expected);
   console.log('Verified the production website serves the exact spreadsheet focus handoff release.');break;
  }catch(error){if(attempt===11)throw error;await new Promise(resolve=>setTimeout(resolve,5000));}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
