const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=function(out){
 const dir=path.join(out,'cad'),hash=crypto.createHash('sha256');
 for(const name of fs.readdirSync(dir).filter(n=>/\.(js|css|html)$/.test(n)).sort())hash.update(name).update(fs.readFileSync(path.join(dir,name)));
 // Fail the release if the CAD page references an asset omitted from the build.
 for(const match of fs.readFileSync(path.join(dir,'index.html'),'utf8').matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))(?:[?#][^"]*)?"/g)){
  if(!/^(?:https?:|\/\/)/.test(match[1])&&!fs.existsSync(path.resolve(dir,match[1])))throw Error('Missing CAD build asset: '+match[1]);
 }
 const version=hash.digest('hex').slice(0,16);
 const cad=path.join(dir,'index.html');
 fs.writeFileSync(cad,fs.readFileSync(cad,'utf8').replace(/((?:src|href)=")([^"?]+\.(?:js|css))"/g,(_,prefix,url)=>prefix+url+'?v='+version+'"'));
 const root=path.join(out,'index.html');
 fs.writeFileSync(root,fs.readFileSync(root,'utf8').replace('cad/?embedded=1','cad/?embedded=1&v='+version));
};

