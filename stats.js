// 刷题助手 - 统计和图表渲染模块

(function () {
  'use strict';

  var escapeHtml = window.UIModule.escapeHtml;
  var formatTime = window.UIModule.formatTime;

  // ===== 首页渲染 =====
  async function renderHomePage() {
    window.UIModule.showLoading();
    try {
      const banks = await getAllBanks();
      const bankCount = banks.length;
      const totalCount = banks.reduce((sum, b) => sum + (b.count || 0), 0);

      const wrongRecords = await getAllWrongRecords();
      const wrongCount = wrongRecords.length;

      const bankCountEl = document.getElementById('home-bank-count');
      const totalCountEl = document.getElementById('home-total-count');
      const wrongCountEl = document.getElementById('home-wrong-count');

      if (bankCountEl) bankCountEl.textContent = bankCount;
      if (totalCountEl) totalCountEl.textContent = totalCount;
      if (wrongCountEl) wrongCountEl.textContent = wrongCount;

      // 今日答题统计
      const todayStats = await getTodayStats();
      const todayCountEl = document.getElementById('home-today-count');
      const todayRateEl = document.getElementById('home-today-rate');
      if (todayCountEl) todayCountEl.textContent = todayStats.count;
      if (todayRateEl) todayRateEl.textContent = todayStats.rate + '%';

      // 连续学习天数
      const streakDays = await getStreakDays();
      const streakEl = document.getElementById('home-streak-days');
      if (streakEl) streakEl.textContent = streakDays + '天';

      renderRecentList(banks);

      const stats = await getStats();
      renderHomePieChart(stats);

      const allRecords = await getAllRecords();
      renderHomeTrendChart(allRecords);

      // 各题型正确率柱状图
      const statsByType = await getStatsByType();
      renderHomeTypeBarChart(statsByType);

      // 知识点掌握度雷达图
      const statsByTag = await getStatsByTag();
      renderHomeTagRadarChart(statsByTag);
    } catch (e) {
      console.error('[App] 渲染首页失败:', e);
    } finally {
      window.UIModule.hideLoading();
    }
  }

  // ===== 首页饼状图 =====
  function renderHomePieChart(stats) {
    const canvas = document.getElementById('home-pie-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (window._homePieChart) window._homePieChart.destroy();
    window._homePieChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['正确', '错误', '未答'],
        datasets: [{
          data: [stats.correct, stats.wrong, Math.max(0, stats.total - stats.correct - stats.wrong)],
          backgroundColor: ['#00B578', '#FF3141', '#EEEEEE'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, padding: 16 } }
        },
        cutout: '60%'
      }
    });
  }

  // ===== 首页趋势图 =====
  function renderHomeTrendChart(records) {
    const canvas = document.getElementById('home-trend-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (window._homeTrendChart) window._homeTrendChart.destroy();

    const dailyMap = new Map();
    records.forEach(r => {
      const day = new Date(r.createdAt).toLocaleDateString();
      if (!dailyMap.has(day)) dailyMap.set(day, { correct: 0, total: 0 });
      const d = dailyMap.get(day);
      d.total++;
      if (r.isCorrect) d.correct++;
    });
    const days = Array.from(dailyMap.keys()).slice(-7);
    const rates = days.map(d => {
      const s = dailyMap.get(d);
      return s.total > 0 ? Math.round(s.correct / s.total * 100) : 0;
    });

    window._homeTrendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: days.map(d => d.slice(5)),
        datasets: [{
          label: '正确率',
          data: rates,
          borderColor: '#1677FF',
          backgroundColor: 'rgba(22,119,255,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: '#1677FF'
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: { min: 0, max: 100, ticks: { callback: v => v + '%' } }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  // ===== 首页各题型正确率柱状图 =====
  function renderHomeTypeBarChart(statsByType) {
    const canvas = document.getElementById('home-type-bar-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (window._homeTypeBarChart) window._homeTypeBarChart.destroy();

    var typeLabels = { choice: '选择题', judgment: '判断题', fill: '填空题', multiple: '多选题', essay: '简答题', unknown: '未知' };
    var typeOrder = ['choice', 'judgment', 'fill', 'multiple', 'essay'];
    var labels = [];
    var rates = [];

    typeOrder.forEach(function(type) {
      if (statsByType[type]) {
        labels.push(typeLabels[type] || type);
        rates.push(statsByType[type].rate);
      }
    });

    // Include any unknown types not in the predefined order
    Object.keys(statsByType).forEach(function(type) {
      if (typeOrder.indexOf(type) === -1) {
        labels.push(typeLabels[type] || type);
        rates.push(statsByType[type].rate);
      }
    });

    if (labels.length === 0) {
      labels = ['暂无数据'];
      rates = [0];
    }

    window._homeTypeBarChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: '正确率',
          data: rates,
          backgroundColor: [
            'rgba(79,110,247,0.7)',
            'rgba(255,143,31,0.7)',
            'rgba(47,84,235,0.7)',
            'rgba(196,29,127,0.7)',
            'rgba(56,158,13,0.7)',
            'rgba(156,160,171,0.7)'
          ],
          borderRadius: 6,
          maxBarThickness: 40
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            min: 0,
            max: 100,
            ticks: { callback: function(v) { return v + '%'; }, color: getComputedStyle(document.documentElement).getPropertyValue('--chart-text').trim() },
            grid: { color: getComputedStyle(document.documentElement).getPropertyValue('--chart-grid').trim() }
          },
          x: {
            ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--chart-text').trim() },
            grid: { display: false }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) { return context.parsed.y + '%'; }
            }
          }
        }
      }
    });
  }

  // ===== 首页知识点掌握度雷达图 =====
  function renderHomeTagRadarChart(statsByTag) {
    const canvas = document.getElementById('home-tag-radar-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (window._homeTagRadarChart) window._homeTagRadarChart.destroy();

    var entries = Object.entries(statsByTag);
    // Sort by total count descending, take top 8
    entries.sort(function(a, b) { return b[1].total - a[1].total; });
    var topEntries = entries.slice(0, 8);

    var labels = topEntries.map(function(e) { return e[0] === 'untagged' ? '未分类' : e[0]; });
    var rates = topEntries.map(function(e) { return e[1].rate; });

    if (labels.length === 0) {
      labels = ['暂无数据'];
      rates = [0];
    }

    window._homeTagRadarChart = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: labels,
        datasets: [{
          label: '掌握度',
          data: rates,
          backgroundColor: 'rgba(79,110,247,0.15)',
          borderColor: 'rgba(79,110,247,0.8)',
          borderWidth: 2,
          pointBackgroundColor: 'rgba(79,110,247,1)',
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: {
              stepSize: 20,
              callback: function(v) { return v + '%'; },
              color: getComputedStyle(document.documentElement).getPropertyValue('--chart-text').trim(),
              backdropColor: 'transparent'
            },
            grid: { color: getComputedStyle(document.documentElement).getPropertyValue('--chart-grid').trim() },
            pointLabels: {
              color: getComputedStyle(document.documentElement).getPropertyValue('--chart-text').trim(),
              font: { size: 11 }
            },
            angleLines: { color: getComputedStyle(document.documentElement).getPropertyValue('--chart-grid').trim() }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) { return '掌握度: ' + context.parsed.r + '%'; }
            }
          }
        }
      }
    });
  }

  // ===== 渲染最近练习记录 =====
  function renderRecentList(banks) {
    const container = document.getElementById('home-recent-list');
    if (!container) return;

    if (!banks || banks.length === 0) {
      container.innerHTML = '<p class="empty-tip">暂无练习记录</p>';
      return;
    }

    const recentBanks = banks.slice(0, 3);
    let html = '';
    recentBanks.forEach((bank) => {
      html += '<div class="recent-item">';
      html += '<div class="recent-info"><div class="recent-name">' + escapeHtml(bank.name) + '</div>';
      html += '<div class="recent-meta">' + bank.count + ' 题 · ' + formatTime(bank.createdAt) + '</div></div>';
      html += '<button class="btn btn-small btn-primary-small" data-bank-id="' + bank.id + '" onclick="navigateTo(\'#practice\')">练习</button>';
      html += '</div>';
    });
    container.innerHTML = html;
  }

  // ===== 显示练习结果 =====
  async function showResult() {
    const practice = window.PracticeModule;
    const currentQuestions = practice.getCurrentQuestions();
    const answers = practice.getAnswers();
    const currentBank = practice.getCurrentBank();

    const total = currentQuestions.length;
    let correct = 0;
    let wrong = 0;

    currentQuestions.forEach((q, i) => {
      var userAns = answers[i];
      var qType = q.type || 'choice';
      if (qType === 'fill') {
        var fillResult = userAns ? userAns.split('|')[0] : '';
        if (fillResult === 'correct') correct++;
        else wrong++;
      } else {
        if (userAns === q.answer) correct++;
        else wrong++;
      }
    });

    const rate = total > 0 ? Math.round((correct / total) * 100) : 0;

    const accuracyEl = document.getElementById('result-accuracy');
    const totalEl = document.getElementById('result-total');
    const correctEl = document.getElementById('result-correct');
    const wrongEl = document.getElementById('result-wrong');

    if (accuracyEl) accuracyEl.textContent = rate + '%';
    if (totalEl) totalEl.textContent = total;
    if (correctEl) correctEl.textContent = correct;
    if (wrongEl) wrongEl.textContent = wrong;

    practice.clearProgress();
    practice.hideResumeBanner();

    navigateTo('#result');

    renderResultPieChart(correct, wrong);

    if (currentBank && currentBank.id) {
      try {
        const records = await getRecordsByBank(currentBank.id);
        renderResultTrendChart(records);
      } catch (e) {
        console.error('[App] 渲染结果趋势图失败:', e);
      }
    }
  }

  // ===== 结果页饼状图 =====
  function renderResultPieChart(correct, wrong) {
    const canvas = document.getElementById('result-pie-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (window._resultPieChart) window._resultPieChart.destroy();
    window._resultPieChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['正确', '错误'],
        datasets: [{
          data: [correct, wrong],
          backgroundColor: ['#00B578', '#FF3141'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, padding: 16 } }
        },
        cutout: '60%'
      }
    });
  }

  // ===== 结果页趋势图 =====
  function renderResultTrendChart(records) {
    const canvas = document.getElementById('result-trend-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (window._resultTrendChart) window._resultTrendChart.destroy();

    const dailyMap = new Map();
    records.forEach(r => {
      const day = new Date(r.createdAt).toLocaleDateString();
      if (!dailyMap.has(day)) dailyMap.set(day, { correct: 0, total: 0 });
      const d = dailyMap.get(day);
      d.total++;
      if (r.isCorrect) d.correct++;
    });
    const days = Array.from(dailyMap.keys()).slice(-7);
    const rates = days.map(d => {
      const s = dailyMap.get(d);
      return s.total > 0 ? Math.round(s.correct / s.total * 100) : 0;
    });

    window._resultTrendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: days.map(d => d.slice(5)),
        datasets: [{
          label: '正确率',
          data: rates,
          borderColor: '#1677FF',
          backgroundColor: 'rgba(22,119,255,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: '#1677FF'
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: { min: 0, max: 100, ticks: { callback: v => v + '%' } }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  // 暴露到全局
  window.StatsModule = {
    renderHomePage: renderHomePage,
    renderHomePieChart: renderHomePieChart,
    renderHomeTrendChart: renderHomeTrendChart,
    renderHomeTypeBarChart: renderHomeTypeBarChart,
    renderHomeTagRadarChart: renderHomeTagRadarChart,
    renderRecentList: renderRecentList,
    renderResultPieChart: renderResultPieChart,
    renderResultTrendChart: renderResultTrendChart,
    showResult: showResult
  };
})();
