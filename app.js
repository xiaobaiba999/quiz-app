// 刷题助手 - 应用入口

(function () {
  'use strict';

  // ===== 注册 Service Worker =====
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('service-worker.js')
        .then((registration) => {
          console.log('[App] Service Worker 注册成功，作用域:', registration.scope);
        })
        .catch((error) => {
          console.log('[App] Service Worker 注册失败:', error);
        });
    });
  }

  // ===== 初始化 =====
  document.addEventListener('DOMContentLoaded', async () => {
    // 先初始化数据库
    try {
      await initDB();
    } catch (e) {
      console.error('[App] 数据库初始化失败:', e);
    }

    // 初始化路由系统
    initRouter();

    // 初始化护眼模式
    window.ThemeModule.initTheme();

    // 绑定底部导航栏点击事件
    bindBottomNav();

    // 绑定护眼模式切换按钮
    window.ThemeModule.bindThemeToggles();

    // 绑定导入页面事件
    bindImportEvents();

    // 绑定 AI 设置事件
    bindAISettingsEvents();

    // 绑定练习页面按钮事件
    window.PracticeModule.bindPracticeEvents();

    // 绑定题库详情/编辑页面事件
    window.EditModule.bindEditEvents();

    // 监听路由变化，自动刷新页面
    window.addEventListener('hashchange', onRouteChange);

    // 尝试恢复进度
    const restored = await window.PracticeModule.restoreProgress();
    if (restored) {
      switchPage('practice');
      updateNavHighlight('practice');
      window.PracticeModule.renderCurrentQuestion();
    } else {
      window.StatsModule.renderHomePage();
      renderBankList();
      window.PracticeModule.renderPracticePage();
      window.PracticeModule.renderWrongPage();
      window.PracticeModule.renderCollectionPage();
    }

    // 自动检查 OTA 更新
    if (window.OTAModule) {
      window.OTAModule.autoCheck();
    }
  });

  // ===== 路由变化时自动刷新 =====
  function onRouteChange() {
    const hash = window.location.hash || '#home';
    const route = hash.replace('#', '');
    const routeName = route.split('/')[0];

    switch (routeName) {
      case 'home':
        window.StatsModule.renderHomePage();
        break;
      case 'bank-list':
        renderBankList();
        break;
      case 'bank-detail':
        var bankIdStr = route.split('/')[1] || '';
        var bankId = parseInt(bankIdStr, 10);
        if (bankId) {
          window.EditModule.renderBankDetail(bankId);
        } else {
          navigateTo('#bank-list');
        }
        break;
      case 'practice':
        if (window.PracticeModule.getCurrentBank() && window.PracticeModule.getCurrentQuestions().length > 0) {
          window.PracticeModule.renderCurrentQuestion();
        } else {
          window.PracticeModule.renderPracticePage();
        }
        break;
      case 'wrong':
        window.PracticeModule.renderWrongPage();
        break;
      case 'collection':
        window.PracticeModule.renderCollectionPage();
        break;
    }
  }

  // ===== 底部导航栏点击事件 =====
  function bindBottomNav() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const targetHash = item.getAttribute('href');
        navigateTo(targetHash);
      });
    });
  }

  // ===== 导入页面事件绑定 =====
  function bindImportEvents() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    const btnConfirmImport = document.getElementById('btn-confirm-import');

    if (!uploadArea || !fileInput) return;

    uploadArea.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        handleFileImport(file);
      }
    });

    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) {
        handleFileImport(file);
      }
    });

    if (btnConfirmImport) {
      btnConfirmImport.addEventListener('click', () => {
        confirmImport();
      });
    }
  }

  // ===== 题库列表渲染 =====
  async function renderBankList() {
    const container = document.getElementById('bank-list-container');
    if (!container) return;

    var escapeHtml = window.UIModule.escapeHtml;
    var formatTime = window.UIModule.formatTime;

    try {
      const banks = await getAllBanks();

      if (banks.length === 0) {
        container.innerHTML = '<p class="empty-tip">暂无题库，点击右上角导入</p>';
        return;
      }

      let html = '';
      banks.forEach((bank) => {
        html += '<div class="bank-card">';
        html += '<div class="bank-info" data-bank-id="' + bank.id + '" style="cursor:pointer;">';
        html += '<div class="bank-name">' + escapeHtml(bank.name) + '</div>';
        html += '<div class="bank-meta">' + bank.count + ' 题 · ' + formatTime(bank.createdAt) + '</div>';
        html += '</div>';
        html += '<div class="bank-actions">';
        html += '<button class="btn btn-primary btn-small-action" data-bank-id="' + bank.id + '" onclick="window._startPractice(' + bank.id + ')">练习</button>';
        html += '<button class="btn btn-secondary btn-small-action" data-bank-id="' + bank.id + '" onclick="window._deleteBank(' + bank.id + ')">删除</button>';
        html += '</div>';
        html += '</div>';
      });
      container.innerHTML = html;

      // 绑定题库卡片点击事件，跳转到题库详情
      container.querySelectorAll('.bank-info').forEach((info) => {
        info.addEventListener('click', () => {
          const bankId = info.getAttribute('data-bank-id');
          navigateTo('#bank-detail/' + bankId);
        });
      });
    } catch (e) {
      console.error('[App] 渲染题库列表失败:', e);
      container.innerHTML = '<p class="empty-tip">加载题库失败</p>';
    }
  }

  // ===== 开始练习（从题库列表点击） =====
  window._startPractice = function (bankId) {
    window.UIModule.showModal(
      '选择练习模式',
      '<div style="display:flex;flex-direction:column;gap:10px;">' +
        '<button class="btn btn-primary btn-block" id="mode-sequential">顺序练习</button>' +
        '<button class="btn btn-accent btn-block" id="mode-random">随机练习</button>' +
        '<button class="btn btn-secondary btn-block" id="mode-special">专项练习</button>' +
        '<button class="btn btn-secondary btn-block" id="mode-exam">考试模式</button>' +
        '<button class="btn btn-danger btn-block" id="mode-wrong">错题重练</button>' +
      '</div>',
      null
    );

    setTimeout(() => {
      const seqBtn = document.getElementById('mode-sequential');
      const randBtn = document.getElementById('mode-random');
      const specialBtn = document.getElementById('mode-special');
      const examBtn = document.getElementById('mode-exam');
      const wrongBtn = document.getElementById('mode-wrong');

      if (seqBtn) {
        seqBtn.addEventListener('click', () => {
          window.UIModule.closeModal();
          window.PracticeModule.startPractice(bankId, 'sequential');
        });
      }
      if (randBtn) {
        randBtn.addEventListener('click', () => {
          window.UIModule.closeModal();
          window.PracticeModule.startPractice(bankId, 'random');
        });
      }
      if (specialBtn) {
        specialBtn.addEventListener('click', () => {
          window.UIModule.closeModal();
          window.PracticeModule.showSpecialPracticeModal(bankId);
        });
      }
      if (examBtn) {
        examBtn.addEventListener('click', () => {
          window.UIModule.closeModal();
          window.PracticeModule.showExamSettingsModal(bankId);
        });
      }
      if (wrongBtn) {
        wrongBtn.addEventListener('click', () => {
          window.UIModule.closeModal();
          window.PracticeModule.startWrongPractice(bankId);
        });
      }
    }, 50);
  };

  // ===== 删除题库 =====
  window._deleteBank = function (bankId) {
    window.UIModule.showModal('确认删除', '确定要删除该题库及其所有题目和答题记录吗？此操作不可恢复。', () => {
      deleteBank(bankId).then(() => {
        window.UIModule.showToast('题库已删除');
        renderBankList();
        window.StatsModule.renderHomePage();
      }).catch((e) => {
        window.UIModule.showToast('删除失败');
        console.error('[App] 删除题库失败:', e);
      });
    });
  };

  // ===== 设置事件绑定 =====
  function bindAISettingsEvents() {
    var btnAISettings = document.getElementById('btn-ai-settings');
    var overlay = document.getElementById('ai-settings-overlay');
    var btnClose = document.getElementById('ai-settings-close');
    var otaUrlInput = document.getElementById('ota-manifest-url');
    var btnCheckUpdate = document.getElementById('btn-check-update');
    var otaStatus = document.getElementById('ota-update-status');
    var btnCancelAI = document.getElementById('btn-cancel-ai');

    // 打开设置
    if (btnAISettings) {
      btnAISettings.addEventListener('click', function () {
        if (overlay) {
          overlay.style.display = '';
          if (otaUrlInput) otaUrlInput.value = window.OTAModule ? window.OTAModule.getManifestUrl() : '';
          if (otaStatus) otaStatus.textContent = '';
        }
      });
    }

    // 关闭设置
    if (btnClose) {
      btnClose.addEventListener('click', function () {
        if (overlay) overlay.style.display = 'none';
        if (window.OTAModule && otaUrlInput) {
          window.OTAModule.setManifestUrl(otaUrlInput.value);
        }
      });
    }

    // 点击遮罩关闭
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
          overlay.style.display = 'none';
          if (window.OTAModule && otaUrlInput) window.OTAModule.setManifestUrl(otaUrlInput.value);
        }
      });
    }

    // 检查更新
    if (btnCheckUpdate && otaStatus) {
      btnCheckUpdate.addEventListener('click', function () {
        if (otaUrlInput) window.OTAModule.setManifestUrl(otaUrlInput.value);
        otaStatus.textContent = '检查中...';
        otaStatus.style.color = 'var(--text-hint)';
        window.OTAModule.checkForUpdate().then(function (update) {
          if (update) {
            otaStatus.textContent = '发现新版本 v' + update.version;
            otaStatus.style.color = 'var(--primary)';
            window.OTAModule.applyUpdate(update).then(function (success) {
              if (success) {
                window.UIModule.showToast('更新成功，即将重启...');
                setTimeout(function () {
                  window.OTAModule.reloadApp();
                }, 1500);
              } else {
                otaStatus.textContent = '更新失败，请重试';
                otaStatus.style.color = 'var(--danger)';
              }
            });
          } else {
            otaStatus.textContent = '已是最新版本';
            otaStatus.style.color = 'var(--success)';
          }
        }).catch(function (err) {
          otaStatus.textContent = '检查失败：' + err.message;
          otaStatus.style.color = 'var(--danger)';
        });
      });
    }

    // 取消文件转换
    if (btnCancelAI) {
      btnCancelAI.addEventListener('click', function () {
        _aiConvertAborted = true;
        var progressEl = document.getElementById('ai-convert-progress');
        if (progressEl) progressEl.style.display = 'none';
        window.UIModule.showToast('已取消转换');
      });
    }
  }
})();
