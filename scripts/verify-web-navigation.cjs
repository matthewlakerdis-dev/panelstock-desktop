const assert=require('node:assert/strict'),{createHash}=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const asset=fs.readFileSync(path.join(__dirname,'../dispatch-workspace.js')),hash=value=>createHash('sha256').update(value).digest('hex'),digest=hash(asset),site='https://web.panelstockhq.com';
async function verify(){
 const headers={'Cache-Control':'no-cache'},response=await fetch(site+'/?navigation-release='+digest.slice(0,12),{headers,signal:AbortSignal.timeout(20000)});assert.equal(response.status,200);const html=await response.text();
 for(const marker of ['key:"purchasingGroup",label:"Purchasing"','key:"dispatchGroup",label:"Dispatch"','key:"safetyGroup",label:"Safety"','breadcrumbParent+" / "'])assert.ok(html.includes(marker),'Missing navigation change: '+marker);
 const script='dispatch-workspace.js?v='+digest.slice(0,12);assert.ok(html.includes(script),'HTML must load the released combined dispatch workspace');
 const published=await fetch(new URL(script,site),{headers,signal:AbortSignal.timeout(20000)});assert.equal(published.status,200);assert.equal(hash(Buffer.from(await published.arrayBuffer())),digest);
 console.log('Verified published navigation groups, parent breadcrumb and combined dispatch workspace.');
}
(async()=>{for(let attempt=0;;attempt++){try{await verify();return;}catch(error){if(attempt===11)throw error;await new Promise(resolve=>setTimeout(resolve,5000));}}})().catch(error=>{console.error(error.message);process.exitCode=1;});
