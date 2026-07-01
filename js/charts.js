// Log charts — auto-renders after loadApprovedLogs() and after log submissions.

var _chartTPS     = null;
var _chartScatter = null;

var BLK_TIERS  = ['Fast+ (50mm)', 'Fast (25mm)', 'Dense (12mm)', 'Dense+ (6mm)'];
var BLK_LABELS = { 'Fast+ (50mm)': 'Fast+ 50mm', 'Fast (25mm)': 'Fast 25mm', 'Dense (12mm)': 'Dense 12mm', 'Dense+ (6mm)': 'Dense+ 6mm' };

function renderCharts() {
  var fedLogs = AppState.DB.filter(function(p) {
    return p.actual_hours > 0 && p.actual_scans > 0 && p.scanner === 'BLK360';
  });

  // Approved but not yet fed to model — compute from allLogs
  var notFedLogs = (AppState.allLogs || []).filter(function(l) {
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

  renderTPSChart(fedLogs);
  renderScatterChart(fedLogs, notFedLogs);
}

// ── Chart 1: Average TPS by quality tier ──────────────────────────────────────
function renderTPSChart(logs) {
  var ctx = document.getElementById('chart-tps');
  if (!ctx) return;
  if (_chartTPS) { _chartTPS.destroy(); _chartTPS = null; }

  var loggedTPS = BLK_TIERS.map(function(tier) {
    var g = logs.filter(function(p) { return p.quality_setting === tier && p.actual_scans > 0 && p.actual_hours > 0; });
    if (!g.length) return null;
    return Math.round(g.reduce(function(s, p) { return s + (p.actual_hours * 3600 / p.actual_scans); }, 0) / g.length);
  });

  var modelTPS = BLK_TIERS.map(function(tier) {
    return QUALITY[tier] ? QUALITY[tier].tps : null;
  });

  var hasAnyLogged = loggedTPS.some(function(v) { return v !== null; });

  _chartTPS = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: BLK_TIERS.map(function(t) { return BLK_LABELS[t]; }),
      datasets: [
        {
          label: 'Logged avg',
          data: loggedTPS,
          backgroundColor: BLK_TIERS.map(function(t) { return QTC[t] || '#ccc'; }),
          borderRadius: 5, borderSkipped: false, barPercentage: 0.5,
        },
        {
          label: 'Model baseline',
          data: modelTPS,
          backgroundColor: 'rgba(0,0,0,0.07)', borderColor: 'rgba(0,0,0,0.18)', borderWidth: 1,
          borderRadius: 5, borderSkipped: false, barPercentage: 0.5,
        }
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

  var note = document.getElementById('chart-tps-note');
  if (note) note.textContent = hasAnyLogged ? '' : 'No approved logs with scan_start data yet';
}

// ── Chart 2: Scan count vs duration scatter ───────────────────────────────────
function renderScatterChart(fedLogs, notFedLogs) {
  var ctx = document.getElementById('chart-scatter');
  if (!ctx) return;
  if (_chartScatter) { _chartScatter.destroy(); _chartScatter = null; }

  var allLogs = fedLogs.concat(notFedLogs || []);
  var maxScans = 10;
  allLogs.forEach(function(p) { if (p.actual_scans > maxScans) maxScans = p.actual_scans; });
  maxScans = Math.ceil(maxScans * 1.1);

  var datasets = [];

  // Solid dots — fed to model
  BLK_TIERS.forEach(function(tier) {
    var points = fedLogs
      .filter(function(p) { return p.quality_setting === tier; })
      .map(function(p) { return { x: p.actual_scans, y: Math.round(p.actual_hours * 60), id: p.id }; });
    if (!points.length) return;
    datasets.push({
      label: BLK_LABELS[tier] + ' (in model)',
      data: points,
      backgroundColor: QTC[tier] || '#ccc',
      borderColor: QTC[tier] || '#ccc',
      pointRadius: 6, pointHoverRadius: 8,
      type: 'scatter',
    });
  });

  // Hollow dots — approved, not yet fed
  BLK_TIERS.forEach(function(tier) {
    var points = (notFedLogs || [])
      .filter(function(p) { return p.quality_setting === tier; })
      .map(function(p) { return { x: p.actual_scans, y: Math.round(p.actual_hours * 60), id: p.id }; });
    if (!points.length) return;
    datasets.push({
      label: BLK_LABELS[tier] + ' (pending)',
      data: points,
      backgroundColor: 'rgba(255,255,255,0.9)',
      borderColor: QTC[tier] || '#ccc',
      borderWidth: 2,
      pointRadius: 6, pointHoverRadius: 8,
      type: 'scatter',
    });
  });

  // Dashed model prediction lines
  BLK_TIERS.forEach(function(tier) {
    if (!QUALITY[tier]) return;
    var tps = QUALITY[tier].tps;
    datasets.push({
      label: BLK_LABELS[tier] + ' model',
      data: [{ x: 0, y: 0 }, { x: maxScans, y: Math.round(maxScans * tps / 60) }],
      type: 'line',
      borderColor: QTC[tier] || '#ccc',
      borderWidth: 1.5,
      borderDash: [5, 4],
      pointRadius: 0,
      fill: false, tension: 0,
    });
  });

  _chartScatter = new Chart(ctx, {
    type: 'scatter',
    data: { datasets: datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      onClick: function(evt, elements) {
        if (!elements.length) return;
        var el = elements[0];
        var pt = _chartScatter.data.datasets[el.datasetIndex].data[el.index];
        if (!pt || !pt.id) return;
        AppState.logFilter = 'all';
        document.querySelectorAll('#filter-tabs .lft').forEach(function(b, i) {
          b.classList.toggle('active', i === 0);
        });
        selectLog(pt.id);
        setTimeout(function() {
          var card = document.querySelector('[data-id="' + pt.id + '"]');
          if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 60);
      },
      onHover: function(evt, elements) {
        var hasPt = elements.length > 0 &&
          _chartScatter.data.datasets[elements[0].datasetIndex].data[elements[0].index].id;
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
