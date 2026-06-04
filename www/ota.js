// 刷题助手 - OTA 热更新模块

(function () {
  'use strict';

  var OTAModule = {};

  var VERSION_KEY = 'quiz_app_version';
  var UPDATE_CHECK_KEY = 'quiz_last_update_check';
  var CURRENT_VERSION = '2.3.0';

  var DEFAULT_MANIFEST_URL = 'https://xiaobaiba999.github.io/quiz-app/manifest-ota.json';

  /**
   * 跨域安全的 HTTP GET（获取 JSON）
   * 当 CapacitorHttp 启用时，fetch 会被自动 patch 走原生 HTTP，无 CORS 限制
   * 浏览器环境直接用 fetch（GitHub Pages 有 CORS 头）
   */
  function _httpGetJson(url) {
    // 优先使用 Capacitor 原生 HTTP 插件
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp) {
      var httpPlugin = window.Capacitor.Plugins.CapacitorHttp;
      if (httpPlugin.get) {
        return httpPlugin.get({ url: url }).then(function (res) {
          if (res.status < 200 || res.status >= 300) {
            throw new Error('HTTP ' + res.status);
          }
          var data = res.data;
          if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch (e) {
              throw new Error('JSON解析失败');
            }
          }
          return data;
        });
      }
      if (httpPlugin.request) {
        return httpPlugin.request({
          url: url,
          method: 'GET'
        }).then(function (res) {
          if (res.status < 200 || res.status >= 300) {
            throw new Error('HTTP ' + res.status);
          }
          var data = res.data;
          if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch (e) {
              throw new Error('JSON解析失败');
            }
          }
          return data;
        });
      }
    }

    // 回退：标准 fetch（CapacitorHttp 启用后会被 patch 为原生 HTTP）
    return fetch(url, { cache: 'no-cache' }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    });
  }

  /**
   * 跨域安全的 HTTP GET（获取文本，用于缓存更新）
   */
  function _httpGetText(url) {
    // 优先使用 Capacitor 原生 HTTP 插件
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp) {
      var httpPlugin = window.Capacitor.Plugins.CapacitorHttp;
      if (httpPlugin.get) {
        return httpPlugin.get({ url: url }).then(function (res) {
          if (res.status < 200 || res.status >= 300) {
            throw new Error('HTTP ' + res.status);
          }
          return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        });
      }
      if (httpPlugin.request) {
        return httpPlugin.request({
          url: url,
          method: 'GET'
        }).then(function (res) {
          if (res.status < 200 || res.status >= 300) {
            throw new Error('HTTP ' + res.status);
          }
          return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        });
      }
    }

    // 回退：标准 fetch
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
   * 获取配置的清单地址
   */
  OTAModule.getManifestUrl = function () {
    return localStorage.getItem('quiz_ota_manifest_url') || DEFAULT_MANIFEST_URL;
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
    var manifestUrl = OTAModule.getManifestUrl();
    if (!manifestUrl) {
      return Promise.resolve(null);
    }

    var fullUrl = manifestUrl + '?t=' + Date.now();
    return _httpGetJson(fullUrl).then(function (manifest) {
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

    // 方式1：通过 Service Worker 更新
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

    // 方式2：直接更新缓存
    if (updateInfo.files && Object.keys(updateInfo.files).length > 0) {
      return _directUpdateCache(updateInfo);
    }

    return Promise.resolve(true);
  };

  /**
   * 直接更新缓存中的文件
   */
  function _directUpdateCache(updateInfo) {
    if (!('caches' in window)) {
      return Promise.resolve(true);
    }

    var baseUrl = OTAModule.getManifestUrl();
    baseUrl = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);

    return caches.open(CACHE_NAME).then(function (cache) {
      var promises = Object.keys(updateInfo.files).map(function (filePath) {
        var fileUrl = updateInfo.files[filePath];
        if (fileUrl && !fileUrl.startsWith('http')) {
          fileUrl = baseUrl + fileUrl;
        }
        if (!fileUrl) return Promise.resolve();

        return _httpGetText(fileUrl + '?t=' + Date.now()).then(function (text) {
          var response = new Response(text, {
            status: 200,
            headers: { 'Content-Type': 'application/javascript' }
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
    var manifestUrl = OTAModule.getManifestUrl();
    if (!manifestUrl) return;

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
