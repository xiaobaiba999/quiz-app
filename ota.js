// 刷题助手 - OTA 热更新模块

(function () {
  'use strict';

  var OTAModule = {};

  var VERSION_KEY = 'quiz_app_version';
  var UPDATE_CHECK_KEY = 'quiz_last_update_check';
  var CURRENT_VERSION = '2.3.0';

  // OTA 清单地址：优先 jsDelivr（国内可访问），回退 GitHub Pages
  var MANIFEST_URLS = [
    'https://cdn.jsdelivr.net/gh/xiaobaiba999/quiz-app@main/www/manifest-ota.json',
    'https://xiaobaiba999.github.io/quiz-app/manifest-ota.json'
  ];

  // 文件下载基础路径：优先 jsDelivr，回退 GitHub Pages
  var FILE_BASE_URLS = [
    'https://cdn.jsdelivr.net/gh/xiaobaiba999/quiz-app@main/www/',
    'https://xiaobaiba999.github.io/quiz-app/'
  ];

  /**
   * 带自动回退的 HTTP GET JSON
   * 依次尝试多个 URL，第一个成功即返回
   */
  function _httpGetJsonWithFallback(urls) {
    if (!urls || urls.length === 0) {
      return Promise.reject(new Error('无可用地址'));
    }

    var url = urls[0] + '?t=' + Date.now();
    return _httpGetJson(url).catch(function () {
      // 第一个 URL 失败，尝试下一个
      if (urls.length > 1) {
        return _httpGetJsonWithFallback(urls.slice(1));
      }
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
    return _httpGetText(url).catch(function () {
      if (urls.length > 1) {
        return _httpGetTextWithFallback(urls.slice(1));
      }
      throw new Error('下载失败');
    });
  }

  /**
   * HTTP GET JSON（单 URL）
   */
  function _httpGetJson(url) {
    // 优先使用 Capacitor 原生 HTTP 插件
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp) {
      var httpPlugin = window.Capacitor.Plugins.CapacitorHttp;
      if (httpPlugin.get) {
        return httpPlugin.get({ url: url }).then(function (res) {
          if (res.status < 200 || res.status >= 300) throw new Error('HTTP ' + res.status);
          var data = res.data;
          if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch (e) { throw new Error('JSON解析失败'); }
          }
          return data;
        });
      }
    }

    // 回退：fetch（CapacitorHttp 启用后会被 patch 为原生 HTTP）
    return fetch(url, { cache: 'no-cache' }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    });
  }

  /**
   * HTTP GET Text（单 URL）
   */
  function _httpGetText(url) {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp) {
      var httpPlugin = window.Capacitor.Plugins.CapacitorHttp;
      if (httpPlugin.get) {
        return httpPlugin.get({ url: url }).then(function (res) {
          if (res.status < 200 || res.status >= 300) throw new Error('HTTP ' + res.status);
          return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        });
      }
    }

    return fetch(url, { cache: 'no-cache' }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.text();
    });
  }

  /**
   * 获取当前版本号
   */
  OTAModule.getCurrentVersion = function () {
    return CURRENT_VERSION;
  };

  /**
   * 获取配置的清单地址（用户自定义优先）
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
   * 检查更新（自动回退多个 CDN 地址）
   */
  OTAModule.checkForUpdate = function () {
    // 构建尝试的 URL 列表
    var customUrl = localStorage.getItem('quiz_ota_manifest_url');
    var urls;
    if (customUrl) {
      urls = [customUrl];
    } else {
      urls = MANIFEST_URLS.slice();
    }

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
    if (!updateInfo) {
      return Promise.reject(new Error('无效的更新信息'));
    }

    // 通过 Service Worker 更新
    if (updateInfo.updateUrl && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
      return new Promise(function (resolve) {
        var messageChannel = new MessageChannel();

        messageChannel.port1.onmessage = function (event) {
          if (event.data && event.data.type === 'UPDATE_APPLIED') {
            localStorage.setItem(VERSION_KEY, updateInfo.version);
            resolve(true);
          } else if (event.data && event.data.type === 'UPDATE_FAILED') {
            resolve(false);
          }
        };

        navigator.serviceWorker.controller.postMessage({
          type: 'APPLY_UPDATE',
          updateUrl: updateInfo.updateUrl,
          version: updateInfo.version
        }, [messageChannel.port2]);

        setTimeout(function () { resolve(false); }, 30000);
      });
    }

    // 直接更新缓存
    if (updateInfo.files && Object.keys(updateInfo.files).length > 0) {
      return _directUpdateCache(updateInfo);
    }

    return Promise.resolve(true);
  };

  /**
   * 直接更新缓存中的文件（使用 jsDelivr CDN 下载）
   */
  function _directUpdateCache(updateInfo) {
    if (!('caches' in window)) {
      return Promise.resolve(true);
    }

    return caches.open(CACHE_NAME).then(function (cache) {
      var promises = Object.keys(updateInfo.files).map(function (filePath) {
        var fileUrl = updateInfo.files[filePath];
        if (!fileUrl) return Promise.resolve();

        // 构建多个下载地址（jsDelivr 优先，GitHub Pages 回退）
        var downloadUrls;
        if (fileUrl.startsWith('http')) {
          downloadUrls = [fileUrl];
        } else {
          downloadUrls = FILE_BASE_URLS.map(function (base) { return base + fileUrl; });
        }

        return _httpGetTextWithFallback(downloadUrls).then(function (text) {
          var contentType = 'text/plain';
          if (filePath.endsWith('.js')) contentType = 'application/javascript';
          else if (filePath.endsWith('.css')) contentType = 'text/css';
          else if (filePath.endsWith('.html')) contentType = 'text/html';
          else if (filePath.endsWith('.json')) contentType = 'application/json';

          var response = new Response(text, {
            status: 200,
            headers: { 'Content-Type': contentType }
          });
          return cache.put(new Request('/' + filePath), response);
        }).catch(function () {
          // 单个文件更新失败不中断
        });
      });

      return Promise.all(promises).then(function () {
        localStorage.setItem(VERSION_KEY, updateInfo.version);
        return true;
      });
    }).catch(function () {
      return false;
    });
  }

  var CACHE_NAME = 'quiz-app-v' + CURRENT_VERSION.replace(/\./g, '');

  /**
   * 立即刷新页面以应用更新
   */
  OTAModule.reloadApp = function () {
    window.location.reload(true);
  };

  /**
   * 获取上次检查更新的时间
   */
  OTAModule.getLastCheckTime = function () {
    return localStorage.getItem(UPDATE_CHECK_KEY) || '';
  };

  /**
   * 自动检查更新（启动时弹窗提示）
   */
  OTAModule.autoCheck = function () {
    OTAModule.checkForUpdate().then(function (update) {
      if (update && update.version) {
        _showUpdateModal(update);
      }
    });
  };

  // ===== 显示更新弹窗 =====
  function _showUpdateModal(update) {
    var changelogHtml = '';
    if (update.changelog) {
      var items = update.changelog.split(/[;；\n]/);
      changelogHtml = '<div style="margin-top:10px;text-align:left;font-size:13px;color:var(--text-secondary);line-height:1.8;">';
      changelogHtml += '<div style="font-weight:600;color:var(--text);margin-bottom:4px;">更新内容：</div>';
      items.forEach(function (item) {
        var trimmed = item.trim();
        if (trimmed) changelogHtml += '<div>· ' + trimmed + '</div>';
      });
      changelogHtml += '</div>';
    }

    if (window.UIModule && window.UIModule.showModal) {
      window.UIModule.showModal(
        '发现新版本 v' + update.version,
        '<div style="text-align:center;">' +
          '<div style="font-size:36px;font-weight:700;color:var(--primary);">v' + update.version + '</div>' +
          changelogHtml +
        '</div>',
        function () {
          OTAModule.applyUpdate(update).then(function (success) {
            if (success) {
              window.UIModule.showToast('更新成功，即将重启...');
              setTimeout(function () {
                OTAModule.reloadApp();
              }, 1500);
            } else {
              window.UIModule.showToast('更新失败，请重试');
            }
          });
        },
        '立即更新'
      );
    }
  }

  // ===== 版本号比较 =====
  function _compareVersions(v1, v2) {
    var parts1 = v1.split('.').map(Number);
    var parts2 = v2.split('.').map(Number);
    var len = Math.max(parts1.length, parts2.length);

    for (var i = 0; i < len; i++) {
      var a = parts1[i] || 0;
      var b = parts2[i] || 0;
      if (a > b) return 1;
      if (a < b) return -1;
    }
    return 0;
  }

  window.OTAModule = OTAModule;
})();
