import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {parse} from 'acorn';

const WORKER_ORIGIN='https://panelstock-reports.matthewlakerdis.workers.dev';
const WEB_ORIGIN='https://web.panelstockhq.com';
const hash=value=>"'sha256-"+createHash('sha256').update(value).digest('base64')+"'";
const inline=(html,tag)=>[...html.matchAll(new RegExp('<'+tag+'\\b([^>]*)>([\\s\\S]*?)<\\/'+tag+'>','gi'))]
  .filter(match=>!(/\bsrc\s*=/i.test(match[1])&&/static\.cloudflareinsights\.com\/beacon\.min\.js/.test(match[1])))
  .map(match=>{assert.ok(!/\bsrc\s*=/i.test(match[1]),'Unexpected external application script');return match[2];});
const policyOf=html=>html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i)?.[1];
const input=(html,id)=>html.match(new RegExp('<input\\b[^>]*\\bid="'+id+'"[^>]*>','i'))?.[0];

export function validateAttendancePage(html,{manage=false,worker=false,headers,expected}={}){
  assert.match(html,/Lennox Facades/);
  assert.doesNotMatch(html,/attendance-test-|iOS 10 compatibility test|Demo administrator|Demo data only|ipadtest|103434|panelstock-attendance-ios10-test|Made-up test company|Welcome to PanelStock/);
  const scripts=inline(html,'script'),styles=inline(html,'style'),policy=policyOf(html);
  assert.equal(scripts.length,1,'Expected one compiled inline application script');
  assert.equal(styles.length,1,'Expected one inline stylesheet');
  assert.ok(policy,'Missing hashed CSP meta policy');
  assert.ok(policy.includes('script-src '+hash(scripts[0])),'Application script hash does not match CSP');
  assert.ok(policy.includes('style-src '+hash(styles[0])),'Stylesheet hash does not match CSP');
  assert.doesNotMatch(policy,/unsafe-inline|unsafe-eval|nonce-/);
  assert.ok(policy.includes('connect-src '+(worker?"'self'":WORKER_ORIGIN)),'Wrong attendance API origin in CSP');
  parse(scripts[0],{ecmaVersion:5,sourceType:'script'});
  assert.ok(scripts[0].includes('window.attendanceApiOrigin='+JSON.stringify(worker?'':WORKER_ORIGIN)),'Wrong attendance API origin in compiled application');
  assert.match(scripts[0],/attendanceLegacyRequest/);
  if(expected){
    assert.deepEqual(scripts,inline(expected,'script'),'Deployed application differs from the release build');
    assert.deepEqual(styles,inline(expected,'style'),'Deployed stylesheet differs from the release build');
    assert.equal(policy,policyOf(expected),'Deployed policy differs from the release build');
  }
  if(worker&&headers){
    assert.equal(headers.get('X-Attendance-Environment'),'production');
    assert.equal(headers.get('Cache-Control'),'no-store');
    assert.equal(headers.get('Content-Security-Policy'),policy+"; frame-ancestors 'none'");
    assert.equal(headers.get('Referrer-Policy'),'no-referrer');
  }
  if(manage){
    assert.match(html,/<form\b[^>]*id="login"/);
    assert.match(input(html,'username')||'',/\brequired\b/);
    assert.match(input(html,'pin')||'',/type="password"/);
    assert.match(html,/Use your PanelStock administrator account/);
    for(const field of ['visitorSafetyAcknowledged','workshopAccess','ppeConfirmed'])assert.ok(scripts[0].includes(field),'Visitor safety register/export field missing: '+field);
  }else{
    for(const id of ['name','company','host'])assert.match(input(html,id)||'',/\brequired\b/,'Missing required field: '+id);
    assert.ok(input(html,'contact'),'Contact field missing');
    assert.doesNotMatch(html,/id="purpose(?:-field)?"|Reason for visit/);
    assert.match(html,/rel="apple-touch-icon" href="\/sign-in\/apple-touch-icon\.png"/);
    assert.match(html,/name="apple-mobile-web-app-capable" content="yes"/);
    assert.match(html,/id="attendance-admin-connect"/);
    assert.match(input(html,'attendance-admin-username')||'',/\brequired\b/);
    assert.match(input(html,'attendance-admin-pin')||'',/type="password"/);
    assert.doesNotMatch(html,/station code|pairing code|connection code/i);
    assert.match(html,/People currently signed in/);
    for(const id of ['action-screen','role-screen','in-screen','back-to-roles','back-to-actions-role','back-to-actions-out','visitor-safety','ppe-field','visitor-workshop-warning']){
      assert.ok(html.includes('id="'+id+'"'),'Arrival wizard or visitor question missing: '+id);
    }
    for(const id of ['role-screen','in-screen','out-screen'])assert.match(html,new RegExp('<section\\b[^>]*id="'+id+'"[^>]*\\bhidden\\b'),'Wizard steps must start hidden: '+id);
    assert.match(input(html,'visitor-safety-acknowledged')||'',/type="checkbox"[^>]*\brequired\b/,'Visitor acknowledgement missing');
    for(const id of ['workshop-access-yes','workshop-access-no'])assert.match(input(html,id)||'',/type="radio"[^>]*\brequired\b/,'Workshop choice missing');
    for(const id of ['ppe-confirmed-yes','ppe-confirmed-no'])assert.match(input(html,id)||'',/type="radio"[^>]*\bdisabled\b/,'Conditional PPE choice missing');
    assert.ok(html.includes('visitor safety instructions provided by my host'),'Host-provided visitor acknowledgement missing');
    assert.ok(html.includes('Speak to your host before entering the workshop.'),'PPE host reminder missing');
  }
}

export async function verifyAttendanceSurface(surface,{fetcher=fetch,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),attempts=8,expectedPages,expectedIcon}={}){
  assert.ok(['worker','web'].includes(surface),'Expected --worker or --web');
  const worker=surface==='worker',origin=worker?WORKER_ORIGIN:WEB_ORIGIN;
  async function get(path){
    // This verifier issues GET requests only, never credentials or mutations.
    const response=await fetcher(origin+path,{method:'GET',redirect:'follow',headers:{'Cache-Control':'no-cache','User-Agent':'PanelStock-attendance-release-verifier/1.0'},signal:AbortSignal.timeout(30000)});
    if(response.url)assert.equal(new URL(response.url).origin,origin,'Unexpected redirect away from attendance host');
    return response;
  }
  for(let attempt=0;attempt<attempts;attempt++){
    try{
      for(const path of ['/sign-in','/sign-in/','/sign-in/manage','/sign-in/manage/']){
        const manage=path.includes('manage'),response=await get(path);
        assert.equal(response.status,200,'Attendance page unavailable: '+path);
        assert.match(response.headers.get('Content-Type')||'',/text\/html/i);
        validateAttendancePage(await response.text(),{manage,worker,headers:response.headers,expected:expectedPages?.[manage?1:0]});
      }
      const icon=await get('/sign-in/apple-touch-icon.png');
      assert.equal(icon.status,200,'Apple touch icon unavailable');
      assert.match(icon.headers.get('Content-Type')||'',/image\/png/i);
      const bytes=Buffer.from(await icon.arrayBuffer());
      assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a','Apple touch icon is not PNG');
      assert.equal(bytes.readUInt32BE(16),192);assert.equal(bytes.readUInt32BE(20),192);
      if(expectedIcon)assert.ok(bytes.equals(expectedIcon),'Apple touch icon differs from the release build');
      if(worker){
        const session=await get('/session');
        assert.equal(session.status,401,'Live attendance must require an administrator session');
      }
      console.log('Verified '+surface+' attendance pages: ES5 application, matching CSP hashes, production fields, real administrator forms and Lennox iPad icon. No login, pairing or attendance mutation performed.');
      return;
    }catch(error){
      if(attempt===attempts-1)throw error;
      console.log('Waiting for '+surface+' attendance deployment propagation ('+(attempt+1)+'/'+attempts+').');
      await wait(30000);
    }
  }
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  assert.equal(process.argv.length,3,'Usage: verify-attendance-production.mjs --worker|--web');
  const surface=process.argv[2].replace(/^--/,'');
  assert.ok(['worker','web'].includes(surface),'The verifier accepts only the fixed production Worker or web host');
  let expectedPages,expectedIcon;
  if(surface==='worker'){
    const {buildAttendancePage}=await import('../generated/attendance-pages.js');
    expectedPages=[buildAttendancePage(false).html,buildAttendancePage(true).html];
    expectedIcon=await readFile(new URL('../../icon-adaptive-v4-192.png',import.meta.url));
  }else{
    expectedPages=await Promise.all(['../sign-in/index.html','../sign-in/manage/index.html'].map(path=>readFile(new URL(path,import.meta.url),'utf8')));
    expectedIcon=await readFile(new URL('../sign-in/apple-touch-icon.png',import.meta.url));
  }
  await verifyAttendanceSurface(surface,{expectedPages,expectedIcon});
}
