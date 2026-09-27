const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../cad/cad.js'),'utf8'),c={};vm.runInNewContext(source.slice(source.indexOf('function filterPanelRows('),source.indexOf('const findPanelsButton=')),c);
const rows=[{index:0,p:{spec:{panelId:'Z2-21'},file:{name:'Balcony.jpg'},result:{dxf:'drawing'}},reasons:[]},{index:1,p:{name:'Lobby.pdf',result:{dxf:'drawing'}},reasons:['Review']},{index:2,p:{spec:{panelId:'Z2-22'}},reasons:['Generate']}];
test('search matches ID and source filename without case sensitivity',()=>{assert.equal(c.filterPanelRows(rows,' z2-21 ','all')[0].index,0);assert.equal(c.filterPanelRows(rows,'BALCONY','all')[0].index,0);assert.equal(c.filterPanelRows(rows,'lobby','all')[0].index,1);assert.equal(c.filterPanelRows(rows,'missing','all').length,0);});
test('filters combine with search and preserve original indices',()=>{assert.equal(c.filterPanelRows(rows,'','generated').length,2);assert.equal(c.filterPanelRows(rows,'','attention').length,2);assert.equal(c.filterPanelRows(rows,'Z2','attention')[0].index,2);assert.equal(c.filterPanelRows([],'','all').length,0);assert.equal(rows.length,3);});

test('ready excludes generated panels with unresolved issues and combines with search',()=>{assert.equal(c.filterPanelRows(rows,'','ready').length,1);assert.equal(c.filterPanelRows(rows,'','ready')[0].index,0);assert.equal(c.filterPanelRows(rows,'Lobby','ready').length,0);});

test('panel ID search ignores spaces hyphens and underscores while respecting filters',()=>{for(const term of ['z221','Z2 21','z2_21'])assert.equal(c.filterPanelRows(rows,term,'all')[0].index,0);assert.equal(c.filterPanelRows(rows,'z221','attention').length,0);assert.equal(c.filterPanelRows(rows,'---','all').length,0);});

test('not generated filter excludes existing drawings and combines with search',()=>{assert.equal(c.filterPanelRows(rows,'','ungenerated').length,1);assert.equal(c.filterPanelRows(rows,'','ungenerated')[0].index,2);assert.equal(c.filterPanelRows(rows,'Lobby','ungenerated').length,0);});
