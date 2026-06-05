// 刷题助手 - Service Worker
// OTA 热更新支持：缓存优先 + 网络回退

var APP_VERSION = '2.7.0';
var CACHE_NAME = 'quiz-app-v' + APP_VERSION.replace(/\./g, '');
var OTA_CACHE = 'quiz-app-ota';

// 需要缓存的文件列表
var CACHE_FILES = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/db.js',
  '/router.js',
  '/import.js',
  '/ota.js',
  '/theme.js',
  '/ui.js',
  '/stats.js',
  '/practice.js',
  '/edit.js',
  '/manifest.json'
];

// 安装事件：预缓存核心文件
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(CACHE_FILES);
    })
  );
  self.skipWaiting();
});

// 激活事件：清理旧缓存（保留 OTA 缓存）
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.filter(function (name) {
          return name !== CACHE_NAME && name !== OTA_CACHE;
        }).map(function (name) {
          return caches.delete(name);
        })
      );
    })
  );
  self.clients.claim();
});

// 请求拦截：OTA 缓存优先 → 网络 → 应用缓存
self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    // 1. 先查 OTA 缓存（OTA 更新的文件在这里）
    caches.open(OTA_CACHE).then(function (otaCache) {
      return otaCache.match(event.request).then(function (otaResponse) {
        if (otaResponse) {
          return otaResponse;
        }
        // 2. OTA 缓存没有，走网络
        return fetch(event.request).then(function (networkResponse) {
          if (networkResponse && networkResponse.status === 200) {
            var clone = networkResponse.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(event.request, clone);
            });
          }
          return networkResponse;
        }).catch(function () {
          // 3. 网络失败，查应用缓存
          return caches.match(event.request).then(function (cachedResponse) {
            if (cachedResponse) return cachedResponse;
            if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
              return caches.match('/index.html');
            }
          });
        });
      });
    })
  );
});

// OTA 更新消息处理
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'APPLY_UPDATE') {
    var version = event.data.version;
    var port = event.ports[0];

    // 从 OTA 缓存中读取已下载的文件并确认
    caches.open(OTA_CACHE).then(function (otaCache) {
      return otaCache.keys();
    }).then(function (keys) {
      if (keys.length > 0) {
        if (port) port.postMessage({ type: 'UPDATE_APPLIED', version: version });
      } else {
        if (port) port.postMessage({ type: 'UPDATE_FAILED' });
      }
    }).catch(function () {
      if (port) port.postMessage({ type: 'UPDATE_FAILED' });
    });
  }

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
