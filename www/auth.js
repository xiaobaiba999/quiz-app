// 刷题助手 - 用户认证模块

(function () {
  'use strict';

  var AuthModule = {};

  var AUTH_KEY = 'quiz_app_current_user';

  /**
   * 获取当前登录用户
   * @returns {Object|null} 用户对象或null
   */
  AuthModule.getCurrentUser = function () {
    var data = localStorage.getItem(AUTH_KEY);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch (e) {
      return null;
    }
  };

  /**
   * 是否已登录
   * @returns {boolean}
   */
  AuthModule.isLoggedIn = function () {
    return !!AuthModule.getCurrentUser();
  };

  /**
   * 注册
   * @param {string} username - 用户名
   * @param {string} password - 密码
   * @returns {Promise<Object>} 用户对象
   */
  AuthModule.register = function (username, password) {
    if (!username || !username.trim()) {
      return Promise.reject(new Error('请输入用户名'));
    }
    if (!password || password.length < 4) {
      return Promise.reject(new Error('密码至少4位'));
    }
    return registerUser(username.trim(), password).then(function (user) {
      _setLoginState(user);
      return user;
    });
  };

  /**
   * 登录
   * @param {string} username - 用户名
   * @param {string} password - 密码
   * @returns {Promise<Object>} 用户对象
   */
  AuthModule.login = function (username, password) {
    if (!username || !username.trim()) {
      return Promise.reject(new Error('请输入用户名'));
    }
    if (!password) {
      return Promise.reject(new Error('请输入密码'));
    }
    return loginUser(username.trim(), password).then(function (user) {
      _setLoginState(user);
      return user;
    });
  };

  /**
   * 忘记密码（只需用户名即可重置）
   * @param {string} username - 用户名
   * @param {string} newPassword - 新密码
   * @returns {Promise<Object>} 用户对象
   */
  AuthModule.forgotPassword = function (username, newPassword) {
    if (!username || !username.trim()) {
      return Promise.reject(new Error('请输入用户名'));
    }
    if (!newPassword || newPassword.length < 4) {
      return Promise.reject(new Error('新密码至少4位'));
    }
    return resetPassword(username.trim(), newPassword).then(function (user) {
      _setLoginState(user);
      return user;
    });
  };

  /**
   * 退出登录
   */
  AuthModule.logout = function () {
    localStorage.removeItem(AUTH_KEY);
  };

  /**
   * 设置登录状态
   */
  function _setLoginState(user) {
    localStorage.setItem(AUTH_KEY, JSON.stringify({ id: user.id, username: user.username }));
  }

  window.AuthModule = AuthModule;
})();
