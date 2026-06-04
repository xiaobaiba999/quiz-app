// 刷题助手 - OTA 热更新模块

(function () {
  'use strict';

  var OTAModule = {};

  var VERSION_KEY = 'quiz_app_version';
  var UPDATE_CHECK_KEY = 'quiz_last_update_check';
  var CURRENT_VERSION = '2.4.0';

  // OTA 清单地址：优先 jsDelivr（国内可访问），回退 GitHub Pages
  var MANIFEST_URLS = [
    'https://cdn.jsdelivr.net/gh/xiaobaiba999/quiz-app@main/www/manifest-ota.json',
    'https://xiaobaiba999.github.io/quiz-app/manifest-ota.json'
  ];

  // 文件下载基础路径
  var FILE_BASE_URLS = [
    'https://cdn.jsdelivr.net/gh/xiaobaiba999/quiz-app@main/www/',
    'https://xiaobaiba999.github.io/quiz-app/'
  ];

  /**
   * 带自动回退的 HTTP GET JSON
   */
  function _httpGetJsonWithFallback(urls) {
    if (!urls || urls.length === 0) {
      return Promise.reject(new Error('无可用地址'));
    }
    var url = urls[0] + '?t=' + Date.now();
    return fetch(url, { mode: 'cors', cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .catch(function () {
        if (urls.length > 1) return _httpGetJsonWithFallback(urls.slice(1));
        throw new Error('所有地址均无法访问');
      });
  }

  /**
   * 带自动回退的 HTTP GET Text
   */
  function _httpGetTextWithFallback(urls) {
    if (!urls || urls.length === 0) {
      return Promise.reject(new Error('无可用地址'));
    }
    var url = urls[0] + '?t=' + Date.now();
    return fetch(url, { mode: 'cors', cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .catch(function () {
        if (urls.length > 1) return _httpGetTextWithFallback(urls.slice(1));
        throw new Error('下载失败');
      });
  }

  /**
   * 获取当前版本号
   */
  OTAModule.getCurrentVersion = function () {
    return CURRENT_VERSION;
  };

  /**
   * 获取配置的清单地址
   */
  OTAModule.getManifestUrl = function () {
    return localStorage.getItem('quiz_ota_manifest_url') || MANIFEST_URLS[0];
  };

  /**
   * 设置清单地址
   */
  OTAModule.setManifestUrl = function (url) {
    if (url && url.trim()) {
      localStorage.setItem('quiz_ota_manifest_url', url.trim());
    } else {
      localStorage.removeItem('quiz_ota_manifest_url');
    }
  };

  /**
   * 检查更新
   */
  OTAModule.checkForUpdate = function () {
    var customUrl = localStorage.getItem('quiz_ota_manifest_url');
    var urls = customUrl ? [customUrl] : MANIFEST_URLS.slice();

    return _httpGetJsonWithFallback(urls).then(function (manifest) {
      localStorage.setItem(UPDATE_CHECK_KEY, new Date().toISOString());
      if (!manifest.version) return { _error: '清单缺少版本号' };

      var cmp = _compareVersions(manifest.version, CURRENT_VERSION);
      if (cmp > 0) {
        return {
          version: manifest.version,
          changelog: manifest.changelog || '',
          updateUrl: manifest.updateUrl || '',
          files: manifest.files || [],
          forceUpdate: manifest.forceUpdate || false
        };
      }
      return { _current: true, remoteVersion: manifest.version };
    }).catch(function (err) {
      console.error('[OTA] 检查更新失败:', err);
      return { _error: err.message || '网络错误' };
    });
  };

  /**
   * 应用更新
   */
  OTAModule.applyUpdate = function (updateInfo) {
    if (!updateInfo) return Promise.reject(new Error('无效的更新信息'));

    if (updateInfo.updateUrl && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
      return new Promise(function (resolve) {
        var mc = new MessageChannel();
        mc.port1.onmessage = function (e) {
          if (e.data && e.data.type === 'UPDATE_APPLIED') {
            localStorage.setItem(VERSION_KEY, updateInfo.version);
            resolve(true);
          } else if (e.data && e.data.type === 'UPDATE_FAILED') {
            resolve(false);
          }
        };
        navigator.serviceWorker.controller.postMessage({
          type: 'APPLY_UPDATE', updateUrl: updateInfo.updateUrl, version: updateInfo.version
        }, [mc.port2]);
        setTimeout(function () { resolve(false); }, 30000);
      });
    }

    if (updateInfo.files && Object.keys(updateInfo.files).length > 0) {
      return _directUpdateCache(updateInfo);
    }
    return Promise.resolve(true);
  };

  var OTA_CACHE = 'quiz-app-ota';

  /**
   * 直接更新缓存（写入 OTA 专用缓存，SW 会优先读取）
   */
  function _directUpdateCache(updateInfo) {
    if (!('caches' in window)) return Promise.resolve(true);

    return caches.open(OTA_CACHE).then(function (cache) {
      var promises = Object.keys(updateInfo.files).map(function (filePath) {
        var fileUrl = updateInfo.files[filePath];
        if (!fileUrl) return Promise.resolve();

        var downloadUrls = fileUrl.startsWith('http')
          ? [fileUrl]
          : FILE_BASE_URLS.map(function (base) { return base + fileUrl; });

        return _httpGetTextWithFallback(downloadUrls).then(function (text) {
          var ct = 'text/plain';
          if (filePath.endsWith('.js')) ct = 'application/javascript';
          else if (filePath.endsWith('.css')) ct = 'text/css';
          else if (filePath.endsWith('.html')) ct = 'text/html';
          else if (filePath.endsWith('.json')) ct = 'application/json';

          return cache.put(new Request('/' + filePath), new Response(text, { status: 200, headers: { 'Content-Type': ct } }));
        }).catch(function () {});
      });

      return Promise.all(promises).then(function () {
        localStorage.setItem(VERSION_KEY, updateInfo.version);
        return true;
      });
    }).catch(function () { return false; });
  }

  var CACHE_NAME = 'quiz-app-v' + CURRENT_VERSION.replace(/\./g, '');

  OTAModule.reloadApp = function () {
    // Capacitor WebView 中 location.href 比 reload() 更可靠
    window.location.href = window.location.origin + window.location.pathname;
  };

  OTAModule.getLastCheckTime = function () { return localStorage.getItem(UPDATE_CHECK_KEY) || ''; };

  OTAModule.autoCheck = function () {
    // 更新后 5 分钟内不再弹窗（防止重复弹窗）
    var lastCheck = localStorage.getItem(UPDATE_CHECK_KEY);
    if (lastCheck) {
      var elapsed = Date.now() - new Date(lastCheck).getTime();
      if (elapsed < 5 * 60 * 1000) return;
    }

    OTAModule.checkForUpdate().then(function (update) {
      if (update && update.version) _showUpdateModal(update);
    });
  };

  function _showUpdateModal(update) {
    var changelogHtml = '';
    if (update.changelog) {
      var items = update.changelog.split(/[;；\n]/);
      changelogHtml = '<div style="margin-top:10px;text-align:left;font-size:13px;color:var(--text-secondary);line-height:1.8;">';
      changelogHtml += '<div style="font-weight:600;color:var(--text);margin-bottom:4px;">更新内容：</div>';
      items.forEach(function (item) {
        var t = item.trim();
        if (t) changelogHtml += '<div>· ' + t + '</div>';
      });
      changelogHtml += '</div>';
    }
    if (window.UIModule && window.UIModule.showModal) {
      window.UIModule.showModal(
        '发现新版本 v' + update.version,
        '<div style="text-align:center;"><div style="font-size:36px;font-weight:700;color:var(--primary);">v' + update.version + '</div>' + changelogHtml + '</div>',
        function () {
          OTAModule.applyUpdate(update).then(function (success) {
            if (success) {
              window.UIModule.showToast('更新成功，即将重启...');
              setTimeout(function () { OTAModule.reloadApp(); }, 1500);
            } else {
              window.UIModule.showToast('更新失败，请重试');
            }
          });
        },
        '立即更新'
      );
    }
  }

  function _compareVersions(v1, v2) {
    var p1 = v1.split('.').map(Number), p2 = v2.split('.').map(Number);
    var len = Math.max(p1.length, p2.length);
    for (var i = 0; i < len; i++) {
      var a = p1[i] || 0, b = p2[i] || 0;
      if (a > b) return 1; if (a < b) return -1;
    }
    return 0;
  }

  window.OTAModule = OTAModule;
})();
