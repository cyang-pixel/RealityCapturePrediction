// Supabase client + all database read/write functions.

const sb = supabase.createClient(SUPA_URL, SUPA_KEY);

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
        sq_ft:          r.sq_ft || 0,
        env_type:       r.environment,
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

  document.getElementById('db-total').textContent = AppState.DB.length;
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
