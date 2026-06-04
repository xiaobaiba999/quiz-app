// 刷题助手 - 单页应用路由模块

/**
 * hash 路由映射表
 * key: hash 值（不含 #）
 * value: 页面容器的 id 前缀（page-xxx）
 */
const ROUTE_MAP = {
  'login': 'page-login',
  'home': 'page-home',
  'bank-list': 'page-bank-list',
  'bank-detail': 'page-bank-detail',
  'import': 'page-import',
  'practice': 'page-practice',
  'result': 'page-result',
  'wrong': 'page-wrong',
  'collection': 'page-collection'
};

/**
 * 底部导航栏对应的页面
 * 只有这些页面会高亮底部 tab
 */
const NAV_PAGES = ['home', 'bank-list', 'practice', 'collection', 'wrong'];

/**
 * 导航到指定 hash 路由
 * @param {string} hash - 目标路由，如 "#home"、"#bank-detail/1"
 */
function navigateTo(hash) {
  // 去掉 # 前缀
  const route = hash.replace('#', '');

  // 提取路由名称（支持带参数的路由，如 bank-detail/1）
  const routeName = route.split('/')[0];

  // 如果路由不存在，跳转到首页
  if (!ROUTE_MAP[routeName]) {
    window.location.hash = '#home';
    return;
  }

  // 更新 hash（会触发 hashchange 事件）
  if (window.location.hash !== hash) {
    window.location.hash = hash;
  } else {
    // hash 未变化时手动切换页面
    switchPage(routeName);
  }
}

/**
 * 切换页面显示/隐藏
 * @param {string} route - 路由名称
 */
function switchPage(route) {
  const pageId = ROUTE_MAP[route];
  if (!pageId) return;

  // 找到当前活动页面
  const currentPage = document.querySelector('.page.active');

  // 显示目标页面
  const targetPage = document.getElementById(pageId);
  if (!targetPage) return;

  // 如果目标页面已经是当前页面，不重复切换
  if (currentPage === targetPage) return;

  // 旧页面添加离开动画类
  if (currentPage) {
    currentPage.classList.add('page-leave');
    currentPage.classList.remove('page-enter');
    // 动画结束后移除类和 active
    const onLeaveEnd = () => {
      currentPage.classList.remove('active', 'page-leave');
      currentPage.removeEventListener('animationend', onLeaveEnd);
    };
    currentPage.addEventListener('animationend', onLeaveEnd);
  }

  // 新页面添加进入动画类
  targetPage.classList.add('active', 'page-enter');
  // 动画结束后移除进入类
  const onEnterEnd = () => {
    targetPage.classList.remove('page-enter');
    targetPage.removeEventListener('animationend', onEnterEnd);
  };
  targetPage.addEventListener('animationend', onEnterEnd);

  // 更新底部导航栏高亮
  updateNavHighlight(route);
}

/**
 * 更新底部导航栏高亮状态
 * @param {string} currentRoute - 当前路由名称
 */
function updateNavHighlight(currentRoute) {
  const navItems = document.querySelectorAll('.nav-item');

  navItems.forEach((item) => {
    const itemPage = item.getAttribute('data-page');
    if (itemPage === currentRoute) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // 对于非导航页面（import、result、bank-detail），保持相关页面的高亮
  if (currentRoute === 'import' || currentRoute === 'bank-detail') {
    highlightNav('bank-list');
  } else if (currentRoute === 'result') {
    highlightNav('practice');
  } else if (currentRoute === 'collection') {
    highlightNav('collection');
  }
}

/**
 * 高亮指定导航项
 * @param {string} page - 导航页名称
 */
function highlightNav(page) {
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.remove('active');
    if (item.getAttribute('data-page') === page) {
      item.classList.add('active');
    }
  });
}

/**
 * 初始化路由
 * 监听 hashchange 事件，设置默认路由
 */
function initRouter() {
  // 监听 hash 变化
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash || '#home';
    const route = hash.replace('#', '');
    const routeName = route.split('/')[0];
    switchPage(routeName);
  });

  // 设置默认路由
  var currentHash = window.location.hash || '#home';
  var currentRoute = currentHash.replace('#', '');
  var currentRouteName = currentRoute.split('/')[0];
  if (!currentHash || !ROUTE_MAP[currentRouteName]) {
    window.location.hash = '#home';
  } else {
    switchPage(currentRouteName);
  }
}
