const {test}=require('node:test'),assert=require('node:assert/strict'),{createController,stages,pickup,dates}=require('../order-production-plan.js');
const fields=()=>Object.fromEntries(stages.map(([key])=>[key,{date:'',notApplicable:false,assignedUsername:'',notes:''}]));
const data=()=>({ok:true,order:{id:'order',updatedAt:'order-version',scheduledDeliveryDate:'',scheduledDeliveryTime:'',requestedDeliveryDate:'2026-11-30'},plan:{revision:1,stages:fields()},people:[],canEdit:true,canScheduleDelivery:true});
function fixture(fetcher){const requests=[],saved=[],states=[],client={username:'admin',apiFetch:async(url,options)=>{requests.push({url,options});return fetcher(url,options);}},controller=createController({client,baseUrl:'https://api.test',orderId:'order',uuid:()=> '10000000-0000-4000-8000-000000000001',onChange:value=>states.push(value),onSaved:value=>saved.push(value)});return {client,controller,requests,saved,states};}
test('the compact date model has separate drawing, CNC and fabrication dates, plus automatic powder pickup',()=>{
 assert.deepEqual(stages.map(row=>row[0]),['stockOrder','drawnCnc','cnc','fabrication','powderCoating']);const draft={stages:fields(),scheduledDeliveryDate:'2026-11-30'};draft.stages.drawnCnc.date='2026-11-20';draft.stages.cnc.date='2026-11-21';draft.stages.fabrication.date='2026-11-23';draft.stages.powderCoating.date='2026-11-20';assert.equal(pickup('2026-11-20'),'2026-11-27');assert.equal(pickup('2026-12-31'),'2027-01-07');assert.equal(dates(draft).length,6);assert.equal(dates(draft).find(row=>row.stage==='cnc').date,'2026-11-21');assert.equal(dates(draft).find(row=>row.stage==='powderPickup').date,'2026-11-27');assert.equal(dates(draft).some(row=>['stockDelivery','finalQa','readyForDispatch'].includes(row.stage)),false);
});
test('save uses current plan/order versions, prevents duplicate clicks, and returns the actual saved plan',async()=>{
 let finish;const initial=data(),f=fixture(async(url,options)=>options?.method==='POST'?new Promise(resolve=>finish=resolve):Response.json(initial));await f.controller.load();assert.equal(f.requests.length,1);f.controller.update('drawnCnc','date','2026-11-23');f.controller.update('cnc','date','2026-11-24');const pending=f.controller.save();await f.controller.save();assert.equal(f.requests.length,2);const body=JSON.parse(f.requests[1].options.body);assert.equal(body.expectedRevision,1);assert.equal(body.expectedOrderUpdatedAt,'order-version');assert.equal(body.stages.drawnCnc.date,'2026-11-23');assert.equal(body.stages.cnc.date,'2026-11-24');finish(Response.json({...data(),plan:{...initial.plan,revision:2,stages:body.stages}}));await pending;assert.equal(f.saved.length,1);assert.equal(f.controller.state.saving,false);assert.equal(f.controller.state.dirty,false);
});
test('an uncertain save freezes edits and retries the exact same request identifier and dates',async()=>{
 let posts=0;const f=fixture(async(url,options)=>{if(options?.method!=='POST')return Response.json(data());posts++;if(posts===1)throw Error('Connection lost');return Response.json({...data(),duplicate:true});});await f.controller.load();f.controller.update('powderCoating','date','2026-11-20');await f.controller.save();assert.equal(f.controller.state.uncertain,true);f.controller.update('powderCoating','date','2026-11-24');assert.equal(f.controller.state.draft.stages.powderCoating.date,'2026-11-20');await f.controller.save();assert.equal(f.requests[1].options.body,f.requests[2].options.body);assert.equal(f.saved[0].duplicate,true);assert.equal(f.controller.state.uncertain,false);
});
test('stale errors preserve unsaved dates and N/A clears the related send and derived pickup date',async()=>{
 const f=fixture(async(url,options)=>options?.method==='POST'?Response.json({error:'The production plan changed.'},{status:409}):Response.json(data()));await f.controller.load();f.controller.update('powderCoating','date','2026-11-20');await f.controller.save();assert.equal(f.controller.state.conflict,true);assert.equal(f.controller.state.draft.stages.powderCoating.date,'2026-11-20');f.controller.update('powderCoating','notApplicable',true);assert.equal(f.controller.state.draft.stages.powderCoating.date,'');assert.equal(pickup(f.controller.state.draft.stages.powderCoating.date),'');assert.equal(f.saved.length,0);
});
test('viewers cannot save and schedule managers cannot change admin delivery fields',async()=>{
 const response=data();response.canScheduleDelivery=false;const f=fixture(async()=>Response.json(response));await f.controller.load();f.controller.update('siteDelivery','scheduledDeliveryDate','2026-12-01');assert.equal(f.controller.state.draft.scheduledDeliveryDate,'');f.controller.update('fabrication','date','2026-11-23');assert.equal(f.controller.state.draft.stages.fabrication.date,'2026-11-23');const read=data();read.canEdit=false;const viewer=fixture(async()=>Response.json(read));await viewer.controller.load();viewer.controller.update('fabrication','date','2026-11-23');await viewer.controller.save();assert.equal(viewer.requests.length,1);assert.equal(viewer.controller.state.draft.stages.fabrication.date,'');
});
test('late loads and saves cannot restore private plan state after closing or switching account',async()=>{
 for(const action of ['close','switch']){let finish;const f=fixture(()=>new Promise(resolve=>finish=resolve)),pending=f.controller.load();if(action==='close')f.controller.destroy();else f.client.username='other';finish(Response.json(data()));await pending;assert.equal(f.controller.state.data,null);assert.equal(f.saved.length,0);}
 let finish;const f=fixture(async(url,options)=>options?.method==='POST'?new Promise(resolve=>finish=resolve):Response.json(data()));await f.controller.load();const pending=f.controller.save();f.client.username='other';finish(Response.json(data()));await pending;assert.equal(f.saved.length,0);
});

test('coating choices change only applicable panel stages; linked stock and other type definitions stay authoritative',async()=>{
 const model=require('../order-production-plan.js'),initial=data();initial.stageDefinitions=stages;initial.coating={canChoose:true,selection:'required'};const f=fixture(async()=>Response.json(initial));await f.controller.load();f.controller.update('powderCoating','date','2026-11-20');f.controller.update('plan','panelCoating','already_coated');let draft=f.controller.state.draft;
 assert.equal(model.definitions(initial,draft).length,4);assert.equal(model.dates(draft,model.definitions(initial,draft)).some(row=>row.stage==='powderPickup'),false);f.controller.update('powderCoating','date','2026-11-24');assert.equal(f.controller.state.draft.stages.powderCoating.date,'2026-11-20');f.controller.update('plan','panelCoating','required');draft=f.controller.state.draft;assert.equal(model.definitions(initial,draft).length,5);assert.equal(model.dates(draft,model.definitions(initial,draft)).find(row=>row.stage==='powderPickup').date,'2026-11-27');
 initial.coating.canChoose=false;initial.stageDefinitions=stages.filter(([name])=>name!=='powderCoating');assert.equal(model.definitions(initial,draft).length,4);
 initial.coating=null;initial.stageDefinitions=[['stockOrder','Order'],['drawnCnc','Drawn']];assert.deepEqual(model.definitions(initial,draft),initial.stageDefinitions);
});
test('responsible people are omitted from drafts and cannot be updated or sent by the controller',async()=>{
 const initial=data();initial.plan.stages.fabrication.assignedUsername='old-person';const f=fixture(async(url,options)=>options?.method==='POST'?Response.json(initial):Response.json(initial));await f.controller.load();f.controller.update('fabrication','assignedUsername','new-person');assert.equal(f.controller.state.draft.stages.fabrication.assignedUsername,undefined);await f.controller.save();assert.ok(!f.requests.at(-1).options.body.includes('assignedUsername'));
 const fs=require('node:fs'),html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8'),modal=html.slice(html.indexOf('  function ProductionPlanModal'),html.indexOf('  function OrderLeadTimeSettings'));assert.ok(!modal.includes('Responsible person'));assert.ok(!modal.includes('data.people'));assert.ok(modal.includes('stageDefinitions.map'));
});

test('row date fields retain ordered/requested dates, then the full production sequence and scheduled delivery',()=>{
 const {rowDates}=require('../order-production-plan.js'),order={createdAt:'2026-11-19T00:00:00Z',requestedDeliveryDate:'2026-11-30',scheduledDeliveryDate:'2026-12-01',scheduledDeliveryTime:'09:30'},summary={milestones:[{stage:'stockOrder',label:'Order stock',date:''},{stage:'drawnCnc',label:'Drawn / Toolpath',date:'2026-11-23'},{stage:'cnc',label:'CNC',date:'2026-11-24'},{stage:'fabrication',label:'Fabrication',date:'2026-11-24'},{stage:'powderCoating',label:'Powder coating · Send',date:'2026-11-25'},{stage:'powderPickup',label:'Powder coating · Pickup',date:'2026-12-02'}]};
 const rows=rowDates(order,summary);assert.deepEqual(rows.map(row=>row.stage),['dateOrdered','requested','stockOrder','drawnCnc','cnc','fabrication','powderCoating','powderPickup','siteDelivery']);assert.equal(rows[0].date,order.createdAt);assert.equal(rows.at(-1).time,'09:30');assert.equal(rowDates({},undefined).at(-1).date,'');
});

test('the dialog can load and save while the Worker still uses the combined stage',async()=>{
 const initial=data();
 delete initial.plan.stages.cnc;
 initial.stageDefinitions=stages.filter(([name])=>name!=='cnc');
 initial.coating={canChoose:true,selection:'required'};
 const f=fixture(async()=>Response.json(initial));
 await f.controller.load();
 assert.equal(new URL(f.requests[0].url).searchParams.get('separateCnc'),'1');
 assert.equal(f.controller.state.draft.stages.cnc,undefined);
 f.controller.update('drawnCnc','date','2026-11-23');
 await f.controller.save();
 const {stages:sent}=JSON.parse(f.requests[1].options.body);
 assert.equal(sent.drawnCnc.date,'2026-11-23');
 assert.equal(sent.cnc,undefined);
});

test('the pickup preview applies the configured number of working days',()=>{
 const draft={stages:fields()};
 draft.stages.powderCoating.date='2026-11-20';
 assert.equal(pickup('2026-11-20',3),'2026-11-25');
 assert.equal(dates(draft,stages,3).find(row=>row.stage==='powderPickup').date,'2026-11-25');
 draft.powderPickupDateOverride='2026-11-26';
 assert.equal(dates(draft,stages,3).find(row=>row.stage==='powderPickup').date,'2026-11-26');
});
