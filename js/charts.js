// Log charts — auto-renders after loadApprovedLogs() and after log submissions.

var _chartTPS     = null;
var _chartScatter = null;

var BLK_TIERS = ['Fast+ (50mm)', 'Fast (25mm)', 'Dense (12mm)', 'Dense+ (6mm)'];
var BLK_LABELS = { 'Fast+ (50mm)': 'Fast+ 50mm', 'Fast (25mm)': 'Fast 25mm', 'Dense (12mm)': 'Dense 12mm', 'Dense+ (6mm)': 'Dense+ 6mm' };

function renderCharts() {
  var logs = AppState.DB.filter(function(p) {
    return p.actual_hours > 0 && p.actual_scans > 0 && p.scanner === 'BLK360';
  });
  renderTPSChart(logs);
  renderScatterChart(logs);
}

// ── Chart 1: Average TPS by quality tier ──────────────────────────────────────
function renderTPSChart(logs) {
  var ctx = document.getElementById('chart-tps');
  if (!ctx) return;
  if (_chartTPS) { _chartTPS.destroy(); _chartTPS = null; }

  var loggedTPS = BLK_TIERS.map(function(tier) {
    var g = logs.filter(function(p) { return p.quality_setting === tier; });
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
          borderRadius: 5,
          borderSkipped: false,
          barPercentage: 0.5,
        },
        {
          label: 'Model baseline',
          data: modelTPS,
          backgroundColor: 'rgba(0,0,0,0.07)',
          borderColor: 'rgba(0,0,0,0.18)',
          borderWidth: 1,
          borderRadius: 5,
          borderSkipped: false,
          barPercentage: 0.5,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { family: 'Sora', size: 10 }, boxWidth: 10, padding: 10 }
        },
        tooltip: {
          callbacks: {
            label: function(c) { return c.dataset.label + ': ' + (c.parsed.y !== null ? c.parsed.y + 's' : 'no data'); }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'seconds / scan', font: { size: 10, family: 'Sora' }, color: '#bbb' },
          grid: { color: '#F0F0F0' },
          ticks: { font: { family: 'Sora', size: 10 }, color: '#aaa' }
        },
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Sora', size: 10 }, color: '#555' }
        }
      }
    }
  });

  var note = document.getElementById('chart-tps-note');
  if (note) note.textContent = hasAnyLogged ? '' : 'No approved logs with scan_start data yet';
}

// ── Chart 2: Scan count vs duration scatter ───────────────────────────────────
function renderScatterChart(logs) {
  var ctx = document.getElementById('chart-scatter');
  if (!ctx) return;
  if (_chartScatter) { _chartScatter.destroy(); _chartScatter = null; }

  var maxScans = 10;
  logs.forEach(function(p) { if (p.actual_scans > maxScans) maxScans = p.actual_scans; });
  maxScans = Math.ceil(maxScans * 1.1);

  var datasets = [];

  // Scatter points per tier
  BLK_TIERS.forEach(function(tier) {
    var points = logs
      .filter(function(p) { return p.quality_setting === tier; })
      .map(function(p) { return { x: p.actual_scans, y: Math.round(p.actual_hours * 60) }; });
    if (!points.length) return;
    datasets.push({
      label: BLK_LABELS[tier],
      data: points,
      backgroundColor: QTC[tier] || '#ccc',
      pointRadius: 6,
      pointHoverRadius: 8,
      type: 'scatter',
    });
  });

  // Dashed model prediction lines per tier
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
      fill: false,
      tension: 0,
    });
  });

  _chartScatter = new Chart(ctx, {
    type: 'scatter',
    data: { datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { family: 'Sora', size: 10 }, boxWidth: 10, padding: 10,
            filter: function(item) { return !item.text.includes(' model'); }
          }
        },
        tooltip: {
          filter: function(item) { return !item.dataset.label.includes(' model'); },
          callbacks: {
            label: function(c) {
              return c.dataset.label + ': ' + c.parsed.x + ' scans · ' + c.parsed.y + ' min';
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'scan count', font: { size: 10, family: 'Sora' }, color: '#bbb' },
          beginAtZero: true,
          grid: { color: '#F0F0F0' },
          ticks: { font: { family: 'Sora', size: 10 }, color: '#aaa' }
        },
        y: {
          title: { display: true, text: 'duration (min)', font: { size: 10, family: 'Sora' }, color: '#bbb' },
          beginAtZero: true,
          grid: { color: '#F0F0F0' },
          ticks: { font: { family: 'Sora', size: 10 }, color: '#aaa' }
        }
      }
    }
  });
}
