self.addEventListener('install',event=>{
  event.waitUntil(caches.open('panelstock-shell-v1').then(cache=>Promise.allSettled([
    './','./index.html','./panelstock-client.js','./icon-192.png','./manifest.json',
    './icon-mobile-v3-192.png','./icon-mobile-v3-512.png','./icon-adaptive-v4-192.png','./icon-adaptive-v4-512.png',
    'https://cdn.tailwindcss.com/'
  ].map(asset=>cache.add(asset)))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('panelstock-shell-')&&key!=='panelstock-shell-v1').map(key=>caches.delete(key)))).then(()=>clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET')return;
  const url=new URL(request.url),sameOrigin=url.origin===self.location.origin,isNavigation=request.mode==='navigate';
  if(!sameOrigin&&url.hostname!=='cdn.tailwindcss.com')return;
  if(url.hostname==='cdn.tailwindcss.com'){
    event.respondWith(caches.match(request,{ignoreSearch:true}).then(cached=>cached||fetch(request).then(response=>{const copy=response.clone();void caches.open('panelstock-shell-v1').then(cache=>cache.put(request,copy));return response;})));
    return;
  }
  event.respondWith(fetch(request).then(response=>{if(response.ok&&(isNavigation||['document','script','style','image','manifest'].includes(request.destination))){const copy=response.clone();void caches.open('panelstock-shell-v1').then(cache=>cache.put(request,copy));}return response;}).catch(async()=>await caches.match(isNavigation?'./index.html':request,{ignoreSearch:true})||new Response('PanelStock is unavailable offline.',{status:503,headers:{'Content-Type':'text/plain'}})));
});
self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?.json()||{};}catch{data={body:event.data?.text()||''};}
  event.waitUntil(self.registration.showNotification(data.title||'PanelStock',{body:data.body||'',icon:'/icon-mobile-v3-192.png',badge:'/icon-mobile-v3-192.png',tag:data.tag||'panelstock',data:{link:data.link||'notifications'}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL('./index.html',self.registration.scope);target.searchParams.set('open',event.notification.data?.link||'notifications');
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(windows=>{const existing=windows[0];if(existing){existing.navigate(target.href);return existing.focus();}return clients.openWindow(target.href);}));
});
