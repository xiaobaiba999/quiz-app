// 刷题助手 - 题库详情与题目编辑模块

(function () {
  'use strict';

  var escapeHtml = window.UIModule.escapeHtml;
  var showToast = window.UIModule.showToast;
  var showModal = window.UIModule.showModal;

  // 当前查看的题库 ID
  var currentDetailBankId = null;

  // 题型映射
  var TYPE_OPTIONS = [
    { value: 'choice', label: '选择题' },
    { value: 'multiple', label: '多选题' },
    { value: 'judgment', label: '判断题' },
    { value: 'fill', label: '填空题' },
    { value: 'essay', label: '简答题' }
  ];

  function getTypeLabel(type) {
    var labels = { choice: '选择题', multiple: '多选题', judgment: '判断题', fill: '填空题', essay: '简答题' };
    return labels[type] || '选择题';
  }

  function getTypeClass(type) {
    var classes = { choice: 'type-choice', multiple: 'type-multiple', judgment: 'type-judgment', fill: 'type-fill', essay: 'type-essay' };
    return classes[type] || 'type-choice';
  }

  // ===== 渲染题库详情页 =====
  async function renderBankDetail(bankId) {
    currentDetailBankId = bankId;
    window.UIModule.showLoading();

    try {
      var banks = await getAllBanks();
      var bank = banks.find(function (b) { return b.id === bankId; });
      if (!bank) {
        showToast('题库不存在');
        navigateTo('#bank-list');
        return;
      }

      // 更新标题
      var titleEl = document.getElementById('bank-detail-title');
      if (titleEl) titleEl.textContent = bank.name;

      // 渲染统计
      var questions = await getQuestionsByBank(bankId);
      var typeCounts = {};
      TYPE_OPTIONS.forEach(function (t) { typeCounts[t.value] = 0; });
      questions.forEach(function (q) {
        var t = q.type || 'choice';
        if (typeCounts[t] === undefined) typeCounts[t] = 0;
        typeCounts[t]++;
      });

      var statsEl = document.getElementById('bank-detail-stats');
      if (statsEl) {
        var html = '';
        html += '<div class="bank-detail-stat">';
        html += '<div class="stat-number">' + questions.length + '</div>';
        html += '<div class="stat-label">总题数</div>';
        html += '</div>';

        // 显示前两个题型数量
        var typeKeys = Object.keys(typeCounts).filter(function (k) { return typeCounts[k] > 0; });
        for (var i = 0; i < Math.min(2, typeKeys.length); i++) {
          html += '<div class="bank-detail-stat">';
          html += '<div class="stat-number">' + typeCounts[typeKeys[i]] + '</div>';
          html += '<div class="stat-label">' + getTypeLabel(typeKeys[i]) + '</div>';
          html += '</div>';
        }
        // 如果还有更多题型，合并显示
        if (typeKeys.length > 3) {
          var restCount = 0;
          for (var j = 2; j < typeKeys.length; j++) {
            restCount += typeCounts[typeKeys[j]];
          }
          html += '<div class="bank-detail-stat">';
          html += '<div class="stat-number">' + restCount + '</div>';
          html += '<div class="stat-label">其他</div>';
          html += '</div>';
        }

        statsEl.innerHTML = html;
      }

      // 渲染题目列表
      renderQuestionList(questions);

    } catch (e) {
      console.error('[Edit] 渲染题库详情失败:', e);
      showToast('加载题库详情失败');
    } finally {
      window.UIModule.hideLoading();
    }
  }

  // ===== 渲染题目列表 =====
  function renderQuestionList(questions) {
    var container = document.getElementById('bank-detail-question-list');
    if (!container) return;

    if (questions.length === 0) {
      container.innerHTML = '<p class="empty-tip">暂无题目，点击上方添加</p>';
      return;
    }

    var html = '';
    questions.forEach(function (q, index) {
      var qType = q.type || 'choice';
      html += '<div class="question-item">';
      html += '<div class="question-item-header">';
      html += '<div class="question-item-left">';
      html += '<span class="question-item-number">' + (index + 1) + '.</span>';
      html += '<span class="question-type ' + getTypeClass(qType) + '">' + getTypeLabel(qType) + '</span>';
      html += '</div>';
      html += '<div class="question-item-actions">';
      html += '<button class="question-item-btn btn-edit" data-question-id="' + q.id + '" title="编辑">';
      html += '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
      html += '</button>';
      html += '<button class="question-item-btn btn-delete" data-question-id="' + q.id + '" title="删除">';
      html += '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
      html += '</button>';
      html += '</div>';
      html += '</div>';
      html += '<div class="question-item-content">' + escapeHtml(q.content) + '</div>';
      html += '</div>';
    });

    container.innerHTML = html;

    // 绑定编辑/删除按钮事件
    container.querySelectorAll('.btn-edit').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var qId = parseInt(this.getAttribute('data-question-id'), 10);
        openEditQuestionModal(qId);
      });
    });

    container.querySelectorAll('.btn-delete').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var qId = parseInt(this.getAttribute('data-question-id'), 10);
        confirmDeleteQuestion(qId);
      });
    });
  }

  // ===== 确认删除题目 =====
  function confirmDeleteQuestion(questionId) {
    showModal('确认删除', '确定要删除该题目吗？此操作不可恢复。', function () {
      deleteQuestion(questionId).then(function () {
        showToast('题目已删除');
        // 更新题库计数
        if (currentDetailBankId) {
          updateBankCount(currentDetailBankId);
        }
        renderBankDetail(currentDetailBankId);
      }).catch(function (e) {
        console.error('[Edit] 删除题目失败:', e);
        showToast('删除失败');
      });
    });
  }

  // ===== 更新题库题目计数 =====
  async function updateBankCount(bankId) {
    try {
      var count = await getQuestionsCountByBank(bankId);
      var banks = await getAllBanks();
      var bank = banks.find(function (b) { return b.id === bankId; });
      if (bank) {
        bank.count = count;
        // 使用 withTransaction 更新 bank
        await withTransaction(['banks'], 'readwrite', function (stores) {
          return new Promise(function (resolve, reject) {
            var request = stores[0].put(bank);
            request.onsuccess = function () { resolve(); };
            request.onerror = function () { reject(request.error); };
          });
        });
      }
    } catch (e) {
      console.error('[Edit] 更新题库计数失败:', e);
    }
  }

  // ===== 打开添加题目弹窗 =====
  function openAddQuestionModal() {
    if (!currentDetailBankId) return;
    showQuestionFormModal(null);
  }

  // ===== 打开编辑题目弹窗 =====
  async function openEditQuestionModal(questionId) {
    try {
      var questions = await getQuestionsByBank(currentDetailBankId);
      var question = questions.find(function (q) { return q.id === questionId; });
      if (!question) {
        showToast('题目不存在');
        return;
      }
      showQuestionFormModal(question);
    } catch (e) {
      console.error('[Edit] 加载题目失败:', e);
      showToast('加载题目失败');
    }
  }

  // ===== 显示题目表单弹窗 =====
  function showQuestionFormModal(question) {
    var isEdit = !!question;
    var title = isEdit ? '编辑题目' : '添加题目';

    var qType = question ? (question.type || 'choice') : 'choice';
    var qContent = question ? question.content : '';
    var qAnswer = question ? (question.answer || '') : '';
    var qExplanation = question ? (question.explanation || '') : '';
    var qTags = question && question.tags ? question.tags.join(', ') : '';
    var qOptions = question && question.options ? question.options : [];

    // 构建选项值
    var optA = '', optB = '', optC = '', optD = '';
    qOptions.forEach(function (opt) {
      if (opt.label === 'A') optA = opt.text || '';
      if (opt.label === 'B') optB = opt.text || '';
      if (opt.label === 'C') optC = opt.text || '';
      if (opt.label === 'D') optD = opt.text || '';
    });

    var content = '';
    content += '<div class="question-form-group">';
    content += '<label for="qf-type">题型</label>';
    content += '<select id="qf-type">';
    TYPE_OPTIONS.forEach(function (t) {
      content += '<option value="' + t.value + '"' + (t.value === qType ? ' selected' : '') + '>' + t.label + '</option>';
    });
    content += '</select>';
    content += '</div>';

    content += '<div class="question-form-group">';
    content += '<label for="qf-content">题目内容</label>';
    content += '<textarea id="qf-content" rows="3">' + escapeHtml(qContent) + '</textarea>';
    content += '</div>';

    // 选项区域（选择题/多选题显示）
    content += '<div class="question-form-group" id="qf-options-group">';
    content += '<label>选项</label>';
    content += '<div class="question-form-options">';
    content += '<div class="question-form-option-row"><span class="question-form-option-label">A</span><input type="text" id="qf-opt-a" value="' + escapeHtml(optA) + '" placeholder="选项A"></div>';
    content += '<div class="question-form-option-row"><span class="question-form-option-label">B</span><input type="text" id="qf-opt-b" value="' + escapeHtml(optB) + '" placeholder="选项B"></div>';
    content += '<div class="question-form-option-row"><span class="question-form-option-label">C</span><input type="text" id="qf-opt-c" value="' + escapeHtml(optC) + '" placeholder="选项C"></div>';
    content += '<div class="question-form-option-row"><span class="question-form-option-label">D</span><input type="text" id="qf-opt-d" value="' + escapeHtml(optD) + '" placeholder="选项D"></div>';
    content += '</div>';
    content += '</div>';

    // 答案区域
    content += '<div class="question-form-group" id="qf-answer-group">';
    content += '<label for="qf-answer">答案</label>';
    // 选择题答案下拉
    content += '<select id="qf-answer-choice">';
    ['A', 'B', 'C', 'D'].forEach(function (l) {
      content += '<option value="' + l + '"' + (qAnswer === l ? ' selected' : '') + '>' + l + '</option>';
    });
    content += '</select>';
    // 多选题答案复选框
    content += '<div class="question-form-answer-checkboxes" id="qf-answer-multiple" style="display:none;">';
    ['A', 'B', 'C', 'D'].forEach(function (l) {
      var checked = qAnswer.indexOf(l) !== -1 ? ' checked' : '';
      content += '<label class="question-form-answer-checkbox"><input type="checkbox" value="' + l + '"' + checked + '>' + l + '</label>';
    });
    content += '</div>';
    // 判断题答案下拉
    content += '<select id="qf-answer-judgment" style="display:none;">';
    content += '<option value="对"' + (qAnswer === '对' ? ' selected' : '') + '>对</option>';
    content += '<option value="错"' + (qAnswer === '错' ? ' selected' : '') + '>错</option>';
    content += '</select>';
    // 填空题/简答题答案输入
    content += '<input type="text" id="qf-answer-text" value="' + escapeHtml(qAnswer) + '" placeholder="请输入答案" style="display:none;">';
    content += '</div>';

    content += '<div class="question-form-group">';
    content += '<label for="qf-explanation">解析</label>';
    content += '<textarea id="qf-explanation" rows="2">' + escapeHtml(qExplanation) + '</textarea>';
    content += '</div>';

    content += '<div class="question-form-group">';
    content += '<label for="qf-tags">标签（逗号分隔）</label>';
    content += '<input type="text" id="qf-tags" value="' + escapeHtml(qTags) + '" placeholder="如：TCP, 传输层">';
    content += '</div>';

    showModal(title, content, null);

    setTimeout(function () {
      // 切换题型时更新选项和答案区域
      var typeSelect = document.getElementById('qf-type');
      if (typeSelect) {
        updateFormVisibility(typeSelect.value);
        typeSelect.addEventListener('change', function () {
          updateFormVisibility(this.value);
          resetFormFields(this.value);
        });
      }

      // 替换取消按钮为保存按钮
      var cancelBtn = document.getElementById('modal-cancel');
      if (cancelBtn) {
        cancelBtn.textContent = '取消';
      }

      var modalActions = document.querySelector('.modal-actions');
      if (modalActions) {
        var saveBtn = document.createElement('button');
        saveBtn.className = 'btn btn-primary';
        saveBtn.id = 'qf-save-btn';
        saveBtn.textContent = '保存';
        modalActions.appendChild(saveBtn);

        saveBtn.addEventListener('click', function () {
          saveQuestionForm(isEdit ? question.id : null);
        });
      }
    }, 50);
  }

  // ===== 根据题型更新表单可见性 =====
  function updateFormVisibility(type) {
    var optionsGroup = document.getElementById('qf-options-group');
    var answerChoice = document.getElementById('qf-answer-choice');
    var answerMultiple = document.getElementById('qf-answer-multiple');
    var answerJudgment = document.getElementById('qf-answer-judgment');
    var answerText = document.getElementById('qf-answer-text');

    // 选项区域：仅选择题/多选题显示
    if (optionsGroup) {
      optionsGroup.style.display = (type === 'choice' || type === 'multiple') ? '' : 'none';
    }

    // 答案区域
    if (answerChoice) answerChoice.style.display = type === 'choice' ? '' : 'none';
    if (answerMultiple) answerMultiple.style.display = type === 'multiple' ? '' : 'none';
    if (answerJudgment) answerJudgment.style.display = type === 'judgment' ? '' : 'none';
    if (answerText) {
      if (type === 'fill') {
        answerText.style.display = '';
        answerText.placeholder = '请输入答案';
        answerText.type = 'text';
      } else if (type === 'essay') {
        answerText.style.display = '';
        answerText.placeholder = '请输入参考答案';
        answerText.type = 'text';
      } else {
        answerText.style.display = 'none';
      }
    }
  }

  // ===== 题型切换时重置表单字段 =====
  function resetFormFields(type) {
    // 重置选项值
    var optA = document.getElementById('qf-opt-a');
    var optB = document.getElementById('qf-opt-b');
    var optC = document.getElementById('qf-opt-c');
    var optD = document.getElementById('qf-opt-d');
    if (optA) optA.value = '';
    if (optB) optB.value = '';
    if (optC) optC.value = '';
    if (optD) optD.value = '';

    // 重置答案值
    var answerChoice = document.getElementById('qf-answer-choice');
    var answerMultiple = document.getElementById('qf-answer-multiple');
    var answerJudgment = document.getElementById('qf-answer-judgment');
    var answerText = document.getElementById('qf-answer-text');

    if (answerChoice) answerChoice.value = 'A';
    if (answerMultiple) {
      answerMultiple.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
        cb.checked = false;
      });
    }
    if (answerJudgment) answerJudgment.value = '对';
    if (answerText) answerText.value = '';
  }

  // ===== 保存题目表单 =====
  async function saveQuestionForm(editQuestionId) {
    var typeSelect = document.getElementById('qf-type');
    var contentInput = document.getElementById('qf-content');
    var explanationInput = document.getElementById('qf-explanation');
    var tagsInput = document.getElementById('qf-tags');

    var type = typeSelect ? typeSelect.value : 'choice';
    var content = contentInput ? contentInput.value.trim() : '';
    var explanation = explanationInput ? explanationInput.value.trim() : '';
    var tagsStr = tagsInput ? tagsInput.value.trim() : '';
    var tags = tagsStr ? tagsStr.split(/[,，、]/).map(function (t) { return t.trim(); }).filter(Boolean) : [];

    if (!content) {
      showToast('请输入题目内容');
      return;
    }

    // 获取答案
    var answer = '';
    if (type === 'choice') {
      var answerChoice = document.getElementById('qf-answer-choice');
      answer = answerChoice ? answerChoice.value : 'A';
    } else if (type === 'multiple') {
      var checkboxes = document.querySelectorAll('#qf-answer-multiple input[type="checkbox"]:checked');
      var selected = [];
      checkboxes.forEach(function (cb) { selected.push(cb.value); });
      if (selected.length === 0) {
        showToast('请至少选择一个答案');
        return;
      }
      answer = selected.sort().join('');
    } else if (type === 'judgment') {
      var answerJudgment = document.getElementById('qf-answer-judgment');
      answer = answerJudgment ? answerJudgment.value : '对';
    } else {
      var answerText = document.getElementById('qf-answer-text');
      answer = answerText ? answerText.value.trim() : '';
      if (!answer) {
        showToast('请输入答案');
        return;
      }
    }

    // 获取选项
    var options = [];
    if (type === 'choice' || type === 'multiple') {
      var optA = document.getElementById('qf-opt-a');
      var optB = document.getElementById('qf-opt-b');
      var optC = document.getElementById('qf-opt-c');
      var optD = document.getElementById('qf-opt-d');

      options = [
        { label: 'A', text: optA ? optA.value.trim() : '' },
        { label: 'B', text: optB ? optB.value.trim() : '' },
        { label: 'C', text: optC ? optC.value.trim() : '' },
        { label: 'D', text: optD ? optD.value.trim() : '' }
      ].filter(function (o) { return o.text !== ''; });
    }

    try {
      if (editQuestionId) {
        // 编辑模式
        await updateQuestion(editQuestionId, {
          type: type,
          content: content,
          options: options,
          answer: answer,
          explanation: explanation,
          tags: tags
        });
        showToast('题目已更新');
      } else {
        // 添加模式
        // 获取当前最大 order
        var existingQuestions = await getQuestionsByBank(currentDetailBankId);
        var maxOrder = 0;
        existingQuestions.forEach(function (q) {
          if (q.order > maxOrder) maxOrder = q.order;
        });

        await addQuestions(currentDetailBankId, [{
          type: type,
          content: content,
          options: options,
          answer: answer,
          explanation: explanation,
          tags: tags,
          order: maxOrder + 1
        }]);

        // 更新题库计数
        await updateBankCount(currentDetailBankId);

        showToast('题目已添加');
      }

      window.UIModule.closeModal();
      renderBankDetail(currentDetailBankId);
    } catch (e) {
      console.error('[Edit] 保存题目失败:', e);
      showToast('保存失败');
    }
  }

  // ===== 绑定事件 =====
  function bindEditEvents() {
    var addBtn = document.getElementById('btn-add-question');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        openAddQuestionModal();
      });
    }

    var backBtn = document.getElementById('btn-bank-detail-back');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        navigateTo('#bank-list');
      });
    }
  }

  // 暴露到全局
  window.EditModule = {
    renderBankDetail: renderBankDetail,
    bindEditEvents: bindEditEvents,
    getCurrentDetailBankId: function () { return currentDetailBankId; }
  };
})();
