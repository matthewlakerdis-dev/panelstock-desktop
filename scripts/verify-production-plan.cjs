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
 const script=(await page.text()).match(/<script src="(order-production-plan[.]js[?]v=[a-f0-9]+)"><\/script>/)?.[1];
 assert.equal(script,'order-production-plan.js?v='+digest.slice(0,12),'Production HTML must reference the released plan script');
 const response=await fetch(new URL(script,site),{headers,signal:AbortSignal.timeout(20000)});
 assert.equal(response.status,200,'Production plan script must be available');
 assert.equal(hash(Buffer.from(await response.arrayBuffer())),digest,'Production plan script differs from the release build');
 console.log('Verified that production loads the released Production plan script.');
}

(async()=>{
 for(let attempt=0;;attempt++){
  try{await verify();return;}
  catch(error){if(attempt===11)throw error;await new Promise(resolve=>setTimeout(resolve,5000));}
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
