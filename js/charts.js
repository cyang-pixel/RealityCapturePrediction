// Log charts — mini previews in collapsed cards, full detail in expand modal.

var _chartTPS     = null;
var _chartScatter = null;
var _chartFull    = null;

var _fedLogs    = [];
var _notFedLogs = [];

var _activeChartScanner = 'BLK360';

function setChartScanner(scanner, btn) {
  _activeChartScanner = scanner;
  document.querySelectorAll('.cst').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  renderCharts();
}

function updateChartScannerTabs() {
  document.querySelectorAll('.cst').forEach(function(btn) {
    var sc      = btn.dataset.sc;
    var hasData = AppState.DB.some(function(p) { return p.scanner === sc; });
    btn.disabled = !hasData;
    btn.classList.toggle('cst--empty', !hasData);
  });
}

var BLK_TIERS  = ['Fast+ (50mm)', 'Fast (25mm)', 'Dense (12mm)', 'Dense+ (6mm)'];
var BLK_LABELS = { 'Fast+ (50mm)': 'Fast+ 50mm', 'Fast (25mm)': 'Fast 25mm', 'Dense (12mm)': 'Dense 12mm', 'Dense+ (6mm)': 'Dense+ 6mm' };

var MINI_OPTS = {
  responsive: true, maintainAspectRatio: false,
  animation: { duration: 0 },
  plugins: { legend: { display: false }, tooltip: { enabled: false } },
  scales: { x: { display: false }, y: { display: false, beginAtZero: true } }
};

function fmtScanLabel(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr + 'T12:00:00');
  return d.getDate() + '-' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
}

// ── Entry point — called after data loads ─────────────────────────────────────

function renderCharts() {
  _fedLogs = AppState.DB.filter(function(p) {
    return p.actual_hours > 0 && p.actual_scans > 0 && p.scanner === _activeChartScanner;
  });
  updateChartScannerTabs();

  _notFedLogs = (AppState.allLogs || []).filter(function(l) {
    return l.status === 'approved' && !l.fed_to_model && normScanner(l.scanner) === 'BLK360';
  }).map(function(l) {
    var hrs   = calcHours(l.scan_start, l.departure_time);
    var scans = parseInt(l.total_scans) || 0;
    if (hrs <= 0 || scans <= 0) return null;
    var tiers = {
      'Fast+ (50mm)': parseFloat(l.quality_standard)  || 0,
      'Fast (25mm)':  parseFloat(l.quality_medium)    || 0,
      'Dense (12mm)': parseFloat(l.quality_dense)     || 0,
      'Dense+ (6mm)': parseFloat(l.quality_denseplus) || 0
    };
    var dominant = Object.keys(tiers).reduce(function(a, b) { return tiers[a] >= tiers[b] ? a : b; });
    return { quality_setting: dominant, actual_hours: hrs, actual_scans: scans, id: l.id };
  }).filter(Boolean);

  updateKPIs();
  renderTPSMini();
  renderScatterMini();
}

// ── Per-job TPS data — shared by mini and full charts ─────────────────────────

function buildTPSJobs(logs, withLabels) {
  return logs.map(function(l) {
    var actual_tps = Math.round(l.actual_hours * 3600 / l.actual_scans);
    var expected   = QUALITY[l.quality_setting] ? QUALITY[l.quality_setting].tps : null;
    var scan_date  = '';
    var label      = '';
    var rec        = (AppState.allLogs || []).find(function(r) { return r.id === l.id; });
    if (rec && rec.scan_date) {
      scan_date = rec.scan_date;
      if (withLabels) label = fmtScanLabel(rec.scan_date);
    }
    if (withLabels && !label) label = BLK_LABELS[l.quality_setting] || 'Job';
    return {
      label:         label,
      actual_tps:    actual_tps,
      expected:      expected,
      quality_setting: l.quality_setting,
      scan_date:     scan_date,
      project_name:  (rec && rec.project_name) ? rec.project_name : '',
      environment:   (l.env_type && l.env_type.length) ? l.env_type.join(', ') : '',
      actual_scans:  l.actual_scans,
      dur_min:       Math.round(l.actual_hours * 60),
    };
  }).sort(function(a, b) { return a.scan_date.localeCompare(b.scan_date); });
}

// ── KPI numbers shown in collapsed cards ─────────────────────────────────────

function updateKPIs() {
  var tpsEl = document.getElementById('chart-tps-kpi');
  if (tpsEl) {
    if (_fedLogs.length) {
      var jobs   = buildTPSJobs(_fedLogs, false);
      var avgTPS = Math.round(jobs.reduce(function(s, j) { return s + j.actual_tps; }, 0) / jobs.length);
      tpsEl.innerHTML = avgTPS + 's<span class="chart-kpi-sub"> avg/scan · ' + jobs.length + ' jobs</span>';
    } else {
      tpsEl.innerHTML = '<span class="chart-kpi-sub">No data yet</span>';
    }
  }

  var scEl = document.getElementById('chart-scatter-kpi');
  if (scEl) {
    var n        = _fedLogs.length;
    var avgScans = n ? Math.round(_fedLogs.reduce(function(s, p) { return s + p.actual_scans; }, 0) / n) : 0;
    scEl.innerHTML = n
      ? n + '<span class="chart-kpi-sub"> jobs · avg ' + avgScans + ' scans</span>'
      : '<span class="chart-kpi-sub">No data yet</span>';
  }
}

// ── Mini charts (sparkline previews in collapsed cards) ───────────────────────

function renderTPSMini() {
  var ctx  = document.getElementById('chart-tps');
  if (!ctx) return;
  if (_chartTPS) { _chartTPS.destroy(); _chartTPS = null; }

  var note = document.getElementById('chart-tps-note');
  if (!_fedLogs.length) {
    if (note) note.textContent = 'No approved logs with scan data yet';
    return;
  }
  if (note) note.textContent = '';

  var jobs = buildTPSJobs(_fedLogs, false);

  _chartTPS = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: jobs.map(function(_, i) { return i + 1; }),
      datasets: [{
        data:            jobs.map(function(j) { return j.actual_tps; }),
        backgroundColor: jobs.map(function(j) { return QTC[j.quality_setting] || '#5DCAA5'; }),
        borderRadius:    3,
        borderSkipped:   false,
        barPercentage:   0.8,
      }]
    },
    options: Object.assign({}, MINI_OPTS, {
      scales: { x: { display: false }, y: { display: false, beginAtZero: true } }
    })
  });
}

function renderScatterMini() {
  var ctx = document.getElementById('chart-scatter');
  if (!ctx) return;
  if (_chartScatter) { _chartScatter.destroy(); _chartScatter = null; }

  var allLogs  = _fedLogs.concat(_notFedLogs);
  var maxScans = allLogs.reduce(function(m, p) { return Math.max(m, p.actual_scans); }, 10);
  maxScans     = Math.ceil(maxScans * 1.1);

  var datasets = [];
  BLK_TIERS.forEach(function(tier) {
    var pts = _fedLogs.filter(function(p) { return p.quality_setting === tier; })
      .map(function(p) { return { x: p.actual_scans, y: Math.round(p.actual_hours * 60) }; });
    if (pts.length) datasets.push({ data: pts, backgroundColor: QTC[tier], pointRadius: 3, type: 'scatter' });
  });
  BLK_TIERS.forEach(function(tier) {
    if (!QUALITY[tier]) return;
    var tps = QUALITY[tier].tps;
    datasets.push({ data: [{ x: 0, y: 0 }, { x: maxScans, y: Math.round(maxScans * tps / 60) }], type: 'line', borderColor: QTC[tier], borderWidth: 1, borderDash: [4, 3], pointRadius: 0, fill: false, tension: 0 });
  });

  _chartScatter = new Chart(ctx, {
    type: 'scatter', data: { datasets: datasets },
    options: Object.assign({}, MINI_OPTS, { scales: { x: { display: false, beginAtZero: true }, y: { display: false, beginAtZero: true } } })
  });
}

// ── Modal — open / close ──────────────────────────────────────────────────────

var CHART_MODAL_META = {
  tps: {
    title: 'Time Per Scan · By Job',
    vsub: '<div class="chart-vsub"><span class="vleg"><span class="vdot" style="background:#C0DD97"></span>Fast+ 50mm</span><span class="vleg"><span class="vdot" style="background:#5DCAA5"></span>Fast 25mm</span><span class="vleg"><span class="vdot" style="background:#0F6E56"></span>Dense 12mm</span><span class="vleg"><span class="vdot" style="background:#085041"></span>Dense+ 6mm</span><span class="vleg"><span class="vdash"></span>model expected</span></div>'
  },
  scatter: {
    title: 'Scan Count vs Duration',
    vsub: '<div class="chart-vsub"><span class="vleg"><span class="vdot" style="background:#C0DD97"></span>Fast+ 50mm</span><span class="vleg"><span class="vdot" style="background:#5DCAA5"></span>Fast 25mm</span><span class="vleg"><span class="vdot" style="background:#0F6E56"></span>Dense 12mm</span><span class="vleg"><span class="vdot" style="background:#085041"></span>Dense+ 6mm</span><span class="vleg"><span class="vdot vdot-hollow" style="border-color:#5DCAA5"></span>pending</span><span class="vleg"><span class="vdash"></span>model prediction</span></div>'
  }
};

function openChartModal(id) {
  var meta = CHART_MODAL_META[id];
  if (!meta) return;
  document.getElementById('chart-modal-title').textContent = meta.title;
  document.getElementById('chart-modal-vsub').innerHTML    = meta.vsub || '';
  document.getElementById('chart-modal-ov').classList.add('show');

  if (_chartFull) { _chartFull.destroy(); _chartFull = null; }
  var ctx    = document.getElementById('chart-modal-canvas');
  var wrap   = ctx.parentElement;
  if (wrap) wrap.style.height = '360px';
  _chartFull = id === 'tps' ? renderTPSFull(ctx) : renderScatterFull(ctx);
}

function closeChartModal(evt) {
  if (evt && evt.target.id !== 'chart-modal-ov') return;
  document.getElementById('chart-modal-ov').classList.remove('show');
  if (_chartFull) { _chartFull.destroy(); _chartFull = null; }
}

// ── Full chart renders (used in modal) ───────────────────────────────────────

// Draws the actual TPS value above each bar
var VALUE_LABEL_PLUGIN = {
  id: 'valueLabelPlugin',
  afterDatasetsDraw: function(chart) {
    var ctx = chart.ctx;
    chart.data.datasets.forEach(function(dataset, i) {
      if (dataset.type && dataset.type !== 'bar') return;
      var meta = chart.getDatasetMeta(i);
      if (meta.hidden) return;
      meta.data.forEach(function(bar, j) {
        var val = dataset.data[j];
        if (val === null || val === undefined) return;
        ctx.save();
        ctx.font = '600 11px Sora, sans-serif';
        ctx.fillStyle = '#555';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(val + 's', bar.x, bar.y - 4);
        ctx.restore();
      });
    });
  }
};

function renderTPSFull(ctx) {
  var jobs      = buildTPSJobs(_fedLogs, true);
  var labels    = jobs.map(function(j) { return j.label; });
  var actData   = jobs.map(function(j) { return j.actual_tps; });
  var expData   = jobs.map(function(j) { return j.expected; });
  var barColors = jobs.map(function(j) { return QTC[j.quality_setting] || '#5DCAA5'; });

  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label:           'Actual TPS',
          data:            actData,
          backgroundColor: barColors,
          borderRadius:    5,
          borderSkipped:   false,
          barPercentage:   0.6,
          order:           2,
        },
        {
          type:                 'line',
          label:                'Model expected',
          data:                 expData,
          borderColor:          'rgba(0,0,0,0.22)',
          borderWidth:          2,
          borderDash:           [5, 4],
          pointStyle:           'circle',
          pointRadius:          5,
          pointBackgroundColor: barColors,
          pointBorderColor:     barColors,
          fill:                 false,
          tension:              0,
          order:                1,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: function(items) {
              var j = jobs[items[0].dataIndex];
              return j.project_name || j.label;
            },
            label: function(item) {
              var j = jobs[item.dataIndex];
              if (item.datasetIndex === 0) {
                var diff    = j.expected !== null ? j.actual_tps - j.expected : null;
                var diffStr = diff !== null
                  ? '  (' + (diff >= 0 ? '+' : '') + diff + 's vs model)'
                  : '';
                return j.quality_setting + ':  ' + j.actual_tps + 's/scan' + diffStr;
              }
              return 'Model expected:  ' + item.parsed.y + 's';
            },
            afterBody: function(items) {
              var j   = jobs[items[0].dataIndex];
              var out = [j.actual_scans + ' scans  ·  ' + j.dur_min + ' min on site'];
              if (j.environment) out.push(j.environment);
              return out;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'seconds / scan', font: { size: 10, family: 'Sora' }, color: '#bbb' },
          grid:  { color: '#F0F0F0' },
          ticks: { font: { family: 'Sora', size: 10 }, color: '#aaa' }
        },
        x: {
          grid:  { display: false },
          ticks: { font: { family: 'Sora', size: 11 }, color: '#555' }
        }
      }
    },
    plugins: [VALUE_LABEL_PLUGIN]
  });
}

function renderScatterFull(ctx) {
  var allLogs  = _fedLogs.concat(_notFedLogs);
  var maxScans = allLogs.reduce(function(m, p) { return Math.max(m, p.actual_scans); }, 10);
  maxScans     = Math.ceil(maxScans * 1.1);

  var datasets = [];

  function ptName(id) {
    var rec = (AppState.allLogs || []).find(function(r) { return r.id === id; });
    return (rec && rec.project_name) ? rec.project_name : '';
  }

  BLK_TIERS.forEach(function(tier) {
    var pts = _fedLogs.filter(function(p) { return p.quality_setting === tier; })
      .map(function(p) { return { x: p.actual_scans, y: Math.round(p.actual_hours * 60), id: p.id, name: ptName(p.id) }; });
    if (pts.length) datasets.push({ label: BLK_LABELS[tier] + ' (in model)', data: pts, backgroundColor: QTC[tier] || '#ccc', borderColor: QTC[tier] || '#ccc', pointRadius: 6, pointHoverRadius: 8, type: 'scatter' });
  });

  BLK_TIERS.forEach(function(tier) {
    var pts = _notFedLogs.filter(function(p) { return p.quality_setting === tier; })
      .map(function(p) { return { x: p.actual_scans, y: Math.round(p.actual_hours * 60), id: p.id, name: ptName(p.id) }; });
    if (pts.length) datasets.push({ label: BLK_LABELS[tier] + ' (pending)', data: pts, backgroundColor: 'rgba(255,255,255,0.9)', borderColor: QTC[tier] || '#ccc', borderWidth: 2, pointRadius: 6, pointHoverRadius: 8, type: 'scatter' });
  });

  BLK_TIERS.forEach(function(tier) {
    if (!QUALITY[tier]) return;
    var tps = QUALITY[tier].tps;
    datasets.push({ label: BLK_LABELS[tier] + ' model', data: [{ x: 0, y: 0 }, { x: maxScans, y: Math.round(maxScans * tps / 60) }], type: 'line', borderColor: QTC[tier] || '#ccc', borderWidth: 1.5, borderDash: [5, 4], pointRadius: 0, fill: false, tension: 0 });
  });

  return new Chart(ctx, {
    type: 'scatter',
    data: { datasets: datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      onClick: function(evt, elements) {
        if (!elements.length) return;
        var el = elements[0];
        var pt = _chartFull.data.datasets[el.datasetIndex].data[el.index];
        if (!pt || !pt.id) return;
        closeChartModal();
        AppState.logFilter = 'all';
        document.querySelectorAll('#filter-tabs .lft').forEach(function(b, i) { b.classList.toggle('active', i === 0); });
        selectLog(pt.id);
        setTimeout(function() {
          var card = document.querySelector('[data-id="' + pt.id + '"]');
          if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 80);
      },
      onHover: function(evt, elements) {
        if (!evt.native) return;
        var hasPt = elements.length > 0 && _chartFull && _chartFull.data.datasets[elements[0].datasetIndex].data[elements[0].index].id;
        evt.native.target.style.cursor = hasPt ? 'pointer' : 'default';
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: function(item) { return !item.dataset.label.includes(' model'); },
          callbacks: {
            title: function(items) {
              var pt = _chartFull.data.datasets[items[0].datasetIndex].data[items[0].dataIndex];
              return (pt && pt.name) ? pt.name : '';
            },
            label: function(c) {
              var tier = c.dataset.label.replace(' (in model)', '').replace(' (pending)', '');
              var fed  = c.dataset.label.includes('(in model)') ? ' · in model' : ' · not yet fed';
              return tier + ':  ' + c.parsed.x + ' scans  ·  ' + c.parsed.y + ' min' + fed;
            }
          }
        }
      },
      scales: {
        x: { title: { display: true, text: 'scan count',     font: { size: 10, family: 'Sora' }, color: '#bbb' }, beginAtZero: true, grid: { color: '#F0F0F0' }, ticks: { font: { family: 'Sora', size: 10 }, color: '#aaa' } },
        y: { title: { display: true, text: 'duration (min)', font: { size: 10, family: 'Sora' }, color: '#bbb' }, beginAtZero: true, grid: { color: '#F0F0F0' }, ticks: { font: { family: 'Sora', size: 10 }, color: '#aaa' } }
      }
    }
  });
}
