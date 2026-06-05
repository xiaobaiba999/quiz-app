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

    // 绑定认证页面事件
    bindAuthEvents();

    // 检查登录状态
    if (!window.AuthModule.isLoggedIn()) {
      switchPage('login');
      return;
    }

    // 已登录，初始化主应用
    initMainApp();
  });

  // ===== 主应用初始化（登录后调用） =====
  function initMainApp() {
    // 显示当前用户名
    var currentUser = window.AuthModule.getCurrentUser();
    var userNameEl = document.getElementById('current-user-name');
    if (currentUser && userNameEl) {
      userNameEl.textContent = currentUser.username;
    }

    // 绑定退出登录
    var btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', function () {
        window.UIModule.showModal('退出登录', '确定要退出当前账号吗？', function () {
          window.AuthModule.logout();
          window.location.href = window.location.origin + window.location.pathname;
        });
      });
    }

    // 绑定底部导航栏点击事件
    bindBottomNav();

    // 绑定护眼模式切换按钮
    window.ThemeModule.bindThemeToggles();

    // 绑定导入页面事件
    bindImportEvents();

    // 绑定检查更新事件
    bindCheckUpdateEvents();

    // 初始化更新页面
    initUpdatePage();

    // 绑定练习页面按钮事件
    window.PracticeModule.bindPracticeEvents();

    // 绑定题库详情/编辑页面事件
    window.EditModule.bindEditEvents();

    // 监听路由变化，自动刷新页面
    window.addEventListener('hashchange', onRouteChange);

    // 尝试恢复进度
    window.PracticeModule.restoreProgress().then(function (restored) {
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
    });

    // 自动检查 OTA 更新
    if (window.OTAModule) {
      window.OTAModule.autoCheck();
    }
  }

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
      case 'update':
        initUpdatePage();
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
        container.innerHTML = '<div class="empty-tip"><div style="font-size:40px;margin-bottom:12px;">📚</div><div>暂无题库</div><div style="font-size:12px;margin-top:6px;">点击右上角「+」导入题库开始刷题</div></div>';
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

  // ===== 认证页面事件绑定 =====
  function bindAuthEvents() {
    var formLogin = document.getElementById('auth-form-login');
    var formRegister = document.getElementById('auth-form-register');
    var formForgot = document.getElementById('auth-form-forgot');

    // 切换到注册
    var linkToRegister = document.getElementById('link-to-register');
    if (linkToRegister) {
      linkToRegister.addEventListener('click', function () {
        formLogin.style.display = 'none';
        formRegister.style.display = '';
        formForgot.style.display = 'none';
      });
    }

    // 切换到登录
    var linkToLogin = document.getElementById('link-to-login');
    if (linkToLogin) {
      linkToLogin.addEventListener('click', function () {
        formLogin.style.display = '';
        formRegister.style.display = 'none';
        formForgot.style.display = 'none';
      });
    }

    // 切换到忘记密码
    var linkToForgot = document.getElementById('link-to-forgot');
    if (linkToForgot) {
      linkToForgot.addEventListener('click', function () {
        formLogin.style.display = 'none';
        formRegister.style.display = 'none';
        formForgot.style.display = '';
      });
    }

    // 从忘记密码返回登录
    var linkToLoginFromForgot = document.getElementById('link-to-login-from-forgot');
    if (linkToLoginFromForgot) {
      linkToLoginFromForgot.addEventListener('click', function () {
        formLogin.style.display = '';
        formRegister.style.display = 'none';
        formForgot.style.display = 'none';
      });
    }

    // 登录
    var btnLogin = document.getElementById('btn-login');
    if (btnLogin) {
      btnLogin.addEventListener('click', function () {
        var username = document.getElementById('login-username').value;
        var password = document.getElementById('login-password').value;
        window.AuthModule.login(username, password).then(function () {
          window.UIModule.showToast('登录成功', 2000);
          setTimeout(function () {
            navigateTo('#home');
            initMainApp();
          }, 500);
        }).catch(function (err) {
          window.UIModule.showToast(err.message, 3000);
        });
      });
    }

    // 注册
    var btnRegister = document.getElementById('btn-register');
    if (btnRegister) {
      btnRegister.addEventListener('click', function () {
        var username = document.getElementById('register-username').value;
        var password = document.getElementById('register-password').value;
        var password2 = document.getElementById('register-password2').value;
        if (password !== password2) {
          window.UIModule.showToast('两次密码不一致', 3000);
          return;
        }
        window.AuthModule.register(username, password).then(function () {
          window.UIModule.showToast('注册成功', 2000);
          setTimeout(function () {
            navigateTo('#home');
            initMainApp();
          }, 500);
        }).catch(function (err) {
          window.UIModule.showToast(err.message, 3000);
        });
      });
    }

    // 忘记密码
    var btnForgot = document.getElementById('btn-forgot');
    if (btnForgot) {
      btnForgot.addEventListener('click', function () {
        var username = document.getElementById('forgot-username').value;
        var password = document.getElementById('forgot-password').value;
        var password2 = document.getElementById('forgot-password2').value;
        if (password !== password2) {
          window.UIModule.showToast('两次密码不一致', 3000);
          return;
        }
        window.AuthModule.forgotPassword(username, password).then(function () {
          window.UIModule.showToast('密码重置成功', 2000);
          setTimeout(function () {
            formLogin.style.display = '';
            formRegister.style.display = 'none';
            formForgot.style.display = 'none';
          }, 500);
        }).catch(function (err) {
          window.UIModule.showToast(err.message, 3000);
        });
      });
    }

    // 回车键提交
    ['login-username', 'login-password'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('keydown', function (e) { if (e.key === 'Enter') btnLogin && btnLogin.click(); });
    });
    ['register-username', 'register-password', 'register-password2'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('keydown', function (e) { if (e.key === 'Enter') btnRegister && btnRegister.click(); });
    });
    ['forgot-username', 'forgot-password', 'forgot-password2'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('keydown', function (e) { if (e.key === 'Enter') btnForgot && btnForgot.click(); });
    });
  }

  // ===== 检查更新事件绑定 =====
  function bindCheckUpdateEvents() {
    var btnUpdateCheck = document.getElementById('btn-update-check');

    if (btnUpdateCheck) {
      btnUpdateCheck.addEventListener('click', function () {
        var statusEl = document.getElementById('update-status');
        if (statusEl) statusEl.textContent = '正在检查更新...';
        btnUpdateCheck.disabled = true;
        btnUpdateCheck.textContent = '检查中...';

        window.OTAModule.checkForUpdate().then(function (update) {
          btnUpdateCheck.disabled = false;
          btnUpdateCheck.textContent = '检查更新';

          if (!update) {
            if (statusEl) statusEl.textContent = '未配置更新地址';
          } else if (update._error) {
            if (statusEl) statusEl.textContent = '检查失败：' + update._error;
          } else if (update._current) {
            if (statusEl) statusEl.textContent = '已是最新版本 v' + update.localVersion;
          } else {
            // 发现新版本
            if (statusEl) statusEl.textContent = '发现新版本 v' + update.version;
            var changelogEl = document.getElementById('update-changelog');
            var changelogTextEl = document.getElementById('update-changelog-text');
            if (changelogEl && changelogTextEl && update.changelog) {
              changelogTextEl.textContent = update.changelog;
              changelogEl.style.display = '';
            }
            // 由ota.js的_showUpdateModal处理下载
            window.OTAModule._showUpdateModalDirect(update);
          }
        }).catch(function (err) {
          btnUpdateCheck.disabled = false;
          btnUpdateCheck.textContent = '检查更新';
          var statusEl = document.getElementById('update-status');
          if (statusEl) statusEl.textContent = '检查失败：' + err.message;
        });
      });
    }
  }

  // ===== 更新页面初始化 =====
  function initUpdatePage() {
    var versionEl = document.getElementById('update-current-version');
    if (versionEl) {
      var otaVersion = localStorage.getItem('quiz_ota_version');
      versionEl.textContent = otaVersion ? ('v' + otaVersion) : 'v2.11';
    }
  }
})();
