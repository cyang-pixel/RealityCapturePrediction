// Supabase client + all database read/write functions.

const sb = supabase.createClient(SUPA_URL, SUPA_KEY);

// Map raw DB scanner strings → canonical AppState keys
function normScanner(s) {
  if (!s)                          return 'BLK360';
  if (s.indexOf('BLK') !== -1)     return 'BLK360';
  if (s.indexOf('RTC') !== -1)     return 'RTC360';
  if (s.indexOf('VLX') !== -1 || s.indexOf('NavVis') !== -1) return 'VLX';
  return s;
}

async function loadApprovedLogs() {
  var { data } = await sb
    .from('scan_logs')
    .select('*')
    .eq('status', 'approved')
    .eq('fed_to_model', true);

  AppState.DB = [];
  if (data) {
    data.forEach(r => {
      AppState.DB.push({
        scanner:        normScanner(r.scanner),
        sq_ft:          r.sq_ft || 0,
        env_type:       r.environment.split(',').map(function(e) { return e.trim(); }),
        complexity:     r.complexity,
        quality_setting: getDomQ(r),
        actual_scans:   r.total_scans,
        actual_hours:   calcHours(r.arrival_time, r.departure_time),
        actual_data_gb: r.data_gb,
        batteries:      r.batteries_used,
        delay_profile:  r.delay_level
      });
    });
  }

  var scannerLogs = AppState.DB.filter(function(p) { return p.scanner === AppState.selScanner; });
  document.getElementById('db-total').textContent = scannerLogs.length;
  updConf();
}

async function loadLogs() {
  document.getElementById('log-list').innerHTML = '<div class="loading-msg">Loading...</div>';

  var { data, error } = await sb
    .from('scan_logs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    document.getElementById('log-list').innerHTML =
      '<div class="loading-msg" style="color:#A32D2D">Failed to load.<br>Run RLS policy fix in Supabase SQL Editor.</div>';
    return;
  }

  AppState.allLogs = data || [];

  var pending = AppState.allLogs.filter(l => l.status === 'pending').length;
  var pc = document.getElementById('pending-count');
  if (pending > 0) {
    pc.textContent    = pending;
    pc.style.display  = 'block';
  } else {
    pc.style.display  = 'none';
  }

  renderLogList();
}
