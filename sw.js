/* Caché de la app; los datos de entrenamiento se guardan solo en el navegador. */
const CACHE='mi-entreno-offline-v2.0.0';
const FILES=['./','./index.html','./styles.css','./seed.js','./app.js','./excel.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('mi-entreno-offline-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
    if(response.ok){const cloned=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,cloned));}
    return response;
  })));
});
