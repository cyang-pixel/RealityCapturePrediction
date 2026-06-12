// Post-scan feedback logs — list rendering, detail panel, and admin actions.

function filterLogs(f, btn) {
  AppState.logFilter = f;
  document.getElementById('filter-tabs').querySelectorAll('.lft').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderLogList();
}

var SCANNER_SECTIONS = [
  { key: 'BLK360', label: 'BLK360 G2' },
  { key: 'RTC360', label: 'RTC360' },
  { key: 'VLX',    label: 'NavVis VLX' }
];

function renderLogList() {
  var list     = document.getElementById('log-list');
  var filtered = AppState.logFilter === 'all'
    ? AppState.allLogs
    : AppState.allLogs.filter(l => l.status === AppState.logFilter);

  var html = '';
  SCANNER_SECTIONS.forEach(function(sc) {
    var logs = filtered.filter(function(l) { return normScanner(l.scanner) === sc.key; });
    var cnt  = logs.length;
    html += '<div class="sc-section sc-section--' + sc.key + '">'
      + '<div class="sc-sec-hdr">'
      +   '<span class="sc-sec-name">' + sc.label + '</span>'
      +   '<span class="sc-sec-cnt">' + cnt + ' log' + (cnt !== 1 ? 's' : '') + '</span>'
      + '</div>';
    if (cnt === 0) {
      html += '<div class="sc-sec-empty">No logs yet</div>';
    } else {
      html += logs.map(function(l) {
        var st  = l.status === 'approved' ? 'sa' : l.status === 'rejected' ? 'sr' : 'sp';
        var sel = AppState.selLogId === l.id ? ' sel' : '';
        var dt  = fmtDateTime(l.created_at);
        var dom = l.delay_level && l.delay_level !== 'None'
          ? '<span class="pill amber">' + l.delay_level + ' delay</span>'
          : '';
        var fed = l.fed_to_model ? '<span class="pill green">In model</span>' : '';
        return (
          '<div class="lcard' + sel + '" onclick="selectLog(\'' + l.id + '\')">'
          + '<div class="lcard-top">'
          +   '<div class="lcard-name">' + escHtml(l.project_name) + '</div>'
          +   '<div>'
          +     '<div style="display:flex;gap:6px;align-items:center;justify-content:flex-end;margin-bottom:3px">'
          +       '<span class="sbadge ' + st + '">' + l.status + '</span>'
          +     '</div>'
          +     '<div class="lcard-date">' + dt.date + '</div>'
          +     '<div class="lcard-time">' + dt.time + '</div>'
          +   '</div>'
          + '</div>'
          + '<div class="lcard-meta">'
          +   '<span class="pill blue">' + escHtml(l.environment) + '</span>'
          +   '<span class="pill">' + escHtml(l.complexity) + '</span>'
          +   '<span class="pill">' + l.total_scans + ' scans</span>'
          +   '<span class="pill">' + l.batteries_used + ' batt</span>'
          +   dom + fed
          + '</div>'
          + '</div>'
        );
      }).join('');
    }
    html += '</div>'; // close sc-section
  });
  list.innerHTML = html;
}

function selectLog(id) {
  AppState.selLogId = id;
  renderLogList();

  var l = AppState.allLogs.find(p => p.id === id);
  if (!l) return;

  var durMins  = calcHours(l.arrival_time, l.departure_time) * 60;
  var sqftStr  = l.sq_ft ? parseInt(l.sq_ft).toLocaleString('en-US') + ' sq ft' : 'Not recorded';
  var dt       = fmtDateTime(l.created_at);
  var tiers    = {
    'Fast+ (50mm)': l.quality_standard  || 0,
    'Fast (25mm)':  l.quality_medium    || 0,
    'Dense (12mm)': l.quality_dense     || 0,
    'Dense+ (6mm)': l.quality_denseplus || 0
  };

  var barSegs = '', legend = '';
  Object.entries(tiers).forEach(([k, pct]) => {
    if (pct > 0) {
      var col = QTC[k] || '#ccc';
      barSegs += '<div class="qt-seg" style="width:' + pct + '%;background:' + col + '"></div>';
      legend  += '<div class="qt-li"><div class="qt-dot" style="background:' + col + '"></div>' + k + ' ' + pct + '%</div>';
    }
  });

  var sc         = l.status === 'approved' ? 'sa' : l.status === 'rejected' ? 'sr' : 'sp';
  var canApprove = l.status === 'pending';
  var canFeed    = l.status === 'approved' && !l.fed_to_model;

  document.getElementById('log-detail').innerHTML =
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:18px">'
    + '<div>'
    +   '<div style="font-size:15px;font-weight:800;color:#111;letter-spacing:-.4px">' + escHtml(l.project_name) + '</div>'
    +   '<div style="font-size:12px;color:#aaa;margin-top:4px">' + dt.date + ' at ' + dt.time + ' &middot; ' + escHtml(l.scanner) + '</div>'
    +   '<div style="margin-top:6px">'
    +     '<span class="sbadge ' + sc + '">' + l.status + '</span>'
    +     (l.fed_to_model ? ' <span class="pill green" style="display:inline-block;margin-left:4px">In model</span>' : '')
    +   '</div>'
    + '</div></div>'

    + '<div class="det-sec"><div class="det-slbl">Site &amp; timing</div><div class="det-rows">'
    +   '<div class="det-row"><span class="det-k">Scan date</span><span class="det-v">'  + (l.scan_date     || '&#x2014;') + '</span></div>'
    +   '<div class="det-row"><span class="det-k">Submitted by</span><span class="det-v">' + escHtml(l.submitted_by || '—') + '</span></div>'
    +   '<div class="det-row"><span class="det-k">Environment</span><span class="det-v">' + escHtml(l.environment) + ' &middot; ' + escHtml(l.complexity) + '</span></div>'
    +   '<div class="det-row"><span class="det-k">Arrival</span><span class="det-v">'    + (l.arrival_time  || '&#x2014;') + '</span></div>'
    +   '<div class="det-row"><span class="det-k">Scan start</span><span class="det-v">' + (l.scan_start    || '&#x2014;') + '</span></div>'
    +   '<div class="det-row"><span class="det-k">Departure</span><span class="det-v">'  + (l.departure_time || '&#x2014;') + '</span></div>'
    +   '<div class="det-row"><span class="det-k">Site duration</span><span class="det-v">' + Math.round(durMins) + ' mins</span></div>'
    +   '<div class="det-row"><span class="det-k">Delay</span><span class="det-v">'      + (l.delay_level || 'None') + '</span></div>'
    + '</div></div>'

    + '<div class="det-sec"><div class="det-slbl">Scan metrics</div><div class="det-rows">'
    +   '<div class="det-row"><span class="det-k">Total setups</span><span class="det-v">'  + l.total_scans    + ' positions</span></div>'
    +   '<div class="det-row"><span class="det-k">Batteries used</span><span class="det-v">' + l.batteries_used + ' packs</span></div>'
    +   '<div class="det-row"><span class="det-k">Data size</span><span class="det-v">'     + l.data_gb        + ' GB</span></div>'
    +   '<div class="det-row"><span class="det-k">Area scanned</span><span class="det-v">'  + sqftStr          + '</span></div>'
    + '</div></div>'

    + '<div class="det-sec"><div class="det-slbl">Quality tier breakdown</div>'
    +   '<div class="qt-bar">' + (barSegs || '<div style="width:100%;background:#EEEEEE;border-radius:5px;height:10px"></div>') + '</div>'
    +   '<div class="qt-legend">' + (legend || '<span style="font-size:11px;color:#ccc">No data</span>') + '</div>'
    + '</div>'

    + (l.notes
      ? '<div class="det-sec"><div class="det-slbl">Field notes</div>'
      +   '<div style="font-size:12px;color:#555;line-height:1.65">' + escHtml(l.notes) + '</div>'
      + '</div>'
      : '')

    + '<div class="appr-section"><div class="appr-title">Admin review</div>'
    + (canApprove
      ? '<div class="appr-btns">'
      +   '<button class="appr-btn appr-a" onclick="approveLog(\'' + l.id + '\')">Approve</button>'
      +   '<button class="appr-btn appr-r" onclick="rejectLog(\'' + l.id + '\')">Reject</button>'
      + '</div>'
      : '<div style="font-size:12px;color:#aaa;margin-bottom:6px">Status: <strong style="color:#111">' + l.status + '</strong>'
      +   (l.fed_to_model ? ' &middot; <span style="color:#0F6E56;font-weight:700">Fed to model &#x2713;</span>' : '')
      + '</div>')
    + (canFeed
      ? '<button class="feed-btn" onclick="feedToModel(\'' + l.id + '\')">&#x2192; Feed to calculation model</button>'
      : '')
    + '<button class="dup-btn" onclick="duplicateLog(\'' + l.id + '\')">&#x2398; Duplicate this log</button>'
    + '<button class="edit-btn" onclick="openEditModal(\'' + l.id + '\')">&#x270E; Edit this log</button>'
    + '<button class="del-btn" onclick="deleteLog(\'' + l.id + '\')">&#x1F5D1; Delete this log</button>'
    + '</div>';
}

async function deleteLog(id) {
  if (!confirm('Delete this log? This cannot be undone.')) return;
  await sb.from('scan_logs').delete().eq('id', id);
  AppState.selLogId = null;
  document.getElementById('log-detail').innerHTML =
    '<div class="det-empty"><div style="font-size:36px">&#x1F4CB;</div><p>Select a log to view details</p></div>';
  await loadLogs();
  await loadApprovedLogs();
}

async function approveLog(id) {
  await sb.from('scan_logs').update({ status: 'approved' }).eq('id', id);
  await loadLogs();
  await loadApprovedLogs();
  selectLog(id);
}

async function rejectLog(id) {
  await sb.from('scan_logs').update({ status: 'rejected' }).eq('id', id);
  await loadLogs();
  selectLog(id);
}

async function feedToModel(id) {
  await sb.from('scan_logs').update({ fed_to_model: true }).eq('id', id);
  await loadLogs();
  await loadApprovedLogs();
  selectLog(id);
}
