// Log charts — mini previews in collapsed cards, full detail in expand modal.

var _chartTPS     = null;
var _chartScatter = null;
var _chartFull    = null;

var _fedLogs    = [];
var _notFedLogs = [];

var BLK_TIERS  = ['Fast+ (50mm)', 'Fast (25mm)', 'Dense (12mm)', 'Dense+ (6mm)'];
var BLK_LABELS = { 'Fast+ (50mm)': 'Fast+ 50mm', 'Fast (25mm)': 'Fast 25mm', 'Dense (12mm)': 'Dense 12mm', 'Dense+ (6mm)': 'Dense+ 6mm' };

var MINI_OPTS = {
  responsive: true, maintainAspectRatio: false,
  animation: { duration: 0 },
  plugins: { legend: { display: false }, tooltip: { enabled: false } },
  scales: { x: { display: false }, y: { display: false, beginAtZero: true } }
};

// ── Entry point — called after data loads ─────────────────────────────────────

function renderCharts() {
  _fedLogs = AppState.DB.filter(function(p) {
    return p.actual_hours > 0 && p.actual_scans > 0 && p.scanner === 'BLK360';
  });

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

// ── KPI numbers shown in collapsed cards ─────────────────────────────────────

function updateKPIs() {
  var tpsEl = document.getElementById('chart-tps-kpi');
  if (tpsEl) {
    var best = null;
    // Prefer Dense 12mm; fall back to whatever has data
    ['Dense (12mm)', 'Fast (25mm)', 'Fast+ (50mm)', 'Dense+ (6mm)'].forEach(function(tier) {
      if (best) return;
      var g = _fedLogs.filter(function(p) { return p.quality_setting === tier; });
      if (g.length) {
        var avg = Math.round(g.reduce(function(s, p) { return s + (p.actual_hours * 3600 / p.actual_scans); }, 0) / g.length);
        best = { label: BLK_LABELS[tier], avg: avg };
      }
    });
    tpsEl.innerHTML = best
      ? best.avg + '<span class="chart-kpi-sub"> s/scan &middot; ' + best.label + '</span>'
      : '<span class="chart-kpi-sub">No data yet</span>';
  }

  var scEl = document.getElementById('chart-scatter-kpi');
  if (scEl) {
    var n = _fedLogs.length;
    var avgScans = n ? Math.round(_fedLogs.reduce(function(s, p) { return s + p.actual_scans; }, 0) / n) : 0;
    scEl.innerHTML = n
      ? n + '<span class="chart-kpi-sub"> jobs &middot; avg ' + avgScans + ' scans</span>'
      : '<span class="chart-kpi-sub">No data yet</span>';
  }
}

// ── Mini charts (sparkline previews in collapsed cards) ───────────────────────

function renderTPSMini() {
  var ctx = document.getElementById('chart-tps');
  if (!ctx) return;
  if (_chartTPS) { _chartTPS.destroy(); _chartTPS = null; }

  var logged = BLK_TIERS.map(function(tier) {
    var g = _fedLogs.filter(function(p) { return p.quality_setting === tier; });
    return g.length ? Math.round(g.reduce(function(s, p) { return s + (p.actual_hours * 3600 / p.actual_scans); }, 0) / g.length) : null;
  });
  var model = BLK_TIERS.map(function(t) { return QUALITY[t] ? QUALITY[t].tps : null; });

  _chartTPS = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: BLK_TIERS,
      datasets: [
        { data: logged, backgroundColor: BLK_TIERS.map(function(t) { return QTC[t] || '#ccc'; }), borderRadius: 3, borderSkipped: false, barPercentage: 0.5 },
        { data: model,  backgroundColor: 'rgba(0,0,0,0.07)', borderRadius: 3, borderSkipped: false, barPercentage: 0.5 }
      ]
    },
    options: MINI_OPTS
  });

  var note = document.getElementById('chart-tps-note');
  if (note) note.textContent = _fedLogs.length ? '' : 'No approved logs with scan data yet';
}

function renderScatterMini() {
  var ctx = document.getElementById('chart-scatter');
  if (!ctx) return;
  if (_chartScatter) { _chartScatter.destroy(); _chartScatter = null; }

  var allLogs = _fedLogs.concat(_notFedLogs);
  var maxScans = allLogs.reduce(function(m, p) { return Math.max(m, p.actual_scans); }, 10);
  maxScans = Math.ceil(maxScans * 1.1);

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

// ── Modal — open / close / full chart render ──────────────────────────────────

var CHART_MODAL_META = {
  tps: {
    title: 'Avg Time Per Scan · Quality Tier',
    vsub: '<div class="chart-vsub"><span class="vleg"><span class="vbar" style="background:#5DCAA5"></span>Logged avg</span><span class="vleg"><span class="vbar" style="background:#E8E8E8;border:1px solid #ddd"></span>Model baseline</span></div>'
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
  document.getElementById('chart-modal-vsub').innerHTML    = meta.vsub;
  document.getElementById('chart-modal-ov').classList.add('show');

  if (_chartFull) { _chartFull.destroy(); _chartFull = null; }
  var ctx = document.getElementById('chart-modal-canvas');
  _chartFull = id === 'tps' ? renderTPSFull(ctx) : renderScatterFull(ctx);
}

function closeChartModal(evt) {
  if (evt && evt.target.id !== 'chart-modal-ov') return;
  document.getElementById('chart-modal-ov').classList.remove('show');
  if (_chartFull) { _chartFull.destroy(); _chartFull = null; }
}

// ── Full chart renders (used in modal) ───────────────────────────────────────

function renderTPSFull(ctx) {
  var loggedTPS = BLK_TIERS.map(function(tier) {
    var g = _fedLogs.filter(function(p) { return p.quality_setting === tier && p.actual_scans > 0 && p.actual_hours > 0; });
    return g.length ? Math.round(g.reduce(function(s, p) { return s + (p.actual_hours * 3600 / p.actual_scans); }, 0) / g.length) : null;
  });
  var modelTPS = BLK_TIERS.map(function(t) { return QUALITY[t] ? QUALITY[t].tps : null; });

  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: BLK_TIERS.map(function(t) { return BLK_LABELS[t]; }),
      datasets: [
        { label: 'Logged avg',     data: loggedTPS, backgroundColor: BLK_TIERS.map(function(t) { return QTC[t] || '#ccc'; }), borderRadius: 6, borderSkipped: false, barPercentage: 0.5 },
        { label: 'Model baseline', data: modelTPS,  backgroundColor: 'rgba(0,0,0,0.07)', borderColor: 'rgba(0,0,0,0.18)', borderWidth: 1, borderRadius: 6, borderSkipped: false, barPercentage: 0.5 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: function(c) { return c.dataset.label + ': ' + (c.parsed.y !== null ? c.parsed.y + 's' : 'no data'); } } }
      },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'seconds / scan', font: { size: 10, family: 'Sora' }, color: '#bbb' }, grid: { color: '#F0F0F0' }, ticks: { font: { family: 'Sora', size: 10 }, color: '#aaa' } },
        x: { grid: { display: false }, ticks: { font: { family: 'Sora', size: 10 }, color: '#555' } }
      }
    }
  });
}

function renderScatterFull(ctx) {
  var allLogs = _fedLogs.concat(_notFedLogs);
  var maxScans = allLogs.reduce(function(m, p) { return Math.max(m, p.actual_scans); }, 10);
  maxScans = Math.ceil(maxScans * 1.1);

  var datasets = [];

  BLK_TIERS.forEach(function(tier) {
    var pts = _fedLogs.filter(function(p) { return p.quality_setting === tier; })
      .map(function(p) { return { x: p.actual_scans, y: Math.round(p.actual_hours * 60), id: p.id }; });
    if (pts.length) datasets.push({ label: BLK_LABELS[tier] + ' (in model)', data: pts, backgroundColor: QTC[tier] || '#ccc', borderColor: QTC[tier] || '#ccc', pointRadius: 6, pointHoverRadius: 8, type: 'scatter' });
  });

  BLK_TIERS.forEach(function(tier) {
    var pts = _notFedLogs.filter(function(p) { return p.quality_setting === tier; })
      .map(function(p) { return { x: p.actual_scans, y: Math.round(p.actual_hours * 60), id: p.id }; });
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
            label: function(c) {
              var fed = c.dataset.label.includes('(in model)') ? ' · in model' : ' · not yet fed';
              return c.dataset.label.replace(' (in model)', '').replace(' (pending)', '') + ': ' + c.parsed.x + ' scans · ' + c.parsed.y + ' min' + fed;
            }
          }
        }
      },
      scales: {
        x: { title: { display: true, text: 'scan count', font: { size: 10, family: 'Sora' }, color: '#bbb' }, beginAtZero: true, grid: { color: '#F0F0F0' }, ticks: { font: { family: 'Sora', size: 10 }, color: '#aaa' } },
        y: { title: { display: true, text: 'duration (min)', font: { size: 10, family: 'Sora' }, color: '#bbb' }, beginAtZero: true, grid: { color: '#F0F0F0' }, ticks: { font: { family: 'Sora', size: 10 }, color: '#aaa' } }
      }
    }
  });
}
