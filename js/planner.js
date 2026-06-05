// Mission planner — all calculation logic for scan estimates.

function lookAlikes(envSet, comp) {
  return AppState.DB.filter(p =>
    envSet.has(p.env_type) &&
    p.complexity === comp &&
    p.delay_profile !== 'Major'
  );
}

function getBaseSF(envSet, comp, matches) {
  if (matches.length > 0) {
    var totalSF    = matches.reduce((a, p) => a + p.sq_ft, 0);
    var totalScans = matches.reduce((a, p) => a + p.actual_scans, 0);
    return totalSF / totalScans;
  }
  var t = 0, c = 0;
  envSet.forEach(e => { t += (BASELINE[e] || BASELINE['Office'])[comp] || 500; c++; });
  return t / c;
}

function getAvgTpS(envSet, comp, qual, matches) {
  var qm = matches.filter(p => p.quality_setting === qual);
  if (qm.length > 0) {
    return qm.reduce((a, p) => a + (p.actual_hours * 3600 / p.actual_scans), 0) / qm.length;
  }
  return QUALITY[qual].tps;
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
  var matches = lookAlikes(AppState.selEnvs, AppState.complexity);
  var conf    = getConf(matches.length);
  var chip    = document.getElementById('conf-chip');
  if (!chip) return;

  chip.className = 'chip ' + conf.cls;
  document.getElementById('conf-dot').style.background = conf.dot;
  document.getElementById('conf-lbl').textContent      = conf.label;
  document.getElementById('db-matches').textContent    = matches.length;
  document.getElementById('db-src').textContent        = matches.length > 0 ? 'Historic look-alikes' : 'Global baseline';
}

// Maps slider keys → quality tier names used in QUALITY config and DB matching.
var QT_QUAL_MAP = {
  s:  'Fast+ (50mm)',
  m:  'Fast (25mm)',
  d:  'Dense (12mm)',
  dp: 'Dense+ (6mm)'
};

// ── Planner quality-tier sliders ──────────────────────────────────────────────

function autoBalancePlannerQT(changed) {
  var val = parseInt(document.getElementById('pqs-' + changed).value) || 0;
  val = Math.max(0, Math.min(100, Math.round(val / 5) * 5));
  document.getElementById('pqs-' + changed).value = val;
  AppState.plannerQT[changed] = val;

  var others    = QT_KEYS.filter(k => k !== changed);
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

  var total = 0;
  QT_KEYS.forEach(k => {
    var v = parseInt(document.getElementById('pqs-' + k).value) || 0;
    document.getElementById('pqp-' + k).textContent = v + '%';
    AppState.plannerQT[k] = v;
    total += v;
  });
  var td = document.getElementById('pqt-total');
  td.textContent = total + '%';
  td.className   = 'qt-total-val ' + (total === 100 ? 'qt-ok' : 'qt-bad');
  updatePlannerQTBar();
}

function updatePlannerQTBar() {
  var barSegs = '', legend = '';
  QT_KEYS.forEach(k => {
    var pct = AppState.plannerQT[k] || 0;
    if (pct > 0) {
      var col = QTC[QT_QUAL_MAP[k]];
      barSegs += '<div class="qt-seg" style="width:' + pct + '%;background:' + col + '"></div>';
      legend  += '<div class="qt-li"><div class="qt-dot" style="background:' + col + '"></div>' + QT_QUAL_MAP[k] + ' ' + pct + '%</div>';
    }
  });
  document.getElementById('planner-qt-bar').innerHTML    = barSegs || '<div style="width:100%;background:#EEEEEE;height:10px;border-radius:5px"></div>';
  document.getElementById('planner-qt-legend').innerHTML = legend;
}

// ── Main calculation ──────────────────────────────────────────────────────────

function calculate() {
  var finishMins  = parseInt(document.getElementById('finish-time').value) || 1020;
  var floorCount  = AppState.floorsMode === 'multi'
    ? parseInt(document.getElementById('floor-count').value) || 2
    : 1;
  var fm      = getFriction();
  var matches = lookAlikes(AppState.selEnvs, AppState.complexity);

  // Weighted quality values across all active tiers
  var pqt = AppState.plannerQT;
  var weightedSfMult = 0, weightedTps = 0, weightedData = 0, weightedBatt = 0;
  QT_KEYS.forEach(k => {
    var pct = (pqt[k] || 0) / 100;
    if (pct > 0) {
      var qual = QT_QUAL_MAP[k];
      weightedSfMult += pct * QUALITY[qual].sfScanMult;
      weightedTps    += pct * getAvgTpS(AppState.selEnvs, AppState.complexity, qual, matches);
      weightedData   += pct * getAvgData(matches, qual);
      weightedBatt   += pct * getBattLife(matches, qual);
    }
  });
  // Fallback if all sliders are at 0
  if (weightedBatt === 0) { weightedSfMult = 1.0; weightedTps = 30; weightedData = 0.29; weightedBatt = 0.70; }

  var Ps;
  if (AppState.calcMode === 'area') {
    Ps = Math.ceil((getRaw('calc-value') / getBaseSF(AppState.selEnvs, AppState.complexity, matches)) * weightedSfMult);
  } else {
    Ps = Math.max(1, Math.round(getRaw('calc-value')));
  }
  Ps = Math.max(1, Ps);

  var Vf     = AppState.floorsMode === 'single' ? 1.0 : 1.0 + (0.07 * (floorCount - 1));
  var D_adj  = (Ps * weightedTps / 60) * Vf * fm;
  var D_min  = D_adj * 0.875;
  var D_max  = D_adj * 1.125;

  var battMin   = Math.ceil((D_adj / 60) / weightedBatt);
  var battRec   = battMin + 1;
  var totalData = Ps * weightedData;

  document.getElementById('arr-time').textContent = minsToStr(finishMins - D_max);

  var qualDesc = QT_KEYS
    .filter(k => pqt[k] > 0)
    .map(k => QT_QUAL_MAP[k] + ' ' + pqt[k] + '%')
    .join(' · ');
  document.getElementById('arr-note').textContent = Ps + ' setups · ' + qualDesc;

  function setResult(id, val, cls) {
    var el = document.getElementById(id);
    el.textContent = val;
    el.className   = 'rv' + (cls ? ' ' + cls : '');
  }

  setResult('res-setups', Ps + ' positions');
  setResult('res-dur',    Math.round(D_min) + ' – ' + Math.round(D_max) + ' mins');
  setResult('res-hours',  (D_min / 60).toFixed(1) + ' – ' + (D_max / 60).toFixed(1) + ' hrs');
  setResult('res-bmin',   battMin + ' packs',            battMin > TOTAL_BATT ? 'danger' : '');
  setResult('res-brec',   battRec + ' packs (+1 buffer)', battRec > TOTAL_BATT ? 'warn'   : '');
  setResult('res-data',   (totalData * 0.875).toFixed(1) + ' – ' + (totalData * 1.125).toFixed(1) + ' GB');

  var ab = document.getElementById('alert-box');
  if (battRec > TOTAL_BATT) {
    ab.className   = 'ab adanger show';
    ab.textContent = 'Battery shortage — ' + battRec + ' packs recommended, kit holds ' + TOTAL_BATT + '.';
  } else if (battRec === TOTAL_BATT) {
    ab.className   = 'ab awarn show';
    ab.textContent = 'Full kit in use. Plan a mid-scan charge window.';
  } else {
    ab.className = 'ab';
  }

  updConf();
}
