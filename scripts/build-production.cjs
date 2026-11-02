const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist-production');
const files = ['index.html','excel-order-actions.js','excel-order-actions.css','pull-refresh.js','workshop-stock.js','workshop-stock.css','panelstock-client.js','toolbox-launcher.js','tailwind.css','icon-192.png','lennox-logo.jpg','PanelStock_SOP.pdf','push-sw.js','CNAME'];
fs.mkdirSync(out,{recursive:true});
for (const file of files) fs.copyFileSync(path.join(root,file),path.join(out,file));
// Version styles and workshop assets so published changes bypass browser caches.
const indexPath=path.join(out,'index.html');
let indexHtml=fs.readFileSync(indexPath,'utf8');
for(const asset of ['tailwind.css','workshop-stock.js','workshop-stock.css','excel-order-actions.js','excel-order-actions.css']){
 const version=require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(out,asset))).digest('hex').slice(0,12);
 indexHtml=indexHtml.replace(new RegExp(asset.replace('.', '\\.')+'\\?v=[^"\\x27]+','g'),asset+'?v='+version);
}
fs.writeFileSync(indexPath,indexHtml);
fs.cpSync(path.join(root,'cad'),path.join(out,'cad'),{recursive:true});
const pdfRoot=path.join(root,'node_modules/pdfjs-dist');
const pdfOut=path.join(out,'cad/pdfjs');
fs.mkdirSync(pdfOut,{recursive:true});
for(const name of ['pdf.min.mjs','pdf.worker.min.mjs']) fs.copyFileSync(path.join(pdfRoot,'build',name),path.join(pdfOut,name));
for(const name of ['cmaps','standard_fonts','wasm']) fs.cpSync(path.join(pdfRoot,name),path.join(pdfOut,name),{recursive:true});
fs.copyFileSync(path.join(pdfRoot,'LICENSE'),path.join(pdfOut,'LICENSE'));
fs.writeFileSync(path.join(out,'.nojekyll'),'');
for(const file of ['index.html','cad/cad.js']){
 const text=fs.readFileSync(path.join(out,file),'utf8');
 if(!text.includes('https://panelstock-reports.matthewlakerdis.workers.dev')||text.includes('panelstock-reports-staging')) throw Error('Production API configuration invalid: '+file);
}
console.log('Production website built with PDF assets in dist-production');

require('./version-cad.cjs')(out);
