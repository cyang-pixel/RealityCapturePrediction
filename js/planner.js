// Mission planner — all calculation logic for scan estimates.

function envMatch(envSet, envType) {
  if (envSet.size === 0) return true;
  var types = Array.isArray(envType) ? envType : [envType];
  return types.some(function(t) { return envSet.has(t); });
}

function lookAlikes(envSet, spacing) {
  return AppState.DB.filter(p =>
    p.scanner === AppState.selScanner &&
    envMatch(envSet, p.env_type) &&
    p.spacing === spacing &&
    p.delay_profile !== 'Major'
  );
}

function getBaseSF(envSet, spacing, matches) {
  if (matches.length > 0) {
    var totalSF    = matches.reduce((a, p) => a + p.sq_ft, 0);
    var totalScans = matches.reduce((a, p) => a + p.actual_scans, 0);
    return totalSF / totalScans;
  }
  var keys = envSet.size > 0 ? Array.from(envSet) : Object.keys(BASELINE);
  var t = 0, c = 0;
  keys.forEach(e => { t += (BASELINE[e] || BASELINE['Office'])[spacing] || 500; c++; });
  return t / c;
}

// Time-per-scan multipliers relative to Airport (open, fast movement = 1.0).
// Reflects setup/movement overhead per environment type, not scan acquisition time.
// Office/Hospital/Residential are highest — many rooms mean more door-threshold
// positions and more stop-start movement. Bypassed automatically once real data
// for that environment exists in the DB.
var ENV_TPS_MULT = {
  'Airport':     1.00,
  'Warehouse':   1.10,
  'Industrial':  1.15,
  'Retail':      1.20,
  'Mixed Use':   1.25,
  'Office':      1.40,
  'Hospital':    1.45,
  'Residential': 1.55
};

function getEnvMult(envSet) {
  var keys = envSet.size > 0 ? Array.from(envSet) : Object.keys(ENV_TPS_MULT);
  var total = 0;
  keys.forEach(function(e) { total += (ENV_TPS_MULT[e] || 1.0); });
  return keys.length > 0 ? total / keys.length : 1.0;
}

// Minimum look-alike records before trusting historic TPS over spec
var TPS_MIN_LOGS = 1;

function getAvgTpS(envSet, spacing, qual, matches) {
  var baseline = QUALITY[qual] ? QUALITY[qual].tps : 60;

  // Primary: env-matching logs with valid actual_hours + actual_scans
  var qm = matches.filter(function(p) {
    return p.quality_setting === qual && p.actual_hours > 0 && p.actual_scans > 0;
  });
  if (qm.length >= TPS_MIN_LOGS) {
    var logged = qm.reduce(function(a, p) { return a + (p.actual_hours * 3600 / p.actual_scans); }, 0) / qm.length;
    // Sanity check: if logged TPS is more than 3× baseline the log data is likely corrupted
    // (e.g. arrival_time used instead of scan_start). Fall through to baseline in that case.
    if (logged > 0 && logged <= baseline * 3) return logged;
  }

  var targetEnv = getEnvMult(envSet);

  // Adjacent environments sorted by TPS multiplier proximity — scale by env only
  var adjEnvs = Object.keys(ENV_TPS_MULT)
    .filter(function(e) { return !envSet.has(e); })
    .sort(function(a, b) {
      return Math.abs(ENV_TPS_MULT[a] - targetEnv) - Math.abs(ENV_TPS_MULT[b] - targetEnv);
    });

  for (var ei = 0; ei < adjEnvs.length; ei++) {
    var ae = adjEnvs[ei];
    var aem = AppState.DB.filter(function(p) {
      var t = Array.isArray(p.env_type) ? p.env_type : [p.env_type];
      return t.indexOf(ae) !== -1 && p.delay_profile !== 'Major' && p.quality_setting === qual &&
             p.actual_hours > 0 && p.actual_scans > 0;
    });
    if (aem.length > 0) {
      var tps = aem.reduce(function(a, p) { return a + (p.actual_hours * 3600 / p.actual_scans); }, 0) / aem.length;
      if (tps > 0 && tps <= baseline * 3) return tps * (targetEnv / (ENV_TPS_MULT[ae] || 1.0));
    }
  }

  // Spec fallback: quality tier scan time × environment movement overhead
  return QUALITY[qual].tps * targetEnv;
}

function getAvgData(matches, qual) {
  var qm = matches.filter(p => p.quality_setting === qual);
  if (qm.length > 0) {
    return qm.reduce((a, p) => a + (p.actual_data_gb / p.actual_scans), 0) / qm.length;
  }
  return QUALITY[qual].dataGbScan;
}

function getBattLife(matches, qual) {
  var qm = matches.filter(p => p.quality_setting === qual && p.batteries > 0);
  if (qm.length > 0) {
    return qm.reduce((a, p) => a + (p.actual_hours / p.batteries), 0) / qm.length;
  }
  return QUALITY[qual].battLifeHrs;
}

function getFriction() {
  if (AppState.selConds.has('none')) return 1.0;
  var x = 0;
  document.querySelectorAll('#site-cond-grp .btn.active').forEach(b => {
    if (b.dataset.val !== 'none') x += parseFloat(b.dataset.mult || 0);
  });
  return 1.0 + x;
}

function getConf(n) {
  if (n >= 20) return { label: 'High confidence', cls: 'ch', dot: '#0F6E56' };
  if (n >= 5)  return { label: 'Med confidence',  cls: 'cm', dot: '#BA7517' };
  return            { label: 'Low confidence',  cls: 'cl', dot: '#ccc'    };
}

function updConf() {
  var matches = lookAlikes(AppState.selEnvs, AppState.spacing);
  var conf    = getConf(matches.length);

  document.getElementById('db-matches').textContent = matches.length;
  document.getElementById('db-src').textContent     = matches.length > 0 ? 'Historic look-alikes' : 'Global baseline';

  var fill = document.getElementById('dbc-fill');
  if (fill) {
    fill.style.width      = Math.min(100, (matches.length / 20) * 100) + '%';
    fill.style.background = conf.dot;
  }

  // Env button counts — logs for this scanner + that environment
  document.querySelectorAll('#env-tags .btn[data-env]').forEach(function(btn) {
    var n = AppState.DB.filter(function(p) {
      var t = Array.isArray(p.env_type) ? p.env_type : [p.env_type];
      return p.scanner === AppState.selScanner && t.indexOf(btn.dataset.env) !== -1 && p.delay_profile !== 'Major';
    }).length;
    var s = btn.querySelector('.btn-cnt');
    if (s) s.textContent = n > 0 ? ' (' + n + ')' : '';
  });

  // Spacing button counts — logs for this scanner + current env(s) + that spacing
  document.querySelectorAll('#complexity-grp .btn[data-comp]').forEach(function(btn) {
    var n = AppState.DB.filter(function(p) {
      return p.scanner === AppState.selScanner && envMatch(AppState.selEnvs, p.env_type) && p.spacing === btn.dataset.comp && p.delay_profile !== 'Major';
    }).length;
    var s = btn.querySelector('.btn-cnt');
    if (s) s.textContent = n > 0 ? ' (' + n + ')' : '';
  });
}

// ── Quality tier helpers ──────────────────────────────────────────────────────

function getQTCfg() { return SCANNER_QT[AppState.selScanner] || SCANNER_QT.BLK360; }

function renderQTSliders(hw) {
  var cfg  = SCANNER_QT[hw] || SCANNER_QT.BLK360;
  var html = '<div class="qt-slider-section">';
  cfg.keys.forEach(function(k) {
    var def = cfg.defaults[k] || 0;
    html += '<div class="qt-slider-row">'
      + '<div class="qt-slider-label-wrap"><span class="qt-slider-label">' + cfg.labels[k] + '</span>'
      + '<span class="qt-slider-hint">' + cfg.hints[k] + '</span></div>'
      + '<input type="range" class="qt-slider" id="pqs-' + k + '" min="0" max="100" value="' + def + '" step="5" oninput="autoBalancePlannerQT(\'' + k + '\')">'
      + '<input type="number" class="qt-pct-input" id="pqp-' + k + '" value="' + def + '" min="0" max="100" step="5" oninput="syncSliderFromInput(\'' + k + '\',this)">'
      + '<span class="qt-pct-unit">%</span>'
      + '</div>';
  });
  html += '</div>';
  document.getElementById('qt-sliders-wrap').innerHTML = html;

  var newQT = {};
  cfg.keys.forEach(function(k) { newQT[k] = cfg.defaults[k] || 0; });
  AppState.plannerQT = newQT;
  updatePlannerQTBar();
}

// ── Planner quality-tier sliders ──────────────────────────────────────────────

function autoBalancePlannerQT(changed) {
  var cfg = getQTCfg();
  var val = parseInt(document.getElementById('pqs-' + changed).value) || 0;
  val = Math.max(0, Math.min(100, Math.round(val / 5) * 5));
  document.getElementById('pqs-' + changed).value = val;
  AppState.plannerQT[changed] = val;

  var others    = cfg.keys.filter(function(k) { return k !== changed; });
  var remaining = 100 - val;
  var otherVals = {}, otherSum = 0;
  others.forEach(k => {
    otherVals[k] = parseInt(document.getElementById('pqs-' + k).value) || 0;
    otherSum += otherVals[k];
  });

  if (remaining <= 0) {
    others.forEach(k => { document.getElementById('pqs-' + k).value = 0; AppState.plannerQT[k] = 0; });
  } else if (otherSum === 0) {
    var per  = Math.round((remaining / others.length) / 5) * 5;
    var left = remaining;
    others.forEach((k, i) => {
      var v = i === others.length - 1 ? Math.max(0, left) : Math.min(per, left);
      document.getElementById('pqs-' + k).value = v;
      AppState.plannerQT[k] = v;
      if (i < others.length - 1) left -= v;
    });
  } else {
    var scaled = {}, sSum = 0;
    others.forEach((k, i) => {
      if (i === others.length - 1) {
        scaled[k] = Math.max(0, remaining - sSum);
      } else {
        var v = Math.round((otherVals[k] / otherSum * remaining) / 5) * 5;
        v = Math.max(0, v); scaled[k] = v; sSum += v;
      }
    });
    others.forEach(k => { document.getElementById('pqs-' + k).value = scaled[k]; AppState.plannerQT[k] = scaled[k]; });
  }

  var cfg2  = getQTCfg();
  var total = 0;
  cfg2.keys.forEach(function(k) {
    var v = parseInt(document.getElementById('pqs-' + k).value) || 0;
    document.getElementById('pqp-' + k).value = v;
    AppState.plannerQT[k] = v;
    total += v;
  });
  var td = document.getElementById('pqt-total');
  td.textContent = total + '%';
  td.className   = 'qt-total-val ' + (total === 100 ? 'qt-ok' : 'qt-bad');
  updatePlannerQTBar();
}

function updatePlannerQTBar() {
  var cfg     = getQTCfg();
  var barSegs = '', legend = '';
  cfg.keys.forEach(function(k) {
    var pct = AppState.plannerQT[k] || 0;
    if (pct > 0) {
      var col = QTC[cfg.map[k]];
      barSegs += '<div class="qt-seg" style="width:' + pct + '%;background:' + col + '"></div>';
      legend  += '<div class="qt-li"><div class="qt-dot" style="background:' + col + '"></div>' + cfg.labels[k] + ' ' + pct + '%</div>';
    }
  });
  document.getElementById('planner-qt-bar').innerHTML    = barSegs || '<div style="width:100%;background:#EEEEEE;height:10px;border-radius:5px"></div>';
  document.getElementById('planner-qt-legend').innerHTML = legend;
}

// ── Main calculation ──────────────────────────────────────────────────────────

function getFinishMins() {
  var hr  = parseInt(document.getElementById('finish-hr').value)  || 5;
  var min = parseInt(document.getElementById('finish-min').value) || 0;
  var pm  = document.getElementById('ampm-pm').classList.contains('active');
  return (hr % 12 + (pm ? 12 : 0)) * 60 + min;
}

function calculate() {
  var finishMins  = getFinishMins();
  var floorCount  = AppState.floorsMode === 'multi'
    ? parseInt(document.getElementById('floor-count').value) || 2
    : 1;
  var fm      = getFriction();
  var matches = lookAlikes(AppState.selEnvs, AppState.spacing);

  // TPS/data/batt use all env-matching logs regardless of spacing — spacing
  // only drives scan count (area mode), not how long each scan takes.
  // Require actual_hours > 0 and actual_scans > 0 to exclude logs with missing scan_start.
  var tpsMatches = AppState.DB.filter(function(p) {
    return p.scanner === AppState.selScanner &&
      envMatch(AppState.selEnvs, p.env_type) &&
      p.delay_profile !== 'Major' &&
      p.actual_hours > 0 &&
      p.actual_scans > 0;
  });

  // Weighted quality values across all active tiers
  var qtCfg = getQTCfg();
  var pqt   = AppState.plannerQT;
  var weightedSfMult = 0, weightedTps = 0, weightedData = 0, weightedBatt = 0;
  qtCfg.keys.forEach(function(k) {
    var pct = (pqt[k] || 0) / 100;
    if (pct > 0) {
      var qual = qtCfg.map[k];
      weightedSfMult += pct * QUALITY[qual].sfScanMult;
      weightedTps    += pct * getAvgTpS(AppState.selEnvs, AppState.spacing, qual, tpsMatches);
      weightedData   += pct * getAvgData(tpsMatches, qual);
      weightedBatt   += pct * getBattLife(tpsMatches, qual);
    }
  });
  // Fallback if all sliders are at 0
  if (weightedBatt === 0) { weightedSfMult = 1.0; weightedTps = 30; weightedData = 0.29; weightedBatt = 0.70; }

  var Ps;
  if (AppState.calcMode === 'area') {
    Ps = Math.ceil((getRaw('calc-value') / getBaseSF(AppState.selEnvs, AppState.spacing, matches)) * weightedSfMult);
  } else {
    Ps = Math.max(1, Math.round(getRaw('calc-value')));
  }
  Ps = Math.max(1, Ps);

  var Vf          = AppState.floorsMode === 'single' ? 1.0 : 1.0 + (0.07 * (floorCount - 1));
  var battTotal   = qtCfg.battTotal   || TOTAL_BATT;
  var battPerUnit = qtCfg.battPerUnit || 1;

  // Duration = pure scan time only. No overhead baked in.
  var D_adj       = (Ps * weightedTps / 60) * Vf * fm;
  var D_min       = D_adj * 0.875;
  var D_max       = D_adj * 1.125;

  var battMin     = Math.ceil((D_adj / 60) / weightedBatt) * battPerUnit;
  var battRec     = battMin + battPerUnit;

  // Battery swap advisory — shown separately, not added to duration
  var battCycles  = Math.ceil((D_adj / 60) / weightedBatt);
  var swapCount   = Math.max(0, battCycles - 1);
  var swapMins    = swapCount * 8;
  var totalData   = Ps * weightedData;

  document.getElementById('arr-time').textContent = minsToStr(finishMins - D_max);

  var qualDesc = qtCfg.keys
    .filter(function(k) { return pqt[k] > 0; })
    .map(function(k) { return qtCfg.labels[k] + ' ' + pqt[k] + '%'; })
    .join(' · ');
  document.getElementById('arr-note').textContent = Ps + ' setups · ' + qualDesc;

  function setResult(id, val, cls) {
    var el = document.getElementById(id);
    el.textContent = val;
    el.className   = 'rv' + (cls ? ' ' + cls : '');
  }

  var kitLabel = battPerUnit > 1
    ? battTotal + ' batteries (' + battPerUnit + ' active)'
    : battTotal + ' batteries';

  setResult('res-setups', Ps + ' positions');
  setResult('res-dur',    Math.round(D_min) + ' – ' + Math.round(D_max) + ' mins');
  setResult('res-hours',  (D_min / 60).toFixed(1) + ' – ' + (D_max / 60).toFixed(1) + ' hrs');
  setResult('res-bmin',   battMin + ' batteries',              battMin > battTotal ? 'danger' : '');
  setResult('res-brec',   battRec + ' batteries (+1 buffer)',  battRec > battTotal ? 'warn'   : '');
  setResult('res-bkit',   kitLabel);
  setResult('res-data',   (totalData * 0.875).toFixed(1) + ' – ' + (totalData * 1.125).toFixed(1) + ' GB');

  // Battery swap advisory — not included in duration, shown separately
  var swapEl = document.getElementById('swap-advisory');
  if (swapEl) {
    if (swapCount > 0) {
      swapEl.style.display = 'flex';
      document.getElementById('swap-text').textContent =
        swapCount + ' swap' + (swapCount > 1 ? 's' : '') + ' needed — add ~' + swapMins + ' min if protocol requires it';
    } else {
      swapEl.style.display = 'none';
    }
  }

  var ab = document.getElementById('alert-box');
  if (battRec > battTotal) {
    ab.className   = 'ab adanger show';
    ab.textContent = 'Battery shortage — ' + battRec + ' batteries recommended, kit holds ' + battTotal + '.';
  } else if (battRec === battTotal) {
    ab.className   = 'ab awarn show';
    ab.textContent = 'Full kit in use. Plan a mid-scan charge window.';
  } else {
    ab.className = 'ab';
  }

  updConf();
}

// ── Keyboard input sync for planner quality sliders ───────────────────────────

function syncSliderFromInput(key, input) {
  var val = parseInt(input.value) || 0;
  val = Math.max(0, Math.min(100, Math.round(val / 5) * 5));
  input.value = val;
  document.getElementById('pqs-' + key).value = val;
  autoBalancePlannerQT(key);
}

// ── Save mission output ───────────────────────────────────────────────────────

function showSaveForm() {
  document.getElementById('save-idle').style.display = 'none';
  document.getElementById('save-form').style.display = 'block';
  document.getElementById('save-name').focus();
}

function hideSaveForm() {
  document.getElementById('save-form').style.display = 'none';
  document.getElementById('save-idle').style.display = 'block';
  document.getElementById('save-name').value = '';
}

function saveMission() {
  var name = document.getElementById('save-name').value.trim();
  if (!name) { document.getElementById('save-name').focus(); return; }

  var missions = JSON.parse(localStorage.getItem('rc_missions') || '[]');
  missions.unshift({
    id:       Date.now(),
    name:     name,
    setups:   document.getElementById('res-setups').textContent,
    duration: document.getElementById('res-dur').textContent,
    hours:    document.getElementById('res-hours').textContent,
    batt:     document.getElementById('res-brec').textContent,
    data:     document.getElementById('res-data').textContent,
    start:    document.getElementById('arr-time').textContent,
    ts:       new Date().toLocaleDateString(),
    params: {
      scanner:    AppState.selScanner,
      calcMode:   AppState.calcMode,
      calcValue:  document.getElementById('calc-value').value,
      envs:       Array.from(AppState.selEnvs),
      spacing: AppState.spacing,
      qt:         { s: AppState.plannerQT.s, m: AppState.plannerQT.m, d: AppState.plannerQT.d, dp: AppState.plannerQT.dp },
      floorsMode: AppState.floorsMode,
      floorCount: document.getElementById('floor-count').value,
      conds:      Array.from(AppState.selConds),
      finishHr:   document.getElementById('finish-hr').value,
      finishMin:  document.getElementById('finish-min').value,
      finishAmPm: document.getElementById('ampm-pm').classList.contains('active') ? 'PM' : 'AM'
    }
  });
  localStorage.setItem('rc_missions', JSON.stringify(missions));
  hideSaveForm();
  renderSaved();
}

function loadMission(id) {
  var missions = JSON.parse(localStorage.getItem('rc_missions') || '[]');
  var m = missions.find(function(x) { return x.id === id; });
  if (!m || !m.params) return;
  var p = m.params;

  // Calc mode
  document.querySelectorAll('#calc-mode-grp .btn[data-mode]').forEach(function(b) {
    if (b.dataset.mode === p.calcMode) setCalcMode(p.calcMode, b);
  });
  document.getElementById('calc-value').value = p.calcValue;

  // Environments
  AppState.selEnvs = new Set(p.envs);
  document.querySelectorAll('#env-tags .btn[data-env]').forEach(function(b) {
    b.classList.toggle('active', AppState.selEnvs.has(b.dataset.env));
  });
  var n = AppState.selEnvs.size;
  document.getElementById('env-note').textContent = n === 0
    ? 'General prediction — all environments blended'
    : n + ' type' + (n > 1 ? 's' : '') + ' selected' + (n > 1 ? ' — baselines blended' : '');

  // Spacing (backward-compat: old saves stored complexity key with Open/Moderate/Complex values)
  AppState.spacing = normSpacing(p.spacing || p.complexity || '40ft');
  document.querySelectorAll('#complexity-grp .btn[data-comp]').forEach(function(b) {
    b.classList.toggle('active', b.dataset.comp === AppState.spacing);
  });

  // Quality tiers — re-render sliders for the saved scanner first
  var savedScanner = p.scanner || 'BLK360';
  AppState.selScanner = savedScanner;
  renderQTSliders(savedScanner);
  var qtCfgL = getQTCfg();
  if (p.qt) {
    qtCfgL.keys.forEach(function(k) {
      var v = p.qt[k] || 0;
      var rs = document.getElementById('pqs-' + k);
      var rp = document.getElementById('pqp-' + k);
      if (rs) rs.value = v;
      if (rp) rp.value = v;
      AppState.plannerQT[k] = v;
    });
  }
  updatePlannerQTBar();
  var qtTotal = qtCfgL.keys.reduce(function(a, k) { return a + (AppState.plannerQT[k] || 0); }, 0);
  var td = document.getElementById('pqt-total');
  td.textContent = qtTotal + '%';
  td.className   = 'qt-total-val ' + (qtTotal === 100 ? 'qt-ok' : 'qt-bad');

  // Floors
  AppState.floorsMode = p.floorsMode || 'single';
  document.querySelectorAll('#floors-grp .btn').forEach(function(b) {
    b.classList.toggle('active', b.textContent.toLowerCase().includes(AppState.floorsMode === 'multi' ? 'multi' : 'single'));
  });
  document.getElementById('flr-row').className = 'flrr' + (AppState.floorsMode === 'multi' ? ' show' : '');
  if (p.floorCount) document.getElementById('floor-count').value = p.floorCount;

  // Site conditions
  AppState.selConds = new Set(p.conds || ['none']);
  document.querySelectorAll('#site-cond-grp .btn').forEach(function(b) {
    b.classList.toggle('active', AppState.selConds.has(b.dataset.val));
  });

  // Finish time
  if (p.finishHr)  document.getElementById('finish-hr').value  = p.finishHr;
  if (p.finishMin !== undefined) document.getElementById('finish-min').value = p.finishMin;
  if (p.finishAmPm) {
    document.getElementById('ampm-am').classList.toggle('active', p.finishAmPm === 'AM');
    document.getElementById('ampm-pm').classList.toggle('active', p.finishAmPm === 'PM');
  }

  updConf();
  calculate();
  document.querySelector('.lp').scrollTop = 0;
}

function deleteSaved(id) {
  var missions = JSON.parse(localStorage.getItem('rc_missions') || '[]');
  missions = missions.filter(function(m) { return m.id !== id; });
  localStorage.setItem('rc_missions', JSON.stringify(missions));
  renderSaved();
}

function renderSaved() {
  var all      = JSON.parse(localStorage.getItem('rc_missions') || '[]');
  var missions = all.filter(function(m) {
    var sc = m.params && m.params.scanner ? m.params.scanner : 'BLK360';
    return sc === AppState.selScanner;
  });
  var el = document.getElementById('saved-list');
  if (!el) return;
  if (missions.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = missions.map(function(m) {
    return '<div class="saved-card" onclick="loadMission(' + m.id + ')">'
      + '<button class="saved-card-del" onclick="event.stopPropagation();deleteSaved(' + m.id + ')">&#x2715;</button>'
      + '<div class="saved-card-name">' + m.name + '</div>'
      + '<div class="saved-card-meta">' + m.start + ' start &middot; ' + m.setups + ' &middot; ' + m.duration + ' &middot; ' + m.ts + '</div>'
      + '</div>';
  }).join('');
}
