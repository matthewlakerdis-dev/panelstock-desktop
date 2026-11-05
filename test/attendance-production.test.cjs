const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('published attendance assets contain the compiled production UI and iPad icon',async()=>{
  const {validateAttendancePage}=await import('../scripts/verify-attendance-production.mjs');
  const root=path.resolve(__dirname,'..');
  for(const [file,manage] of [['sign-in/index.html',false],['sign-in/manage/index.html',true]]){
    validateAttendancePage(fs.readFileSync(path.join(root,file),'utf8'),{manage});
  }
  const icon=fs.readFileSync(path.join(root,'sign-in/apple-touch-icon.png'));
  assert.equal(icon.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(icon.readUInt32BE(16),192);assert.equal(icon.readUInt32BE(20),192);
  assert.equal(fs.readFileSync(path.join(root,'CNAME'),'utf8').trim(),'web.panelstockhq.com');
});
