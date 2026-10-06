/* Only public static files are eligible. Auth, API, HTML sessions and uploads are never cached. */
const CACHE = "untukmu-static-631ab4357f652eba";
const OFFLINE = "/offline.html";
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([OFFLINE,"/offline.js","/icons/icon-192.png","/icons/icon-512.png"]))));
self.addEventListener("activate", event => event.waitUntil((async()=>{for(const name of await caches.keys()) if(name.startsWith("untukmu-static-")&&name!==CACHE) await caches.delete(name); await self.clients.claim();})()));
function eligible(request,url) {
  if(request.method!=="GET" || url.origin!==self.location.origin || url.search || request.headers.has("Authorization")) return false;
  return /^\/visual\/(?:vendor\/)?[a-zA-Z0-9.-]+\.(?:js|css)$/.test(url.pathname) || /^\/_next\/static\//.test(url.pathname) || /^\/icons\//.test(url.pathname) || url.pathname === "/offline.js";
}
self.addEventListener("fetch",event=>{
  const request=event.request,url=new URL(request.url);
  if(url.origin!==self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) return;
  if(request.mode==="navigate") {event.respondWith(fetch(request).catch(()=>caches.match(OFFLINE)));return;}
  if(!eligible(request,url)) return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try {const response=await fetch(request);if(response.ok && response.type==="basic" && !response.headers.get("Cache-Control")?.includes("no-store")) {
      await cache.put(request,response.clone());const keys=await cache.keys();for(const old of keys.slice(0,Math.max(0,keys.length-128))) if(new URL(old.url).pathname!==OFFLINE) await cache.delete(old);
    }return response;} catch(error) {const saved=await cache.match(request);if(saved) return saved;throw error;}
  })());
});
