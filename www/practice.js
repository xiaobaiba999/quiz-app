// 刷题助手 - 练习/答题逻辑模块

(function () {
  'use strict';

  var escapeHtml = window.UIModule.escapeHtml;
  var showToast = window.UIModule.showToast;

  // ===== 练习状态 =====
  var currentBank = null;       // 当前题库
  var currentQuestions = [];    // 当前题目列表
  var currentIndex = 0;         // 当前题目索引
  var answers = [];             // 用户答案记录数组
  var startTime = null;         // 开始时间
  var questionTimer = null;     // 当前题目计时器
  var questionStartTime = null; // 当前题目开始时间
  var currentNoteId = null;     // 当前笔记ID（用于编辑已有笔记）

  // ===== 考试模式状态 =====
  var examMode = false;         // 是否为考试模式
  var examTimer = null;         // 考试倒计时定时器
  var examTimeLimit = 30;       // 考试时限（分钟）
  var examEndTime = null;       // 考试结束时间戳
  var examQuestionCount = 0;    // 考试题数

  // ===== 清理练习资源（计时器等） =====
  function cleanupPractice() {
    clearExamTimer();
    stopQuestionTimer();
  }

  // ===== 练习进度持久化 =====

  // 保存练习进度
  function saveProgress() {
    if (!currentBank || !currentQuestions.length) return;
    const progress = {
      bankId: currentBank.id,
      bankName: currentBank.name,
      questionIds: currentQuestions.map(q => q.id),
      currentIndex: currentIndex,
      answers: answers,
      startTime: startTime,
      savedAt: Date.now(),
      examMode: examMode,
      examTimeLimit: examTimeLimit,
      examEndTime: examMode ? examEndTime : null
    };
    localStorage.setItem('quiz_progress', JSON.stringify(progress));
  }

  // 恢复练习进度
  async function restoreProgress() {
    const saved = localStorage.getItem('quiz_progress');
    if (!saved) return false;
    try {
      const progress = JSON.parse(saved);
      const questions = await getQuestionsByIds(progress.questionIds);
      // 按 questionIds 顺序排列
      currentQuestions = progress.questionIds.map(id => questions.get(id)).filter(Boolean);
      if (currentQuestions.length === 0) return false;
      currentBank = { id: progress.bankId, name: progress.bankName };
      currentIndex = progress.currentIndex;
      answers = progress.answers;
      startTime = progress.startTime;

      // 恢复考试模式
      if (progress.examMode) {
        examMode = true;
        examTimeLimit = progress.examTimeLimit || 30;
        if (progress.examEndTime && progress.examEndTime > Date.now()) {
          // 考试尚未结束，恢复倒计时
          examEndTime = progress.examEndTime;
          startExamTimer();
        } else {
          // 考试已超时，自动交卷
          examEndTime = progress.examEndTime || Date.now();
          submitExam();
        }
      } else {
        examMode = false;
      }

      return true;
    } catch (e) {
      localStorage.removeItem('quiz_progress');
      return false;
    }
  }

  // 清除练习进度
  function clearProgress() {
    cleanupPractice();
    localStorage.removeItem('quiz_progress');
  }

  // ===== 继续练习提示条 =====
  function showResumeBanner() {
    const existing = document.getElementById('resume-banner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'resume-banner';
    banner.className = 'resume-banner';
    banner.innerHTML = '<span>你有未完成的练习，点击继续</span><button class="resume-close" id="resume-close">&times;</button>';

    document.body.appendChild(banner);

    banner.addEventListener('click', (e) => {
      if (e.target.id === 'resume-close') return;
      navigateTo('#practice');
      renderCurrentQuestion();
    });

    const closeBtn = document.getElementById('resume-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        banner.remove();
      });
    }
  }

  function hideResumeBanner() {
    const banner = document.getElementById('resume-banner');
    if (banner) banner.remove();
  }

  // ===== 练习页面渲染 =====
  async function renderPracticePage() {
    if (currentBank && currentQuestions.length > 0) {
      renderCurrentQuestion();
      return;
    }

    const questionCard = document.getElementById('question-card');
    const optionsList = document.getElementById('options-list');
    const progressFill = document.getElementById('practice-progress-fill');
    const progressText = document.getElementById('practice-progress-text');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');

    if (progressFill) progressFill.style.width = '0%';
    if (progressText) progressText.textContent = '0 / 0';
    if (btnPrev) btnPrev.disabled = true;
    if (btnNext) btnNext.disabled = true;

    const questionNumber = document.getElementById('question-number');
    const questionText = document.getElementById('question-text');

    if (questionNumber) questionNumber.textContent = '';
    if (questionText) questionText.textContent = '请选择题库开始练习';

    const explanationEl = document.getElementById('question-explanation');
    if (explanationEl) explanationEl.style.display = 'none';

    const practiceHeader = document.getElementById('practice-bank-name');
    if (practiceHeader) practiceHeader.textContent = '';

    try {
      const banks = await getAllBanks();
      if (optionsList) {
        if (banks.length === 0) {
          optionsList.innerHTML = '<p class="empty-tip">暂无题库，请先导入题库</p>';
        } else {
          let html = '';
          banks.forEach((bank) => {
            html += '<button class="option-btn bank-select-btn" data-bank-id="' + bank.id + '">';
            html += '<span class="option-label">题</span>';
            html += '<span>' + escapeHtml(bank.name) + '（' + bank.count + ' 题）</span>';
            html += '</button>';
          });
          optionsList.innerHTML = html;

          optionsList.querySelectorAll('.option-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
              const bankId = parseInt(btn.getAttribute('data-bank-id'), 10);
              window._startPractice(bankId);
            });
          });
        }
      }
    } catch (e) {
      console.error('[App] 加载题库列表失败:', e);
      if (optionsList) {
        optionsList.innerHTML = '<p class="empty-tip">加载题库失败</p>';
      }
    }
  }

  // ===== 开始练习 =====
  async function startPractice(bankId, mode) {
    window.UIModule.showLoading();
    try {
      const banks = await getAllBanks();
      const bank = banks.find((b) => b.id === bankId);
      if (!bank) {
        showToast('题库不存在');
        return;
      }

      let questions = await getQuestionsByBank(bankId);
      if (questions.length === 0) {
        showToast('该题库没有题目');
        return;
      }

      if (mode === 'random') {
        questions = shuffleArray(questions);
      }

      currentBank = bank;
      currentQuestions = questions;
      currentIndex = 0;
      answers = new Array(questions.length).fill(null);
      startTime = Date.now();
      examMode = false;
      cleanupPractice();

      saveProgress();
      hideResumeBanner();

      switchPage('practice');
      updateNavHighlight('practice');
      renderCurrentQuestion();
    } catch (e) {
      console.error('[App] 开始练习失败:', e);
      showToast('加载题目失败');
    } finally {
      window.UIModule.hideLoading();
    }
  }

  // ===== 专项练习弹窗 =====
  function showSpecialPracticeModal(bankId) {
    var escapeHtml = window.UIModule.escapeHtml;
    // 延迟打开，等上一个 modal 完全关闭
    setTimeout(function() {
      var content = '<div class="special-tabs">' +
        '<button class="special-tab active" id="special-tab-type">按题型</button>' +
        '<button class="special-tab" id="special-tab-tag">按标签</button>' +
      '</div>' +
      '<div class="special-panel" id="special-panel-type">' +
        '<div class="special-btn-group">' +
          '<button class="btn btn-secondary btn-block" data-type="choice">选择题</button>' +
          '<button class="btn btn-secondary btn-block" data-type="judgment">判断题</button>' +
          '<button class="btn btn-secondary btn-block" data-type="fill">填空题</button>' +
          '<button class="btn btn-secondary btn-block" data-type="multiple">多选题</button>' +
          '<button class="btn btn-secondary btn-block" data-type="essay">简答题</button>' +
        '</div>' +
      '</div>' +
      '<div class="special-panel" id="special-panel-tag" style="display:none;">' +
        '<p class="empty-tip" id="special-tag-loading">加载标签中...</p>' +
      '</div>';

      window.UIModule.showModal('专项练习', content, null);

    setTimeout(function() {
      // Tab switching
      var tabType = document.getElementById('special-tab-type');
      var tabTag = document.getElementById('special-tab-tag');
      var panelType = document.getElementById('special-panel-type');
      var panelTag = document.getElementById('special-panel-tag');

      if (tabType) {
        tabType.addEventListener('click', function() {
          tabType.classList.add('active');
          tabTag.classList.remove('active');
          panelType.style.display = '';
          panelTag.style.display = 'none';
        });
      }
      if (tabTag) {
        tabTag.addEventListener('click', function() {
          tabTag.classList.add('active');
          tabType.classList.remove('active');
          panelTag.style.display = '';
          panelType.style.display = 'none';
        });
      }

      // Type filter buttons
      panelType.querySelectorAll('[data-type]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var type = this.getAttribute('data-type');
          window.UIModule.closeModal();
          startSpecialPractice(bankId, 'type', type);
        });
      });

      // Load tags
      getBankTags(bankId).then(function(tags) {
        var tagPanel = document.getElementById('special-panel-tag');
        if (!tagPanel) return;
        if (tags.length === 0) {
          tagPanel.innerHTML = '<p class="empty-tip">该题库暂无标签</p>';
          return;
        }
        var html = '<div class="special-btn-group">';
        tags.forEach(function(tag) {
          html += '<button class="btn btn-secondary btn-block" data-tag="' + escapeHtml(tag) + '">' + escapeHtml(tag) + '</button>';
        });
        html += '</div>';
        tagPanel.innerHTML = html;

        tagPanel.querySelectorAll('[data-tag]').forEach(function(btn) {
          btn.addEventListener('click', function() {
            var tag = this.getAttribute('data-tag');
            window.UIModule.closeModal();
            startSpecialPractice(bankId, 'tag', tag);
          });
        });
      }).catch(function(e) {
        console.error('[App] 加载标签失败:', e);
        var tagPanel = document.getElementById('special-panel-tag');
        if (tagPanel) tagPanel.innerHTML = '<p class="empty-tip">加载标签失败</p>';
      });
    }, 50);
    }, 250);
  }

  // ===== 开始专项练习 =====
  async function startSpecialPractice(bankId, filterType, filterValue) {
    try {
      var banks = await getAllBanks();
      var bank = banks.find(function(b) { return b.id === bankId; });
      if (!bank) {
        showToast('题库不存在');
        return;
      }

      var questions;
      if (filterType === 'type') {
        var allQuestions = await getQuestionsByBank(bankId);
        questions = allQuestions.filter(function(q) { return (q.type || 'choice') === filterValue; });
      } else {
        questions = await getQuestionsByTag(bankId, filterValue);
      }

      if (questions.length === 0) {
        showToast('没有符合条件的题目');
        return;
      }

      currentBank = bank;
      currentQuestions = questions;
      currentIndex = 0;
      answers = new Array(questions.length).fill(null);
      startTime = Date.now();
      examMode = false;
      cleanupPractice();

      saveProgress();
      hideResumeBanner();

      switchPage('practice');
      updateNavHighlight('practice');
      renderCurrentQuestion();
    } catch (e) {
      console.error('[App] 专项练习失败:', e);
      showToast('加载题目失败');
    }
  }

  // ===== 考试模式设置弹窗 =====
  function showExamSettingsModal(bankId) {
    // 延迟打开，等上一个 modal 完全关闭
    setTimeout(function() {
      var content = '<div class="exam-settings">' +
        '<div class="exam-setting-item">' +
          '<label>题目数量</label>' +
          '<input type="number" id="exam-question-count" class="exam-input" placeholder="全部" min="1">' +
        '</div>' +
        '<div class="exam-setting-item">' +
          '<label>时间限制（分钟）</label>' +
          '<input type="number" id="exam-time-limit" class="exam-input" value="30" min="1">' +
        '</div>' +
      '</div>';

      window.UIModule.showModal('考试模式', content, function() {
        var countInput = document.getElementById('exam-question-count');
        var timeInput = document.getElementById('exam-time-limit');
        var count = countInput && countInput.value ? parseInt(countInput.value, 10) : 0;
        var timeLimit = timeInput && timeInput.value ? parseInt(timeInput.value, 10) : 30;
        if (timeLimit < 1) timeLimit = 30;
        startExamPractice(bankId, count, timeLimit);
      });

      // Change confirm button text
      setTimeout(function() {
        var confirmBtn = document.getElementById('modal-confirm');
        if (confirmBtn) confirmBtn.textContent = '开始考试';
      }, 30);
    }, 250);
  }

  // ===== 开始考试模式 =====
  async function startExamPractice(bankId, questionCount, timeLimit) {
    try {
      var banks = await getAllBanks();
      var bank = banks.find(function(b) { return b.id === bankId; });
      if (!bank) {
        showToast('题库不存在');
        return;
      }

      var questions = await getQuestionsByBank(bankId);
      if (questions.length === 0) {
        showToast('该题库没有题目');
        return;
      }

      // Limit question count
      if (questionCount > 0 && questionCount < questions.length) {
        questions = shuffleArray(questions).slice(0, questionCount);
      }

      currentBank = bank;
      currentQuestions = questions;
      currentIndex = 0;
      answers = new Array(questions.length).fill(null);
      startTime = Date.now();
      examMode = true;
      examTimeLimit = timeLimit;
      examEndTime = Date.now() + timeLimit * 60 * 1000;
      examQuestionCount = questions.length;

      cleanupPractice();

      saveProgress();
      hideResumeBanner();

      switchPage('practice');
      updateNavHighlight('practice');
      renderCurrentQuestion();
      startExamTimer();
    } catch (e) {
      console.error('[App] 考试模式失败:', e);
      showToast('加载题目失败');
    }
  }

  // ===== 考试倒计时 =====
  function startExamTimer() {
    clearExamTimer();
    updateExamTimerDisplay();
    examTimer = setInterval(function() {
      updateExamTimerDisplay();
      if (Date.now() >= examEndTime) {
        clearExamTimer();
        submitExam();
      }
    }, 1000);
  }

  function clearExamTimer() {
    if (examTimer) {
      clearInterval(examTimer);
      examTimer = null;
    }
  }

  function updateExamTimerDisplay() {
    var timerEl = document.getElementById('timer-display');
    if (!timerEl || !examEndTime) return;
    var remaining = Math.max(0, examEndTime - Date.now());
    var totalSeconds = Math.floor(remaining / 1000);
    var minutes = Math.floor(totalSeconds / 60);
    var seconds = totalSeconds % 60;
    timerEl.textContent = (minutes < 10 ? '0' : '') + minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
    // Change color when less than 1 minute
    if (remaining < 60000) {
      timerEl.classList.add('timer-danger');
    } else {
      timerEl.classList.remove('timer-danger');
    }
  }

  // ===== 交卷 =====
  function submitExam() {
    clearExamTimer();
    examMode = false;
    // Show exam result
    window.StatsModule.showResult();
  }

  // ===== 错题重练（按题库） =====
  async function startWrongPractice(bankId) {
    try {
      var banks = await getAllBanks();
      var bank = banks.find(function(b) { return b.id === bankId; });
      if (!bank) {
        showToast('题库不存在');
        return;
      }

      var wrongRecords = await getWrongRecordsByBank(bankId);
      if (wrongRecords.length === 0) {
        showToast('该题库暂无错题');
        return;
      }

      var questions = [];
      wrongRecords.forEach(function(record) {
        if (record.question) questions.push(record.question);
      });

      if (questions.length === 0) {
        showToast('没有可重练的错题');
        return;
      }

      currentBank = bank;
      currentQuestions = shuffleArray(questions);
      currentIndex = 0;
      answers = new Array(questions.length).fill(null);
      startTime = Date.now();
      examMode = false;
      cleanupPractice();

      saveProgress();
      hideResumeBanner();

      switchPage('practice');
      updateNavHighlight('practice');
      renderCurrentQuestion();
    } catch (e) {
      console.error('[App] 错题重练失败:', e);
      showToast('加载错题失败');
    }
  }

  // ===== 收藏页面渲染 =====
  async function renderCollectionPage() {
    var container = document.getElementById('collection-list-container');
    if (!container) return;

    try {
      var banks = await getAllBanks();
      var allCollected = await getCollectedQuestions();

      // Build bank filter
      var bankFilterEl = document.getElementById('collection-bank-filter');
      if (bankFilterEl) {
        var currentFilter = bankFilterEl.value || '';
        var filterHtml = '<option value="">全部题库</option>';
        banks.forEach(function(bank) {
          filterHtml += '<option value="' + bank.id + '"' + (currentFilter === String(bank.id) ? ' selected' : '') + '>' + escapeHtml(bank.name) + '</option>';
        });
        bankFilterEl.innerHTML = filterHtml;
        // 绑定筛选器 change 事件（每次渲染后重新绑定）
        bankFilterEl.onchange = function() {
          renderCollectionPage();
        };
      }

      var filterBankId = bankFilterEl && bankFilterEl.value ? parseInt(bankFilterEl.value, 10) : undefined;
      var collected = filterBankId ? allCollected.filter(function(q) { return q.bankId === filterBankId; }) : allCollected;

      if (collected.length === 0) {
        container.innerHTML = '<p class="empty-tip">暂无收藏题目</p>';
        return;
      }

      // Build bank name map
      var bankMap = {};
      banks.forEach(function(b) { bankMap[b.id] = b.name; });

      var html = '';
      collected.forEach(function(q) {
        var qType = q.type || 'choice';
        var truncated = q.content.length > 50 ? q.content.substring(0, 50) + '...' : q.content;
        html += '<div class="collection-card">';
        html += '<div class="collection-header">';
        html += '<span class="question-type ' + getTypeClass(qType) + '">' + getTypeLabel(qType) + '</span>';
        html += '<span class="collection-bank">' + escapeHtml(bankMap[q.bankId] || '未知题库') + '</span>';
        html += '</div>';
        html += '<div class="collection-question">' + escapeHtml(truncated) + '</div>';
        html += '<div class="collection-actions">';
        html += '<button class="btn btn-outline btn-small-action" data-question-id="' + q.id + '" onclick="window._uncollectQuestion(' + q.id + ')">取消收藏</button>';
        html += '<button class="btn btn-primary btn-small-action" data-question-id="' + q.id + '" data-bank-id="' + q.bankId + '" onclick="window._practiceCollected(' + q.bankId + ',' + q.id + ')">练习</button>';
        html += '</div>';
        html += '</div>';
      });

      html += '<div style="margin-top:16px;">';
      html += '<button class="btn btn-primary btn-block" id="btn-practice-all-collected">练习收藏题</button>';
      html += '</div>';

      container.innerHTML = html;

      var practiceAllBtn = document.getElementById('btn-practice-all-collected');
      if (practiceAllBtn) {
        practiceAllBtn.addEventListener('click', function() {
          startCollectionPractice(allCollected);
        });
      }
    } catch (e) {
      console.error('[App] 渲染收藏页面失败:', e);
      container.innerHTML = '<p class="empty-tip">加载收藏失败</p>';
    }
  }

  // ===== 练习收藏题 =====
  function startCollectionPractice(questions) {
    if (!questions || questions.length === 0) {
      showToast('没有收藏的题目');
      return;
    }
    currentBank = { id: 0, name: '收藏题练习' };
    currentQuestions = shuffleArray(questions);
    currentIndex = 0;
    answers = new Array(questions.length).fill(null);
    startTime = Date.now();
    examMode = false;
    cleanupPractice();

    saveProgress();
    hideResumeBanner();

    switchPage('practice');
    updateNavHighlight('practice');
    renderCurrentQuestion();
  }

  // ===== 取消收藏 =====
  window._uncollectQuestion = function(questionId) {
    toggleCollect(questionId).then(function() {
      showToast('已取消收藏');
      renderCollectionPage();
    }).catch(function(e) {
      console.error('[App] 取消收藏失败:', e);
      showToast('操作失败');
    });
  };

  // ===== 练习单个收藏题 =====
  window._practiceCollected = function(bankId, questionId) {
    // Start practice from the bank, then navigate to the question
    startPractice(bankId, 'sequential');
  };

  // ===== 获取题型标签 =====
  function getTypeLabel(type) {
    var labels = { choice: '单选题', multiple: '多选题', judgment: '判断题', fill: '填空题', essay: '简答题' };
    return labels[type] || '单选题';
  }

  function getTypeClass(type) {
    var classes = { choice: 'type-choice', multiple: 'type-multiple', judgment: 'type-judgment', fill: 'type-fill', essay: 'type-essay' };
    return classes[type] || 'type-choice';
  }

  // ===== 计时器 =====
  function startQuestionTimer() {
    stopQuestionTimer();
    questionStartTime = Date.now();
    updateTimerDisplay();
    questionTimer = setInterval(updateTimerDisplay, 1000);
  }

  function stopQuestionTimer() {
    if (questionTimer) {
      clearInterval(questionTimer);
      questionTimer = null;
    }
  }

  function updateTimerDisplay() {
    var timerEl = document.getElementById('timer-display');
    if (!timerEl || !questionStartTime) return;
    var elapsed = Math.floor((Date.now() - questionStartTime) / 1000);
    var minutes = Math.floor(elapsed / 60);
    var seconds = elapsed % 60;
    timerEl.textContent = (minutes < 10 ? '0' : '') + minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
  }

  function getQuestionTimeSpent() {
    if (!questionStartTime) return 0;
    return Date.now() - questionStartTime;
  }

  // ===== 收藏按钮 =====
  function updateCollectButton(question) {
    var btn = document.getElementById('btn-collect');
    if (!btn) return;
    if (question.isCollected) {
      btn.textContent = '★';
      btn.classList.add('collected');
    } else {
      btn.textContent = '☆';
      btn.classList.remove('collected');
    }
  }

  function handleToggleCollect() {
    var question = currentQuestions[currentIndex];
    if (!question) return;
    toggleCollect(question.id).then(function(isCollected) {
      question.isCollected = isCollected;
      updateCollectButton(question);
      // 收藏按钮弹跳动画
      var btn = document.getElementById('btn-collect');
      if (btn) {
        btn.classList.remove('pop');
        // 强制重排以重新触发动画
        void btn.offsetWidth;
        btn.classList.add('pop');
      }
      showToast(isCollected ? '已收藏' : '已取消收藏');
    }).catch(function(e) {
      console.error('[App] 收藏操作失败:', e);
      showToast('操作失败');
    });
  }

  // ===== 笔记按钮 =====
  function updateNoteIndicator(question) {
    var indicator = document.getElementById('note-indicator');
    if (!indicator) return;
    getNotesByQuestion(question.id).then(function(notes) {
      indicator.style.display = notes.length > 0 ? 'block' : 'none';
    }).catch(function() {
      indicator.style.display = 'none';
    });
  }

  function openNoteModal() {
    var question = currentQuestions[currentIndex];
    if (!question) return;
    var overlay = document.getElementById('note-modal-overlay');
    var textarea = document.getElementById('note-textarea');
    if (!overlay || !textarea) return;

    textarea.value = '';
    currentNoteId = null;

    getNotesByQuestion(question.id).then(function(notes) {
      if (notes.length > 0) {
        // 加载最新笔记
        var latest = notes.sort(function(a, b) { return b.updatedAt - a.updatedAt; })[0];
        textarea.value = latest.content || '';
        currentNoteId = latest.id;
      }
      overlay.style.display = 'flex';
      textarea.focus();
    }).catch(function(e) {
      console.error('[App] 加载笔记失败:', e);
      overlay.style.display = 'flex';
    });
  }

  function closeNoteModal() {
    var overlay = document.getElementById('note-modal-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  function saveNote() {
    var question = currentQuestions[currentIndex];
    if (!question) return;
    var textarea = document.getElementById('note-textarea');
    var content = textarea ? textarea.value.trim() : '';
    if (!content) {
      showToast('请输入笔记内容');
      return;
    }

    var promise;
    if (currentNoteId) {
      promise = updateNote(currentNoteId, content);
    } else {
      promise = addNote(question.id, currentBank ? currentBank.id : 0, content);
    }

    promise.then(function() {
      showToast('笔记已保存');
      closeNoteModal();
      updateNoteIndicator(question);
    }).catch(function(e) {
      console.error('[App] 保存笔记失败:', e);
      showToast('保存失败');
    });
  }

  // ===== 答题卡 =====
  function openAnswerSheet() {
    var overlay = document.getElementById('answer-sheet-overlay');
    var grid = document.getElementById('answer-sheet-grid');
    if (!overlay || !grid) return;

    var html = '';
    for (var i = 0; i < currentQuestions.length; i++) {
      var cls = 'answer-sheet-item';
      if (i === currentIndex) {
        cls += ' current';
      } else if (answers[i] !== null) {
        var q = currentQuestions[i];
        var isCorrect = checkAnswerCorrect(q, answers[i]);
        cls += isCorrect ? ' correct' : ' wrong';
      } else {
        cls += ' unanswered';
      }
      html += '<div class="' + cls + '" data-index="' + i + '">' + (i + 1) + '</div>';
    }
    grid.innerHTML = html;

    // 绑定点击跳转
    grid.querySelectorAll('.answer-sheet-item').forEach(function(item) {
      item.addEventListener('click', function() {
        var idx = parseInt(this.getAttribute('data-index'), 10);
        currentIndex = idx;
        saveProgress();
        closeAnswerSheet();
        renderCurrentQuestion();
      });
    });

    overlay.style.display = 'flex';
  }

  function closeAnswerSheet() {
    var overlay = document.getElementById('answer-sheet-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  // ===== 检查答案是否正确（通用） =====
  function checkAnswerCorrect(question, userAnswer) {
    if (userAnswer === null || userAnswer === undefined) return false;
    var qType = question.type || 'choice';
    if (qType === 'fill') {
      var fillParts = userAnswer.split('|');
      return fillParts[0] === 'correct';
    }
    if (qType === 'essay') {
      var essayParts = userAnswer.split('|');
      return essayParts[0] === 'correct';
    }
    if (qType === 'multiple') {
      // 多选题：比较排序后的选项
      var correctOpts = (question.answer || '').split('').sort().join('');
      var userOpts = (userAnswer || '').split('').sort().join('');
      return correctOpts === userOpts;
    }
    return userAnswer === question.answer;
  }

  // ===== 渲染当前题目 =====
  function renderCurrentQuestion() {
    if (!currentQuestions.length) return;

    const question = currentQuestions[currentIndex];
    const total = currentQuestions.length;
    const answered = answers.filter((a) => a !== null).length;

    // 运行时题型检测：修复旧数据中题型误判的问题
    var qType = question.type || 'choice';
    if (qType === 'choice') {
      // 题目含连续下划线填空标记，应为填空题
      if (/_{2,}|＿{2,}/.test(question.content)) {
        qType = 'fill';
        question.type = 'fill';
      }
      // 没有选项且答案为判断关键词，应为判断题
      else if ((!question.options || question.options.length === 0) && isJudgmentAnswerRuntime(question.answer)) {
        qType = 'judgment';
        question.type = 'judgment';
      }
      // 没有选项且答案不是A-D字母，应为填空题
      else if ((!question.options || question.options.length === 0) && question.answer && !/^[A-Da-d]$/.test(question.answer)) {
        qType = 'fill';
        question.type = 'fill';
      }
    }
    // 兜底：有2个以上选项且答案为A-D字母，一定是选择题
    if (qType !== 'choice' && qType !== 'multiple' && question.options && question.options.length >= 2 && /^[A-Da-d]$/.test(question.answer)) {
      qType = 'choice';
      question.type = 'choice';
    }

    // 更新练习页面头部题库名称
    const practiceHeader = document.getElementById('practice-bank-name');
    if (practiceHeader && currentBank) {
      practiceHeader.textContent = currentBank.name;
    }

    // 更新进度条
    const progressFill = document.getElementById('practice-progress-fill');
    const progressText = document.getElementById('practice-progress-text');
    if (progressFill) progressFill.style.width = Math.round((answered / total) * 100) + '%';
    if (progressText) progressText.textContent = (currentIndex + 1) + ' / ' + total;

    // 更新题号和题型标签
    const questionNumber = document.getElementById('question-number');
    if (questionNumber) {
      questionNumber.innerHTML = '第 ' + (currentIndex + 1) + ' 题 <span class="question-type ' + getTypeClass(qType) + '">' + getTypeLabel(qType) + '</span>';
    }

    const questionText = document.getElementById('question-text');
    if (questionText) questionText.textContent = question.content;

    // 更新收藏按钮
    updateCollectButton(question);

    // 更新笔记指示器
    updateNoteIndicator(question);

    // 启动计时器
    startQuestionTimer();

    // 题目卡片入场动画
    var questionCard = document.getElementById('question-card');
    if (questionCard) {
      questionCard.classList.remove('animate-in');
      void questionCard.offsetWidth;
      questionCard.classList.add('animate-in');
    }

    // 渲染答题区域
    const userAnswer = answers[currentIndex];
    const hasAnswered = userAnswer !== null;

    const optionsList = document.getElementById('options-list');
    if (optionsList) {
      let html = '';

      if (qType === 'judgment') {
        // 判断题：显示对/错按钮
        const judgmentOptions = [
          { label: '对', text: '正确' },
          { label: '错', text: '错误' }
        ];
        judgmentOptions.forEach((opt) => {
          let cls = 'option-btn judgment-btn';
          if (hasAnswered) {
            if (opt.label === question.answer) cls += ' correct';
            if (opt.label === userAnswer && userAnswer !== question.answer) cls += ' wrong';
            if (opt.label === userAnswer) cls += ' selected';
          }
          html += '<button class="' + cls + '" data-label="' + opt.label + '"' + (hasAnswered ? ' disabled' : '') + '>';
          html += '<span class="option-label judgment-label">' + opt.label + '</span>';
          html += '<span>' + opt.text + '</span>';
          html += '</button>';
        });
      } else if (qType === 'fill') {
        // 填空题
        if (hasAnswered) {
          // 解析答案格式：'correct|用户文本' 或 'wrong|用户文本' 或 'correct'/'wrong'
          var fillParts = userAnswer.split('|');
          var fillResult = fillParts[0]; // 'correct' 或 'wrong'
          var fillUserText = fillParts.length > 1 ? fillParts.slice(1).join('|') : '';

          if (fillUserText) {
            html += '<div class="fill-user-answer-card">';
            html += '<div class="fill-answer-label">你的答案</div>';
            html += '<div class="fill-user-text">' + escapeHtml(fillUserText) + '</div>';
            html += '</div>';
          }
          html += '<div class="fill-answer-card">';
          html += '<div class="fill-answer-label">正确答案</div>';
          html += '<div class="fill-answer-text">' + escapeHtml(question.answer) + '</div>';
          html += '</div>';
          html += '<div class="fill-result ' + (fillResult === 'correct' ? 'fill-result-correct' : 'fill-result-wrong') + '">';
          html += fillResult === 'correct' ? '回答正确' : '回答错误';
          html += '</div>';
        } else {
          html += '<div class="fill-input-area">';
          html += '<input type="text" class="fill-input" id="fill-input" placeholder="在此输入你的答案">';
          html += '<button class="btn btn-primary btn-block fill-submit-btn" id="fill-submit-answer">提交答案</button>';
          html += '</div>';
        }
      } else if (qType === 'multiple') {
        // 多选题：checkbox 风格，可多选
        var correctOpts = (question.answer || '').split('');
        var userOpts = hasAnswered ? userAnswer.split('') : [];

        (question.options || []).forEach((opt) => {
          let cls = 'multiple-option-btn';
          if (hasAnswered) {
            var isCorrectOpt = correctOpts.indexOf(opt.label) !== -1;
            var isUserOpt = userOpts.indexOf(opt.label) !== -1;
            if (isCorrectOpt) cls += ' correct';
            if (isUserOpt && !isCorrectOpt) cls += ' wrong';
            if (isUserOpt) cls += ' checked';
          }
          html += '<button class="' + cls + '" data-label="' + opt.label + '"' + (hasAnswered ? ' disabled' : '') + '>';
          html += '<span class="option-label">' + opt.label + '</span>';
          html += '<span>' + escapeHtml(opt.text) + '</span>';
          html += '</button>';
        });

        if (!hasAnswered) {
          html += '<button class="btn btn-primary btn-block multiple-submit-btn" id="multiple-submit-answer">确认提交</button>';
        }
      } else if (qType === 'essay') {
        // 简答题
        if (hasAnswered) {
          var essayParts = userAnswer.split('|');
          var essayResult = essayParts[0];
          var essayUserText = essayParts.length > 1 ? essayParts.slice(1).join('|') : '';

          if (essayUserText) {
            html += '<div class="fill-user-answer-card">';
            html += '<div class="fill-answer-label">你的答案</div>';
            html += '<div class="fill-user-text">' + escapeHtml(essayUserText) + '</div>';
            html += '</div>';
          }
          html += '<div class="essay-reference-card">';
          html += '<div class="essay-reference-label">参考答案</div>';
          html += '<div class="essay-reference-text">' + escapeHtml(question.answer) + '</div>';
          html += '</div>';
          html += '<div class="fill-result ' + (essayResult === 'correct' ? 'fill-result-correct' : 'fill-result-wrong') + '">';
          html += essayResult === 'correct' ? '回答正确' : '回答错误';
          html += '</div>';
        } else {
          html += '<textarea class="essay-textarea" id="essay-input" rows="4" placeholder="在此输入你的答案..."></textarea>';
          html += '<button class="btn btn-primary btn-block essay-submit-btn" id="essay-submit-answer">提交</button>';
        }
      } else {
        // 单选题：原有逻辑
        (question.options || []).forEach((opt) => {
          let cls = 'option-btn';
          if (hasAnswered) {
            if (opt.label === question.answer) cls += ' correct';
            if (opt.label === userAnswer && userAnswer !== question.answer) cls += ' wrong';
            if (opt.label === userAnswer) cls += ' selected';
          }
          html += '<button class="' + cls + '" data-label="' + opt.label + '"' + (hasAnswered ? ' disabled' : '') + '>';
          html += '<span class="option-label">' + opt.label + '</span>';
          html += '<span>' + escapeHtml(opt.text) + '</span>';
          html += '</button>';
        });
      }

      optionsList.innerHTML = html;

      // 绑定事件
      if (!hasAnswered) {
        if (qType === 'judgment' || qType === 'choice') {
          optionsList.querySelectorAll('.option-btn').forEach((btn) => {
            btn.addEventListener('click', function() {
              var label = this.getAttribute('data-label');
              handleAnswer(label);
            });
          });
        } else if (qType === 'fill') {
          var submitBtn = document.getElementById('fill-submit-answer');
          var fillInput = document.getElementById('fill-input');
          if (submitBtn) {
            submitBtn.addEventListener('click', function() {
              var userText = fillInput ? fillInput.value.trim() : '';
              showFillAnswer(userText);
            });
          }
          if (fillInput) {
            fillInput.addEventListener('keydown', function(e) {
              if (e.key === 'Enter') {
                e.preventDefault();
                var userText = fillInput.value.trim();
                showFillAnswer(userText);
              }
            });
          }
        } else if (qType === 'multiple') {
          // 多选题：点击选项切换选中状态
          var selectedMultiple = [];
          optionsList.querySelectorAll('.multiple-option-btn').forEach((btn) => {
            btn.addEventListener('click', function() {
              var label = this.getAttribute('data-label');
              var idx = selectedMultiple.indexOf(label);
              if (idx === -1) {
                selectedMultiple.push(label);
                this.classList.add('checked');
              } else {
                selectedMultiple.splice(idx, 1);
                this.classList.remove('checked');
              }
            });
          });
          var multipleSubmitBtn = document.getElementById('multiple-submit-answer');
          if (multipleSubmitBtn) {
            multipleSubmitBtn.addEventListener('click', function() {
              if (selectedMultiple.length === 0) {
                showToast('请至少选择一个选项');
                return;
              }
              handleMultipleAnswer(selectedMultiple.sort().join(''));
            });
          }
        } else if (qType === 'essay') {
          var essaySubmitBtn = document.getElementById('essay-submit-answer');
          if (essaySubmitBtn) {
            essaySubmitBtn.addEventListener('click', function() {
              var essayInput = document.getElementById('essay-input');
              var userText = essayInput ? essayInput.value.trim() : '';
              showEssayAnswer(userText);
            });
          }
        }
      }
    }

    // 解析区域
    const explanationEl = document.getElementById('question-explanation');
    if (explanationEl) {
      if (hasAnswered) {
        explanationEl.style.display = 'block';
        var expText = question.explanation || '暂无解析';
        explanationEl.innerHTML = '<div class="explanation-title">解析</div><div class="explanation-text">' + escapeHtml(expText) + '</div>';
        setTimeout(function() {
          explanationEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
      } else {
        explanationEl.style.display = 'none';
      }
    }

    // 更新按钮状态
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');

    if (btnPrev) btnPrev.disabled = currentIndex === 0;

    if (btnNext) {
      if (currentIndex === total - 1 && isAllAnswered()) {
        btnNext.textContent = '查看结果';
        btnNext.disabled = false;
      } else {
        btnNext.textContent = '下一题';
        btnNext.disabled = currentIndex >= total - 1;
      }
    }

    // 考试模式：显示交卷按钮
    var examSubmitBtn = document.getElementById('btn-exam-submit');
    if (examMode) {
      if (!examSubmitBtn) {
        var actionsDiv = document.querySelector('.practice-actions');
        if (actionsDiv) {
          examSubmitBtn = document.createElement('button');
          examSubmitBtn.className = 'btn btn-danger';
          examSubmitBtn.id = 'btn-exam-submit';
          examSubmitBtn.textContent = '交卷';
          examSubmitBtn.addEventListener('click', function() {
            submitExam();
          });
          actionsDiv.appendChild(examSubmitBtn);
        }
      }
    } else {
      if (examSubmitBtn) examSubmitBtn.remove();
    }
  }

  // ===== 显示填空题答案（供用户自评） =====
  function showFillAnswer(userText) {
    var question = currentQuestions[currentIndex];
    var optionsList = document.getElementById('options-list');
    if (!optionsList) return;

    var html = '';
    if (userText) {
      html += '<div class="fill-user-answer-card">';
      html += '<div class="fill-answer-label">你的答案</div>';
      html += '<div class="fill-user-text">' + escapeHtml(userText) + '</div>';
      html += '</div>';
    }
    html += '<div class="fill-answer-card">';
    html += '<div class="fill-answer-label">正确答案</div>';
    html += '<div class="fill-answer-text">' + escapeHtml(question.answer) + '</div>';
    html += '</div>';
    html += '<div class="fill-self-assess">';
    html += '<div class="fill-assess-label">你答对了吗？</div>';
    html += '<div class="fill-assess-btns">';
    html += '<button class="btn btn-fill-correct" id="fill-correct">答对了</button>';
    html += '<button class="btn btn-fill-wrong" id="fill-wrong">答错了</button>';
    html += '</div>';
    html += '</div>';

    optionsList.innerHTML = html;

    document.getElementById('fill-correct').addEventListener('click', function() {
      handleFillAnswer('correct');
    });
    document.getElementById('fill-wrong').addEventListener('click', function() {
      handleFillAnswer('wrong');
    });
  }

  // ===== 处理填空题自评 =====
  function handleFillAnswer(result) {
    var question = currentQuestions[currentIndex];
    if (!question) return;

    var isCorrect = result === 'correct';
    // 存储自评结果，同时保留用户输入文本（用 | 分隔）
    var fillInput = document.getElementById('fill-input');
    var userText = fillInput ? fillInput.value.trim() : '';
    var answerValue;
    if (userText) {
      answerValue = result + '|' + userText;
    } else {
      answerValue = result;
    }
    answers[currentIndex] = answerValue;

    var timeSpent = getQuestionTimeSpent();
    addRecord(question.id, currentBank.id, result, isCorrect, timeSpent).then(function() {
      renderCurrentQuestion();
      saveProgress();
      if (currentIndex === currentQuestions.length - 1 && isAllAnswered()) {
        var btnNext = document.getElementById('btn-next');
        if (btnNext) {
          btnNext.textContent = '查看结果';
          btnNext.disabled = false;
        }
      }
    }).catch(function(e) {
      console.error('[App] 保存答题记录失败:', e);
      answers[currentIndex] = null; // 回滚
      renderCurrentQuestion();
      showToast('保存失败，请重试');
    });
  }

  // ===== 处理多选题提交 =====
  function handleMultipleAnswer(selectedStr) {
    var question = currentQuestions[currentIndex];
    if (!question) return;

    var correctOpts = (question.answer || '').split('').sort().join('');
    var userOpts = selectedStr.split('').sort().join('');
    var isCorrect = correctOpts === userOpts;

    answers[currentIndex] = selectedStr;

    var timeSpent = getQuestionTimeSpent();
    addRecord(question.id, currentBank.id, selectedStr, isCorrect, timeSpent).then(function() {
      renderCurrentQuestion();
      saveProgress();
      if (currentIndex === currentQuestions.length - 1 && isAllAnswered()) {
        var btnNext = document.getElementById('btn-next');
        if (btnNext) {
          btnNext.textContent = '查看结果';
          btnNext.disabled = false;
        }
      }
    }).catch(function(e) {
      console.error('[App] 保存答题记录失败:', e);
      answers[currentIndex] = null; // 回滚
      renderCurrentQuestion();
      showToast('保存失败，请重试');
    });
  }

  // ===== 显示简答题答案（供用户自评） =====
  function showEssayAnswer(userText) {
    var question = currentQuestions[currentIndex];
    var optionsList = document.getElementById('options-list');
    if (!optionsList) return;

    var html = '';
    if (userText) {
      html += '<div class="fill-user-answer-card">';
      html += '<div class="fill-answer-label">你的答案</div>';
      html += '<div class="fill-user-text">' + escapeHtml(userText) + '</div>';
      html += '</div>';
    }
    html += '<div class="essay-reference-card">';
    html += '<div class="essay-reference-label">参考答案</div>';
    html += '<div class="essay-reference-text">' + escapeHtml(question.answer) + '</div>';
    html += '</div>';
    html += '<div class="fill-self-assess">';
    html += '<div class="fill-assess-label">你答对了吗？</div>';
    html += '<div class="fill-assess-btns">';
    html += '<button class="btn btn-fill-correct" id="essay-correct">答对了</button>';
    html += '<button class="btn btn-fill-wrong" id="essay-wrong">答错了</button>';
    html += '</div>';
    html += '</div>';

    optionsList.innerHTML = html;

    document.getElementById('essay-correct').addEventListener('click', function() {
      handleEssayAnswer('correct', userText);
    });
    document.getElementById('essay-wrong').addEventListener('click', function() {
      handleEssayAnswer('wrong', userText);
    });
  }

  // ===== 处理简答题自评 =====
  function handleEssayAnswer(result, userText) {
    var question = currentQuestions[currentIndex];
    if (!question) return;

    var isCorrect = result === 'correct';
    var answerValue;
    if (userText) {
      answerValue = result + '|' + userText;
    } else {
      answerValue = result;
    }
    answers[currentIndex] = answerValue;

    var timeSpent = getQuestionTimeSpent();
    addRecord(question.id, currentBank.id, result, isCorrect, timeSpent).then(function() {
      renderCurrentQuestion();
      saveProgress();
      if (currentIndex === currentQuestions.length - 1 && isAllAnswered()) {
        var btnNext = document.getElementById('btn-next');
        if (btnNext) {
          btnNext.textContent = '查看结果';
          btnNext.disabled = false;
        }
      }
    }).catch(function(e) {
      console.error('[App] 保存答题记录失败:', e);
      answers[currentIndex] = null; // 回滚
      renderCurrentQuestion();
      showToast('保存失败，请重试');
    });
  }

  // ===== 处理用户答题（选择题/判断题） =====
  function handleAnswer(label) {
    const question = currentQuestions[currentIndex];
    if (!question) return;

    const isCorrect = label === question.answer;
    answers[currentIndex] = label;

    var timeSpent = getQuestionTimeSpent();
    addRecord(question.id, currentBank.id, label, isCorrect, timeSpent).then(function() {
      renderCurrentQuestion();
      saveProgress();
      if (currentIndex === currentQuestions.length - 1 && isAllAnswered()) {
        const btnNext = document.getElementById('btn-next');
        if (btnNext) {
          btnNext.textContent = '查看结果';
          btnNext.disabled = false;
        }
      }
    }).catch(function(e) {
      console.error('[App] 保存答题记录失败:', e);
      answers[currentIndex] = null; // 回滚
      renderCurrentQuestion();
      showToast('保存失败，请重试');
    });
  }

  // ===== 检查是否全部答完 =====
  function isAllAnswered() {
    return answers.every((a) => a !== null);
  }

  // ===== 判断答案是否为判断题 =====
  function isJudgmentAnswerRuntime(answer) {
    if (!answer) return false;
    var a = answer.trim().toUpperCase();
    return ['对', '错', '√', '×', '✓', '✗', '正确', '错误', 'T', 'F', 'TRUE', 'FALSE', '是', '否'].includes(a);
  }

  // ===== 打乱数组 =====
  function shuffleArray(arr) {
    const shuffled = arr.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = temp;
    }
    return shuffled;
  }

  // ===== 练习页面按钮事件绑定 =====
  function bindPracticeEvents() {
    var btnPrev = document.getElementById('btn-prev');
    var btnNext = document.getElementById('btn-next');

    if (btnPrev && !btnPrev.dataset.bound) {
      btnPrev.dataset.bound = '1';
      btnPrev.addEventListener('click', function() {
        if (currentIndex > 0) {
          currentIndex--;
          saveProgress();
          renderCurrentQuestion();
        }
      });
    }

    if (btnNext && !btnNext.dataset.bound) {
      btnNext.dataset.bound = '1';
      btnNext.addEventListener('click', function() {
        if (currentIndex < currentQuestions.length - 1) {
          currentIndex++;
          saveProgress();
          renderCurrentQuestion();
        } else if (isAllAnswered()) {
          window.StatsModule.showResult();
        }
      });
    }

    // 收藏按钮
    var btnCollect = document.getElementById('btn-collect');
    if (btnCollect && !btnCollect.dataset.bound) {
      btnCollect.dataset.bound = '1';
      btnCollect.addEventListener('click', handleToggleCollect);
    }

    // 笔记按钮
    var btnNote = document.getElementById('btn-note');
    if (btnNote && !btnNote.dataset.bound) {
      btnNote.dataset.bound = '1';
      btnNote.addEventListener('click', openNoteModal);
    }

    // 笔记弹窗
    var noteModalClose = document.getElementById('note-modal-close');
    if (noteModalClose && !noteModalClose.dataset.bound) {
      noteModalClose.dataset.bound = '1';
      noteModalClose.addEventListener('click', closeNoteModal);
    }
    var noteModalCancel = document.getElementById('note-modal-cancel');
    if (noteModalCancel && !noteModalCancel.dataset.bound) {
      noteModalCancel.dataset.bound = '1';
      noteModalCancel.addEventListener('click', closeNoteModal);
    }
    var noteModalSave = document.getElementById('note-modal-save');
    if (noteModalSave && !noteModalSave.dataset.bound) {
      noteModalSave.dataset.bound = '1';
      noteModalSave.addEventListener('click', saveNote);
    }
    var noteModalOverlay = document.getElementById('note-modal-overlay');
    if (noteModalOverlay && !noteModalOverlay.dataset.bound) {
      noteModalOverlay.dataset.bound = '1';
      noteModalOverlay.addEventListener('click', function(e) {
        if (e.target === noteModalOverlay) closeNoteModal();
      });
    }

    // 答题卡按钮
    var btnAnswerSheet = document.getElementById('btn-answer-sheet');
    if (btnAnswerSheet && !btnAnswerSheet.dataset.bound) {
      btnAnswerSheet.dataset.bound = '1';
      btnAnswerSheet.addEventListener('click', openAnswerSheet);
    }
    var answerSheetClose = document.getElementById('answer-sheet-close');
    if (answerSheetClose && !answerSheetClose.dataset.bound) {
      answerSheetClose.dataset.bound = '1';
      answerSheetClose.addEventListener('click', closeAnswerSheet);
    }
    var answerSheetOverlay = document.getElementById('answer-sheet-overlay');
    if (answerSheetOverlay && !answerSheetOverlay.dataset.bound) {
      answerSheetOverlay.dataset.bound = '1';
      answerSheetOverlay.addEventListener('click', function(e) {
        if (e.target === answerSheetOverlay) closeAnswerSheet();
      });
    }
  }

  // ===== 错题回顾渲染 =====
  async function renderWrongPage() {
    const container = document.getElementById('wrong-list-container');
    if (!container) return;

    try {
      const wrongRecords = await getAllWrongRecords();

      if (wrongRecords.length === 0) {
        container.innerHTML = '<p class="empty-tip">暂无错题，继续保持！</p>';
        return;
      }

      let html = '';
      wrongRecords.forEach((record) => {
        const question = record.question;
        if (!question) return;

        var qType = question.type || 'choice';
        var answerDisplay = question.answer;
        var userAnswerDisplay = record.userAnswer || '未作答';

        if (qType === 'fill' || qType === 'essay') {
          answerDisplay = question.answer;
          var fillParts = (record.userAnswer || '').split('|');
          var fillResult = fillParts[0];
          var fillText = fillParts.length > 1 ? fillParts.slice(1).join('|') : '';
          userAnswerDisplay = fillText ? fillText + '（' + (fillResult === 'correct' ? '答对' : '答错') + '）' : (fillResult === 'correct' ? '答对' : '答错');
        } else if (qType === 'judgment') {
          answerDisplay = question.answer === '对' ? '正确' : '错误';
          userAnswerDisplay = record.userAnswer === '对' ? '正确' : '错误';
        } else if (qType === 'multiple') {
          answerDisplay = question.answer;
          userAnswerDisplay = record.userAnswer || '未作答';
        }

        html += '<div class="wrong-card">';
        html += '<div class="wrong-header">';
        html += '<span class="question-type ' + getTypeClass(qType) + '">' + getTypeLabel(qType) + '</span>';
        html += '</div>';
        html += '<div class="wrong-question">' + escapeHtml(question.content) + '</div>';
        html += '<div class="wrong-answer">正确答案：' + escapeHtml(answerDisplay) + '</div>';
        html += '<div class="wrong-your-answer">你的答案：' + escapeHtml(userAnswerDisplay) + '</div>';
        if (question.explanation) {
          html += '<div class="wrong-explanation">解析：' + escapeHtml(question.explanation) + '</div>';
        }
        html += '<div class="wrong-actions">';
        html += '<button class="btn btn-primary btn-small-action" data-question-id="' + question.id + '" data-bank-id="' + record.bankId + '" onclick="window._retryWrong(' + question.id + ',' + record.bankId + ')">重做</button>';
        html += '</div>';
        html += '</div>';
      });

      html += '<div style="margin-top:16px;">';
      html += '<button class="btn btn-accent btn-block" id="btn-retry-all-wrong">重练所有错题</button>';
      html += '</div>';

      container.innerHTML = html;

      const retryAllBtn = document.getElementById('btn-retry-all-wrong');
      if (retryAllBtn) {
        retryAllBtn.addEventListener('click', () => {
          retryAllWrong(wrongRecords);
        });
      }
    } catch (e) {
      console.error('[App] 渲染错题页面失败:', e);
      container.innerHTML = '<p class="empty-tip">加载错题失败</p>';
    }
  }

  // ===== 重做单道错题 =====
  window._retryWrong = function (questionId, bankId) {
    startPractice(bankId, 'random');
  };

  // ===== 重练所有错题 =====
  function retryAllWrong(wrongRecords) {
    const questions = [];
    wrongRecords.forEach((record) => {
      if (record.question) {
        questions.push(record.question);
      }
    });

    if (questions.length === 0) {
      showToast('没有可重练的错题');
      return;
    }

    currentBank = { id: 0, name: '错题重练' };
    currentQuestions = shuffleArray(questions);
    currentIndex = 0;
    answers = new Array(questions.length).fill(null);
    startTime = Date.now();

    saveProgress();
    hideResumeBanner();

    switchPage('practice');
    updateNavHighlight('practice');
    renderCurrentQuestion();
  }

  // 暴露到全局
  window.PracticeModule = {
    saveProgress: saveProgress,
    restoreProgress: restoreProgress,
    clearProgress: clearProgress,
    renderPracticePage: renderPracticePage,
    startPractice: startPractice,
    renderCurrentQuestion: renderCurrentQuestion,
    handleAnswer: handleAnswer,
    handleFillAnswer: handleFillAnswer,
    showFillAnswer: showFillAnswer,
    handleMultipleAnswer: handleMultipleAnswer,
    showEssayAnswer: showEssayAnswer,
    handleEssayAnswer: handleEssayAnswer,
    isAllAnswered: isAllAnswered,
    getTypeLabel: getTypeLabel,
    getTypeClass: getTypeClass,
    isJudgmentAnswerRuntime: isJudgmentAnswerRuntime,
    bindPracticeEvents: bindPracticeEvents,
    retryAllWrong: retryAllWrong,
    renderWrongPage: renderWrongPage,
    showResumeBanner: showResumeBanner,
    hideResumeBanner: hideResumeBanner,
    shuffleArray: shuffleArray,
    openAnswerSheet: openAnswerSheet,
    closeAnswerSheet: closeAnswerSheet,
    openNoteModal: openNoteModal,
    closeNoteModal: closeNoteModal,
    saveNote: saveNote,
    handleToggleCollect: handleToggleCollect,
    startQuestionTimer: startQuestionTimer,
    stopQuestionTimer: stopQuestionTimer,
    checkAnswerCorrect: checkAnswerCorrect,
    // 新增：练习模式
    showSpecialPracticeModal: showSpecialPracticeModal,
    showExamSettingsModal: showExamSettingsModal,
    startWrongPractice: startWrongPractice,
    submitExam: submitExam,
    // 新增：收藏页面
    renderCollectionPage: renderCollectionPage,
    // 状态访问器
    getCurrentBank: function () { return currentBank; },
    getCurrentQuestions: function () { return currentQuestions; },
    getCurrentIndex: function () { return currentIndex; },
    getAnswers: function () { return answers; },
    getStartTime: function () { return startTime; },
    isExamMode: function () { return examMode; },
    cleanupPractice: cleanupPractice
  };
})();
