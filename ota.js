// 鍒烽鍔╂墜 - OTA 鐑洿鏂版ā鍧?
(function () {
  'use strict';

  var OTAModule = {};

  var VERSION_KEY = 'quiz_app_version';
  var UPDATE_CHECK_KEY = 'quiz_last_update_check';
  var CURRENT_VERSION = '2.12.0';

  // OTA 娓呭崟鍦板潃锛氫紭鍏?jsDelivr锛堝浗鍐呭彲璁块棶锛夛紝鍥為€€ GitHub Raw
  var MANIFEST_URLS = [
    'https://cdn.jsdelivr.net/gh/xiaobaiba999/quiz-app@main/www/manifest-ota.json',
    'https://raw.githubusercontent.com/xiaobaiba999/quiz-app/main/www/manifest-ota.json'
  ];

  // 鏂囦欢涓嬭浇鍩虹璺緞
  var FILE_BASE_URLS = [
    'https://cdn.jsdelivr.net/gh/xiaobaiba999/quiz-app@main/www/',
    'https://raw.githubusercontent.com/xiaobaiba999/quiz-app/main/www/'
  ];

  // GitHub Pages 鍥為€€鍦板潃锛圕DN楠岃瘉澶辫触鏃朵娇鐢級
  var GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/xiaobaiba999/quiz-app/main/www/';

  /**
   * 甯﹁嚜鍔ㄥ洖閫€鐨?HTTP GET JSON
   */
  function _httpGetJsonWithFallback(urls) {
    if (!urls || urls.length === 0) {
      return Promise.reject(new Error('鏃犲彲鐢ㄥ湴鍧€'));
    }
    var url = urls[0] + '?t=' + Date.now();
    return fetch(url, { mode: 'cors', cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .catch(function () {
        if (urls.length > 1) return _httpGetJsonWithFallback(urls.slice(1));
        throw new Error('鎵€鏈夊湴鍧€鍧囨棤娉曡闂?);
      });
  }

  /**
   * 甯﹁嚜鍔ㄥ洖閫€鐨?HTTP GET Text
   */
  function _httpGetTextWithFallback(urls) {
    if (!urls || urls.length === 0) {
      return Promise.reject(new Error('鏃犲彲鐢ㄥ湴鍧€'));
    }
    var url = urls[0] + '?t=' + Date.now();
    return fetch(url, { mode: 'cors', cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .catch(function () {
        if (urls.length > 1) return _httpGetTextWithFallback(urls.slice(1));
        throw new Error('涓嬭浇澶辫触');
      });
  }

  /**
   * 鑾峰彇褰撳墠鐗堟湰鍙?   */
  OTAModule.getCurrentVersion = function () {
    return CURRENT_VERSION;
  };

  /**
   * 鑾峰彇閰嶇疆鐨勬竻鍗曞湴鍧€
   */
  OTAModule.getManifestUrl = function () {
    return localStorage.getItem('quiz_ota_manifest_url') || MANIFEST_URLS[0];
  };

  /**
   * 璁剧疆娓呭崟鍦板潃
   */
  OTAModule.setManifestUrl = function (url) {
    if (url && url.trim()) {
      localStorage.setItem('quiz_ota_manifest_url', url.trim());
    } else {
      localStorage.removeItem('quiz_ota_manifest_url');
    }
  };

  /**
   * 妫€鏌ユ洿鏂帮紙甯DN缂撳瓨妫€娴嬶細濡傛灉杩斿洖鐗堟湰姣斿綋鍓嶈繕鏃э紝璇存槑CDN缂撳瓨鏈洿鏂帮紝鑷姩鍥為€€涓嬩竴涓猆RL锛?   */
  OTAModule.checkForUpdate = function () {
    var customUrl = localStorage.getItem('quiz_ota_manifest_url');
    var urls = customUrl ? [customUrl] : MANIFEST_URLS.slice();

    return _checkWithFallback(urls, 0);
  };

  function _checkWithFallback(urls, index) {
    if (index >= urls.length) {
      return { _error: '鎵€鏈夊湴鍧€鍧囪繑鍥炴棫鐗堟湰锛孋DN缂撳瓨鍙兘灏氭湭鏇存柊锛岃绋嶅悗閲嶈瘯' };
    }
    var url = urls[index] + '?t=' + Date.now();
    return fetch(url, { mode: 'cors', cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (manifest) {
        if (!manifest.version) return { _error: '娓呭崟缂哄皯鐗堟湰鍙? };

        var cmp = _compareVersions(manifest.version, CURRENT_VERSION);
        if (cmp > 0) {
          // 鍙戠幇鏂扮増鏈?          localStorage.setItem(UPDATE_CHECK_KEY, new Date().toISOString());
          return {
            version: manifest.version,
            changelog: manifest.changelog || '',
            updateUrl: manifest.updateUrl || '',
            files: manifest.files || [],
            forceUpdate: manifest.forceUpdate || false
          };
        }

        // CDN杩斿洖鐨勭増鏈?<= 褰撳墠鐗堟湰锛屽彲鑳芥槸CDN缂撳瓨鏈洿鏂?        // 濡傛灉杩樻湁鍥為€€URL锛屽皾璇曚笅涓€涓?        if (index < urls.length - 1) {
          console.log('[OTA] ' + urls[index] + ' 杩斿洖鐗堟湰 ' + manifest.version + ' <= 褰撳墠 ' + CURRENT_VERSION + '锛屽皾璇曞洖閫€');
          return _checkWithFallback(urls, index + 1);
        }

        // 鎵€鏈塙RL閮借繑鍥炴棫鐗堟湰锛岃鏄庣‘瀹炴槸鏈€鏂扮増
        localStorage.setItem(UPDATE_CHECK_KEY, new Date().toISOString());
        return { _current: true, localVersion: CURRENT_VERSION };
      })
      .catch(function (err) {
        // 璇锋眰澶辫触锛屽皾璇曚笅涓€涓猆RL
        if (index < urls.length - 1) {
          console.log('[OTA] ' + urls[index] + ' 璇锋眰澶辫触: ' + err.message + '锛屽皾璇曞洖閫€');
          return _checkWithFallback(urls, index + 1);
        }
        localStorage.setItem(UPDATE_CHECK_KEY, new Date().toISOString());
        return { _error: err.message || '缃戠粶閿欒' };
      });
  }

  /**
   * 搴旂敤鏇存柊
   */
  OTAModule.applyUpdate = function (updateInfo) {
    if (!updateInfo) return Promise.reject(new Error('鏃犳晥鐨勬洿鏂颁俊鎭?));

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

  var OTA_KEY = 'quiz_ota_files';
  var OTA_VER_KEY = 'quiz_ota_version';

  /**
   * 鐩存帴鏇存柊锛氫笅杞芥枃浠跺瓨鍏ocalStorage锛屽埛鏂板悗鐢監TA鍔犺浇鍣ㄥ姩鎬佹敞鍏?   * 甯﹁繘搴︽彁绀哄拰CDN缂撳瓨楠岃瘉锛岄獙璇佸け璐ユ椂鑷姩鍥為€€GitHub Raw
   */
  function _directUpdateCache(updateInfo, _retryWithGithubPages) {
    var fileKeys = Object.keys(updateInfo.files);
    var totalFiles = fileKeys.length;
    var completedFiles = 0;
    var failedFiles = 0;
    var _toastTimer = null;
    var downloadedTexts = {};

    // 濡傛灉鏄洖閫€妯″紡锛屽彧浣跨敤GitHub Raw鍦板潃
    var baseUrls = _retryWithGithubPages
      ? [GITHUB_RAW_BASE]
      : FILE_BASE_URLS;

    function _showProgress() {
      if (_toastTimer) clearTimeout(_toastTimer);
      _toastTimer = setTimeout(function () {
        var source = _retryWithGithubPages ? '锛圙itHub Raw鍥為€€锛? : '';
        window.UIModule && window.UIModule.showToast('姝ｅ湪涓嬭浇 ' + completedFiles + '/' + totalFiles + ' 涓枃浠? + source + '...', 2000);
      }, 100);
    }

    _showProgress();

    // 绗竴姝ワ細涓嬭浇鎵€鏈夋枃浠跺唴瀹?    var downloadPromises = fileKeys.map(function (filePath) {
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
      // 绗簩姝ワ細楠岃瘉涓嬭浇鐨刼ta.js鏄惁鍖呭惈鏂扮増鏈彿
      var otaText = downloadedTexts['ota.js'];
      if (!otaText) {
        if (!_retryWithGithubPages) {
          window.UIModule && window.UIModule.showToast('CDN涓嬭浇澶辫触锛屽皾璇旼itHub Raw鍥為€€...', 2000);
          return _directUpdateCache(updateInfo, true);
        }
        window.UIModule && window.UIModule.showToast('涓嬭浇澶辫触锛岃閲嶈瘯', 3000);
        return false;
      }

      var match = otaText.match(/CURRENT_VERSION\s*=\s*['"]([^'"]+)['"]/);
      var downloadedVersion = match ? match[1] : null;
      var verified = downloadedVersion && _compareVersions(downloadedVersion, CURRENT_VERSION) > 0;

      if (!verified) {
        if (!_retryWithGithubPages) {
          window.UIModule && window.UIModule.showToast('CDN缂撳瓨鏈洿鏂帮紝灏濊瘯GitHub Raw鍥為€€...', 2000);
          return _directUpdateCache(updateInfo, true);
        }
        _showCDNCacheWarning(updateInfo.version);
        return false;
      }

      // 浣跨敤涓嬭浇鏂囦欢涓殑瀹為檯鐗堟湰鍙?      var actualVersion = downloadedVersion || updateInfo.version;

      // 绗笁姝ワ細瀛樺叆localStorage锛屽埛鏂板悗鐢監TA鍔犺浇鍣ㄨ鍙栧苟娉ㄥ叆
      try {
        localStorage.setItem(OTA_KEY, JSON.stringify(downloadedTexts));
        localStorage.setItem(OTA_VER_KEY, actualVersion);
        localStorage.setItem(VERSION_KEY, actualVersion);
      } catch (e) {
        // localStorage鍙兘绌洪棿涓嶈冻锛屽皾璇曞彧瀛樺叧閿甁S鏂囦欢
        window.UIModule && window.UIModule.showToast('瀛樺偍绌洪棿涓嶈冻锛屽皾璇曠簿绠€瀛樺偍...', 2000);
        var essential = {};
        var essentialFiles = ['ota.js', 'app.js', 'db.js', 'auth.js', 'router.js'];
        for (var i = 0; i < essentialFiles.length; i++) {
          if (downloadedTexts[essentialFiles[i]]) {
            essential[essentialFiles[i]] = downloadedTexts[essentialFiles[i]];
          }
        }
        try {
          localStorage.setItem(OTA_KEY, JSON.stringify(essential));
          localStorage.setItem(OTA_VER_KEY, actualVersion);
          localStorage.setItem(VERSION_KEY, actualVersion);
        } catch (e2) {
          window.UIModule && window.UIModule.showToast('瀛樺偍绌洪棿涓嶈冻锛屾洿鏂板け璐?, 3000);
          return false;
        }
      }

      if (failedFiles > 0) {
        window.UIModule && window.UIModule.showToast('鏇存柊瀹屾垚锛? + failedFiles + '涓枃浠朵笅杞藉け璐ワ級', 3000);
      }
      return failedFiles === 0;
    }).catch(function () { return false; });
  }

  /**
   * 鏄剧ずCDN缂撳瓨鏈洿鏂扮殑璀﹀憡
   */
  function _showCDNCacheWarning(targetVersion) {
    var msg = '娉ㄦ剰锛歫sDelivr CDN 缂撳瓨鍙兘灏氭湭鏇存柊锛屼笅杞界殑鏂囦欢鍙兘浠嶄负鏃х増鏈€? +
      'CDN 閫氬父闇€瑕?0~24 灏忔椂鍚屾鏈€鏂版枃浠躲€? +
      '寤鸿绛夊緟涓€娈垫椂闂村悗鍐嶆妫€鏌ユ洿鏂帮紝鎴栬闂?jsdelivr.net/cache 鎵嬪姩鍒锋柊缂撳瓨銆?;
    if (window.UIModule && window.UIModule.showModal) {
      window.UIModule.showModal(
        'CDN 缂撳瓨寤惰繜鎻愮ず',
        '<div style="text-align:left;font-size:13px;line-height:1.8;">' +
          '<div style="font-weight:600;color:var(--warning);margin-bottom:8px;">鈿?妫€娴嬪埌CDN缂撳瓨寤惰繜</div>' +
          '<div>鐩爣鐗堟湰锛?strong>v' + targetVersion + '</strong></div>' +
          '<div style="margin-top:8px;">jsDelivr CDN 缂撳瓨鍙兘灏氭湭鏇存柊锛屼笅杞界殑鏂囦欢鍙兘浠嶄负鏃х増鏈唬鐮併€?/div>' +
          '<div style="margin-top:8px;color:var(--text-secondary);">路 CDN 閫氬父闇€瑕?<strong>0~24 灏忔椂</strong>鍚屾鏈€鏂版枃浠?/div>' +
          '<div style="color:var(--text-secondary);">路 绛夊緟鍚庡啀娆°€屾鏌ユ洿鏂般€嶅嵆鍙幏鍙栨柊鐗堟湰</div>' +
          '<div style="color:var(--text-secondary);">路 涔熷彲璁块棶 <strong>purge.jsdelivr.net</strong> 鎵嬪姩鍒锋柊缂撳瓨</div>' +
        '</div>',
        null,
        '鎴戠煡閬撲簡'
      );
    }
  }

  var CACHE_NAME = 'quiz-app-v' + CURRENT_VERSION.replace(/\./g, '');

  OTAModule.reloadApp = function () {
    // OTA鏂囦欢宸插瓨鍏ocalStorage锛岀洿鎺ュ埛鏂伴〉闈㈠嵆鍙?    // OTA鍔犺浇鍣ㄤ細鍦ㄩ〉闈㈠姞杞芥椂鑷姩娉ㄥ叆鏂颁唬鐮?    window.location.reload(true);
  };

  OTAModule.getLastCheckTime = function () { return localStorage.getItem(UPDATE_CHECK_KEY) || ''; };

  OTAModule.autoCheck = function () {
    // 鏇存柊鍚?5 鍒嗛挓鍐呬笉鍐嶅脊绐楋紙闃叉閲嶅寮圭獥锛?    var lastCheck = localStorage.getItem(UPDATE_CHECK_KEY);
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
      var items = update.changelog.split(/[;锛沑n]/);
      changelogHtml = '<div style="margin-top:10px;text-align:left;font-size:13px;color:var(--text-secondary);line-height:1.8;">';
      changelogHtml += '<div style="font-weight:600;color:var(--text);margin-bottom:4px;">鏇存柊鍐呭锛?/div>';
      items.forEach(function (item) {
        var t = item.trim();
        if (t) changelogHtml += '<div>路 ' + t + '</div>';
      });
      changelogHtml += '</div>';
    }
    var cdnHint = '<div style="margin-top:10px;padding:8px 10px;background:var(--bg-secondary);border-radius:6px;font-size:12px;color:var(--text-hint);line-height:1.6;">' +
      '鎻愮ず锛氭洿鏂版枃浠堕€氳繃 jsDelivr CDN 鍒嗗彂锛孋DN 缂撳瓨鍙兘闇€瑕?0~24 灏忔椂鍚屾銆? +
      '濡傛灉鏇存柊鍚庣増鏈彿鏈彉鍖栵紝璇风瓑寰呭悗鍐嶆妫€鏌ユ洿鏂般€?/div>';
    if (window.UIModule && window.UIModule.showModal) {
      window.UIModule.showModal(
        '鍙戠幇鏂扮増鏈?v' + update.version,
        '<div style="text-align:center;"><div style="font-size:36px;font-weight:700;color:var(--primary);">v' + update.version + '</div>' + changelogHtml + cdnHint + '</div>',
        function () {
          // 鍏抽棴寮圭獥鍚庡紑濮嬫洿鏂?          window.UIModule.showToast('寮€濮嬩笅杞芥洿鏂版枃浠?..', 3000);
          OTAModule.applyUpdate(update).then(function (success) {
            if (success) {
              window.UIModule.showToast('鏇存柊鎴愬姛锛屽嵆灏嗛噸鍚?..', 2000);
              setTimeout(function () { OTAModule.reloadApp(); }, 2000);
            } else {
              window.UIModule.showToast('閮ㄥ垎鏂囦欢鏇存柊澶辫触锛岃绋嶅悗閲嶈瘯', 3000);
            }
          });
        },
        '绔嬪嵆鏇存柊'
      );
    }
  }

  // 鏆撮湶缁欏閮ㄨ皟鐢紙棣栭〉妫€鏌ユ洿鏂版寜閽級
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
