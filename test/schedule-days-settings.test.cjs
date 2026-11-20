const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),a=html.indexOf('  function ScheduleSettingsPanel()'),b=html.indexOf('  function qaReportStatusLabel',a),walk=n=>!n||typeof n!=='object'?[]:[n,...(n.children||[]).flat(Infinity).flatMap(walk)];
function panel(days=[1,2,3,4,5,6,0]){let index=0,calls=[],state=[{startHour:6,endHour:18,visibleUsernames:[],visibleWeekdays:days},[],false,false,''];const e=(type,props,...children)=>({type,props:props||{},children});const context={useState(initial){const i=index++;if(state[i]===undefined)state[i]=initial;return [state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value;}];},useEffect(){},import_react:{createElement:e},import_jsx_runtime:{jsx:(t,p)=>e(t,p,p.children),jsxs:(t,p)=>e(t,p,p.children)},BAKED_WORKER_URL:'',PanelStock:{async apiFetch(path,request){calls.push(JSON.parse(request.body));return {ok:true,json:async()=>path.includes('/vehicles')?{vehicles:[{id:'v1',...calls.at(-1)}],people:[],settings:{...state[0],visibleUsernames:['vehicle:v1']}}:{settings:calls.at(-1)}};}}};const render=()=>{index=0;return vm.runInNewContext(html.slice(a,b)+';ScheduleSettingsPanel()',context);};return {render,state,calls};}
test('schedule settings show all seven days and save chosen days',async()=>{const h=panel(),tree=h.render(),days=walk(tree).filter(n=>n.type==='input'&&n.props.type==='checkbox');assert.equal(days.length,7);days[6].props.onChange();assert.equal(h.state[0].visibleWeekdays.includes(0),false);const save=walk(h.render()).find(n=>n.type==='button'&&n.children.includes('Save schedule settings'));await save.props.onClick();assert.equal(h.calls.length,1);assert.equal(h.calls[0].visibleWeekdays.includes(0),false);});
test('an empty day selection cannot be saved',async()=>{const h=panel([]),save=walk(h.render()).find(n=>n.type==='button'&&n.children.includes('Save schedule settings'));await save.props.onClick();assert.equal(h.calls.length,0);assert.match(h.state[4],/Select at least one/);});

module.exports={panel,walk};

test('vehicle settings add the named vehicle and registration without creating a user',async()=>{const h=panel(),name=walk(h.render()).find(n=>n.type==='input'&&n.props.placeholder==='e.g. Ute');name.props.onChange({target:{value:'Ute'}});const registration=walk(h.render()).find(n=>n.type==='input'&&n.props.maxLength===30);registration.props.onChange({target:{value:'ABC123'}});const add=walk(h.render()).find(n=>n.type==='button'&&n.children.includes('Add vehicle'));await add.props.onClick();assert.equal(h.calls[0].name,'Ute');assert.equal(h.calls[0].registration,'ABC123');assert.equal(h.state[5][0].name,'Ute');assert.equal(h.state[6].name,'');assert.ok(h.state[0].visibleUsernames.includes('vehicle:v1'));});
test('vehicle settings reject a blank name before sending',async()=>{const h=panel(),add=walk(h.render()).find(n=>n.type==='button'&&n.children.includes('Add vehicle'));await add.props.onClick();assert.equal(h.calls.length,0);assert.equal(h.state[4],'Enter a vehicle name.');});

test('production booking defaults save a person and duration per task',async()=>{
 const h=panel();
 h.state[0].visibleUsernames=['operator','vehicle:ute'];
 h.state[1]=[{username:'operator',displayName:'CNC operator'},{username:'vehicle:ute',displayName:'Ute',kind:'vehicle'}];
 h.state[8]=[['cnc','CNC']];
 const select=walk(h.render()).find(node=>node.type==='select'&&walk(node).some(option=>option.children.includes('No default person')));
 assert.ok(walk(select).some(node=>node.props.value==='operator'));
 assert.ok(!walk(select).some(node=>node.props.value==='vehicle:ute'));
 select.props.onChange({target:{value:'operator'}});
 const duration=walk(h.render()).find(node=>node.props['aria-label']==='CNC booking minutes');
 assert.equal(duration.props.value,60);
 duration.props.onChange({target:{value:'90'}});
 await walk(h.render()).find(node=>node.type==='button'&&node.children.includes('Save schedule settings')).props.onClick();
 assert.equal(h.calls[0].productionBookingDefaults.cnc.username,'operator');
 assert.equal(h.calls[0].productionBookingDefaults.cnc.durationMinutes,90);
});

test('schedule settings save a configurable powder coating turnaround in working days',async()=>{
 const h=panel();
 h.state[8]=[['powderPickup','Powder coating · Pickup']];
 const input=walk(h.render()).find(node=>node.type==='input'&&node.props.min===1);
 assert.equal(input.props.value,5);
 input.props.onChange({target:{value:'3'}});
 await walk(h.render()).find(node=>node.type==='button'&&node.children.includes('Save schedule settings')).props.onClick();
 assert.equal(h.calls[0].powderCoatingWorkingDays,3);
});
