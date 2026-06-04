// 刷题助手 - 通用UI组件和辅助函数

(function () {
  'use strict';

  // ===== 显示 Toast 提示 =====
  function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        if (toast.parentNode) toast.remove();
      }, 300);
    }, 2000);
  }

  // ===== 显示确认对话框 =====
  function showModal(title, content, onConfirm) {
    closeModal();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal';

    let html = '<div class="modal-title">' + escapeHtml(title) + '</div>';
    html += '<div class="modal-content">' + content + '</div>';
    html += '<div class="modal-actions">';
    html += '<button class="btn btn-secondary" id="modal-cancel">取消</button>';
    if (onConfirm) {
      html += '<button class="btn btn-primary" id="modal-confirm">确定</button>';
    }
    html += '</div>';

    modal.innerHTML = html;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.classList.add('show');
    });

    const cancelBtn = document.getElementById('modal-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        closeModal();
      });
    }

    if (onConfirm) {
      const confirmBtn = document.getElementById('modal-confirm');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
          closeModal();
          onConfirm();
        });
      }
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal();
      }
    });
  }

  // ===== 关闭 Modal =====
  function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) {
      overlay.classList.remove('show');
      setTimeout(() => {
        if (overlay.parentNode) overlay.remove();
      }, 200);
    }
  }

  // ===== HTML 转义 =====
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ===== 格式化时间 =====
  function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60 * 1000) return '刚刚';
    if (diff < 60 * 60 * 1000) return Math.floor(diff / (60 * 1000)) + ' 分钟前';
    if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / (60 * 60 * 1000)) + ' 小时前';
    if (diff < 7 * 24 * 60 * 60 * 1000) return Math.floor(diff / (24 * 60 * 60 * 1000)) + ' 天前';

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');

    if (y === now.getFullYear()) {
      return m + '-' + d;
    }
    return y + '-' + m + '-' + d;
  }

  // ===== 显示加载遮罩 =====
  function showLoading(text) {
    var overlay = document.getElementById('loading-overlay');
    var textEl = document.getElementById('loading-text');
    if (overlay) {
      if (textEl) textEl.textContent = text || '加载中...';
      overlay.style.display = 'flex';
    }
  }

  // ===== 隐藏加载遮罩 =====
  function hideLoading() {
    var overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  }

  // 暴露到全局
  window.UIModule = {
    showToast: showToast,
    showModal: showModal,
    closeModal: closeModal,
    escapeHtml: escapeHtml,
    formatTime: formatTime,
    showLoading: showLoading,
    hideLoading: hideLoading
  };
})();
