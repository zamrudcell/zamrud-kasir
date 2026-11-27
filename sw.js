// Service worker: simpan tampilan agar cepat dibuka. Data selalu diambil online.
const VERSI = 'zk-v3';
const FILE = ['./', 'index.html', 'css/app.css?v=3', 'js/app.js?v=3', 'assets/gem.png', 'assets/logo.jpg', 'assets/ikon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSI).then(c => c.addAll(FILE)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== VERSI).map(x => caches.delete(x))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // API Supabase tidak disimpan
  // jaringan dulu, cadangan cache bila offline
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(VERSI).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
