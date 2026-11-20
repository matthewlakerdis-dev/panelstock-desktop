const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');

const site='https://web.panelstockhq.com';
const asset=readFileSync(join(__dirname,'../order-production-plan.js'));
const hash=value=>createHash('sha256').update(value).digest('hex');
const digest=hash(asset);

async function verify(){
 const headers={'Cache-Control':'no-cache'};
 const page=await fetch(site+'/',{headers,signal:AbortSignal.timeout(20000)});
 assert.equal(page.status,200,'Production web app must be available');
 const html=await page.text();
 const script=html.match(/<script src="(order-production-plan[.]js[?]v=[a-f0-9]+)"><\/script>/)?.[1];
 assert.equal(script,'order-production-plan.js?v='+digest.slice(0,12),'Production HTML must reference the released plan script');
 const response=await fetch(new URL(script,site),{headers,signal:AbortSignal.timeout(20000)});
 assert.equal(response.status,200,'Production plan script must be available');
 assert.equal(hash(Buffer.from(await response.arrayBuffer())),digest,'Production plan script differs from the release build');
 const moveAsset=readFileSync(join(__dirname,'../schedule-move.js')),moveDigest=hash(moveAsset),moveScript='schedule-move.js?v='+moveDigest.slice(0,12);
 assert.ok(html.includes(moveScript),'Production HTML must load the released schedule move controller');
 const moveResponse=await fetch(new URL(moveScript,site),{headers,signal:AbortSignal.timeout(20000)});
 assert.equal(moveResponse.status,200,'Schedule drag controller must be available');
 assert.equal(hash(Buffer.from(await moveResponse.arrayBuffer())),moveDigest,'Schedule drag controller differs from the release build');
 console.log('Verified the released Production plan and schedule drag controllers.');
}

(async()=>{
 for(let attempt=0;;attempt++){
  try{await verify();return;}
  catch(error){if(attempt===11)throw error;await new Promise(resolve=>setTimeout(resolve,5000));}
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
