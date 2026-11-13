const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../purchase-requests.js'),'utf8');
function harness(rows=[['a','Panel Supplier'],['b','Panel Supplier'],['paused','Panel Paused',true],['0','Zero GST']]){
 const listeners=new Map();let current=true,destroyed=0;
 const doc={activeElement:null,addEventListener(type,listener){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(listener);},removeEventListener(type,listener){listeners.get(type)?.delete(listener);},emit(type,event){for(const listener of listeners.get(type)||[])listener(event);},createElement:tag=>new Node(tag)};
 class Node{
  constructor(tag){this.tagName=tag;this.ownerDocument=doc;this.children=[];this.attributes={};this.listeners=new Map();this._value='';this.textContent='';this.style={};const classes=new Set();this.classList={toggle(name,value){if(value)classes.add(name);else classes.delete(name);},add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name)};}
  appendChild(child){this.children.push(child);child.parentElement=this;return child;}
  replaceChildren(...children){this.children=[];for(const child of children)this.appendChild(child);}
  get options(){return this.children.filter(node=>node.tagName==='option');}
  get value(){return this.tagName==='select'&&!this.options.some(option=>option.value===this._value)?'':this._value;}
  set value(value){this._value=String(value);}
  setAttribute(name,value){this.attributes[name]=String(value);}
  getAttribute(name){return this.attributes[name]??null;}
  removeAttribute(name){delete this.attributes[name];}
  setCustomValidity(message){this.validationMessage=message;}
  matches(selector){if(selector!==':disabled')return false;for(let node=this;node;node=node.parentElement)if(node.disabled)return true;return false;}
  contains(target){return target===this||this.children.some(child=>child.contains(target));}
  addEventListener(type,listener){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(listener);}
  removeEventListener(type,listener){this.listeners.get(type)?.delete(listener);}
  dispatchEvent(event){for(const listener of this.listeners.get(event.type)||[])listener(event);if(event.bubbles)this.parentElement?.dispatchEvent(event);return !event.defaultPrevented;}
  emit(type,properties={}){const event={type,...properties,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){}};this.dispatchEvent(event);return event;}
  focus(){if(doc.activeElement!==this){doc.activeElement=this;this.emit('focus');}}
  select(){this.textSelected=true;}
  getBoundingClientRect(){return this.bounds||{top:600,bottom:640};}
 }
 const context={Intl,JSON,Event,innerHeight:700,console};vm.runInNewContext(source,context);
 const native=new Node('select');native.name='supplier';native.required=true;
 const setRows=next=>{native.replaceChildren();for(const [value,text,disabled=false]of [['','Select…'],...next]){const option=new Node('option');option.value=value;option.textContent=text;option.disabled=disabled;native.appendChild(option);}};setRows(rows);
 const control=context.PanelStockPurchaseRequests.searchableSelect(native,{current:()=>current,onDestroy:()=>destroyed++}),fieldset=new Node('fieldset');fieldset.appendChild(control.element);control.setLabel('Supplier');
 const input=control.input,popup=control.element.children.find(node=>node.getAttribute('role')==='listbox'),options=()=>popup.children.filter(node=>node.getAttribute('role')==='option');
 return{doc,native,control,input,popup,fieldset,options,listeners,setRows,context,createNode:tag=>new Node(tag),setCurrent:value=>{current=value;},get destroyed(){return destroyed;}};
}

test('search filters partial labels without choosing, disambiguates names and commits an exact native ID',()=>{
 const h=harness();let changes=0;h.native.addEventListener('change',()=>changes++);h.input.focus();assert.equal(h.input.textSelected,true);
 h.input.value='pAnEl sUp';h.input.emit('input');assert.equal(h.native.value,'');assert.equal(changes,0);assert.deepEqual(h.options().map(node=>node.textContent),['Panel Supplier · a','Panel Supplier · b']);
 h.input.emit('keydown',{key:'Enter'});assert.equal(h.native.value,'','Enter without an active option does not guess');
 h.input.emit('keydown',{key:'ArrowDown'});h.input.emit('keydown',{key:'ArrowDown'});h.input.emit('keydown',{key:'Enter'});
 assert.equal(h.native.value,'b');assert.equal(changes,1);assert.equal(h.input.value,'Panel Supplier · b');assert.equal(h.input.getAttribute('aria-expanded'),'false');
 assert.equal(h.native.hidden,true);assert.equal(h.native.required,false);assert.equal(h.input.required,true);assert.equal(h.input.validationMessage,'');h.control.destroy();
});

test('mouse selection supports numeric zero IDs and disabled options cannot be chosen',()=>{
 const h=harness();h.input.focus();h.options().find(node=>node.textContent==='Panel Paused').emit('click');assert.equal(h.native.value,'');
 h.options().find(node=>node.textContent==='Zero GST').emit('click');assert.equal(h.native.value,'0');assert.equal(h.input.value,'Zero GST');assert.equal(h.input.validationMessage,'');
 h.control.destroy();
});

test('empty results announce no matches and Escape restores a valid prior choice without a change event',()=>{
 const h=harness();h.native.value='0';h.control.sync();let changes=0,inputEvents=0;h.native.addEventListener('change',()=>changes++);h.native.addEventListener('input',()=>inputEvents++);
 h.input.focus();h.input.value='no supplier like this';h.input.emit('input');assert.equal(h.native.value,'');assert.equal(h.options().length,0);assert.ok(h.popup.children.some(node=>node.textContent==='No matching options.'));assert.ok(h.input.validationMessage);
 assert.equal(h.input.emit('keydown',{key:'Home'}).defaultPrevented,false,'Home retains normal caret behavior while typing');
 h.input.emit('keydown',{key:'Escape'});assert.equal(h.native.value,'0');assert.equal(h.input.value,'Zero GST');assert.equal(changes,0);assert.equal(inputEvents,2);assert.equal(h.input.validationMessage,'');h.control.destroy();
});

test('click-away closes search without selecting the first result and visible input owns invalid focus',()=>{
 const h=harness();h.input.focus();h.input.value='Panel';h.input.emit('input');
 h.doc.emit('pointerdown',{target:{}});assert.equal(h.input.getAttribute('aria-expanded'),'false');assert.equal(h.native.value,'');assert.ok(h.input.validationMessage);
 h.input.emit('invalid');assert.equal(h.input.getAttribute('aria-invalid'),'true');h.input.emit('keydown',{key:'ArrowDown'});h.input.emit('keydown',{key:'Enter'});
 assert.equal(h.input.getAttribute('aria-invalid'),null);assert.equal(h.input.validationMessage,'');h.control.destroy();
});

test('catalog refresh preserves an active search and exact zero selection without a fallback for removed IDs',()=>{
 const h=harness();h.native.value='0';h.control.sync();h.control.refresh();assert.equal(h.native.value,'0');assert.equal(h.input.value,'Zero GST');
 h.input.focus();h.input.value='supplier';h.input.emit('input');
 h.setRows([['c','New Supplier'],['1','Standard GST']]);h.control.refresh();assert.equal(h.input.value,'supplier');assert.deepEqual(h.options().map(node=>node.textContent),['New Supplier']);
 h.input.emit('keydown',{key:'Escape'});assert.equal(h.native.value,'','removed prior choice cannot silently become the first/default choice');assert.equal(h.input.value,'');assert.ok(h.input.validationMessage);h.control.destroy();
});

test('frozen fieldsets, changed accounts and destroyed controls cannot alter the canonical choice',()=>{
 const h=harness();h.native.value='0';h.control.sync();h.input.focus();const first=h.options()[0];
 h.fieldset.disabled=true;h.control.syncDisabled();assert.equal(h.input.getAttribute('aria-expanded'),'false');first.emit('click');assert.equal(h.native.value,'0');
 h.fieldset.disabled=false;h.setCurrent(false);h.input.emit('click');first.emit('click');assert.equal(h.native.value,'0');
 h.setCurrent(true);h.control.sync();h.input.emit('click');assert.equal(h.control.element.classList.contains('is-above'),true,'popup flips when there is more room above');assert.ok(h.listeners.get('pointerdown').size);
 h.control.destroy();assert.equal(h.listeners.get('pointerdown').size,0);assert.equal(h.native.listeners.get('change').size,0);assert.equal(h.input.listeners.get('keydown').size,0);assert.equal(h.destroyed,1);h.control.destroy();assert.equal(h.destroyed,1);
});

test('popup position respects the app scroll area beneath the fixed header',()=>{
 const h=harness(),main=h.createNode('main');h.context.innerHeight=500;h.context.getComputedStyle=node=>({overflowY:node===main?'auto':'visible'});
 main.bounds={top:56,bottom:500};main.appendChild(h.fieldset);h.control.element.bounds={top:260,bottom:302};h.input.focus();
 assert.equal(h.control.element.classList.contains('is-above'),true);assert.ok(parseFloat(h.popup.style.maxHeight)<=192,'height leaves room for header clipping and popup gap');
 h.control.element.bounds={top:80,bottom:122};h.doc.emit('scroll',{type:'scroll',target:main});
 assert.equal(h.control.element.classList.contains('is-above'),false,'scrolling recalculates the best side');
 h.control.destroy();assert.equal(h.listeners.get('scroll').size,0);
});

test('nested overflow-hidden and visual viewport bounds limit short popup space without an 80px minimum',()=>{
 const h=harness(),main=h.createNode('main'),clipped=h.createNode('div');h.context.innerHeight=500;h.context.visualViewport={offsetTop:70,height:300};
 h.context.getComputedStyle=node=>({overflowY:node===main?'auto':node===clipped?'hidden':'visible'});
 main.bounds={top:56,bottom:500};clipped.bounds={top:90,bottom:190};main.appendChild(clipped);clipped.appendChild(h.fieldset);h.control.element.bounds={top:130,bottom:170};h.input.focus();
 assert.equal(h.control.element.classList.contains('is-above'),true);assert.equal(h.popup.style.maxHeight,'28px','the inner clipping box has only40px above, less the12px gap');
 clipped.bounds={top:10,bottom:500};h.control.refresh();assert.equal(h.popup.style.maxHeight,'188px','the visual viewport limits space below the input');
 h.control.destroy();
});
