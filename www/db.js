// 刷题助手 - 数据库模块（IndexedDB）

var DB_NAME = 'QuizAppDB';
var DB_VERSION = 4;

var dbInstance = null;

/**
 * 初始化/打开数据库，创建 object stores 和索引
 * @returns {Promise<IDBDatabase>}
 */
function initDB(retryCount) {
  retryCount = retryCount || 0;
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const oldVersion = event.oldVersion;

      // 题库表
      if (!db.objectStoreNames.contains('banks')) {
        const bankStore = db.createObjectStore('banks', { keyPath: 'id', autoIncrement: true });
        bankStore.createIndex('name', 'name', { unique: false });
      }

      // 题目表
      if (!db.objectStoreNames.contains('questions')) {
        const questionStore = db.createObjectStore('questions', { keyPath: 'id', autoIncrement: true });
        questionStore.createIndex('bankId', 'bankId', { unique: false });
      }

      // 答题记录表
      if (!db.objectStoreNames.contains('records')) {
        const recordStore = db.createObjectStore('records', { keyPath: 'id', autoIncrement: true });
        recordStore.createIndex('questionId', 'questionId', { unique: false });
        recordStore.createIndex('bankId', 'bankId', { unique: false });
      }

      // 笔记表
      if (!db.objectStoreNames.contains('notes')) {
        const noteStore = db.createObjectStore('notes', { keyPath: 'id', autoIncrement: true });
        noteStore.createIndex('questionId', 'questionId', { unique: false });
        noteStore.createIndex('bankId', 'bankId', { unique: false });
      }

      // 用户表（版本4新增）
      if (!db.objectStoreNames.contains('users')) {
        const userStore = db.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
        userStore.createIndex('username', 'username', { unique: true });
      }

      // 版本 3 升级：为已有数据添加新字段的默认值
      if (oldVersion < 3) {
        // questions 表：添加 tags 和 isCollected
        if (db.objectStoreNames.contains('questions')) {
          const questionStore = event.target.transaction.objectStore('questions');
          const qRequest = questionStore.openCursor();
          qRequest.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              const question = cursor.value;
              let updated = false;
              if (question.tags === undefined) {
                question.tags = [];
                updated = true;
              }
              if (question.isCollected === undefined) {
                question.isCollected = false;
                updated = true;
              }
              if (updated) {
                cursor.update(question);
              }
              cursor.continue();
            }
          };
        }

        // records 表：添加 timeSpent
        if (db.objectStoreNames.contains('records')) {
          const recordStore = event.target.transaction.objectStore('records');
          const rRequest = recordStore.openCursor();
          rRequest.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              const record = cursor.value;
              if (record.timeSpent === undefined) {
                record.timeSpent = 0;
                cursor.update(record);
              }
              cursor.continue();
            }
          };
        }

        // banks 表：添加 tags
        if (db.objectStoreNames.contains('banks')) {
          const bankStore = event.target.transaction.objectStore('banks');
          const bRequest = bankStore.openCursor();
          bRequest.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              const bank = cursor.value;
              if (bank.tags === undefined) {
                bank.tags = [];
                cursor.update(bank);
              }
              cursor.continue();
            }
          };
        }
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      const error = event.target.error;
      // 如果版本冲突，删除旧数据库后重试
      if (error && error.name === 'VersionError') {
        if (retryCount >= 3) {
          console.error('[DB] 版本冲突重试已达上限(3次)，放弃重试');
          reject(error);
          return;
        }
        console.warn('[DB] 版本冲突，删除旧数据库重建... (重试 ' + (retryCount + 1) + '/3)');
        indexedDB.deleteDatabase(DB_NAME);
        dbInstance = null;
        initDB(retryCount + 1).then(resolve).catch(reject);
      } else {
        reject(error);
      }
    };
  });
}

/**
 * 通用事务辅助函数
 * @param {string[]} storeNames - 涉及的 object store 名称
 * @param {'readonly'|'readwrite'} mode - 事务模式
 * @param {function(IDBObjectStore[]): Promise} callback - 事务回调
 * @returns {Promise}
 */
function withTransaction(storeNames, mode, callback) {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames, mode);
      const stores = storeNames.map(name => tx.objectStore(name));
      let result;

      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);

      try {
        const callbackResult = callback(stores);
        if (callbackResult && typeof callbackResult.then === 'function') {
          callbackResult.then(r => { result = r; });
        } else {
          result = callbackResult;
        }
      } catch (e) {
        tx.abort();
        reject(e);
      }
    });
  });
}

/**
 * 添加题库
 * @param {string} name - 题库名称
 * @param {number} count - 题目数量
 * @param {string[]} [tags=[]] - 题库标签
 * @returns {Promise<Object>} 完整的 bank 对象
 */
function addBank(name, count, tags) {
  return withTransaction(['banks'], 'readwrite', ([store]) => {
    return new Promise((resolve, reject) => {
      const bank = { name, count, tags: tags || [], createdAt: Date.now() };
      const request = store.add(bank);
      request.onsuccess = () => {
        bank.id = request.result;
        resolve(bank);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * 获取所有题库，按 createdAt 倒序
 * @returns {Promise<Object[]>}
 */
function getAllBanks() {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('banks', 'readonly');
      const store = tx.objectStore('banks');
      const request = store.getAll();
      request.onsuccess = () => {
        const banks = request.result.sort((a, b) => b.createdAt - a.createdAt);
        resolve(banks);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * 删除题库及其所有题目、答题记录和笔记
 * @param {number} id - 题库 ID
 * @returns {Promise<void>}
 */
function deleteBank(id) {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['banks', 'questions', 'records', 'notes'], 'readwrite');
      tx.objectStore('banks').delete(id);

      // 删除该题库下所有题目
      const qStore = tx.objectStore('questions');
      const qIndex = qStore.index('bankId');
      var qCursor = qIndex.openCursor(IDBKeyRange.only(id));
      qCursor.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) { cursor.delete(); cursor.continue(); }
      };
      qCursor.onerror = function(e) {
        console.error('[DB] 删除题目失败:', e.target.error);
      };

      // 删除该题库下所有答题记录
      const rStore = tx.objectStore('records');
      const rIndex = rStore.index('bankId');
      var rCursor = rIndex.openCursor(IDBKeyRange.only(id));
      rCursor.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) { cursor.delete(); cursor.continue(); }
      };
      rCursor.onerror = function(e) {
        console.error('[DB] 删除答题记录失败:', e.target.error);
      };

      // 删除该题库下所有笔记
      const nStore = tx.objectStore('notes');
      const nIndex = nStore.index('bankId');
      var nCursor = nIndex.openCursor(IDBKeyRange.only(id));
      nCursor.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) { cursor.delete(); cursor.continue(); }
      };
      nCursor.onerror = function(e) {
        console.error('[DB] 删除笔记失败:', e.target.error);
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

/**
 * 批量添加题目
 * @param {number} bankId - 题库 ID
 * @param {Array<{content, options:[{label,text}], answer, order, tags?, type?}>} questionsArray
 * @returns {Promise<void>}
 */
function addQuestions(bankId, questionsArray) {
  return withTransaction(['questions'], 'readwrite', ([store]) => {
    questionsArray.forEach(q => {
      store.add({
        bankId,
        content: q.content,
        options: q.options,
        answer: q.answer,
        explanation: q.explanation || '',
        order: q.order,
        tags: q.tags || [],
        type: q.type || '',
        isCollected: false
      });
    });
  });
}

/**
 * 获取所有答题记录
 * @returns {Promise<Object[]>}
 */
function getAllRecords() {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readonly');
      const store = tx.objectStore('records');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * 获取某题库的答题记录
 * @param {number} bankId - 题库 ID
 * @returns {Promise<Object[]>}
 */
function getRecordsByBank(bankId) {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readonly');
      const store = tx.objectStore('records');
      const request = store.index('bankId').getAll(bankId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * 获取某题库所有题目，按 order 排序
 * @param {number} bankId - 题库 ID
 * @returns {Promise<Object[]>}
 */
function getQuestionsByBank(bankId) {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('questions', 'readonly');
      const store = tx.objectStore('questions');
      const request = store.index('bankId').getAll(bankId);
      request.onsuccess = () => {
        const questions = request.result.sort((a, b) => a.order - b.order);
        resolve(questions);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * 添加答题记录
 * @param {number} questionId - 题目 ID
 * @param {number} bankId - 题库 ID
 * @param {string} userAnswer - 用户答案
 * @param {boolean} isCorrect - 是否正确
 * @param {number} [timeSpent=0] - 答题耗时（毫秒）
 * @returns {Promise<Object>} 完整的 record 对象
 */
function addRecord(questionId, bankId, userAnswer, isCorrect, timeSpent) {
  return withTransaction(['records'], 'readwrite', ([store]) => {
    return new Promise((resolve, reject) => {
      const record = { questionId, bankId, userAnswer, isCorrect, timeSpent: timeSpent || 0, createdAt: Date.now() };
      const request = store.add(record);
      request.onsuccess = () => {
        record.id = request.result;
        resolve(record);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * 获取某题库的错题记录（每题只保留最新一条且错误的）
 * @param {number} bankId - 题库 ID
 * @returns {Promise<Array<{...record, question}>>}
 */
function getWrongRecordsByBank(bankId) {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readonly');
      const store = tx.objectStore('records');
      const request = store.index('bankId').getAll(bankId);
      request.onsuccess = () => {
        const records = request.result;
        const latestMap = new Map();

        // 按 questionId 分组，保留最新记录
        records.forEach(r => {
          const existing = latestMap.get(r.questionId);
          if (!existing || r.createdAt > existing.createdAt) {
            latestMap.set(r.questionId, r);
          }
        });

        // 筛选错误的记录
        const wrongRecords = [];
        latestMap.forEach(r => {
          if (r.isCorrect === false) {
            wrongRecords.push(r);
          }
        });

        // 获取对应的 question 对象
        if (wrongRecords.length === 0) {
          resolve([]);
          return;
        }

        const questionIds = wrongRecords.map(r => r.questionId);
        getQuestionsByIds(questionIds).then(questionMap => {
          const result = wrongRecords.map(r => ({
            ...r,
            question: questionMap.get(r.questionId) || null
          }));
          resolve(result);
        }).catch(reject);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * 获取所有错题记录（每题只保留最新一条且错误的）
 * @returns {Promise<Array<{...record, question}>>}
 */
function getAllWrongRecords() {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readonly');
      const store = tx.objectStore('records');
      const request = store.getAll();
      request.onsuccess = () => {
        const records = request.result;
        const latestMap = new Map();

        // 按 questionId 分组，保留最新记录
        records.forEach(r => {
          const existing = latestMap.get(r.questionId);
          if (!existing || r.createdAt > existing.createdAt) {
            latestMap.set(r.questionId, r);
          }
        });

        // 筛选错误的记录
        const wrongRecords = [];
        latestMap.forEach(r => {
          if (r.isCorrect === false) {
            wrongRecords.push(r);
          }
        });

        // 获取对应的 question 对象
        if (wrongRecords.length === 0) {
          resolve([]);
          return;
        }

        const questionIds = wrongRecords.map(r => r.questionId);
        getQuestionsByIds(questionIds).then(questionMap => {
          const result = wrongRecords.map(r => ({
            ...r,
            question: questionMap.get(r.questionId) || null
          }));
          resolve(result);
        }).catch(reject);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * 获取某题库的答题统计
 * @param {number} bankId - 题库 ID
 * @returns {Promise<{total, correct, wrong, rate}>}
 */
function getStatsByBank(bankId) {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readonly');
      const store = tx.objectStore('records');
      const request = store.index('bankId').getAll(bankId);
      request.onsuccess = () => {
        const records = request.result;
        resolve(computeStats(records));
      };
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * 获取全局答题统计
 * @returns {Promise<{total, correct, wrong, rate}>}
 */
function getStats() {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readonly');
      const store = tx.objectStore('records');
      const request = store.getAll();
      request.onsuccess = () => {
        const records = request.result;
        resolve(computeStats(records));
      };
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * 根据 questionId 分组取最新记录后统计
 * @param {Array} records - 所有记录
 * @returns {{total, correct, wrong, rate}}
 */
function computeStats(records) {
  const latestMap = new Map();

  // 按 questionId 分组，保留最新记录
  records.forEach(r => {
    const existing = latestMap.get(r.questionId);
    if (!existing || r.createdAt > existing.createdAt) {
      latestMap.set(r.questionId, r);
    }
  });

  const total = latestMap.size;
  let correct = 0;
  let wrong = 0;

  latestMap.forEach(r => {
    if (r.isCorrect) {
      correct++;
    } else {
      wrong++;
    }
  });

  const rate = total > 0 ? Math.round((correct / total) * 100) : 0;

  return { total, correct, wrong, rate };
}

/**
 * 根据 ID 数组获取题目，返回 Map<id, question>
 * @param {number[]} ids - 题目 ID 数组
 * @returns {Promise<Map<number, Object>>}
 */
function getQuestionsByIds(ids) {
  if (!ids || ids.length === 0) return Promise.resolve(new Map());

  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('questions', 'readonly');
      const store = tx.objectStore('questions');
      const map = new Map();
      let pending = ids.length;

      ids.forEach(id => {
        const request = store.get(id);
        request.onsuccess = () => {
          if (request.result) {
            map.set(id, request.result);
          }
          pending--;
          if (pending === 0) {
            resolve(map);
          }
        };
        request.onerror = () => {
          pending--;
          if (pending === 0) {
            resolve(map);
          }
        };
      });
    });
  });
}

// ==================== 版本 3 新增函数 ====================

/**
 * 切换题目收藏状态
 * @param {number} questionId - 题目 ID
 * @returns {Promise<boolean>} 新的收藏状态
 */
function toggleCollect(questionId) {
  return withTransaction(['questions'], 'readwrite', ([store]) => {
    return new Promise((resolve, reject) => {
      const request = store.get(questionId);
      request.onsuccess = () => {
        const question = request.result;
        if (!question) {
          reject(new Error('题目不存在'));
          return;
        }
        question.isCollected = !question.isCollected;
        const updateRequest = store.put(question);
        updateRequest.onsuccess = () => resolve(question.isCollected);
        updateRequest.onerror = () => reject(updateRequest.error);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * 获取所有收藏的题目，可选按题库筛选
 * @param {number} [bankId] - 题库 ID（可选）
 * @returns {Promise<Object[]>}
 */
function getCollectedQuestions(bankId) {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('questions', 'readonly');
      const store = tx.objectStore('questions');
      const request = store.getAll();
      request.onsuccess = () => {
        let questions = request.result.filter(q => q.isCollected === true);
        if (bankId !== undefined) {
          questions = questions.filter(q => q.bankId === bankId);
        }
        resolve(questions);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * 添加笔记
 * @param {number} questionId - 题目 ID
 * @param {number} bankId - 题库 ID
 * @param {string} content - 笔记内容
 * @returns {Promise<Object>} 完整的 note 对象
 */
function addNote(questionId, bankId, content) {
  return withTransaction(['notes'], 'readwrite', ([store]) => {
    return new Promise((resolve, reject) => {
      const now = Date.now();
      const note = { questionId, bankId, content, createdAt: now, updatedAt: now };
      const request = store.add(note);
      request.onsuccess = () => {
        note.id = request.result;
        resolve(note);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * 获取某题目的所有笔记
 * @param {number} questionId - 题目 ID
 * @returns {Promise<Object[]>}
 */
function getNotesByQuestion(questionId) {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('notes', 'readonly');
      const store = tx.objectStore('notes');
      const request = store.index('questionId').getAll(questionId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * 更新笔记内容
 * @param {number} noteId - 笔记 ID
 * @param {string} content - 新的笔记内容
 * @returns {Promise<Object>} 更新后的 note 对象
 */
function updateNote(noteId, content) {
  return withTransaction(['notes'], 'readwrite', ([store]) => {
    return new Promise((resolve, reject) => {
      const request = store.get(noteId);
      request.onsuccess = () => {
        const note = request.result;
        if (!note) {
          reject(new Error('笔记不存在'));
          return;
        }
        note.content = content;
        note.updatedAt = Date.now();
        const updateRequest = store.put(note);
        updateRequest.onsuccess = () => resolve(note);
        updateRequest.onerror = () => reject(updateRequest.error);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * 删除笔记
 * @param {number} noteId - 笔记 ID
 * @returns {Promise<void>}
 */
function deleteNote(noteId) {
  return withTransaction(['notes'], 'readwrite', ([store]) => {
    store.delete(noteId);
  });
}

/**
 * 根据标签获取题目
 * @param {number} bankId - 题库 ID
 * @param {string} tag - 标签
 * @returns {Promise<Object[]>}
 */
function getQuestionsByTag(bankId, tag) {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('questions', 'readonly');
      const store = tx.objectStore('questions');
      const request = store.index('bankId').getAll(bankId);
      request.onsuccess = () => {
        const questions = request.result.filter(q => Array.isArray(q.tags) && q.tags.includes(tag));
        resolve(questions);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * 获取题库中所有唯一标签
 * @param {number} bankId - 题库 ID
 * @returns {Promise<string[]>}
 */
function getBankTags(bankId) {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('questions', 'readonly');
      const store = tx.objectStore('questions');
      const request = store.index('bankId').getAll(bankId);
      request.onsuccess = () => {
        const tagSet = new Set();
        request.result.forEach(q => {
          if (Array.isArray(q.tags)) {
            q.tags.forEach(t => tagSet.add(t));
          }
        });
        resolve(Array.from(tagSet));
      };
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * 更新题目字段
 * @param {number} questionId - 题目 ID
 * @param {Object} data - 要更新的字段键值对
 * @returns {Promise<Object>} 更新后的 question 对象
 */
function updateQuestion(questionId, data) {
  return withTransaction(['questions'], 'readwrite', ([store]) => {
    return new Promise((resolve, reject) => {
      const request = store.get(questionId);
      request.onsuccess = () => {
        const question = request.result;
        if (!question) {
          reject(new Error('题目不存在'));
          return;
        }
        Object.assign(question, data);
        const updateRequest = store.put(question);
        updateRequest.onsuccess = () => resolve(question);
        updateRequest.onerror = () => reject(updateRequest.error);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * 删除单个题目
 * @param {number} questionId - 题目 ID
 * @returns {Promise<void>}
 */
function deleteQuestion(questionId) {
  return withTransaction(['questions'], 'readwrite', ([store]) => {
    store.delete(questionId);
  });
}

/**
 * 获取题库中的题目数量
 * @param {number} bankId - 题库 ID
 * @returns {Promise<number>}
 */
function getQuestionsCountByBank(bankId) {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('questions', 'readonly');
      const store = tx.objectStore('questions');
      const request = store.index('bankId').count(bankId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * 按题型统计答题情况
 * @returns {Promise<Object>} 按题型分组的统计 { choice: {total, correct, wrong, rate}, ... }
 */
function getStatsByType() {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['records', 'questions'], 'readonly');
      const recordStore = tx.objectStore('records');
      const questionStore = tx.objectStore('questions');

      const rRequest = recordStore.getAll();
      rRequest.onsuccess = () => {
        const records = rRequest.result;

        // 获取所有题目以建立 questionId -> type 映射
        const qRequest = questionStore.getAll();
        qRequest.onsuccess = () => {
          const questions = qRequest.result;
          const typeMap = new Map();
          questions.forEach(q => typeMap.set(q.id, q.type || 'unknown'));

          // 按 questionId 分组取最新记录
          const latestMap = new Map();
          records.forEach(r => {
            const existing = latestMap.get(r.questionId);
            if (!existing || r.createdAt > existing.createdAt) {
              latestMap.set(r.questionId, r);
            }
          });

          // 按题型分组统计
          const statsByType = {};
          latestMap.forEach((r, qId) => {
            const type = typeMap.get(qId) || 'unknown';
            if (!statsByType[type]) {
              statsByType[type] = { total: 0, correct: 0, wrong: 0 };
            }
            statsByType[type].total++;
            if (r.isCorrect) {
              statsByType[type].correct++;
            } else {
              statsByType[type].wrong++;
            }
          });

          // 计算正确率
          Object.keys(statsByType).forEach(type => {
            const s = statsByType[type];
            s.rate = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
          });

          resolve(statsByType);
        };
        qRequest.onerror = () => reject(qRequest.error);
      };
      rRequest.onerror = () => reject(rRequest.error);
    });
  });
}

/**
 * 按标签统计答题情况
 * @returns {Promise<Object>} 按标签分组的统计 { tag1: {total, correct, wrong, rate}, ... }
 */
function getStatsByTag() {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['records', 'questions'], 'readonly');
      const recordStore = tx.objectStore('records');
      const questionStore = tx.objectStore('questions');

      const rRequest = recordStore.getAll();
      rRequest.onsuccess = () => {
        const records = rRequest.result;

        const qRequest = questionStore.getAll();
        qRequest.onsuccess = () => {
          const questions = qRequest.result;
          const tagsMap = new Map();
          questions.forEach(q => tagsMap.set(q.id, Array.isArray(q.tags) ? q.tags : []));

          // 按 questionId 分组取最新记录
          const latestMap = new Map();
          records.forEach(r => {
            const existing = latestMap.get(r.questionId);
            if (!existing || r.createdAt > existing.createdAt) {
              latestMap.set(r.questionId, r);
            }
          });

          // 按标签分组统计
          const statsByTag = {};
          latestMap.forEach((r, qId) => {
            const tags = tagsMap.get(qId) || [];
            if (tags.length === 0) {
              tags.push('untagged');
            }
            tags.forEach(tag => {
              if (!statsByTag[tag]) {
                statsByTag[tag] = { total: 0, correct: 0, wrong: 0 };
              }
              statsByTag[tag].total++;
              if (r.isCorrect) {
                statsByTag[tag].correct++;
              } else {
                statsByTag[tag].wrong++;
              }
            });
          });

          // 计算正确率
          Object.keys(statsByTag).forEach(tag => {
            const s = statsByTag[tag];
            s.rate = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
          });

          resolve(statsByTag);
        };
        qRequest.onerror = () => reject(qRequest.error);
      };
      rRequest.onerror = () => reject(rRequest.error);
    });
  });
}

/**
 * 获取今日答题统计
 * @returns {Promise<{count, correctCount, rate}>}
 */
function getTodayStats() {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readonly');
      const store = tx.objectStore('records');
      const request = store.getAll();
      request.onsuccess = () => {
        const records = request.result;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStart = today.getTime();

        const todayRecords = records.filter(r => r.createdAt >= todayStart);
        const count = todayRecords.length;
        const correctCount = todayRecords.filter(r => r.isCorrect).length;
        const rate = count > 0 ? Math.round((correctCount / count) * 100) : 0;

        resolve({ count, correctCount, rate });
      };
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * 计算连续学习天数
 * @returns {Promise<number>}
 */
function getStreakDays() {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readonly');
      const store = tx.objectStore('records');
      const request = store.getAll();
      request.onsuccess = () => {
        const records = request.result;
        if (records.length === 0) {
          resolve(0);
          return;
        }

        // 收集所有有答题记录的日期（去重）
        const daySet = new Set();
        records.forEach(r => {
          const d = new Date(r.createdAt);
          d.setHours(0, 0, 0, 0);
          daySet.add(d.getTime());
        });

        const days = Array.from(daySet).sort((a, b) => b - a); // 降序

        // 从今天开始往前数连续天数
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTime = today.getTime();

        let streak = 0;
        let checkDay = todayTime;

        // 如果今天没有记录，从昨天开始检查
        if (!daySet.has(checkDay)) {
          const yesterday = new Date(todayTime);
          yesterday.setDate(yesterday.getDate() - 1);
          checkDay = yesterday.getTime();
          if (!daySet.has(checkDay)) {
            resolve(0);
            return;
          }
        }

        // 从 checkDay 往前数连续天数
        for (let i = 0; i < 10000; i++) {
          const d = new Date(checkDay);
          d.setDate(d.getDate() - i);
          const dayTime = d.getTime();
          if (daySet.has(dayTime)) {
            streak++;
          } else {
            break;
          }
        }

        resolve(streak);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

// ==================== 用户相关函数 ====================

/**
 * 注册用户
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @returns {Promise<Object>} 用户对象
 */
function registerUser(username, password) {
  return withTransaction(['users'], 'readwrite', ([store]) => {
    return new Promise((resolve, reject) => {
      const index = store.index('username');
      const checkRequest = index.get(username);
      checkRequest.onsuccess = () => {
        if (checkRequest.result) {
          reject(new Error('用户名已存在'));
          return;
        }
        const user = { username, password: _simpleHash(password), createdAt: Date.now() };
        const addRequest = store.add(user);
        addRequest.onsuccess = () => {
          user.id = addRequest.result;
          resolve(user);
        };
        addRequest.onerror = () => reject(addRequest.error);
      };
      checkRequest.onerror = () => reject(checkRequest.error);
    });
  });
}

/**
 * 用户登录
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @returns {Promise<Object>} 用户对象
 */
function loginUser(username, password) {
  return withTransaction(['users'], 'readonly', ([store]) => {
    return new Promise((resolve, reject) => {
      const index = store.index('username');
      const request = index.get(username);
      request.onsuccess = () => {
        const user = request.result;
        if (!user) {
          reject(new Error('用户名不存在'));
          return;
        }
        if (user.password !== _simpleHash(password)) {
          reject(new Error('密码错误'));
          return;
        }
        resolve(user);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * 重置密码（只需用户名即可）
 * @param {string} username - 用户名
 * @param {string} newPassword - 新密码
 * @returns {Promise<Object>} 更新后的用户对象
 */
function resetPassword(username, newPassword) {
  return withTransaction(['users'], 'readwrite', ([store]) => {
    return new Promise((resolve, reject) => {
      const index = store.index('username');
      const request = index.get(username);
      request.onsuccess = () => {
        const user = request.result;
        if (!user) {
          reject(new Error('用户名不存在'));
          return;
        }
        user.password = _simpleHash(newPassword);
        const updateRequest = store.put(user);
        updateRequest.onsuccess = () => resolve(user);
        updateRequest.onerror = () => reject(updateRequest.error);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * 简单哈希函数（本地存储，非安全加密）
 * @param {string} str - 原始字符串
 * @returns {string} 哈希值
 */
function _simpleHash(str) {
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
    var char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'h' + Math.abs(hash).toString(36);
}
