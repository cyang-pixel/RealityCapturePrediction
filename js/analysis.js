// Scanner Analysis — per-scanner breakdown: project share, environment, quality tier.

var _saCharts   = {};   // { scanner: { project, env, quality } }
var _saRendered = {};   // { scanner: bool }

var SA_SCANNERS = [
  { key: 'BLK360', label: 'BLK360 G2',  dot: '#0F6E56' },
  { key: 'RTC360', label: 'RTC360',      dot: '#4A7FC1' },
  { key: 'VLX',   label: 'NavVis VLX',  dot: '#8A5BB0' }
];

var SA_PROJECT_COLORS = [
  '#6495ED','#EFA050','#B88CE8','#E07070',
  '#52B9A0','#D4A870','#606060','#70C0E0',
  '#F0C040','#80A890'
];

var SA_ENV_COLORS = {
  'Office':      '#6495ED',
  'Airport':     '#52B9A0',
  'Warehouse':   '#EFA050',
  'Retail':      '#B88CE8',
  'Hospital':    '#E07070',
  'Industrial':  '#909090',
  'Residential': '#D4A870',
  'Mixed Use':   '#70C0E0'
};

var BLK_TIER_ORDER = ['Fast+ (50mm)', 'Fast (25mm)', 'Dense (12mm)', 'Dense+ (6mm)'];
var BLK_TIER_SHORT = {
  'Fast+ (50mm)': 'Fast+ 50mm',
  'Fast (25mm)':  'Fast 25mm',
  'Dense (12mm)': 'Dense 12mm',
  'Dense+ (6mm)': 'Dense+ 6mm'
};

// ── Donut center-text plugin ─────────────────────────────────────────────────

var DONUT_CENTER_PLUGIN = {
  id: 'saDonutCenter',
  afterDraw: function(chart) {
    if (chart.config.type !== 'doughnut') return;
    var ct = chart.options.plugins.centerText;
    if (!ct) return;
    var ctx = chart.ctx;
    var cx  = (chart.chartArea.left + chart.chartArea.right)  / 2;
    var cy  = (chart.chartArea.top  + chart.chartArea.bottom) / 2;
    ctx.save();
    ctx.font = '700 17px Sora, sans-serif';
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ct.value, cx, cy - 8);
    ctx.font = '400 10px Sora, sans-serif';
    ctx.fillStyle = '#aaa';
    ctx.fillText(ct.label, cx, cy + 9);
    ctx.restore();
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Extract "JFK T6" from "JFK T6 - STG6_LVL1_E4"; no separator → "Other"
function getProjectFamily(rawName) {
  var name = (rawName || '').trim();
  var idx  = name.indexOf(' - ');
  return idx > 0 ? name.substring(0, idx).trim() : 'Other';
}

function saGetDomQ(l) {
  var t = {
    'Fast+ (50mm)': parseFloat(l.quality_standard)  || 0,
    'Fast (25mm)':  parseFloat(l.quality_medium)    || 0,
    'Dense (12mm)': parseFloat(l.quality_dense)     || 0,
    'Dense+ (6mm)': parseFloat(l.quality_denseplus) || 0
  };
  return Object.keys(t).reduce(function(a, b) { return t[a] >= t[b] ? a : b; });
}

function getAnalysisLogs(scanner) {
  return (AppState.allLogs || []).filter(function(l) {
    return normScanner(l.scanner) === scanner && l.status !== 'rejected';
  });
}

// ── Entry point — call after AppState.allLogs is populated ───────────────────

function renderAnalysis() {
  SA_SCANNERS.forEach(function(sc) {
    var logs  = getAnalysisLogs(sc.key);
    var panel = document.getElementById('sa-panel-' + sc.key);
    if (!panel) return;

    panel.classList.toggle('sa-panel--empty', logs.length === 0);
    updateSABadges(sc.key, logs);

    if (_saRendered[sc.key]) {
      renderSACharts(sc.key, logs);
    }
  });
}

// ── Collapsed summary badges ─────────────────────────────────────────────────

function updateSABadges(scanner, logs) {
  var el = document.getElementById('sa-badges-' + scanner);
  if (!el) return;

  if (!logs.length) {
    el.innerHTML = '<span class="sa-badge-empty">No logs yet</span>';
    return;
  }

  var totalScans = logs.reduce(function(s, l) { return s + (parseInt(l.total_scans) || 0); }, 0);

  var tierCount = {};
  logs.forEach(function(l) { var t = saGetDomQ(l); tierCount[t] = (tierCount[t] || 0) + 1; });
  var topTier = Object.keys(tierCount).reduce(function(a, b) { return tierCount[a] >= tierCount[b] ? a : b; }, '');

  var envCount = {};
  logs.forEach(function(l) {
    (l.environment || '').split(',').forEach(function(e) {
      e = e.trim(); if (e) envCount[e] = (envCount[e] || 0) + 1;
    });
  });
  var topEnv = Object.keys(envCount).length
    ? Object.keys(envCount).reduce(function(a, b) { return envCount[a] >= envCount[b] ? a : b; })
    : '';

  el.innerHTML =
    '<span class="sa-pill">' + logs.length + ' job' + (logs.length !== 1 ? 's' : '') + '</span>'
    + '<span class="sa-pill">' + totalScans.toLocaleString() + ' scans</span>'
    + (topTier ? '<span class="sa-pill">' + (BLK_TIER_SHORT[topTier] || topTier) + '</span>' : '')
    + (topEnv  ? '<span class="sa-pill">' + topEnv + '</span>' : '');
}

// ── Toggle panel open / close ─────────────────────────────────────────────────

function toggleSAPanel(scanner) {
  var panel = document.getElementById('sa-panel-' + scanner);
  var body  = document.getElementById('sa-body-'  + scanner);
  var chev  = document.getElementById('sa-chev-'  + scanner);
  if (!panel || !body || panel.classList.contains('sa-panel--empty')) return;

  var isOpen = body.classList.contains('open');

  if (!isOpen) {
    body.classList.add('open');
    body.style.maxHeight = '0px';
    renderSACharts(scanner, getAnalysisLogs(scanner));
    _saRendered[scanner] = true;
    // Allow reflow so scrollHeight is correct after charts render
    requestAnimationFrame(function() {
      body.style.maxHeight = body.scrollHeight + 'px';
    });
    if (chev) chev.classList.add('open');
  } else {
    body.style.maxHeight = '0px';
    body.classList.remove('open');
    if (chev) chev.classList.remove('open');
  }
}

// ── Chart renders ─────────────────────────────────────────────────────────────

function renderSACharts(scanner, logs) {
  renderSAProject(scanner, logs);
  renderSAEnv(scanner, logs);
  renderSAQuality(scanner, logs);

  // Recalculate maxHeight after charts render (project bar scales dynamically)
  var body = document.getElementById('sa-body-' + scanner);
  if (body && body.classList.contains('open')) {
    requestAnimationFrame(function() { body.style.maxHeight = body.scrollHeight + 'px'; });
  }
}

function destroySAChart(scanner, key) {
  if (_saCharts[scanner] && _saCharts[scanner][key]) {
    try { _saCharts[scanner][key].destroy(); } catch (e) {}
    _saCharts[scanner][key] = null;
  }
}

// ── By Project — horizontal bar (% of total scans) ───────────────────────────

function renderSAProject(scanner, logs) {
  var ctx = document.getElementById('sa-project-' + scanner);
  if (!ctx) return;
  destroySAChart(scanner, 'project');
  if (!_saCharts[scanner]) _saCharts[scanner] = {};

  var proj = {};
  logs.forEach(function(l) {
    var family = getProjectFamily(l.project_name || 'Unnamed');
    if (!proj[family]) proj[family] = { scans: 0, jobs: 0 };
    proj[family].scans += parseInt(l.total_scans) || 0;
    proj[family].jobs++;
  });

  var total  = Object.keys(proj).reduce(function(s, k) { return s + proj[k].scans; }, 0);
  var names  = Object.keys(proj).sort(function(a, b) {
    if (a === 'Other') return 1; if (b === 'Other') return -1;
    return proj[b].scans - proj[a].scans;
  });
  var pcts   = names.map(function(n) { return Math.round(proj[n].scans / Math.max(total, 1) * 100); });
  var colors = names.map(function(_, i) { return SA_PROJECT_COLORS[i % SA_PROJECT_COLORS.length]; });

  // Scale canvas height to number of projects
  var wrap = document.getElementById('sa-project-wrap-' + scanner);
  if (wrap) wrap.style.height = Math.max(80, names.length * 36 + 24) + 'px';

  _saCharts[scanner].project = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: names,
      datasets: [{
        data:            pcts,
        backgroundColor: colors,
        borderRadius:    4,
        borderSkipped:   false,
        barPercentage:   0.6,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 350 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: function(items) { return names[items[0].dataIndex]; },
            label: function(item) {
              var n = names[item.dataIndex], p = proj[n];
              return p.scans.toLocaleString() + ' scans  ·  '
                + p.jobs + ' job' + (p.jobs !== 1 ? 's' : '')
                + '  ·  ' + item.parsed.x + '% of total';
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true, max: 100,
          grid: { color: '#F2F2F2' },
          ticks: { callback: function(v) { return v + '%'; }, font: { family: 'Sora', size: 10 }, color: '#bbb' }
        },
        y: {
          grid:  { display: false },
          ticks: { font: { family: 'Sora', size: 10 }, color: '#444' }
        }
      }
    }
  });
}

// ── By Environment — doughnut (jobs) ─────────────────────────────────────────

function renderSAEnv(scanner, logs) {
  var ctx = document.getElementById('sa-env-' + scanner);
  if (!ctx) return;
  destroySAChart(scanner, 'env');
  if (!_saCharts[scanner]) _saCharts[scanner] = {};

  var envMap = {};
  logs.forEach(function(l) {
    (l.environment || '').split(',').forEach(function(e) {
      e = e.trim(); if (!e) return;
      if (!envMap[e]) envMap[e] = { jobs: 0, scans: 0 };
      envMap[e].jobs++;
      envMap[e].scans += parseInt(l.total_scans) || 0;
    });
  });

  var envNames  = Object.keys(envMap).sort(function(a, b) { return envMap[b].jobs - envMap[a].jobs; });
  var envVals   = envNames.map(function(e) { return envMap[e].jobs; });
  var envTotal  = envVals.reduce(function(s, v) { return s + v; }, 0);
  var envColors = envNames.map(function(e) { return SA_ENV_COLORS[e] || '#B8B8B8'; });

  if (!envNames.length) { envNames = ['No data']; envVals = [1]; envColors = ['#E8E8E8']; envTotal = 0; }

  _saCharts[scanner].env = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: envNames, datasets: [{ data: envVals, backgroundColor: envColors, borderWidth: 2, borderColor: '#fff', hoverOffset: 5 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '60%',
      animation: { duration: 350 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: function(items) { return envNames[items[0].dataIndex]; },
            label: function(c) {
              var e = envMap[envNames[c.dataIndex]];
              if (!e) return '';
              var pct = envTotal ? Math.round(c.parsed / envTotal * 100) : 0;
              return e.jobs + ' job' + (e.jobs !== 1 ? 's' : '') + '  (' + pct + '%)  ·  ' + e.scans.toLocaleString() + ' scans';
            }
          }
        },
        centerText: { value: envTotal || '', label: envTotal ? 'jobs' : '' }
      }
    },
    plugins: [DONUT_CENTER_PLUGIN]
  });

  var legEl = document.getElementById('sa-env-legend-' + scanner);
  if (legEl) {
    legEl.innerHTML = envNames.map(function(name, i) {
      var pct = (envTotal && envMap[name]) ? Math.round(envMap[name].jobs / envTotal * 100) : 0;
      return '<div class="sa-leg-row">'
        + '<span class="sa-leg-dot" style="background:' + envColors[i] + '"></span>'
        + '<span class="sa-leg-name">' + name + '</span>'
        + '<span class="sa-leg-pct">' + pct + '%</span>'
        + '</div>';
    }).join('');
  }
}

// ── By Quality Tier — doughnut (scan positions) ───────────────────────────────

function renderSAQuality(scanner, logs) {
  var ctx = document.getElementById('sa-quality-' + scanner);
  if (!ctx) return;
  destroySAChart(scanner, 'quality');
  if (!_saCharts[scanner]) _saCharts[scanner] = {};

  var tierMap = {};
  logs.forEach(function(l) {
    var tier = saGetDomQ(l);
    if (!tierMap[tier]) tierMap[tier] = { jobs: 0, scans: 0 };
    tierMap[tier].jobs++;
    tierMap[tier].scans += parseInt(l.total_scans) || 0;
  });

  var tierNames  = BLK_TIER_ORDER.filter(function(t) { return tierMap[t]; });
  var tierVals   = tierNames.map(function(t) { return tierMap[t].scans; });
  var tierTotal  = tierVals.reduce(function(s, v) { return s + v; }, 0);
  var tierColors = tierNames.map(function(t) { return QTC[t] || '#ccc'; });

  if (!tierNames.length) { tierNames = ['No data']; tierVals = [1]; tierColors = ['#E8E8E8']; tierTotal = 0; }

  _saCharts[scanner].quality = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: tierNames, datasets: [{ data: tierVals, backgroundColor: tierColors, borderWidth: 2, borderColor: '#fff', hoverOffset: 5 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '60%',
      animation: { duration: 350 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: function(items) { return tierNames[items[0].dataIndex]; },
            label: function(c) {
              var t = tierMap[tierNames[c.dataIndex]];
              if (!t) return '';
              var pct = tierTotal ? Math.round(c.parsed / tierTotal * 100) : 0;
              return t.scans.toLocaleString() + ' scan pos.  (' + pct + '%)  ·  ' + t.jobs + ' job' + (t.jobs !== 1 ? 's' : '');
            }
          }
        },
        centerText: { value: tierTotal ? tierTotal.toLocaleString() : '', label: tierTotal ? 'scans' : '' }
      }
    },
    plugins: [DONUT_CENTER_PLUGIN]
  });

  var legEl = document.getElementById('sa-quality-legend-' + scanner);
  if (legEl) {
    legEl.innerHTML = tierNames.map(function(name, i) {
      var pct = (tierTotal && tierMap[name]) ? Math.round(tierMap[name].scans / tierTotal * 100) : 0;
      return '<div class="sa-leg-row">'
        + '<span class="sa-leg-dot" style="background:' + tierColors[i] + '"></span>'
        + '<span class="sa-leg-name">' + (BLK_TIER_SHORT[name] || name) + '</span>'
        + '<span class="sa-leg-pct">' + pct + '%</span>'
        + '</div>';
    }).join('');
  }
}
