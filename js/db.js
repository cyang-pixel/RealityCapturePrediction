// Airtable REST API client + all database read/write functions.

const AT_URL = 'https://api.airtable.com/v0/' + AT_BASE + '/scan_logs';

function atHeaders() {
  return { 'Authorization': 'Bearer ' + AT_TOKEN, 'Content-Type': 'application/json' };
}

function atRecord(r) {
  var f = r.fields || {};
  return Object.assign({ id: r.id, created_at: r.createdTime }, f, {
    fed_to_model:   f.fed_to_model   || false,
    total_scans:    f.total_scans    || 0,
    batteries_used: f.batteries_used || 0,
    data_gb:        f.data_gb        || 0
  });
}

async function atFetchAll(filterFormula) {
  var records = [];
  var base    = AT_URL;
  if (filterFormula) base += '?' + new URLSearchParams({ filterByFormula: filterFormula }).toString();
  var url = base;
  while (url) {
    var res  = await fetch(url, { headers: atHeaders() });
    var json = await res.json();
    if (!res.ok) throw new Error((json.error && json.error.message) || 'Airtable error');
    records = records.concat((json.records || []).map(atRecord));
    url = json.offset
      ? base + (filterFormula ? '&' : '?') + 'offset=' + encodeURIComponent(json.offset)
      : null;
  }
  return records;
}

// Map raw DB scanner strings → canonical AppState keys
function normScanner(s) {
  if (!s)                          return 'BLK360';
  if (s.indexOf('BLK') !== -1)     return 'BLK360';
  if (s.indexOf('RTC') !== -1)     return 'RTC360';
  if (s.indexOf('VLX') !== -1 || s.indexOf('NavVis') !== -1) return 'VLX';
  return s;
}

async function loadApprovedLogs() {
  var records = await atFetchAll('AND({status}="approved",{fed_to_model}=TRUE())');

  AppState.DB = [];
  records.forEach(function(r) {
    AppState.DB.push({
      scanner:         normScanner(r.scanner),
      sq_ft:           r.sq_ft || 0,
      env_type:        r.environment ? r.environment.split(',').map(function(e) { return e.trim(); }) : [],
      complexity:      r.complexity,
      quality_setting: getDomQ(r),
      actual_scans:    r.total_scans,
      actual_hours:    calcHours(r.arrival_time, r.departure_time),
      actual_data_gb:  r.data_gb,
      batteries:       r.batteries_used,
      delay_profile:   r.delay_level
    });
  });

  var scannerLogs = AppState.DB.filter(function(p) { return p.scanner === AppState.selScanner; });
  document.getElementById('db-total').textContent = scannerLogs.length;
  updConf();
}

async function loadLogs() {
  document.getElementById('log-list').innerHTML = '<div class="loading-msg">Loading...</div>';

  var records;
  try {
    records = await atFetchAll(null);
  } catch (e) {
    document.getElementById('log-list').innerHTML =
      '<div class="loading-msg" style="color:#A32D2D">Failed to load. Check Airtable token and base ID.</div>';
    return;
  }

  records.sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); });
  AppState.allLogs = records;

  var pending = records.filter(function(l) { return l.status === 'pending'; }).length;
  var pc = document.getElementById('pending-count');
  if (pending > 0) {
    pc.textContent   = pending;
    pc.style.display = 'block';
  } else {
    pc.style.display = 'none';
  }

  renderLogList();
}
