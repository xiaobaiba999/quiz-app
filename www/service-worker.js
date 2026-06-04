// 刷题助手 - Service Worker
// 网络优先策略 + OTA 热更新支持

var APP_VERSION = '2.3.0';
var CACHE_NAME = 'quiz-app-v' + APP_VERSION.replace(/\./g, '');

// 需要缓存的文件列表
const CACHE_FILES = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/db.js',
  '/router.js',
  '/import.js',
  '/file-parser.js',
  '/ai.js',
  '/ota.js',
  '/theme.js',
  '/ui.js',
  '/stats.js',
  '/practice.js',
  '/edit.js',
  '/manifest.json'
];

// 安装事件：预缓存核心文件
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] 预缓存核心文件');
      return cache.addAll(CACHE_FILES);
    })
  );
  self.skipWaiting();
});

// 激活事件：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] 删除旧缓存:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// 请求拦截：网络优先策略（仅拦截同源请求）
self.addEventListener('fetch', (event) => {
  // 跳过非 GET 请求
  if (event.request.method !== 'GET') return;

  // 跳过跨域请求（如 GitHub Pages OTA 清单），避免 CORS 问题
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(event.request).then((networkResponse) => {
      if (networkResponse && networkResponse.status === 200) {
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
      }
      return networkResponse;
    }).catch(() => {
      return caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        if (event.request.headers.get('accept').includes('text/html')) {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// OTA 更新消息处理
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'APPLY_UPDATE') {
    var updateUrl = event.data.updateUrl;
    var version = event.data.version;
    var port = event.ports[0];

    if (!updateUrl) {
      if (port) port.postMessage({ type: 'UPDATE_FAILED' });
      return;
    }

    // 下载更新包
    fetch(updateUrl + '?t=' + Date.now())
      .then((response) => {
        if (!response.ok) throw new Error('下载更新包失败');
        return response.json();
      })
      .then((updateData) => {
        if (!updateData.files) throw new Error('更新包格式错误');

        // 更新缓存中的文件
        var cachePromise = caches.open(CACHE_NAME).then((cache) => {
          var promises = Object.keys(updateData.files).map((filePath) => {
            var fileUrl = updateData.files[filePath];
            return fetch(fileUrl).then((fileResponse) => {
              if (fileResponse.ok) {
                return cache.put(new Request('/' + filePath), fileResponse);
              }
            }).catch(() => {
              // 单个文件更新失败不中断整体流程
            });
          });
          return Promise.all(promises);
        });

        return cachePromise.then(() => {
          // 更新版本号
          if (version) {
            localStorage.setItem('quiz_app_version', version);
          }
          if (port) port.postMessage({ type: 'UPDATE_APPLIED', version: version });
        });
      })
      .catch((err) => {
        console.error('[SW] OTA 更新失败:', err);
        if (port) port.postMessage({ type: 'UPDATE_FAILED', error: err.message });
      });
  }

  // 强制更新缓存（跳过等待）
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
