const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
async function verify(fetcher=fetch,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
 const base='https://web.panelstockhq.com/',headers={'Cache-Control':'no-cache','User-Agent':'PanelStock-release-verifier/1.0'};
 const assets=['user-bulk-import.js','user-bulk-import.css'].map(name=>{const content=fs.readFileSync(path.join(__dirname,'..',name),'utf8');return {name,content,version:crypto.createHash('sha256').update(content).digest('hex').slice(0,12)};});
 for(let attempt=0;;attempt++){
  try{
   const response=await fetcher(base+'?release=bulk-users-'+assets[0].version,{headers});assert.equal(response.status,200);const html=await response.text();
   assert.ok(html.includes('PanelStockUserBulkImport.createComponent'),'Published User Access upload binding');
   for(const asset of assets){
    const attribute=asset.name.endsWith('.js')?'src':'href',escaped=asset.name.replaceAll('.','\\.'),match=html.match(new RegExp(attribute+'="([^"]*'+escaped+'\\?v=[^"]+)"'));assert.ok(match,'Published '+asset.name);
    const url=new URL(match[1],base);assert.equal(url.origin,new URL(base).origin);assert.equal(url.searchParams.get('v'),asset.version);
    const published=await fetcher(url,{headers});assert.equal(published.status,200);assert.equal(await published.text(),asset.content);
   }
   console.log('Verified production bulk user upload code and styles. No user accounts were read or changed.');return;
  }catch(error){if(attempt===11)throw error;await wait(5000);}
 }
}
if(require.main===module)verify().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={verify};
