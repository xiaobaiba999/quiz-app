// 刷题助手 - 主题模式模块

(function () {
  'use strict';

  var THEMES = ['light', 'dark', 'eye-care'];
  var THEME_LABELS = { 'light': '日间模式', 'dark': '夜晚模式', 'eye-care': '护眼模式' };
  var THEME_COLORS = { 'light': '#FB7299', 'dark': '#1E1E30', 'eye-care': '#5B8C5A' };

  function getCurrentTheme() {
    return localStorage.getItem('quiz_theme') || 'light';
  }

  function setTheme(theme) {
    document.body.classList.remove('dark', 'eye-care');
    if (theme === 'dark') {
      document.body.classList.add('dark');
    } else if (theme === 'eye-care') {
      document.body.classList.add('eye-care');
    }
    localStorage.setItem('quiz_theme', theme);
    updateThemeIcons();
    // 更新 meta theme-color
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLORS[theme] || '#FB7299');
  }

  function initTheme() {
    var saved = getCurrentTheme();
    setTheme(saved);
  }

  function toggleTheme() {
    var current = getCurrentTheme();
    var idx = THEMES.indexOf(current);
    var next = THEMES[(idx + 1) % THEMES.length];
    setTheme(next);
    // 显示当前模式提示
    if (window.UIModule && window.UIModule.showToast) {
      window.UIModule.showToast(THEME_LABELS[next]);
    }
  }

  function updateThemeIcons() {
    var current = getCurrentTheme();
    var svg;
    if (current === 'dark') {
      // 夜晚模式 → 显示太阳图标（点击切回亮色）
      svg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 0 0 0-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>';
    } else if (current === 'eye-care') {
      // 护眼模式 → 显示月亮图标
      svg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/></svg>';
    } else {
      // 亮色模式 → 显示月亮图标（点击切到夜晚）
      svg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/></svg>';
    }
    document.querySelectorAll('.theme-toggle').forEach(function(btn) {
      btn.innerHTML = svg;
    });
  }

  function bindThemeToggles() {
    document.querySelectorAll('.theme-toggle').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleTheme();
      });
    });
  }

  // 暴露到全局
  window.ThemeModule = {
    initTheme: initTheme,
    toggleTheme: toggleTheme,
    setTheme: setTheme,
    getCurrentTheme: getCurrentTheme,
    updateThemeIcons: updateThemeIcons,
    bindThemeToggles: bindThemeToggles
  };
})();
