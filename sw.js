// ===== Service worker для экрана погоды =====
// 1) HTML (index.html): сначала сеть (всегда свежая версия), если сети нет — копия из кэша.
// 2) Шрифты и видео: сохраняются в кэш ОДИН раз и дальше отдаются из кэша — работают без интернета.
//
// ВАЖНО: если ты ЗАМЕНИЛ файл шрифта или видео (оставив то же имя) — увеличь ASSETS
// (например 'weather-assets-v2'), иначе будет отдаваться старый файл из кэша.
// Новое видео/шрифт добавил — впиши его в ASSET_LIST ниже (хотя и без этого оно закэшируется при первом показе).

var CACHE  = 'weather-screen-v4';
var ASSETS = 'weather-assets-v1';

var ASSET_LIST = [
  'fonts/SF-Pro-Display-Regular.otf',
  'fonts/SF-Pro-Display-Medium.otf',
  'fonts/SF-Pro-Text-Medium.otf',
  'fonts/SF-Pro-Text-Semibold.otf',
  'assets/fog.mp4',
  'assets/pasmyrno.mp4',
  'assets/peremen_oblako.mp4',
  'assets/rain.mp4',
  'assets/rain_light.mp4',
  'assets/rain_night.mp4',
  'assets/snow.mp4',
  'assets/storm.mp4',
  'assets/storm_night.mp4',
  'assets/sunny.mp4',
  'assets/yasna_night.mp4',
  'assets/zakat.mp4'
].map(function (p) { return new URL(p, self.registration.scope).href; });

var ASSET_RE = /\.(mp4|webm|otf)$/i;
var inflight = {};

// скачать файл ЦЕЛИКОМ и положить в кэш (если его там ещё нет); никогда не падает
function cacheFull(url) {
  if (inflight[url]) return inflight[url];
  inflight[url] = caches.open(ASSETS).then(function (c) {
    return c.match(url).then(function (hit) {
      if (hit) return;
      return fetch(url).then(function (res) {
        if (res && res.status === 200) return c.put(url, res);
      });
    });
  }).catch(function () {}).then(function () { delete inflight[url]; });
  return inflight[url];
}

// качаем по одному, чтобы не забивать канал
function precacheAssets() {
  var p = Promise.resolve();
  ASSET_LIST.forEach(function (u) { p = p.then(function () { return cacheFull(u); }); });
  return p;
}

// видео просит куски файла (Range) — отдаём нужный кусок из закэшированного целого файла
function serveAsset(e) {
  var req = e.request, url = req.url;
  return caches.open(ASSETS).then(function (c) { return c.match(url); }).then(function (hit) {
    if (!hit) {
     
      return fetch(req);
    }
    var range = req.headers.get('range');
    var m = range && /bytes=(\d*)-(\d*)/.exec(range);
    if (!m) return hit;
    return hit.blob().then(function (b) {
      var size = b.size, start, end;
      if (m[1] === '') { start = Math.max(0, size - (+m[2])); end = size - 1; }
      else { start = +m[1]; end = m[2] === '' ? size - 1 : Math.min(+m[2], size - 1); }
      if (start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
      return new Response(b.slice(start, end + 1), {
        status: 206, statusText: 'Partial Content',
        headers: {
          'Content-Type': hit.headers.get('Content-Type') || 'video/mp4',
          'Content-Length': String(end - start + 1),
          'Content-Range': 'bytes ' + start + '-' + end + '/' + size,
          'Accept-Ranges': 'bytes'
        }
      });
    });
  });
}

self.addEventListener('install', function (e) {
  // в install только HTML: он быстрый. Тяжёлые файлы качаются отдельно (см. 'message'),
  // иначе установка затянется, а браузер может её прервать.
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll([new Request('./', { cache: 'reload' }), new Request('./index.html', { cache: 'reload' })]); })
  );
  self.skipWaiting();
});

// сколько файлов из ASSET_LIST уже в кэше — сообщаем странице (видно в консоли)
function report() {
  return caches.open(ASSETS).then(function (c) {
    return Promise.all(ASSET_LIST.map(function (u) { return c.match(u).then(function (r) { return r ? 1 : 0; }); }));
  }).then(function (a) {
    var n = a.reduce(function (s, x) { return s + x; }, 0);
    return self.clients.matchAll().then(function (cl) {
      cl.forEach(function (c) { c.postMessage({ type: 'cache', cached: n, total: ASSET_LIST.length }); });
    });
  }).catch(function () {});
}

// страница просит «докачай, чего не хватает» (при загрузке и раз в 10 минут).
// Уже скачанное пропускается, так что это дёшево. Если браузер прервал скачивание — следующий запрос продолжит.
self.addEventListener('message', function (e) {
  if (e.data === 'precache') e.waitUntil(report().then(precacheAssets).then(report));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== ASSETS; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function timeout(ms) {
  return new Promise(function (_, reject) { setTimeout(reject, ms); });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  var u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin) return;
  if (u.searchParams.has('chk')) return;                       // проверка обновлений — всегда напрямую в сеть
  if (ASSET_RE.test(u.pathname)) { e.respondWith(serveAsset(e)); return; }
  e.respondWith(
    Promise.race([fetch(req.url, { cache: 'no-cache' }), timeout(4000)]).then(function (res) {
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