// New / edit modal — open, close, QT slider logic, and Supabase submit.

// ── Quality-tier sliders ──────────────────────────────────────────────────────

function autoBalanceQT(changed) {
  var val = parseInt(document.getElementById('qs-' + changed).value) || 0;
  val = Math.max(0, Math.min(100, Math.round(val / 5) * 5));
  document.getElementById('qs-' + changed).value = val;

  var others    = QT_KEYS.filter(k => k !== changed);
  var remaining = 100 - val;
  var otherVals = {}, otherSum = 0;
  others.forEach(k => {
    otherVals[k] = parseInt(document.getElementById('qs-' + k).value) || 0;
    otherSum += otherVals[k];
  });

  if (remaining <= 0) {
    others.forEach(k => { document.getElementById('qs-' + k).value = 0; });
  } else if (otherSum === 0) {
    var per  = Math.round((remaining / others.length) / 5) * 5;
    var left = remaining;
    others.forEach((k, i) => {
      if (i === others.length - 1) {
        document.getElementById('qs-' + k).value = Math.max(0, left);
      } else {
        var v = Math.min(per, left);
        document.getElementById('qs-' + k).value = v;
        left -= v;
      }
    });
  } else {
    var scaled = {}, sSum = 0;
    others.forEach((k, i) => {
      if (i === others.length - 1) {
        scaled[k] = Math.max(0, remaining - sSum);
      } else {
        var v = Math.round((otherVals[k] / otherSum * remaining) / 5) * 5;
        v = Math.max(0, v);
        scaled[k] = v;
        sSum += v;
      }
    });
    others.forEach(k => { document.getElementById('qs-' + k).value = scaled[k]; });
  }

  var total = 0;
  QT_KEYS.forEach(k => {
    var v = parseInt(document.getElementById('qs-' + k).value) || 0;
    document.getElementById('qp-' + k).textContent = v + '%';
    total += v;
  });
  var td = document.getElementById('qt-total');
  td.textContent = total + '%';
  td.className   = 'qt-total-val ' + (total === 100 ? 'qt-ok' : 'qt-bad');
}

function resetQT(s, m, d, dp) {
  document.getElementById('qs-s').value  = s;
  document.getElementById('qs-m').value  = m;
  document.getElementById('qs-d').value  = d;
  document.getElementById('qs-dp').value = dp;
  QT_KEYS.forEach(k => {
    document.getElementById('qp-' + k).textContent = (parseInt(document.getElementById('qs-' + k).value) || 0) + '%';
  });
  var total = s + m + d + dp;
  var td = document.getElementById('qt-total');
  td.textContent = total + '%';
  td.className   = 'qt-total-val ' + (total === 100 ? 'qt-ok' : 'qt-bad');
}

// ── Environment multi-select ──────────────────────────────────────────────────

function toggleModalEnv(btn) {
  var active = document.querySelectorAll('#m-env-grp .btn.active');
  if (btn.classList.contains('active') && active.length === 1) return; // keep at least one
  btn.classList.toggle('active');
}

function getModalEnvs() {
  var envs = [];
  document.querySelectorAll('#m-env-grp .btn.active').forEach(b => envs.push(b.dataset.env));
  return envs.join(', ');
}

function setModalEnvs(envString) {
  var list = (envString || '').split(',').map(s => s.trim()).filter(Boolean);
  document.querySelectorAll('#m-env-grp .btn').forEach(b => {
    b.classList.toggle('active', list.includes(b.dataset.env));
  });
  // fallback: if nothing matched, default to Airport
  if (!document.querySelector('#m-env-grp .btn.active')) {
    document.querySelector('#m-env-grp .btn[data-env="Airport"]').classList.add('active');
  }
}

// ── Open / close ──────────────────────────────────────────────────────────────

function openNewModal() {
  AppState.editingLogId = null;
  document.getElementById('modal-title-text').textContent    = 'New post-scan feedback log';
  document.getElementById('m-name').value                    = '';
  document.getElementById('m-submitter').value               = '';
  document.getElementById('m-scan-date').value               = new Date().toISOString().split('T')[0];
  document.getElementById('m-scanner').selectedIndex        = 0;
  setModalEnvs('Airport');
  document.getElementById('m-comp').selectedIndex           = 0;
  document.getElementById('m-arrival').value                = '12:00';
  document.getElementById('m-start').value                  = '12:30';
  document.getElementById('m-end').value                    = '16:00';
  document.getElementById('m-scans').value                  = 50;
  document.getElementById('m-batt').value                   = 3;
  document.getElementById('m-data').value                   = 14.5;
  document.getElementById('m-sqft').value                   = '';
  document.getElementById('m-notes').value                  = '';
  AppState.mDelay = 'None';
  document.getElementById('m-delay-grp').querySelectorAll('.dbtn').forEach((b, i) => b.classList.toggle('active', i === 0));
  resetQT(0, 0, 100, 0);
  document.getElementById('modal-submit-btn').textContent   = 'Submit for review';
  document.getElementById('modal-submit-btn').disabled      = false;
  document.getElementById('modal-msg').className            = 'modal-msg';
  document.getElementById('modal-ov').classList.add('show');
}

function openEditModal(id) {
  var l = AppState.allLogs.find(p => p.id === id);
  if (!l) return;

  AppState.editingLogId = id;
  document.getElementById('modal-title-text').textContent = 'Edit log';
  document.getElementById('m-name').value                 = l.project_name || '';
  document.getElementById('m-submitter').value            = l.submitted_by  || '';
  document.getElementById('m-scan-date').value            = l.scan_date     || '';
  document.getElementById('m-scanner').value              = normScanner(l.scanner);
  setModalEnvs(l.environment || 'Airport');
  document.getElementById('m-comp').value                 = l.complexity    || 'Open';
  document.getElementById('m-arrival').value              = l.arrival_time  || '12:00';
  document.getElementById('m-start').value                = l.scan_start    || '12:30';
  document.getElementById('m-end').value                  = l.departure_time || '16:00';
  document.getElementById('m-scans').value                = l.total_scans   || 0;
  document.getElementById('m-batt').value                 = l.batteries_used || 0;
  document.getElementById('m-data').value                 = l.data_gb       || 0;
  document.getElementById('m-sqft').value                 = l.sq_ft ? parseInt(l.sq_ft).toLocaleString('en-US') : '';
  document.getElementById('m-notes').value                = l.notes         || '';
  AppState.mDelay = l.delay_level || 'None';
  document.getElementById('m-delay-grp').querySelectorAll('.dbtn').forEach(b =>
    b.classList.toggle('active', b.textContent === AppState.mDelay)
  );
  resetQT(l.quality_standard || 0, l.quality_medium || 0, l.quality_dense || 0, l.quality_denseplus || 0);
  document.getElementById('modal-submit-btn').textContent = 'Save changes';
  document.getElementById('modal-submit-btn').disabled    = false;
  document.getElementById('modal-msg').className          = 'modal-msg';
  document.getElementById('modal-ov').classList.add('show');
}

function closeModal() {
  document.getElementById('modal-ov').classList.remove('show');
  AppState.editingLogId = null;
}

function setMDelay(v, btn) {
  AppState.mDelay = v;
  document.getElementById('m-delay-grp').querySelectorAll('.dbtn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// ── Submit ────────────────────────────────────────────────────────────────────

function duplicateLog(id) {
  var l = AppState.allLogs.find(p => p.id === id);
  if (!l) return;

  AppState.editingLogId = null;
  document.getElementById('modal-title-text').textContent = 'Duplicate log';
  document.getElementById('m-name').value                 = l.project_name || '';
  document.getElementById('m-submitter').value            = '';
  document.getElementById('m-scan-date').value            = '';
  document.getElementById('m-scanner').value              = normScanner(l.scanner);
  setModalEnvs(l.environment || 'Airport');
  document.getElementById('m-comp').value                 = l.complexity      || 'Open';
  document.getElementById('m-arrival').value              = l.arrival_time    || '12:00';
  document.getElementById('m-start').value                = l.scan_start      || '12:30';
  document.getElementById('m-end').value                  = l.departure_time  || '16:00';
  document.getElementById('m-scans').value                = l.total_scans     || 0;
  document.getElementById('m-batt').value                 = l.batteries_used  || 0;
  document.getElementById('m-data').value                 = l.data_gb         || 0;
  document.getElementById('m-sqft').value                 = l.sq_ft ? parseInt(l.sq_ft).toLocaleString('en-US') : '';
  document.getElementById('m-notes').value                = l.notes           || '';
  AppState.mDelay = l.delay_level || 'None';
  document.getElementById('m-delay-grp').querySelectorAll('.dbtn').forEach(b =>
    b.classList.toggle('active', b.textContent === AppState.mDelay)
  );
  resetQT(l.quality_standard || 0, l.quality_medium || 0, l.quality_dense || 0, l.quality_denseplus || 0);
  document.getElementById('modal-submit-btn').textContent = 'Submit for review';
  document.getElementById('modal-submit-btn').disabled    = false;
  document.getElementById('modal-msg').className          = 'modal-msg';
  document.getElementById('modal-ov').classList.add('show');
}

async function submitLog() {
  var name      = document.getElementById('m-name').value.trim();
  var submitter = document.getElementById('m-submitter').value.trim();
  if (!name)      { showMsg('err', 'Please enter a project name.'); return; }
  if (!submitter) { showMsg('err', 'Please enter your name in "Submitted by" — this field is required.'); return; }

  var qs  = parseInt(document.getElementById('qs-s').value)  || 0;
  var qm  = parseInt(document.getElementById('qs-m').value)  || 0;
  var qd  = parseInt(document.getElementById('qs-d').value)  || 0;
  var qdp = parseInt(document.getElementById('qs-dp').value) || 0;
  if (qs + qm + qd + qdp !== 100) {
    showMsg('err', 'Quality tiers must total 100%. Current: ' + (qs + qm + qd + qdp) + '%.');
    return;
  }

  var envValue = getModalEnvs();
  if (!envValue) { showMsg('err', 'Please select at least one environment type.'); return; }

  var sqftRaw = document.getElementById('m-sqft').value.replace(/,/g, '').trim();
  var btn     = document.getElementById('modal-submit-btn');
  btn.disabled    = true;
  btn.textContent = AppState.editingLogId ? 'Saving...' : 'Submitting...';
  showMsg('', '');

  var payload = {
    project_name:    name,
    submitted_by:    submitter,
    scan_date:       document.getElementById('m-scan-date').value || null,
    scanner:         document.getElementById('m-scanner').value,
    environment:     envValue,
    complexity:      document.getElementById('m-comp').value,
    arrival_time:    document.getElementById('m-arrival').value,
    scan_start:      document.getElementById('m-start').value,
    departure_time:  document.getElementById('m-end').value,
    total_scans:     parseInt(document.getElementById('m-scans').value) || 0,
    batteries_used:  parseInt(document.getElementById('m-batt').value)  || 0,
    data_gb:         parseFloat(document.getElementById('m-data').value) || 0,
    sq_ft:           sqftRaw ? parseInt(sqftRaw) : null,
    quality_standard:  qs,
    quality_medium:    qm,
    quality_dense:     qd,
    quality_denseplus: qdp,
    delay_level:     AppState.mDelay,
    notes:           document.getElementById('m-notes').value.trim()
  };

  var result;
  if (AppState.editingLogId) {
    result = await sb.from('scan_logs').update(payload).eq('id', AppState.editingLogId);
  } else {
    payload.status        = 'pending';
    payload.fed_to_model  = false;
    result = await sb.from('scan_logs').insert(payload);
  }

  if (result.error) {
    console.error('Supabase error:', result.error);
    showMsg('err', 'Error: ' + result.error.message + '. Make sure Supabase RLS policies allow insert/update.');
    btn.disabled    = false;
    btn.textContent = AppState.editingLogId ? 'Save changes' : 'Submit for review';
    return;
  }

  showMsg('ok', AppState.editingLogId ? 'Log updated successfully!' : 'Submitted — pending admin approval');
  setTimeout(() => {
    closeModal();
    loadLogs();
    if (AppState.editingLogId) loadApprovedLogs();
  }, 1600);
}

function showMsg(type, text) {
  var el = document.getElementById('modal-msg');
  if (!type) { el.className = 'modal-msg'; el.textContent = ''; return; }
  el.className   = 'modal-msg ' + type;
  el.textContent = text;
}
