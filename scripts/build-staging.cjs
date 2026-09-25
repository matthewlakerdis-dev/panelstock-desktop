// Build an isolated static staging site; source files retain production defaults.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist-staging');
const api = 'https://panelstock-reports-staging.matthewlakerdis.workers.dev';
const files = ['index.html','panelstock-client.js','tailwind.css','icon-192.png','PanelStock_SOP.pdf','push-sw.js','cad/index.html','cad/cad.js','cad/cad.css','cad/visual-editor.js','cad/visual-editor.css','cad/editor-theme.css','cad/embedded.js'];
const production = 'https://panelstock-reports.matthewlakerdis.workers.dev';
for (const file of ['index.html','cad/cad.js']) {
  if (!fs.readFileSync(path.join(root,file),'utf8').includes(production)) throw Error('Backend marker missing: '+file);
}
fs.mkdirSync(out,{recursive:true});
for (const file of files) {
  const target = path.join(out,file);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  if (/\.(html|js|css)$/.test(file)) {
    let text = fs.readFileSync(path.join(root,file),'utf8');
    text = text.replaceAll(production,api).replaceAll('https://cnc.panelstockhq.com',api).replaceAll('https://tv.panelstockhq.com',api);
    if (file.endsWith('.html')) text = text.replace('<title>','<title>STAGING � ');
    fs.writeFileSync(target,text);
  } else fs.copyFileSync(path.join(root,file),target);
}
fs.writeFileSync(path.join(out,'robots.txt'),'User-agent: *\nDisallow: /\n');
fs.writeFileSync(path.join(out,'_headers'),'/*\n  X-Robots-Tag: noindex, nofollow\n');
console.log('Staging website built in dist-staging');