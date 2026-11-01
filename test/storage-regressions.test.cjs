const {test}=require('node:test');
const assert=require('node:assert/strict');
const {IndexedOutboxStorage,Outbox}=require('../panelstock-client.js');
const KEY='panelstock:outbox:v2';
function brokenDb(){return {transaction(){const tx={objectStore:()=>({put(){queueMicrotask(()=>tx.onabort());}}),error:Error('QuotaExceededError')};return tx;}};}
test('storage exhaustion blocks sending and further edits, retaining pending memory for export',async()=>{
 const notices=[],storage=new IndexedOutboxStorage({setItem(){throw Error('QuotaExceededError');}},(...args)=>notices.push(args));
 storage.db=brokenDb();let sent=0;
 const box=new Outbox({...storage,getItem:()=>null,setItem:storage.setItem.bind(storage),flushWrites:storage.flushWrites.bind(storage)},async()=>{sent++;});
 box.snapshot({variants:[],revision:0,restoreEpoch:0},'staff');
 box.stage({variants:[{id:'v1',qty:1}]},'staff');
 await new Promise(resolve=>setImmediate(resolve));
 await assert.rejects(storage.flushWrites(),/only in memory/);
 assert.equal(sent,0);assert.equal(box.pending(),true);
 assert.throws(()=>box.stage({variants:[]},'staff'),/not saved/);
 assert.ok(notices.some(([,message])=>/only in memory/.test(message)));
});
test('fallback survives IndexedDB failure and is migrated before stale IndexedDB data on reload',async()=>{
 const map=new Map(),fallback={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 const storage=new IndexedOutboxStorage(fallback);storage.db=brokenDb();storage.setItem(KEY,'new pending edits');await storage.flushWrites();
 assert.equal(map.get(KEY),'new pending edits');assert.equal(storage.db,null);
 let saved='older IndexedDB state';const old=globalThis.indexedDB;
 globalThis.indexedDB={open(){const request={};queueMicrotask(()=>{request.result={transaction(){const tx={objectStore(){return {get(){const r={};queueMicrotask(()=>{r.result=saved;r.onsuccess();});return r;},put(value){queueMicrotask(()=>{saved=value;tx.oncomplete();});}};}};return tx;}};request.onsuccess();});return request;}};
 try{const restored=await new IndexedOutboxStorage(fallback).ready();assert.equal(restored.value,'new pending edits');assert.equal(saved,'new pending edits');assert.equal(map.size,0);}finally{if(old)globalThis.indexedDB=old;else delete globalThis.indexedDB;}
});
