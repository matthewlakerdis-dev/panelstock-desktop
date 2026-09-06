const CACHE='panelstock-shell-v2';
const ASSETS=['./','./index.html','./panelstock-client.js','./tailwind.css','./icon-192.png'];
const STATIC_URLS=new Set(ASSETS.map(asset=>new URL(asset,self.registration.scope).href));
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('panelstock-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  const isNavigation=request.mode==='navigate'&&url.origin===self.location.origin&&['/','/index.html'].includes(url.pathname)&&[...url.searchParams.keys()].every(key=>key==='open');
  const assetUrl=isNavigation?new URL('./index.html',self.registration.scope).href:request.url;
  if(request.method!=='GET'||request.headers.has('Authorization')||!STATIC_URLS.has(assetUrl))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try {
      const response=await fetch(request);
      if(response.ok&&!response.redirected&&!/no-store|private/i.test(response.headers.get('Cache-Control')||'')){
        const copy=response.clone();
        event.waitUntil(cache.put(assetUrl,copy).catch(()=>{}));
      }
      return response;
    }catch{
      return await cache.match(assetUrl)||new Response('PanelStock is unavailable offline.',{status:503,headers:{'Content-Type':'text/plain'}});
    }
  })());
});
self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?.json()||{};}catch{data={body:event.data?.text()||''};}
  event.waitUntil(self.registration.showNotification(data.title||'PanelStock',{body:data.body||'',icon:'/icon-192.png',badge:'/icon-192.png',tag:data.tag||'panelstock',data:{link:data.link||'notifications'}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL('./index.html',self.registration.scope);target.searchParams.set('open',event.notification.data?.link||'notifications');
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(windows=>{const existing=windows[0];if(existing){existing.navigate(target.href);return existing.focus();}return clients.openWindow(target.href);}));
});
