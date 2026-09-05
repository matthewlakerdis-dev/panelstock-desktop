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
