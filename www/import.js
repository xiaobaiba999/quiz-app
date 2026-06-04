// 刷题助手 - 题库导入与解析模块

// 文件大小和题目数量限制
var MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
var MAX_QUESTIONS = 2000;

// 当前解析结果缓存
var parsedQuestions = [];
// 未解析行警告缓存
var parsedWarnings = [];

/**
 * 内联 Toast 提示（替代 alert）
 */
function _showImportToast(msg) {
  var toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.remove('show');
  requestAnimationFrame(function () {
    toast.classList.add('show');
  });
  setTimeout(function () {
    toast.classList.remove('show');
    setTimeout(function () { if (toast.parentNode) toast.remove(); }, 300);
  }, 2500);
}

/**
 * 处理文件导入（仅支持 TXT / Markdown）
 */
function handleFileImport(file) {
  var ext = file.name.split('.').pop().toLowerCase();
  var supportedExts = ['txt', 'md', 'markdown'];

  if (!supportedExts.includes(ext)) {
    _showImportToast('不支持的文件格式，请导入 TXT 或 Markdown 文件');
    return;
  }

  if (file.size > MAX_FILE_SIZE) {
    _showImportToast('文件过大，请选择10MB以内的文件');
    return;
  }

  var reader = new FileReader();
  reader.onload = function (e) {
    var text = e.target.result;
    try {
      parsedWarnings = [];
      if (ext === 'txt') {
        parsedQuestions = parseTXT(text);
      } else {
        parsedQuestions = parseMarkdown(text);
      }

      if (parsedQuestions.length === 0) {
        _showImportToast('未能解析出任何题目，请检查文件格式是否正确');
        return;
      }

      if (parsedQuestions.length > MAX_QUESTIONS) {
        _showImportToast('题目数量超过 ' + MAX_QUESTIONS + ' 道，导入可能较慢');
      }

      _showImportPreview(file.name, parsedQuestions);
    } catch (err) {
      _showImportToast('解析文件失败：' + err.message);
    }
  };
  reader.readAsText(file, 'UTF-8');
}

/**
 * 显示导入预览
 */
function _showImportPreview(fileName, questions) {
  var previewEl = document.getElementById('import-preview');
  var fileInfoEl = document.getElementById('import-file-info');
  var statsEl = document.getElementById('import-preview-stats');
  var nameInput = document.getElementById('bank-name-input');

  previewEl.style.display = '';
  fileInfoEl.textContent = '文件：' + fileName;

  var bankName = fileName.replace(/\.[^.]+$/, '');
  nameInput.value = bankName;

  var typeCounts = { choice: 0, multiple: 0, judgment: 0, fill: 0, essay: 0 };
  questions.forEach(function (q) { typeCounts[q.type] = (typeCounts[q.type] || 0) + 1; });
  var statsText = '解析出 ' + questions.length + ' 道题目';
  var parts = [];
  if (typeCounts.choice > 0) parts.push('单选' + typeCounts.choice);
  if (typeCounts.multiple > 0) parts.push('多选' + typeCounts.multiple);
  if (typeCounts.judgment > 0) parts.push('判断' + typeCounts.judgment);
  if (typeCounts.fill > 0) parts.push('填空' + typeCounts.fill);
  if (typeCounts.essay > 0) parts.push('简答' + typeCounts.essay);
  if (parts.length > 0) statsText += '（' + parts.join('、') + '）';
  statsEl.textContent = statsText;

  _renderImportWarnings();
}

/**
 * 渲染未解析行警告
 */
function _renderImportWarnings() {
  var warnEl = document.getElementById('import-warnings');
  if (parsedWarnings.length === 0) {
    if (warnEl) warnEl.remove();
    return;
  }
  if (!warnEl) {
    warnEl = document.createElement('div');
    warnEl.id = 'import-warnings';
    warnEl.className = 'import-warnings';
    var statsEl = document.getElementById('import-preview-stats');
    statsEl.parentNode.insertBefore(warnEl, statsEl.nextSibling);
  }
  var html = '<div class="warning-title">⚠ 以下行未能解析：</div>';
  parsedWarnings.forEach(function (w) {
    html += '<div class="warning-line">第' + w.line + '行：' + _escapeHtml(w.text) + '</div>';
  });
  warnEl.innerHTML = html;
}

function _escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ===== 判断答案是否为判断题 =====
function isJudgmentAnswer(answer) {
  if (!answer) return false;
  var a = answer.trim().toUpperCase();
  return ['对', '错', '√', '×', '✓', '✗', '正确', '错误', 'T', 'F', 'TRUE', 'FALSE', '是', '否'].indexOf(a) >= 0;
}

// ===== 判断答案是否为多选题 =====
function isMultipleChoiceAnswer(answer) {
  if (!answer) return false;
  var letters = answer.replace(/[,，、\s]/g, '').match(/[A-Da-d]/g);
  if (!letters || letters.length < 2) return false;
  var unique = [];
  letters.map(function (l) { return l.toUpperCase(); }).forEach(function (l) {
    if (unique.indexOf(l) < 0) unique.push(l);
  });
  return unique.length >= 2;
}

// ===== 提取多选题答案 =====
function extractMultipleAnswer(answer) {
  if (!answer) return '';
  var letters = answer.replace(/[,，、\s]/g, '').match(/[A-Da-d]/g);
  if (!letters) return '';
  var unique = [];
  letters.map(function (l) { return l.toUpperCase(); }).forEach(function (l) {
    if (unique.indexOf(l) < 0) unique.push(l);
  });
  return unique.join('');
}

// ===== 标准化答案 =====
function normalizeAnswer(answer, type) {
  if (!answer) return '';
  var a = answer.trim();
  if (type === 'judgment') {
    var upper = a.toUpperCase();
    if (['对', '√', '✓', '正确', 'T', 'TRUE', '是'].indexOf(upper) >= 0) return '对';
    return '错';
  }
  if (type === 'multiple') {
    return extractMultipleAnswer(a);
  }
  if (type === 'choice') {
    var match = a.match(/^([A-Da-d])/);
    return match ? match[1].toUpperCase() : a.toUpperCase();
  }
  return a;
}

// ===== 尝试拆分选项文本中的内联选项 =====
function trySplitInlineOptions(text) {
  if (!text) return null;
  var regex = /([B-Db-d])[.、]\s*/g;
  var matches = [];
  var m;
  while ((m = regex.exec(text)) !== null) {
    matches.push({ index: m.index, label: m[1].toUpperCase(), afterIndex: m.index + m[0].length });
  }
  if (matches.length === 0) return null;

  var firstText = text.substring(0, matches[0].index).trim();
  var options = [];
  for (var i = 0; i < matches.length; i++) {
    var start = matches[i].afterIndex;
    var end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    options.push({ label: matches[i].label, text: text.substring(start, end).trim() });
  }
  return { firstText: firstText, options: options };
}

// ===== 从未解析行中提取内联选项 =====
function extractInlineOptions(line) {
  var regex = /([A-Da-d])[.、]\s*/g;
  var matches = [];
  var m;
  while ((m = regex.exec(line)) !== null) {
    matches.push({ index: m.index, label: m[1].toUpperCase(), afterIndex: m.index + m[0].length });
  }
  if (matches.length === 0) return { options: [], textBefore: line };

  var textBefore = line.substring(0, matches[0].index).trim();
  var options = [];
  for (var i = 0; i < matches.length; i++) {
    var start = matches[i].afterIndex;
    var end = i + 1 < matches.length ? matches[i + 1].index : line.length;
    options.push({ label: matches[i].label, text: line.substring(start, end).trim() });
  }
  return { options: options, textBefore: textBefore };
}

// ===== 判断题型 =====
function detectType(content, answer, finalOptions) {
  if (isMultipleChoiceAnswer(answer)) return 'multiple';
  if (content && /简答/.test(content)) return 'essay';
  if (/_{2,}|＿{2,}/.test(content)) return 'fill';
  if (isJudgmentAnswer(answer)) return 'judgment';
  if (answer && !/^[A-Da-d]$/.test(answer) && !/^[A-Da-d][.、]/.test(answer)) {
    if (answer.length > 10) return 'essay';
    return 'fill';
  }
  return 'choice';
}

// ===== 安全检查 =====
function applySafetyCheck(type, answer, finalOptions) {
  if (type !== 'choice' && type !== 'multiple' && finalOptions.length >= 2 && /^[A-Da-d]$/.test(answer)) {
    return 'choice';
  }
  return type;
}

/**
 * 解析 TXT 格式题库
 */
function parseTXT(text) {
  var questions = [];
  var warnings = [];
  var blocks = text.split(/\n\s*\n/);

  for (var bi = 0; bi < blocks.length; bi++) {
    var block = blocks[bi];
    var lines = block.split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l.length > 0; });
    if (lines.length === 0) continue;

    var content = '';
    var options = [];
    var answer = '';
    var explanation = '';
    var tags = [];
    var hasQuestionLine = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var lineNum = i + 1;

      // 跳过章节标题行
      if (/^(?:选择|判断|填空|简答|问答|计算|综合|应用)[题题]/.test(line)) continue;
      if (/^[（(]\s*(?:每|共)\s*\d+/.test(line)) continue;
      if (/^[（(]$/.test(line)) continue;

      // 题目行
      var questionMatch = line.match(/^(\d+)[.、）)]\s*(.+)/);
      if (questionMatch) {
        content = questionMatch[2].trim();
        hasQuestionLine = true;
        continue;
      }

      // 选项行
      var optionMatch = line.match(/^([A-Da-d])[.、]\s*(.*)/);
      if (optionMatch) {
        options.push({ label: optionMatch[1].toUpperCase(), text: optionMatch[2].trim() });
        continue;
      }

      // 单独字母选项行
      var standaloneMatch = line.match(/^([A-Da-d])$/);
      if (standaloneMatch) {
        options.push({ label: standaloneMatch[1].toUpperCase(), text: '' });
        continue;
      }

      // 答案行
      var answerMatch = line.match(/^答案\s*[:：]\s*(.+)/);
      if (answerMatch) { answer = answerMatch[1].trim(); continue; }

      // 解析行
      var explanationMatch = line.match(/^解[释析]\s*[:：]\s*(.+)/);
      if (explanationMatch) { explanation = explanationMatch[1].trim(); continue; }

      // 标签行
      var tagMatch = line.match(/^(?:标签|分类)\s*[:：]\s*(.+)/);
      if (tagMatch) {
        var tagStr = tagMatch[1].trim();
        var parsedTags = tagStr.split(/[,，、]/).map(function (t) { return t.trim(); }).filter(function (t) { return t.length > 0; });
        tags = tags.concat(parsedTags);
        continue;
      }

      // 未匹配行处理
      if (options.length > 0) {
        var lastOpt = options[options.length - 1];
        if (lastOpt.text === '') { lastOpt.text = line; continue; }
        var extracted = extractInlineOptions(line);
        if (extracted.options.length > 0) {
          if (extracted.textBefore && lastOpt.text === '') lastOpt.text = extracted.textBefore;
          options = options.concat(extracted.options);
          continue;
        }
      }

      // 无题号的题目行
      if (!content && !hasQuestionLine) {
        if (/[？?]/.test(line) || (line.length > 5 && !/^[（(]\d/.test(line))) {
          content = line;
          hasQuestionLine = true;
          continue;
        }
      }

      // 解析补充
      if (content && answer && !explanation) { explanation = line; continue; }

      // 判断题答案补充
      if (content && !answer && /^(?:对|错|正确|错误|√|×|✓|✗|T|F|TRUE|FALSE|是|否)$/i.test(line)) {
        answer = line;
        continue;
      }

      warnings.push({ line: lineNum, text: line });
    }

    // 后处理：拆分内联选项
    var finalOptions = [];
    for (var oi = 0; oi < options.length; oi++) {
      var split = trySplitInlineOptions(options[oi].text);
      if (split) {
        finalOptions.push({ label: options[oi].label, text: split.firstText });
        split.options.forEach(function (o) { finalOptions.push(o); });
      } else {
        finalOptions.push(options[oi]);
      }
    }

    var type = detectType(content, answer, finalOptions);
    type = applySafetyCheck(type, answer, finalOptions);

    if ((type === 'choice' || type === 'multiple') && finalOptions.length === 0 && content) {
      if (answer) type = 'fill';
    }

    if (content) {
      questions.push({
        content: content,
        options: (type === 'choice' || type === 'multiple') ? finalOptions : [],
        answer: normalizeAnswer(answer, type),
        type: type,
        explanation: explanation,
        tags: tags,
        order: questions.length + 1
      });
    }
  }

  parsedWarnings = warnings;
  return questions;
}

/**
 * 解析 Markdown 格式题库
 */
function parseMarkdown(text) {
  var questions = [];
  var warnings = [];
  var blocks = text.split(/\n\s*\n/);

  for (var bi = 0; bi < blocks.length; bi++) {
    var block = blocks[bi];
    var lines = block.split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l.length > 0; });
    if (lines.length === 0) continue;

    var content = '';
    var options = [];
    var answer = '';
    var explanation = '';
    var tags = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      var questionMatch = line.match(/^##\s*(\d+)[.、]\s*(.+)/);
      if (questionMatch) { content = questionMatch[2].trim(); continue; }

      var optionMatch = line.match(/^-\s*([A-Da-d])[.、]\s*(.*)/);
      if (optionMatch) { options.push({ label: optionMatch[1].toUpperCase(), text: optionMatch[2].trim() }); continue; }

      var answerMatch = line.match(/\*\*答案\s*[:：]\s*(.+?)\*\*/);
      if (answerMatch) { answer = answerMatch[1].trim(); continue; }

      var explanationMatch = line.match(/\*\*解[释析]\s*[:：]\s*(.+?)\*\*/);
      if (explanationMatch) { explanation = explanationMatch[1].trim(); continue; }

      var mdTagMatch = line.match(/\*\*(?:标签|分类)\s*[:：]\s*(.+?)\*\*/);
      if (mdTagMatch) {
        var tagStr = mdTagMatch[1].trim();
        tags = tags.concat(tagStr.split(/[,，、]/).map(function (t) { return t.trim(); }).filter(function (t) { return t.length > 0; }));
        continue;
      }
      var plainTagMatch = line.match(/^(?:标签|分类)\s*[:：]\s*(.+)/);
      if (plainTagMatch) {
        var tagStr2 = plainTagMatch[1].trim();
        tags = tags.concat(tagStr2.split(/[,，、]/).map(function (t) { return t.trim(); }).filter(function (t) { return t.length > 0; }));
        continue;
      }
    }

    var finalOptions = [];
    for (var oi = 0; oi < options.length; oi++) {
      var split = trySplitInlineOptions(options[oi].text);
      if (split) {
        finalOptions.push({ label: options[oi].label, text: split.firstText });
        split.options.forEach(function (o) { finalOptions.push(o); });
      } else {
        finalOptions.push(options[oi]);
      }
    }

    var type = detectType(content, answer, finalOptions);
    type = applySafetyCheck(type, answer, finalOptions);

    if ((type === 'choice' || type === 'multiple') && finalOptions.length === 0 && content) {
      if (answer) type = 'fill';
    }

    if (content) {
      questions.push({
        content: content,
        options: (type === 'choice' || type === 'multiple') ? finalOptions : [],
        answer: normalizeAnswer(answer, type),
        type: type,
        explanation: explanation,
        tags: tags,
        order: questions.length + 1
      });
    }
  }

  parsedWarnings = warnings;
  return questions;
}

/**
 * 确认导入
 */
function confirmImport() {
  var nameInput = document.getElementById('bank-name-input');
  var bankName = nameInput.value.trim();

  if (!bankName) { _showImportToast('请输入题库名称'); return; }
  if (parsedQuestions.length === 0) { _showImportToast('没有可导入的题目'); return; }

  var allTags = [];
  parsedQuestions.forEach(function (q) {
    if (q.tags) q.tags.forEach(function (t) { if (allTags.indexOf(t) < 0) allTags.push(t); });
  });

  addBank(bankName, parsedQuestions.length, allTags).then(function (bank) {
    var bankId = bank.id;
    var count = parsedQuestions.length;
    return addQuestions(bankId, parsedQuestions).then(function () {
      parsedQuestions = [];
      parsedWarnings = [];

      document.getElementById('import-preview').style.display = 'none';
      document.getElementById('bank-name-input').value = '';
      document.getElementById('file-input').value = '';
      var warnEl = document.getElementById('import-warnings');
      if (warnEl) warnEl.remove();

      _showImportToast('导入成功！共导入 ' + count + ' 道题目');
      navigateTo('#bank-list');
    });
  }).catch(function (err) {
    _showImportToast('导入失败：' + err.message);
  });
}
