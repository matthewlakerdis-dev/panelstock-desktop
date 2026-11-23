const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {createHash}=require('node:crypto');
const site='https://web.panelstockhq.com';
const api='https://panelstock-reports.matthewlakerdis.workers.dev';
const hash=value=>createHash('sha256').update(value).digest('hex');
(async()=>{
 const files=['workshop-stock.js','workshop-stock.css'].map(name=>({name,digest:hash(readFileSync(join(__dirname,'..',name)))}));
 const headers={'Cache-Control':'no-cache'},page=await fetch(site+'/?stock-release='+files[0].digest.slice(0,12),{headers,signal:AbortSignal.timeout(20000)});
 assert.equal(page.status,200,'Web must be available');const html=await page.text();
 for(const {name,digest}of files){
  const asset=name+'?v='+digest.slice(0,12);assert.ok(html.includes(asset),'Web must reference the released '+name);
  const response=await fetch(new URL(asset,site),{headers,signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,200,'Released '+name+' must be available');assert.equal(hash(Buffer.from(await response.arrayBuffer())),digest,'Published '+name+' differs from the release build');
 }
 for(const path of ['/workshop-stock?images=deferred','/purchase-orders?images=deferred','/workshop-stock/images/release-verification-only']){
  const response=await fetch(api+path,{headers:{...headers,Origin:site},signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,401,'Stock, receiving and photo requests must require login');await response.arrayBuffer();
 }
 console.log('Verified published stock and receiving assets and authenticated photo access.');
})().catch(()=>{console.error('Stock and receiving release verification failed; check the published build and API availability.');process.exitCode=1;});
