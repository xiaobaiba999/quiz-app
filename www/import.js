// 刷题助手 - 题库导入与解析模块

// 文件大小和题目数量限制
var MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB（文档文件较大）
var MAX_QUESTIONS = 2000;

// 当前解析结果缓存
let parsedQuestions = [];
// 未解析行警告缓存
let parsedWarnings = [];

// AI 转换取消标记
var _aiConvertAborted = false;

/**
 * 内联 Toast 提示（替代 alert）
 * @param {string} msg - 提示消息
 */
function _showImportToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.remove('show');
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
  }, 2500);
}

/**
 * 处理文件导入
 * @param {File} file - 用户选择的文件
 */
function handleFileImport(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const textExts = ['txt', 'md', 'markdown'];
  const docExts = ['pdf', 'doc', 'docx', 'ppt', 'pptx'];

  if (!textExts.includes(ext) && !docExts.includes(ext)) {
    _showImportToast('不支持的文件格式');
    return;
  }

  // 检查文件大小
  if (file.size > MAX_FILE_SIZE) {
    _showImportToast('文件过大，请选择10MB以内的文件');
    return;
  }

  // 文档类文件走 AI 智能转换流程
  if (docExts.includes(ext)) {
    _handleSmartImport(file, ext);
    return;
  }

  // TXT/Markdown 走原有流程
  const reader = new FileReader();
  reader.onload = function (e) {
    const text = e.target.result;
    try {
      parsedWarnings = [];
      if (ext === 'txt') {
        parsedQuestions = parseTXT(text);
      } else {
        parsedQuestions = parseMarkdown(text);
      }

      if (parsedQuestions.length === 0) {
        alert('未能解析出任何题目，请检查文件格式是否正确');
        return;
      }

      // 题目数量超限警告（允许导入但提示）
      if (parsedQuestions.length > MAX_QUESTIONS) {
        _showImportToast('题目数量超过 ' + MAX_QUESTIONS + ' 道，导入可能较慢');
      }

      // 显示预览区域
      _showImportPreview(file.name, parsedQuestions);
    } catch (err) {
      _showImportToast('解析文件失败：' + err.message);
    }
  };
  reader.readAsText(file, 'UTF-8');
}

/**
 * 智能导入流程（PDF/Word/PPT → 提取文本 → 直接解析，可选 AI 增强）
 */
function _handleSmartImport(file, ext) {
  _aiConvertAborted = false;
  var progressEl = document.getElementById('ai-convert-progress');
  var progressText = document.getElementById('ai-progress-text');
  var progressBar = document.getElementById('ai-progress-bar');

  progressEl.style.display = '';
  progressText.textContent = '正在解析 ' + ext.toUpperCase() + ' 文件...';
  progressBar.style.width = '10%';

  // 第一步：解析文件提取文本
  window.FileParserModule.parseFile(file).then(function (rawText) {
    if (_aiConvertAborted) return;
    progressText.textContent = '文件解析完成，正在提取题目...';
    progressBar.style.width = '50%';

    // 第二步：清洗文本并尝试直接解析
    var cleanedText = window.FileParserModule.cleanText(rawText);
    parsedWarnings = [];
    parsedQuestions = parseTXT(cleanedText);

    progressBar.style.width = '80%';

    // 如果直接解析出了题目，直接使用
    if (parsedQuestions.length > 0) {
      progressText.textContent = '解析完成！';
      progressBar.style.width = '100%';
      setTimeout(function () {
        _aiConvertAborted = false;
        progressEl.style.display = 'none';
        _showImportPreview(file.name, parsedQuestions);
      }, 400);
      return;
    }

    // 直接解析失败，检查是否有 AI Key 可用
    if (window.AIModule && window.AIModule.hasAPIKey()) {
      progressText.textContent = '直接解析未识别出题目，正在调用 AI 智能转换...';
      progressBar.style.width = '30%';

      return window.AIModule.convertToQuestions(rawText, {}, function (streamText) {
        if (_aiConvertAborted) return;
        var estimatedProgress = Math.min(30 + streamText.length / 50, 90);
        progressBar.style.width = estimatedProgress + '%';
        progressText.textContent = 'AI 正在生成题目和解析...';
      }).then(function (formattedText) {
        if (_aiConvertAborted) return;
        progressText.textContent = 'AI 转换完成，正在解析题目...';
        progressBar.style.width = '95%';

        parsedWarnings = [];
        parsedQuestions = parseTXT(formattedText);

        if (parsedQuestions.length === 0) {
          _aiConvertAborted = false;
          progressEl.style.display = 'none';
          _showImportToast('AI 转换后未能解析出题目，请检查文件内容');
          return;
        }

        progressBar.style.width = '100%';
        setTimeout(function () {
          _aiConvertAborted = false;
          progressEl.style.display = 'none';
          _showImportPreview(file.name, parsedQuestions);
        }, 500);
      });
    } else {
      // 没有 AI Key，提示用户
      _aiConvertAborted = false;
      progressEl.style.display = 'none';
      window.UIModule.showModal(
        '未能识别题目',
        '从文件中提取的文本未能自动识别出题目格式。\n\n' +
        '建议：\n' +
        '1. 确保文档中的题目格式规范（如：1. 题目 A. 选项 B. 选项 答案：A）\n' +
        '2. 或配置 DeepSeek API Key 使用 AI 智能转换（点击右上角「AI」按钮）',
        null
      );
    }
  }).catch(function (err) {
    var wasAborted = _aiConvertAborted;
    _aiConvertAborted = false;
    progressEl.style.display = 'none';
    if (!wasAborted) {
      _showImportToast('文件解析失败：' + err.message);
    }
  });
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

  // 自动填充题库名称（取文件名去掉扩展名）
  var bankName = fileName.replace(/\.[^.]+$/, '');
  nameInput.value = bankName;

  // 显示题型统计
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

  // 显示未解析行警告
  _renderImportWarnings();
}

/**
 * 渲染未解析行警告到预览区域
 */
function _renderImportWarnings() {
  let warnEl = document.getElementById('import-warnings');
  if (parsedWarnings.length === 0) {
    if (warnEl) warnEl.remove();
    return;
  }
  if (!warnEl) {
    warnEl = document.createElement('div');
    warnEl.id = 'import-warnings';
    warnEl.className = 'import-warnings';
    // 插入到统计信息之后、确认按钮之前
    const statsEl = document.getElementById('import-preview-stats');
    statsEl.parentNode.insertBefore(warnEl, statsEl.nextSibling);
  }
  let html = '<div class="warning-title">⚠ 以下行未能解析：</div>';
  parsedWarnings.forEach(w => {
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
  const a = answer.trim().toUpperCase();
  return ['对', '错', '√', '×', '✓', '✗', '正确', '错误', 'T', 'F', 'TRUE', 'FALSE', '是', '否'].includes(a);
}

// ===== 判断答案是否为多选题 =====
function isMultipleChoiceAnswer(answer) {
  if (!answer) return false;
  // 提取所有 A-D 字母（支持各种分隔符：无分隔、逗号、顿号、空格）
  const letters = answer.replace(/[,，、\s]/g, '').match(/[A-Da-d]/g);
  if (!letters || letters.length < 2) return false;
  // 去重后仍 >= 2 个不同字母
  const unique = [...new Set(letters.map(l => l.toUpperCase()))];
  return unique.length >= 2;
}

// ===== 提取多选题答案（返回大写字母无分隔符） =====
function extractMultipleAnswer(answer) {
  if (!answer) return '';
  const letters = answer.replace(/[,，、\s]/g, '').match(/[A-Da-d]/g);
  if (!letters) return '';
  const unique = [];
  letters.map(l => l.toUpperCase()).forEach(l => {
    if (!unique.includes(l)) unique.push(l);
  });
  return unique.join('');
}

// ===== 标准化答案 =====
function normalizeAnswer(answer, type) {
  if (!answer) return '';
  const a = answer.trim();
  if (type === 'judgment') {
    const upper = a.toUpperCase();
    if (['对', '√', '✓', '正确', 'T', 'TRUE', '是'].includes(upper)) return '对';
    return '错';
  }
  if (type === 'multiple') {
    return extractMultipleAnswer(a);
  }
  if (type === 'choice') {
    const match = a.match(/^([A-Da-d])/);
    return match ? match[1].toUpperCase() : a.toUpperCase();
  }
  return a;
}

// ===== 尝试拆分选项文本中的内联选项 =====
// 例如 "BGP B. IGP C. RIP D. OSPF" → { firstText: "BGP", options: [{label:"B",text:"IGP"},...] }
function trySplitInlineOptions(text) {
  if (!text) return null;
  // 查找 B-D 选项标记（A 是当前选项自身，从 B 开始查找内联选项）
  const regex = /([B-Db-d])[.、]\s*/g;
  const matches = [];
  let m;
  while ((m = regex.exec(text)) !== null) {
    matches.push({ index: m.index, label: m[1].toUpperCase(), afterIndex: m.index + m[0].length });
  }
  if (matches.length === 0) return null;

  const firstText = text.substring(0, matches[0].index).trim();
  const options = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].afterIndex;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    options.push({ label: matches[i].label, text: text.substring(start, end).trim() });
  }
  return { firstText, options };
}

// ===== 从未解析行中提取内联选项 =====
function extractInlineOptions(line) {
  const regex = /([A-Da-d])[.、]\s*/g;
  const matches = [];
  let m;
  while ((m = regex.exec(line)) !== null) {
    matches.push({ index: m.index, label: m[1].toUpperCase(), afterIndex: m.index + m[0].length });
  }
  if (matches.length === 0) return { options: [], textBefore: line };

  const textBefore = line.substring(0, matches[0].index).trim();
  const options = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].afterIndex;
    const end = i + 1 < matches.length ? matches[i + 1].index : line.length;
    options.push({ label: matches[i].label, text: line.substring(start, end).trim() });
  }
  return { options, textBefore };
}

// ===== 判断题型（统一逻辑） =====
function detectType(content, answer, finalOptions) {
  // 1. 答案含多个 A-D 字母 → 多选题
  if (isMultipleChoiceAnswer(answer)) {
    return 'multiple';
  }
  // 2. 题目内容含"简答"关键词 → 简答题
  if (content && /简答/.test(content)) {
    return 'essay';
  }
  // 3. 题目内容含填空标记（连续下划线 ___、＿＿＿ 等）→ 填空题
  const hasBlankMarker = /_{2,}|＿{2,}/.test(content);
  if (hasBlankMarker) {
    return 'fill';
  }
  // 4. 答案是判断关键词 → 判断题
  if (isJudgmentAnswer(answer)) {
    return 'judgment';
  }
  // 5. 答案不是单个 A-D 字母 → 填空题（含简答题兜底：答案超10字且非判断）
  if (answer && !/^[A-Da-d]$/.test(answer) && !/^[A-Da-d][.、]/.test(answer)) {
    // 答案超过10个字符且非判断答案 → 简答题
    if (answer.length > 10) {
      return 'essay';
    }
    return 'fill';
  }
  // 6. 否则 → 单选题
  return 'choice';
}

// ===== 安全检查：非 choice 但有选项且答案为单 A-D → 强制回 choice =====
function applySafetyCheck(type, answer, finalOptions) {
  if (type !== 'choice' && type !== 'multiple' && finalOptions.length >= 2 && /^[A-Da-d]$/.test(answer)) {
    return 'choice';
  }
  return type;
}

/**
 * 解析 TXT 格式题库
 * 支持选择题、多选题、判断题、填空题、简答题
 * @param {string} text - 文件内容
 * @returns {Array<{content:string, options:Array, answer:string, type:string, explanation:string, tags:Array, order:number}>}
 */
function parseTXT(text) {
  const questions = [];
  const warnings = [];
  // 按空行分隔题目块
  const blocks = text.split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) continue;

    let content = '';
    const options = [];
    let answer = '';
    let explanation = '';
    let tags = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // 记录原始行号（用于警告提示）
      const lineNum = i + 1;

      // 题目行：以数字开头，后跟 . 或 、或 ）
      const questionMatch = line.match(/^(\d+)[.、）)]\s*(.+)/);
      if (questionMatch) {
        content = questionMatch[2].trim();
        continue;
      }

      // 选项行：字母后跟 . 或 、
      const optionMatch = line.match(/^([A-Da-d])[.、]\s*(.*)/);
      if (optionMatch) {
        options.push({
          label: optionMatch[1].toUpperCase(),
          text: optionMatch[2].trim()
        });
        continue;
      }

      // 单独字母选项行（如 "A" 独占一行）
      const standaloneMatch = line.match(/^([A-Da-d])$/);
      if (standaloneMatch) {
        options.push({
          label: standaloneMatch[1].toUpperCase(),
          text: ''
        });
        continue;
      }

      // 答案行：以"答案"开头
      const answerMatch = line.match(/^答案\s*[:：]\s*(.+)/);
      if (answerMatch) {
        answer = answerMatch[1].trim();
        continue;
      }

      // 解释行：以"解释"或"解析"开头
      const explanationMatch = line.match(/^解[释析]\s*[:：]\s*(.+)/);
      if (explanationMatch) {
        explanation = explanationMatch[1].trim();
        continue;
      }

      // 标签行：以"标签"或"分类"开头
      const tagMatch = line.match(/^(?:标签|分类)\s*[:：]\s*(.+)/);
      if (tagMatch) {
        const tagStr = tagMatch[1].trim();
        // 支持逗号、顿号分隔
        const parsedTags = tagStr.split(/[,，、]/).map(t => t.trim()).filter(t => t.length > 0);
        tags.push(...parsedTags);
        continue;
      }

      // 未匹配行：可能是上一个空选项的文本，或包含内联选项
      if (options.length > 0) {
        const lastOpt = options[options.length - 1];
        // 上一个选项文本为空，此行作为该选项的文本
        if (lastOpt.text === '') {
          lastOpt.text = line;
          continue;
        }
        // 尝试从行内提取内联选项（如 "BGP B. IGP C. RIP D. OSPF"）
        const extracted = extractInlineOptions(line);
        if (extracted.options.length > 0) {
          // 第一个选项前的文本补充给上一个选项
          if (extracted.textBefore && lastOpt.text === '') {
            lastOpt.text = extracted.textBefore;
          }
          options.push(...extracted.options);
          continue;
        }
      }

      // 真正无法解析的行 → 记录警告
      warnings.push({ line: lineNum, text: line });
    }

    // 后处理：拆分选项文本中的内联选项
    // 例如选项 A 的文本是 "BGP B. IGP C. RIP D. OSPF"
    const finalOptions = [];
    for (const opt of options) {
      const split = trySplitInlineOptions(opt.text);
      if (split) {
        finalOptions.push({ label: opt.label, text: split.firstText });
        split.options.forEach(o => finalOptions.push(o));
      } else {
        finalOptions.push(opt);
      }
    }

    // 判断题型
    let type = detectType(content, answer, finalOptions);

    // 安全检查
    type = applySafetyCheck(type, answer, finalOptions);

    // 选择题/多选题但没有选项，降级为填空题
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
 * 支持选择题、多选题、判断题、填空题、简答题
 * @param {string} text - 文件内容
 * @returns {Array<{content:string, options:Array, answer:string, type:string, explanation:string, tags:Array, order:number}>}
 */
function parseMarkdown(text) {
  const questions = [];
  const warnings = [];
  const blocks = text.split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) continue;

    let content = '';
    const options = [];
    let answer = '';
    let explanation = '';
    let tags = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // 题目行：以 ## 开头
      const questionMatch = line.match(/^##\s*(\d+)[.、]\s*(.+)/);
      if (questionMatch) {
        content = questionMatch[2].trim();
        continue;
      }

      // 选项行：以 - 开头
      const optionMatch = line.match(/^-\s*([A-Da-d])[.、]\s*(.*)/);
      if (optionMatch) {
        options.push({
          label: optionMatch[1].toUpperCase(),
          text: optionMatch[2].trim()
        });
        continue;
      }

      // 答案行：被 ** 包裹
      const answerMatch = line.match(/\*\*答案\s*[:：]\s*(.+?)\*\*/);
      if (answerMatch) {
        answer = answerMatch[1].trim();
        continue;
      }

      // 解释行：被 ** 包裹
      const explanationMatch = line.match(/\*\*解[释析]\s*[:：]\s*(.+?)\*\*/);
      if (explanationMatch) {
        explanation = explanationMatch[1].trim();
        continue;
      }

      // 标签行：被 ** 包裹 或 普通标签行
      const mdTagMatch = line.match(/\*\*(?:标签|分类)\s*[:：]\s*(.+?)\*\*/);
      if (mdTagMatch) {
        const tagStr = mdTagMatch[1].trim();
        const parsedTags = tagStr.split(/[,，、]/).map(t => t.trim()).filter(t => t.length > 0);
        tags.push(...parsedTags);
        continue;
      }
      const plainTagMatch = line.match(/^(?:标签|分类)\s*[:：]\s*(.+)/);
      if (plainTagMatch) {
        const tagStr = plainTagMatch[1].trim();
        const parsedTags = tagStr.split(/[,，、]/).map(t => t.trim()).filter(t => t.length > 0);
        tags.push(...parsedTags);
        continue;
      }
    }

    // 后处理：拆分内联选项
    const finalOptions = [];
    for (const opt of options) {
      const split = trySplitInlineOptions(opt.text);
      if (split) {
        finalOptions.push({ label: opt.label, text: split.firstText });
        split.options.forEach(o => finalOptions.push(o));
      } else {
        finalOptions.push(opt);
      }
    }

    // 判断题型
    let type = detectType(content, answer, finalOptions);

    // 安全检查
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
async function confirmImport() {
  const nameInput = document.getElementById('bank-name-input');
  const bankName = nameInput.value.trim();

  if (!bankName) {
    _showImportToast('请输入题库名称');
    return;
  }

  if (parsedQuestions.length === 0) {
    _showImportToast('没有可导入的题目');
    return;
  }

  try {
    // 收集所有唯一标签
    const allTags = [...new Set(parsedQuestions.flatMap(q => q.tags || []))];
    const bank = await addBank(bankName, parsedQuestions.length, allTags);
    const bankId = bank.id;
    const count = parsedQuestions.length;
    await addQuestions(bankId, parsedQuestions);
    parsedQuestions = [];
    parsedWarnings = [];

    document.getElementById('import-preview').style.display = 'none';
    document.getElementById('bank-name-input').value = '';
    document.getElementById('file-input').value = '';
    // 清除警告区域
    const warnEl = document.getElementById('import-warnings');
    if (warnEl) warnEl.remove();

    _showImportToast('导入成功！共导入 ' + count + ' 道题目');
    navigateTo('#bank-list');
  } catch (err) {
    _showImportToast('导入失败：' + err.message);
  }
}
