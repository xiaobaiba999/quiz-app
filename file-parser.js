// 刷题助手 - 文件解析模块（PDF/Word/PPT）

(function () {
  'use strict';

  var FileParserModule = {};

  /**
   * 解析文件，根据扩展名自动选择解析器
   * @param {File} file - 用户选择的文件
   * @returns {Promise<string>} 提取的文本内容
   */
  FileParserModule.parseFile = function (file) {
    var ext = file.name.split('.').pop().toLowerCase();
    switch (ext) {
      case 'pdf':
        return FileParserModule.parsePDF(file);
      case 'doc':
      case 'docx':
        return FileParserModule.parseWord(file);
      case 'ppt':
      case 'pptx':
        return FileParserModule.parsePPT(file);
      default:
        return Promise.reject(new Error('不支持的文件格式：' + ext));
    }
  };

  /**
   * 获取支持的文件扩展名列表
   */
  FileParserModule.getSupportedExts = function () {
    return ['pdf', 'doc', 'docx', 'ppt', 'pptx'];
  };

  /**
   * 解析 PDF 文件（使用 pdf.js）
   */
  FileParserModule.parsePDF = function (file) {
    return _loadPdfJs().then(function (pdfjsLib) {
      return file.arrayBuffer().then(function (buffer) {
        var loadingTask = pdfjsLib.getDocument({ data: buffer });
        return loadingTask.promise.then(function (pdf) {
          var totalPages = pdf.numPages;
          var textParts = [];
          var chain = Promise.resolve();

          for (var i = 1; i <= totalPages; i++) {
            (function (pageNum) {
              chain = chain.then(function () {
                return pdf.getPage(pageNum).then(function (page) {
                  return page.getTextContent().then(function (content) {
                    var pageText = content.items.map(function (item) {
                      return item.str;
                    }).join(' ');
                    if (pageText.trim()) {
                      textParts.push(pageText.trim());
                    }
                  });
                });
              });
            })(i);
          }

          return chain.then(function () {
            if (textParts.length === 0) {
              throw new Error('PDF 文件中未提取到文本内容，可能是扫描版 PDF');
            }
            return textParts.join('\n\n');
          });
        });
      });
    });
  };

  /**
   * 解析 Word 文件（使用 mammoth.js）
   */
  FileParserModule.parseWord = function (file) {
    return _loadMammoth().then(function (mammoth) {
      return file.arrayBuffer().then(function (buffer) {
        return mammoth.extractRawText({ arrayBuffer: buffer }).then(function (result) {
          var text = result.value;
          if (!text || !text.trim()) {
            throw new Error('Word 文件中未提取到文本内容');
          }
          return text.trim();
        });
      });
    });
  };

  /**
   * 解析 PPT 文件（使用 JSZip 提取 XML 文本）
   */
  FileParserModule.parsePPT = function (file) {
    return _loadJSZip().then(function (JSZip) {
      return file.arrayBuffer().then(function (buffer) {
        var zip = new JSZip();
        return zip.loadAsync(buffer).then(function (contents) {
          var slideFiles = [];
          contents.forEach(function (relativePath, zipEntry) {
            if (/^ppt\/slides\/slide\d+\.xml$/.test(relativePath)) {
              slideFiles.push(zipEntry);
            }
          });

          slideFiles.sort(function (a, b) {
            var numA = parseInt(a.name.match(/slide(\d+)/)[1], 10);
            var numB = parseInt(b.name.match(/slide(\d+)/)[1], 10);
            return numA - numB;
          });

          var textParts = [];
          var chain = Promise.resolve();

          slideFiles.forEach(function (slideEntry) {
            chain = chain.then(function () {
              return slideEntry.async('text').then(function (xmlStr) {
                var texts = _extractTextFromSlideXml(xmlStr);
                if (texts.length > 0) {
                  textParts.push(texts.join('\n'));
                }
              });
            });
          });

          return chain.then(function () {
            if (textParts.length === 0) {
              throw new Error('PPT 文件中未提取到文本内容');
            }
            return textParts.join('\n\n');
          });
        });
      });
    });
  };

  // ===== 从 PPT 幻灯片 XML 中提取文本 =====
  function _extractTextFromSlideXml(xmlStr) {
    var texts = [];
    var regex = /<a:t>([^<]*)<\/a:t>/g;
    var match;
    while ((match = regex.exec(xmlStr)) !== null) {
      var text = match[1].trim();
      if (text) texts.push(text);
    }
    return texts;
  }

  /**
   * 清洗从文档提取的原始文本，使其更适合题库解析
   * 将各种文档格式统一转为标准题库格式：
   *   1. 题目内容
   *   A. 选项A
   *   B. 选项B
   *   答案：A
   *   解析：详细解析内容
   * @param {string} rawText - 原始文本
   * @returns {string} 清洗后的文本
   */
  FileParserModule.cleanText = function (rawText) {
    if (!rawText) return '';

    var text = rawText;

    // 1. 统一换行符
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 2. 去除页眉页脚常见模式
    text = text.replace(/第\s*\d+\s*页\s*[，,]?\s*共\s*\d+\s*页/g, '');
    text = text.replace(/Page\s*\d+\s*(of|\/)\s*\d+/gi, '');
    text = text.replace(/-\s*\d+\s*-/g, '');

    // 3. 统一选项标记格式：将各种选项标记统一为 "A. " 格式
    // "(A)" "(A " "（A）" "（A " → "A. "
    text = text.replace(/[（(]\s*([A-Da-d])\s*[）)]\s*/g, '$1. ');
    // "A、" "A）" "A)" "A．" → "A. "
    text = text.replace(/^([A-Da-d])[、）)\．]\s*/gm, '$1. ');
    // "A" 后跟空格和文本（非选项标记行）→ "A. "
    text = text.replace(/^([A-Da-d])\s+(?=\S)/gm, '$1. ');

    // 3.5 同行多选项拆分：将同一行中的多个选项标记拆为多行
    // "A. xxx B. yyy C. zzz D. zzz" → 每个选项一行
    // 先处理 (A) 格式已被转为 A. 的情况
    text = text.replace(/([^\n])\s+([B-Db-d])\.\s*/g, function (match, before, letter) {
      // 避免误拆：如果 before 本身是选项标记的末尾，不拆
      if (/[A-Da-d]\.\s*$/.test(before)) return match;
      return before + '\n' + letter.toUpperCase() + '. ';
    });

    // 4. 修复 PDF 提取时选项粘连（保留兼容）
    text = text.replace(/([^\n])\s+([B-Db-d])[.、．]\s*/g, function (match, before, letter) {
      if (/[A-Da-d][.、．]\s*$/.test(before)) return match;
      return before + '\n' + letter.toUpperCase() + '. ';
    });

    // 5. 修复题号格式：统一为 "1. " 格式
    text = text.replace(/^(\d+)[、）)\．]\s*/gm, '$1. ');
    // 中文序号 → 阿拉伯数字（仅当后面看起来像题目）
    var cnNumMap = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,
                    '十一':11,'十二':12,'十三':13,'十四':14,'十五':15,'二十':20};
    text = text.replace(/^(十?[一二三四五六七八九十]+)[、．.]\s*/gm, function (m, cn) {
      var num = cnNumMap[cn];
      return num ? num + '. ' : m;
    });

    // 5.5 去除章节标题（如 "二、选择题（每题2分，共20分）" "四、问答题（共44分）"）
    // 这些不是题目，需要移除
    text = text.replace(/^[一二三四五六七八九十]+[、．.]\s*(?:[一二三四五六七八九十]+[、．.])?\s*(?:选择|判断|填空|简答|问答|计算|综合|应用)[题题].*$/gm, '');
    // "选择题" "判断题" 等独立标题行
    text = text.replace(/^(?:选择|判断|填空|简答|问答|计算|综合|应用)[题题]\s*[（(].*$/gm, '');

    // 6. 修复题号粘连：将 "1.题目2.题目" 拆开
    text = text.replace(/([^\n])(\d+)[.、）)]\s*(?=[^\d\s])/g, function (match, before, num) {
      if (parseInt(num) > 0 && parseInt(num) < 2000) {
        return before + '\n' + num + '. ';
      }
      return match;
    });

    // 7. 统一答案/解析/标签标记格式
    text = text.replace(/^答(?:案)?\s*[:：]\s*/gm, '答案：');
    text = text.replace(/^解(?:释|析)?\s*[:：]\s*/gm, '解析：');
    text = text.replace(/^分类\s*[:：]\s*/gm, '标签：');

    // 8. 修复答案/解析/标签前缺换行
    text = text.replace(/([^\n])(答案：)/g, '$1\n$2');
    text = text.replace(/([^\n])(解析：)/g, '$1\n$2');
    text = text.replace(/([^\n])(标签：)/g, '$1\n$2');

    // 9. 修复判断题答案格式统一
    text = text.replace(/答案：\s*(?:正确|√|✓|T|TRUE|是)\s*$/gm, '答案：对');
    text = text.replace(/答案：\s*(?:错误|×|✗|F|FALSE|否)\s*$/gm, '答案：错');

    // 10. 修复填空题标记：统一用 ___ 表示空白
    text = text.replace(/_{6,}/g, '___');
    text = text.replace(/＿{6,}/g, '___');
    text = text.replace(/（\s*）/g, '___');
    text = text.replace(/\(\s*\)/g, '___');
    text = text.replace(/【\s*】/g, '___');

    // 11. 合并被意外拆分的行
    text = text.replace(/(\S)\n\n([A-D][.、])/g, '$1\n$2');
    text = text.replace(/(\S)\n\n(答案：)/g, '$1\n$2');
    text = text.replace(/(\S)\n\n(解析：)/g, '$1\n$2');
    text = text.replace(/(\S)\n\n(标签：)/g, '$1\n$2');

    // 12. 去除多余空行
    text = text.replace(/\n{3,}/g, '\n\n');

    // 13. 去除行首尾空白
    text = text.split('\n').map(function (line) {
      return line.trim();
    }).join('\n');

    // 14. 去除空行中的空白
    text = text.replace(/\n[ \t]+\n/g, '\n\n');

    return text.trim();
  };

  // ===== 动态加载 pdf.js =====
  var _pdfJsLoaded = null;
  function _loadPdfJs() {
    if (_pdfJsLoaded) return _pdfJsLoaded;
    _pdfJsLoaded = new Promise(function (resolve, reject) {
      if (window.pdfjsLib) {
        resolve(window.pdfjsLib);
        return;
      }
      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = function () {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      };
      script.onerror = function () {
        _pdfJsLoaded = null;
        reject(new Error('加载 PDF 解析库失败，请检查网络连接'));
      };
      document.head.appendChild(script);
    });
    return _pdfJsLoaded;
  }

  // ===== 动态加载 mammoth.js =====
  var _mammothLoaded = null;
  function _loadMammoth() {
    if (_mammothLoaded) return _mammothLoaded;
    _mammothLoaded = new Promise(function (resolve, reject) {
      if (window.mammoth) {
        resolve(window.mammoth);
        return;
      }
      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js';
      script.onload = function () {
        resolve(window.mammoth);
      };
      script.onerror = function () {
        _mammothLoaded = null;
        reject(new Error('加载 Word 解析库失败，请检查网络连接'));
      };
      document.head.appendChild(script);
    });
    return _mammothLoaded;
  }

  // ===== 动态加载 JSZip =====
  var _jszipLoaded = null;
  function _loadJSZip() {
    if (_jszipLoaded) return _jszipLoaded;
    _jszipLoaded = new Promise(function (resolve, reject) {
      if (window.JSZip) {
        resolve(window.JSZip);
        return;
      }
      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      script.onload = function () {
        resolve(window.JSZip);
      };
      script.onerror = function () {
        _jszipLoaded = null;
        reject(new Error('加载 PPT 解析库失败，请检查网络连接'));
      };
      document.head.appendChild(script);
    });
    return _jszipLoaded;
  }

  window.FileParserModule = FileParserModule;
})();
