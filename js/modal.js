// New / edit modal — open, close, QT slider logic, and submit.

// Per-scanner quality tier config — cols maps each key to the Airtable field name
var MODAL_QT_CFG = {
  BLK360: {
    keys:     ['s', 'm', 'd', 'dp'],
    labels:   { s: 'Fast+ 50mm', m: 'Fast 25mm', d: 'Dense 12mm', dp: 'Dense+ 6mm' },
    cols:     { s: 'quality_standard', m: 'quality_medium', d: 'quality_dense', dp: 'quality_denseplus' },
    defaults: { s: 0, m: 0, d: 100, dp: 0 }
  },
  RTC360: {
    keys:     ['l', 'm', 'h'],
    labels:   { l: 'Low · 12mm', m: 'Medium · 6mm', h: 'High · 3mm' },
    cols:     { l: 'quality_standard', m: 'quality_medium', h: 'quality_dense' },
    defaults: { l: 0, m: 100, h: 0 }
  },
  VLX: {
    keys:     ['s', 'm', 'd', 'dp'],
    labels:   { s: 'Fast+ 50mm', m: 'Fast 25mm', d: 'Dense 12mm', dp: 'Dense+ 6mm' },
    cols:     { s: 'quality_standard', m: 'quality_medium', d: 'quality_dense', dp: 'quality_denseplus' },
    defaults: { s: 0, m: 0, d: 100, dp: 0 }
  }
};
var modalScannerMode = 'BLK360';

// ── Quality-tier sliders ──────────────────────────────────────────────────────

function renderModalQTSliders(scanner, vals) {
  modalScannerMode = scanner || 'BLK360';
  var cfg = MODAL_QT_CFG[modalScannerMode] || MODAL_QT_CFG.BLK360;
  var v   = vals || cfg.defaults;

  var html = '<div class="qt-slider-section">';
  cfg.keys.forEach(function(k) {
    var def = (v[k] !== undefined ? v[k] : cfg.defaults[k]) || 0;
    html += '<div class="qt-slider-row">'
      + '<div class="qt-slider-label-wrap"><span class="qt-slider-label">' + cfg.labels[k] + '</span>'
      + '<span class="qt-slider-hint">' + (cfg.hints[k] || '') + '</span></div>'
      + '<input type="range" class="qt-slider" id="qs-' + k + '" min="0" max="100" value="' + def + '" step="5" oninput="autoBalanceQT(\'' + k + '\')">'
      + '<span class="qt-pct-display" id="qp-' + k + '">' + def + '%</span>'
      + '</div>';
  });
  var total = cfg.keys.reduce(function(a, k) {
    return a + ((v[k] !== undefined ? v[k] : cfg.defaults[k]) || 0);
  }, 0);
  html += '<div class="qt-total-row"><span class="qt-total-lbl">Total</span>'
    + '<span class="qt-total-val ' + (total === 100 ? 'qt-ok' : 'qt-bad') + '" id="qt-total">' + total + '%</span>'
    + '</div></div>';
  document.getElementById('modal-qt-wrap').innerHTML = html;

  // Battery hint — RTC360 uses 2 simultaneously
  var hint = document.getElementById('m-batt-hint');
  if (hint) hint.style.display = modalScannerMode === 'RTC360' ? 'block' : 'none';
}

function onModalScannerChange() {
  renderModalQTSliders(document.getElementById('m-scanner').value);
}

function autoBalanceQT(changed) {
  var cfg  = MODAL_QT_CFG[modalScannerMode] || MODAL_QT_CFG.BLK360;
  var keys = cfg.keys;

  var val = parseInt(document.getElementById('qs-' + changed).value) || 0;
  val = Math.max(0, Math.min(100, Math.round(val / 5) * 5));
  document.getElementById('qs-' + changed).value = val;

  var others = keys.filter(function(k) { return k !== changed; });
  var remaining = 100 - val;
  var otherVals = {}, otherSum = 0;
  others.forEach(function(k) {
    otherVals[k] = parseInt(document.getElementById('qs-' + k).value) || 0;
    otherSum += otherVals[k];
  });

  if (remaining <= 0) {
    others.forEach(function(k) { document.getElementById('qs-' + k).value = 0; });
  } else if (otherSum === 0) {
    var per = Math.round((remaining / others.length) / 5) * 5;
    var left = remaining;
    others.forEach(function(k, i) {
      if (i === others.length - 1) {
        document.getElementById('qs-' + k).value = Math.max(0, left);
      } else {
        var vv = Math.min(per, left);
        document.getElementById('qs-' + k).value = vv;
        left -= vv;
      }
    });
  } else {
    var scaled = {}, sSum = 0;
    others.forEach(function(k, i) {
      if (i === others.length - 1) {
        scaled[k] = Math.max(0, remaining - sSum);
      } else {
        var vv = Math.round((otherVals[k] / otherSum * remaining) / 5) * 5;
        vv = Math.max(0, vv);
        scaled[k] = vv;
        sSum += vv;
      }
    });
    others.forEach(function(k) { document.getElementById('qs-' + k).value = scaled[k]; });
  }

  var total = 0;
  keys.forEach(function(k) {
    var vv = parseInt(document.getElementById('qs-' + k).value) || 0;
    document.getElementById('qp-' + k).textContent = vv + '%';
    total += vv;
  });
  var td = document.getElementById('qt-total');
  td.textContent = total + '%';
  td.className   = 'qt-total-val ' + (total === 100 ? 'qt-ok' : 'qt-bad');
}

// Build a key→value object from DB column values for the given scanner
function qtValsFromDB(scanner, l) {
  var cfg  = MODAL_QT_CFG[scanner] || MODAL_QT_CFG.BLK360;
  var dbV  = { quality_standard: l.quality_standard||0, quality_medium: l.quality_medium||0, quality_dense: l.quality_dense||0, quality_denseplus: l.quality_denseplus||0 };
  var vals = {};
  cfg.keys.forEach(function(k) { vals[k] = dbV[cfg.cols[k]] || 0; });
  return vals;
}

// ── Environment multi-select ──────────────────────────────────────────────────

function toggleModalEnv(btn) {
  var active = document.querySelectorAll('#m-env-grp .btn.active');
  if (btn.classList.contains('active') && active.length === 1) return;
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
  if (!document.querySelector('#m-env-grp .btn.active')) {
    document.querySelector('#m-env-grp .btn[data-env="Airport"]').classList.add('active');
  }
}

// ── Open / close ──────────────────────────────────────────────────────────────

function openNewModal() {
  AppState.editingLogId = null;
  document.getElementById('modal-title-text').textContent = 'New post-scan feedback log';
  document.getElementById('m-name').value                 = '';
  document.getElementById('m-submitter').value            = '';
  document.getElementById('m-scan-date').value            = new Date().toISOString().split('T')[0];
  document.getElementById('m-scanner').selectedIndex     = 0;
  renderModalQTSliders('BLK360');
  setModalEnvs('Airport');
  document.getElementById('m-comp').value                = '20ft';
  document.getElementById('m-arrival').value             = '12:00';
  document.getElementById('m-start').value               = '12:30';
  document.getElementById('m-end').value                 = '16:00';
  document.getElementById('m-scans').value               = 50;
  document.getElementById('m-batt').value                = 3;
  document.getElementById('m-data').value                = 14.5;
  document.getElementById('m-sqft').value                = '';
  document.getElementById('m-notes').value               = '';
  AppState.mDelay = 'None';
  document.getElementById('m-delay-grp').querySelectorAll('.dbtn').forEach((b, i) => b.classList.toggle('active', i === 0));
  document.getElementById('modal-submit-btn').textContent = 'Submit for review';
  document.getElementById('modal-submit-btn').disabled   = false;
  document.getElementById('modal-msg').className         = 'modal-msg';
  document.getElementById('modal-ov').classList.add('show');
}

function openEditModal(id) {
  var l = AppState.allLogs.find(p => p.id === id);
  if (!l) return;

  var sc = normScanner(l.scanner);
  AppState.editingLogId = id;
  document.getElementById('modal-title-text').textContent = 'Edit log';
  document.getElementById('m-name').value                 = l.project_name  || '';
  document.getElementById('m-submitter').value            = l.submitted_by   || '';
  document.getElementById('m-scan-date').value            = l.scan_date      || '';
  document.getElementById('m-scanner').value              = sc;
  renderModalQTSliders(sc, qtValsFromDB(sc, l));
  setModalEnvs(l.environment || 'Airport');
  document.getElementById('m-comp').value                 = normSpacing(l.complexity) || '12m';
  document.getElementById('m-arrival').value              = l.arrival_time   || '12:00';
  document.getElementById('m-start').value                = l.scan_start     || '12:30';
  document.getElementById('m-end').value                  = l.departure_time || '16:00';
  document.getElementById('m-scans').value                = l.total_scans    || 0;
  document.getElementById('m-batt').value                 = l.batteries_used || 0;
  document.getElementById('m-data').value                 = l.data_gb        || 0;
  document.getElementById('m-sqft').value                 = l.sq_ft ? parseInt(l.sq_ft).toLocaleString('en-US') : '';
  document.getElementById('m-notes').value                = l.notes          || '';
  AppState.mDelay = l.delay_level || 'None';
  document.getElementById('m-delay-grp').querySelectorAll('.dbtn').forEach(b =>
    b.classList.toggle('active', b.textContent === AppState.mDelay)
  );
  document.getElementById('modal-submit-btn').textContent = 'Save changes';
  document.getElementById('modal-submit-btn').disabled   = false;
  document.getElementById('modal-msg').className         = 'modal-msg';
  document.getElementById('modal-ov').classList.add('show');
}

function duplicateLog(id) {
  var l = AppState.allLogs.find(p => p.id === id);
  if (!l) return;

  var sc = normScanner(l.scanner);
  AppState.editingLogId = null;
  document.getElementById('modal-title-text').textContent = 'Duplicate log';
  document.getElementById('m-name').value                 = l.project_name  || '';
  document.getElementById('m-submitter').value            = '';
  document.getElementById('m-scan-date').value            = '';
  document.getElementById('m-scanner').value              = sc;
  renderModalQTSliders(sc, qtValsFromDB(sc, l));
  setModalEnvs(l.environment || 'Airport');
  document.getElementById('m-comp').value                 = normSpacing(l.complexity) || '12m';
  document.getElementById('m-arrival').value              = l.arrival_time   || '12:00';
  document.getElementById('m-start').value                = l.scan_start     || '12:30';
  document.getElementById('m-end').value                  = l.departure_time || '16:00';
  document.getElementById('m-scans').value                = l.total_scans    || 0;
  document.getElementById('m-batt').value                 = l.batteries_used || 0;
  document.getElementById('m-data').value                 = l.data_gb        || 0;
  document.getElementById('m-sqft').value                 = l.sq_ft ? parseInt(l.sq_ft).toLocaleString('en-US') : '';
  document.getElementById('m-notes').value                = l.notes          || '';
  AppState.mDelay = l.delay_level || 'None';
  document.getElementById('m-delay-grp').querySelectorAll('.dbtn').forEach(b =>
    b.classList.toggle('active', b.textContent === AppState.mDelay)
  );
  document.getElementById('modal-submit-btn').textContent = 'Submit for review';
  document.getElementById('modal-submit-btn').disabled   = false;
  document.getElementById('modal-msg').className         = 'modal-msg';
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

async function submitLog() {
  var name      = document.getElementById('m-name').value.trim();
  var submitter = document.getElementById('m-submitter').value.trim();
  if (!name)      { showMsg('err', 'Please enter a project name.'); return; }
  if (!submitter) { showMsg('err', 'Please enter your name in "Submitted by" — this field is required.'); return; }

  var cfg    = MODAL_QT_CFG[modalScannerMode] || MODAL_QT_CFG.BLK360;
  var qtTotal = 0;
  var qs = 0, qm = 0, qd = 0, qdp = 0;
  cfg.keys.forEach(function(k) {
    var vv  = parseInt(document.getElementById('qs-' + k).value) || 0;
    qtTotal += vv;
    var col  = cfg.cols[k];
    if (col === 'quality_standard')  qs  = vv;
    if (col === 'quality_medium')    qm  = vv;
    if (col === 'quality_dense')     qd  = vv;
    if (col === 'quality_denseplus') qdp = vv;
  });
  if (qtTotal !== 100) {
    showMsg('err', 'Quality tiers must total 100%. Current: ' + qtTotal + '%.');
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
    project_name:      name,
    submitted_by:      submitter,
    scan_date:         document.getElementById('m-scan-date').value || null,
    scanner:           document.getElementById('m-scanner').value,
    environment:       envValue,
    complexity:        document.getElementById('m-comp').value,
    arrival_time:      document.getElementById('m-arrival').value,
    scan_start:        document.getElementById('m-start').value,
    departure_time:    document.getElementById('m-end').value,
    total_scans:       parseInt(document.getElementById('m-scans').value) || 0,
    batteries_used:    parseInt(document.getElementById('m-batt').value)  || 0,
    data_gb:           parseFloat(document.getElementById('m-data').value) || 0,
    sq_ft:             sqftRaw ? parseInt(sqftRaw) : null,
    quality_standard:  qs,
    quality_medium:    qm,
    quality_dense:     qd,
    quality_denseplus: qdp,
    delay_level:       AppState.mDelay,
    notes:             document.getElementById('m-notes').value.trim()
  };

  var result;
  if (AppState.editingLogId) {
    result = await fetch(AT_URL + '/' + AppState.editingLogId, {
      method: 'PATCH', headers: atHeaders(),
      body: JSON.stringify({ fields: payload })
    });
  } else {
    payload.status = 'pending';
    result = await fetch(AT_URL, {
      method: 'POST', headers: atHeaders(),
      body: JSON.stringify({ fields: payload })
    });
  }

  if (!result.ok) {
    var errJson = await result.json().catch(function() { return {}; });
    console.error('Airtable error:', errJson);
    showMsg('err', 'Error: ' + ((errJson.error && errJson.error.message) || 'Request failed') + '.');
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
