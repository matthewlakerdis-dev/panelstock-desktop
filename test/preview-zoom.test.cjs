const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../cad/measured-outline.js'),'utf8');
function node(){return {style:{},children:[],attrs:{},events:{},append(...n){this.children.push(...n);},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k];},querySelectorAll(){return [];},addEventListener(k,v){this.events[k]=v;}};}
test('shared preview zoom handles limits, keyboard fit, and switching panel bounds',()=>{
 const c={document:{createElement:node}};vm.createContext(c);vm.runInContext(source.slice(source.indexOf('function addPreviewZoom('),source.indexOf('function show(')),c);
 const svg=node(),host=node();svg.setAttribute('viewBox','0 0 760 540');host.children=[svg];host.insertBefore=function(n,b){this.children.splice(this.children.indexOf(b),0,n);};
 const zoom=c.addPreviewZoom(host,svg),controls=host.children[0],buttons=[controls.children[3],controls.children[1],controls.children[2]];
 assert.equal(buttons[1].disabled,true);buttons[0].onclick();assert.ok(Number(svg.attrs.viewBox.split(' ')[2])<760);assert.equal(buttons[1].disabled,false);
 svg.events.keydown({key:'0',preventDefault(){}});assert.equal(svg.attrs.viewBox,'0 0 760 540');
 for(let i=0;i<20;i++)buttons[0].onclick();assert.equal(buttons[0].disabled,true);
 svg.setAttribute('viewBox','10 20 200 100');zoom.reset();assert.equal(svg.attrs.viewBox,'10 20 200 100');assert.equal(buttons[1].disabled,true);
 assert.equal(host.children[1].className,'sketch-navigation-help');assert.equal(host.children[2],svg);
});
