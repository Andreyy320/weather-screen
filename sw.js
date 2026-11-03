var CACHE = 'weather-screen-v1';

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(['./', './index.html']); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function timeout(ms) {
  return new Promise(function (_, reject) { setTimeout(reject, ms); });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    Promise.race([fetch(req), timeout(4000)]).then(function (res) {
      // Ошибочные ответы (404, 5xx) не показываем и не сохраняем: берём прошлую рабочую копию
      if (!res || !res.ok) throw new Error('bad response');
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () {
      return caches.match(req).then(function (r) {
        return r || caches.match('./index.html');
      }).then(function (r) {
        return r || new Response('offline', { status: 503, statusText: 'offline' });
      });
    })
  );
});