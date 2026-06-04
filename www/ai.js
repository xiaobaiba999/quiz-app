// 刷题助手 - AI 智能转换模块（DeepSeek API）

(function () {
  'use strict';

  var AIModule = {};

  var API_URL = 'https://api.deepseek.com/chat/completions';
  var STORAGE_KEY = 'quiz_ai_api_key';
  var MODEL = 'deepseek-chat';

  // ===== API Key 管理 =====

  /**
   * 获取存储的 API Key
   */
  AIModule.getAPIKey = function () {
    return localStorage.getItem(STORAGE_KEY) || '';
  };

  /**
   * 保存 API Key
   */
  AIModule.setAPIKey = function (key) {
    if (key && key.trim()) {
      localStorage.setItem(STORAGE_KEY, key.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  /**
   * 检查是否已配置 API Key
   */
  AIModule.hasAPIKey = function () {
    return !!AIModule.getAPIKey();
  };

  // ===== 智能转换 =====

  /**
   * 将原始文本通过 AI 转换为标准题库格式
   * @param {string} rawText - 从文件提取的原始文本
   * @param {object} options - 可选参数
   * @param {function} onProgress - 进度回调 (text)
   * @returns {Promise<string>} AI 返回的格式化文本
   */
  AIModule.convertToQuestions = function (rawText, options, onProgress) {
    var apiKey = AIModule.getAPIKey();
    if (!apiKey) {
      return Promise.reject(new Error('请先在设置中配置 DeepSeek API Key'));
    }

    // 如果文本太长，分段处理
    var MAX_CHUNK = 6000;
    if (rawText.length <= MAX_CHUNK) {
      return _callAPI(rawText, apiKey, onProgress);
    }

    // 分段转换
    var chunks = _splitText(rawText, MAX_CHUNK);
    var results = [];
    var chain = Promise.resolve();

    chunks.forEach(function (chunk, idx) {
      chain = chain.then(function () {
        if (onProgress) onProgress('正在转换第 ' + (idx + 1) + '/' + chunks.length + ' 段...');
        return _callAPI(chunk, apiKey);
      }).then(function (result) {
        results.push(result);
      });
    });

    return chain.then(function () {
      return results.join('\n\n');
    });
  };

  /**
   * 为已有题目批量添加解析
   * @param {Array} questions - 题目数组
   * @param {function} onProgress - 进度回调
   * @returns {Promise<Array>} 添加了解析的题目数组
   */
  AIModule.addExplanations = function (questions, onProgress) {
    var apiKey = AIModule.getAPIKey();
    if (!apiKey) {
      return Promise.reject(new Error('请先在设置中配置 DeepSeek API Key'));
    }

    // 筛选没有解析的题目
    var needExplain = questions.filter(function (q) {
      return !q.explanation || q.explanation.trim() === '';
    });

    if (needExplain.length === 0) {
      return Promise.resolve(questions);
    }

    // 构建请求文本
    var questionText = needExplain.map(function (q, i) {
      var text = (i + 1) + '. ' + q.content;
      if (q.options && q.options.length > 0) {
        q.options.forEach(function (opt) {
          text += '\n' + opt.label + '. ' + opt.text;
        });
      }
      text += '\n答案：' + q.answer;
      if (q.explanation) text += '\n解析：' + q.explanation;
      return text;
    }).join('\n\n');

    var prompt = '请为以下每道题目添加详细的解析说明。如果已有简短解析，请扩展为更详细的解析。' +
      '请严格按原题号输出，格式为"解析：xxx"。不要修改题目、选项和答案，只补充解析。\n\n' + questionText;

    return _callRawAPI(prompt, apiKey, onProgress).then(function (response) {
      // 解析 AI 返回的解析内容
      var lines = response.split('\n');
      var explainMap = {};
      var currentNum = 0;

      lines.forEach(function (line) {
        var numMatch = line.match(/^(\d+)[.、）)]\s*/);
        if (numMatch) currentNum = parseInt(numMatch[1], 10);

        var explainMatch = line.match(/^解[释析]\s*[:：]\s*(.+)/);
        if (explainMatch && currentNum > 0) {
          explainMap[currentNum] = explainMatch[1].trim();
        }
      });

      // 合并解析回原题目
      var explainIdx = 0;
      questions.forEach(function (q) {
        if (!q.explanation || q.explanation.trim() === '') {
          explainIdx++;
          if (explainMap[explainIdx]) {
            q.explanation = explainMap[explainIdx];
          }
        }
      });

      return questions;
    });
  };

  // ===== 内部方法 =====

  function _callAPI(rawText, apiKey, onProgress) {
    var systemPrompt = '你是一个专业的题库格式转换助手。你的任务是将用户提供的原始文本转换为标准题库格式。' +
      '\n\n转换规则：' +
      '\n1. 仔细识别文本中的所有题目，包括选择题、多选题、判断题、填空题、简答题' +
      '\n2. 为每道题目添加详细的解析说明（如果原文没有解析，请根据题目内容自动生成详细解析）' +
      '\n3. 严格按以下格式输出，每道题之间用空行分隔：' +
      '\n\n单选题格式：' +
      '\n1. 题目内容' +
      '\nA. 选项A' +
      '\nB. 选项B' +
      '\nC. 选项C' +
      '\nD. 选项D' +
      '\n答案：A' +
      '\n解析：详细解析内容' +
      '\n\n多选题格式（答案含多个字母）：' +
      '\n1. 题目内容' +
      '\nA. 选项A' +
      '\nB. 选项B' +
      '\nC. 选项C' +
      '\nD. 选项D' +
      '\n答案：ABC' +
      '\n解析：详细解析内容' +
      '\n\n判断题格式：' +
      '\n1. 题目内容' +
      '\n答案：对' +
      '\n解析：详细解析内容' +
      '\n\n填空题格式（题目中用___表示空白）：' +
      '\n1. 题目内容___' +
      '\n答案：答案内容' +
      '\n解析：详细解析内容' +
      '\n\n简答题格式：' +
      '\n1. 简述XXX' +
      '\n答案：详细答案内容' +
      '\n解析：详细解析内容' +
      '\n\n标签格式（可选）：' +
      '\n标签：标签1,标签2' +
      '\n\n重要规则：' +
      '\n- 不要遗漏任何题目' +
      '\n- 不要修改原文的题目内容和答案' +
      '\n- 如果原文没有解析，必须根据知识点自动生成详细解析' +
      '\n- 如果原文有解析但过于简短，请扩展为更详细的解析' +
      '\n- 保持题目的原始编号顺序' +
      '\n- 只输出转换后的题目，不要输出其他说明文字';

    return _callRawAPIWithSystem(rawText, systemPrompt, apiKey, onProgress);
  }

  function _callRawAPI(userMessage, apiKey, onProgress) {
    var systemPrompt = '你是一个专业的题库解析助手。请按要求处理题目内容。';
    return _callRawAPIWithSystem(userMessage, systemPrompt, apiKey, onProgress);
  }

  function _callRawAPIWithSystem(userMessage, systemPrompt, apiKey, onProgress) {
    return new Promise(function (resolve, reject) {
      var body = JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.3,
        max_tokens: 8000,
        stream: true
      });

      fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
        body: body
      }).then(function (response) {
        if (!response.ok) {
          return response.json().then(function (err) {
            var msg = err.error ? err.error.message : 'API 请求失败';
            if (response.status === 401) msg = 'API Key 无效，请检查设置';
            if (response.status === 429) msg = 'API 请求过于频繁，请稍后再试';
            reject(new Error(msg));
          }).catch(function () {
            reject(new Error('API 请求失败（HTTP ' + response.status + '）'));
          });
          return;
        }

        // 流式读取
        var reader = response.body.getReader();
        var decoder = new TextDecoder();
        var fullText = '';
        var buffer = '';

        function read() {
          reader.read().then(function (result) {
            if (result.done) {
              resolve(fullText);
              return;
            }

            buffer += decoder.decode(result.value, { stream: true });
            var lines = buffer.split('\n');
            buffer = lines.pop(); // 保留不完整的行

            lines.forEach(function (line) {
              var trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data:')) return;
              var data = trimmed.slice(5).trim();
              if (data === '[DONE]') return;

              try {
                var json = JSON.parse(data);
                var content = json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content;
                if (content) {
                  fullText += content;
                  if (onProgress) onProgress(fullText);
                }
              } catch (e) {
                // 忽略解析错误
              }
            });

            read();
          }).catch(function (err) {
            // 如果流式读取失败，但已有部分内容，返回已有内容
            if (fullText.length > 0) {
              resolve(fullText);
            } else {
              reject(new Error('读取 AI 响应失败：' + err.message));
            }
          });
        }

        read();
      }).catch(function (err) {
        reject(new Error('网络请求失败，请检查网络连接：' + err.message));
      });
    });
  }

  // ===== 文本分段 =====
  function _splitText(text, maxLen) {
    var chunks = [];
    var lines = text.split('\n');
    var current = '';

    lines.forEach(function (line) {
      if (current.length + line.length + 1 > maxLen && current.length > 0) {
        chunks.push(current);
        current = line;
      } else {
        current += (current ? '\n' : '') + line;
      }
    });

    if (current) chunks.push(current);
    return chunks;
  }

  // ===== 测试 API Key 是否有效 =====
  AIModule.testAPIKey = function (apiKey) {
    if (!apiKey || !apiKey.trim()) {
      return Promise.reject(new Error('请输入 API Key'));
    }

    return fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey.trim()
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: '你好' }],
        max_tokens: 10
      })
    }).then(function (response) {
      if (response.ok) {
        return 'API Key 有效';
      }
      return response.json().then(function (err) {
        throw new Error(err.error ? err.error.message : 'API Key 无效');
      });
    });
  };

  window.AIModule = AIModule;
})();
