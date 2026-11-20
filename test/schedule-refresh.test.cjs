const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(__dirname+'/../index.html','utf8'),a=html.indexOf('    async function load(){',html.indexOf('  function SchedulePage')),b=html.indexOf('    useEffect(',a),source=html.slice(a,b);
test('refresh keeps the existing schedule visible until fresh data arrives',async()=>{
 let finish,entries=[{id:'existing'}],loading=[],notice='';
 const ctx={loadVersion:{current:0},current:()=>true,entryOrder:null,seeded:{current:false},setLoading:v=>loading.push(v),setNotice:v=>notice=v,setEntries:v=>entries=v,setProjects(){},setOrders(){},setPeople(){},setScheduleSettings(){},setPlanningEntries(){},projectTitleCase:v=>v,BAKED_WORKER_URL:'https://api.test',PanelStock:{apiFetch:()=>new Promise(resolve=>finish=resolve)}};
 const load=vm.runInNewContext(source+';load',ctx),pending=load();
 assert.equal(entries[0].id,'existing');assert.deepEqual(loading,[]);
 finish({ok:true,json:async()=>({entries:[{id:'updated'}]})});await pending;
 assert.equal(entries[0].id,'updated');assert.deepEqual(loading,[false]);assert.equal(notice,'');
});
test('failed refresh keeps existing bookings on screen and reports the failure',async()=>{
 let entries=[{id:'existing'}],loading=[],notice='';
 const ctx={loadVersion:{current:0},current:()=>true,entryOrder:null,setLoading:v=>loading.push(v),setNotice:v=>notice=v,setEntries:v=>entries=v,BAKED_WORKER_URL:'https://api.test',PanelStock:{apiFetch:async()=>({ok:false,json:async()=>({error:'Offline'})})}};
 const load=vm.runInNewContext(source+';load',ctx);assert.equal(await load(),false);assert.equal(entries[0].id,'existing');assert.deepEqual(loading,[false]);assert.equal(notice,'Offline');
});
