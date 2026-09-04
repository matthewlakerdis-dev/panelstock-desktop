const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('Web CNC tracker links to the live Excel tracker',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.match(html,/const excelLink = `https:\/\/cnc\.panelstockhq\.com\/cnc-tracker\?token=/);
  assert.match(html,/Excel tracker/);
  assert.match(html,/href: excelLink/);
});
