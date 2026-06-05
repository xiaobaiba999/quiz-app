// 刷题助手 - OTA 热更新模块

(function () {
  'use strict';

  var OTAModule = {};

  var VERSION_KEY = 'quiz_app_version';
  var UPDATE_CHECK_KEY = 'quiz_last_update_check';
  var CURRENT_VERSION = '2.10.0';

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
      return { _current: true, localVersion: CURRENT_VERSION };
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
   * 带进度提示和CDN缓存验证，验证失败时自动回退GitHub Pages
   */
  function _directUpdateCache(updateInfo, _retryWithGithubPages) {
    if (!('caches' in window)) return Promise.resolve(true);

    var fileKeys = Object.keys(updateInfo.files);
    var totalFiles = fileKeys.length;
    var completedFiles = 0;
    var failedFiles = 0;
    var _toastTimer = null;
    var downloadedTexts = {}; // 先暂存下载内容，验证通过后再写入缓存

    // 如果是回退模式，只使用GitHub Pages地址
    var baseUrls = _retryWithGithubPages
      ? ['https://xiaobaiba999.github.io/quiz-app/']
      : FILE_BASE_URLS;

    function _showProgress() {
      if (_toastTimer) clearTimeout(_toastTimer);
      _toastTimer = setTimeout(function () {
        var source = _retryWithGithubPages ? '（GitHub回退）' : '';
        window.UIModule && window.UIModule.showToast('正在下载 ' + completedFiles + '/' + totalFiles + ' 个文件' + source + '...', 2000);
      }, 100);
    }

    _showProgress();

    // 第一步：下载所有文件内容（暂存，不写入缓存）
    var downloadPromises = fileKeys.map(function (filePath) {
      var fileUrl = updateInfo.files[filePath];
      if (!fileUrl) return Promise.resolve();

      var downloadUrls = fileUrl.startsWith('http')
        ? [fileUrl]
        : baseUrls.map(function (base) { return base + fileUrl; });

      return _httpGetTextWithFallback(downloadUrls).then(function (text) {
        completedFiles++;
        _showProgress();
        downloadedTexts[filePath] = text;
      }).catch(function () {
        failedFiles++;
        completedFiles++;
        _showProgress();
      });
    });

    return Promise.all(downloadPromises).then(function () {
      // 第二步：验证下载的ota.js是否包含新版本号
      var otaText = downloadedTexts['ota.js'];
      if (!otaText) {
        // ota.js下载失败，尝试GitHub Pages回退
        if (!_retryWithGithubPages) {
          window.UIModule && window.UIModule.showToast('CDN下载失败，尝试GitHub回退...', 2000);
          return _directUpdateCache(updateInfo, true);
        }
        window.UIModule && window.UIModule.showToast('下载失败，请重试', 3000);
        return false;
      }

      var match = otaText.match(/CURRENT_VERSION\s*=\s*['"]([^'"]+)['"]/);
      var verified = match && match[1] === updateInfo.version;

      if (!verified) {
        // CDN缓存未更新，如果不是回退模式，自动尝试GitHub Pages
        if (!_retryWithGithubPages) {
          window.UIModule && window.UIModule.showToast('CDN缓存未更新，尝试GitHub回退...', 2000);
          return _directUpdateCache(updateInfo, true);
        }
        // GitHub Pages也验证失败，显示警告
        _showCDNCacheWarning(updateInfo.version);
        return false;
      }

      // 第三步：验证通过，写入缓存（同时写入OTA缓存和应用缓存，确保万无一失）
      return caches.open(OTA_CACHE).then(function (otaCache) {
        var writePromises = Object.keys(downloadedTexts).map(function (filePath) {
          var text = downloadedTexts[filePath];
          var ct = 'text/plain';
          if (filePath.endsWith('.js')) ct = 'application/javascript';
          else if (filePath.endsWith('.css')) ct = 'text/css';
          else if (filePath.endsWith('.html')) ct = 'text/html';
          else if (filePath.endsWith('.json')) ct = 'application/json';

          // 同时写入两种URL格式，确保SW能匹配到
          var req1 = new Request(window.location.origin + '/' + filePath);
          var req2 = new Request('/' + filePath);
          var resp1 = new Response(text, { status: 200, headers: { 'Content-Type': ct } });
          var resp2 = new Response(text, { status: 200, headers: { 'Content-Type': ct } });
          return otaCache.put(req1, resp1).then(function () {
            return otaCache.put(req2, resp2);
          });
        });

        return Promise.all(writePromises).then(function () {
          // 也写入当前应用缓存，确保即使SW策略不读OTA缓存也能生效
          return caches.keys().then(function (cacheNames) {
            var appCacheName = cacheNames.find(function (n) { return n.startsWith('quiz-app-v'); });
            if (!appCacheName) return;
            return caches.open(appCacheName).then(function (appCache) {
              var appWritePromises = Object.keys(downloadedTexts).map(function (filePath) {
                var text = downloadedTexts[filePath];
                var ct = 'text/plain';
                if (filePath.endsWith('.js')) ct = 'application/javascript';
                else if (filePath.endsWith('.css')) ct = 'text/css';
                else if (filePath.endsWith('.html')) ct = 'text/html';
                else if (filePath.endsWith('.json')) ct = 'application/json';

                var req1 = new Request(window.location.origin + '/' + filePath);
                var req2 = new Request('/' + filePath);
                var resp1 = new Response(text, { status: 200, headers: { 'Content-Type': ct } });
                var resp2 = new Response(text, { status: 200, headers: { 'Content-Type': ct } });
                return appCache.put(req1, resp1).then(function () {
                  return appCache.put(req2, resp2);
                });
              });
              return Promise.all(appWritePromises);
            });
          });
        }).then(function () {
          localStorage.setItem(VERSION_KEY, updateInfo.version);
          // 通知Service Worker跳过等待立即激活
          if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
          }
          if (failedFiles > 0) {
            window.UIModule && window.UIModule.showToast('更新完成（' + failedFiles + '个文件下载失败）', 3000);
          }
          return failedFiles === 0;
        });
      });
    }).catch(function () { return false; });
  }

  /**
   * 显示CDN缓存未更新的警告
   */
  function _showCDNCacheWarning(targetVersion) {
    var msg = '注意：jsDelivr CDN 缓存可能尚未更新，下载的文件可能仍为旧版本。' +
      'CDN 通常需要 0~24 小时同步最新文件。' +
      '建议等待一段时间后再次检查更新，或访问 jsdelivr.net/cache 手动刷新缓存。';
    if (window.UIModule && window.UIModule.showModal) {
      window.UIModule.showModal(
        'CDN 缓存延迟提示',
        '<div style="text-align:left;font-size:13px;line-height:1.8;">' +
          '<div style="font-weight:600;color:var(--warning);margin-bottom:8px;">⚠ 检测到CDN缓存延迟</div>' +
          '<div>目标版本：<strong>v' + targetVersion + '</strong></div>' +
          '<div style="margin-top:8px;">jsDelivr CDN 缓存可能尚未更新，下载的文件可能仍为旧版本代码。</div>' +
          '<div style="margin-top:8px;color:var(--text-secondary);">· CDN 通常需要 <strong>0~24 小时</strong>同步最新文件</div>' +
          '<div style="color:var(--text-secondary);">· 等待后再次「检查更新」即可获取新版本</div>' +
          '<div style="color:var(--text-secondary);">· 也可访问 <strong>purge.jsdelivr.net</strong> 手动刷新缓存</div>' +
        '</div>',
        null,
        '我知道了'
      );
    }
  }

  var CACHE_NAME = 'quiz-app-v' + CURRENT_VERSION.replace(/\./g, '');

  OTAModule.reloadApp = function () {
    // 先尝试更新Service Worker，然后强制刷新
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
    }
    // 注册新的SW以触发更新
    if (navigator.serviceWorker) {
      navigator.serviceWorker.getRegistration().then(function (reg) {
        if (reg) {
          reg.update().then(function () {
            // 等SW更新完成后再刷新页面
            setTimeout(function () {
              window.location.href = window.location.origin + window.location.pathname;
            }, 1000);
          });
        } else {
          window.location.href = window.location.origin + window.location.pathname;
        }
      }).catch(function () {
        window.location.href = window.location.origin + window.location.pathname;
      });
    } else {
      window.location.href = window.location.origin + window.location.pathname;
    }
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
    var cdnHint = '<div style="margin-top:10px;padding:8px 10px;background:var(--bg-secondary);border-radius:6px;font-size:12px;color:var(--text-hint);line-height:1.6;">' +
      '提示：更新文件通过 jsDelivr CDN 分发，CDN 缓存可能需要 0~24 小时同步。' +
      '如果更新后版本号未变化，请等待后再次检查更新。</div>';
    if (window.UIModule && window.UIModule.showModal) {
      window.UIModule.showModal(
        '发现新版本 v' + update.version,
        '<div style="text-align:center;"><div style="font-size:36px;font-weight:700;color:var(--primary);">v' + update.version + '</div>' + changelogHtml + cdnHint + '</div>',
        function () {
          // 关闭弹窗后开始更新
          window.UIModule.showToast('开始下载更新文件...', 3000);
          OTAModule.applyUpdate(update).then(function (success) {
            if (success) {
              window.UIModule.showToast('更新成功，即将重启...', 2000);
              setTimeout(function () { OTAModule.reloadApp(); }, 2000);
            } else {
              window.UIModule.showToast('部分文件更新失败，请稍后重试', 3000);
            }
          });
        },
        '立即更新'
      );
    }
  }

  // 暴露给外部调用（首页检查更新按钮）
  OTAModule._showUpdateModalDirect = _showUpdateModal;

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
