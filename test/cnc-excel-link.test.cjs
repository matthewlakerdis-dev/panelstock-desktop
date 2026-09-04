const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('Web CNC tracker links to the live Excel tracker',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.match(html,/const excelLink = `https:\/\/cnc\.panelstockhq\.com\/cnc-tracker\?token=/);
  assert.match(html,/" Excel"/);
  assert.match(html,/href: excelLink/);
  assert.match(html,/linkCopied \? "Link copied!" : "CNC Tracker"/);
  assert.match(html,/className: "flex flex-wrap items-center gap-2 mb-3"/);
});
