const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const start = html.indexOf('function openUser(user)');
const end = html.indexOf('function openRole(', start);

test('a profile draft checks the reporting line it was opened with', async () => {
  const employee = {username:'employee', title:'Installer', employeeProfile:{supervisorUsername:'lead'}};
  const context = {
    username:'admin', originalUser:{current:null},
    setEditUser(draft) { context.editUser = draft; },
    setStatus(value) { context.status = value; },
    setBusy() {}, setAccessUser() {},
    async callWorker(path, payload) {
      assert.equal(path, '/admin/update-user');
      context.payload = payload;
      return {ok:false, error:'Reload the page and reopen this employee before saving.'};
    }
  };
  const api = vm.runInNewContext(html.slice(start,end) + ';({openUser,saveUser,toggleActive})', context);
  api.openUser(employee);
  context.editUser = {...context.editUser, title:'Team lead', employeeProfile:{supervisorUsername:'director'}};
  await api.saveUser();
  assert.equal(context.payload.previousReporting.title, 'Installer');
  assert.equal(context.payload.previousReporting.managerId, 'lead');
  assert.equal(context.payload.title, 'Team lead');
  assert.equal(context.payload.employeeProfile.supervisorUsername, 'director');
  assert.equal(context.status.kind, 'err');
  assert.equal(context.editUser.title, 'Team lead');

  await api.toggleActive({username:'another', title:'', active:true, employeeProfile:{}});
  assert.equal(context.payload.previousReporting.title, '');
  assert.equal(context.payload.previousReporting.managerId, null);
});
