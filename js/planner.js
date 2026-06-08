// Mission planner — all calculation logic for scan estimates.

function envMatch(envSet, envType) {
  if (envSet.size === 0) return true;
  var types = Array.isArray(envType) ? envType : [envType];
  return types.some(function(t) { return envSet.has(t); });
}

function lookAlikes(envSet, comp) {
  return AppState.DB.filter(p =>
    envMatch(envSet, p.env_type) &&
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
  var keys = envSet.size > 0 ? Array.from(envSet) : Object.keys(BASELINE);
  var t = 0, c = 0;
  keys.forEach(e => { t += (BASELINE[e] || BASELINE['Office'])[comp] || 500; c++; });
  return t / c;
}

var COMP_MULT = { Open: 1.0, Moderate: 1.35, Complex: 1.75 };
var COMP_FALLBACK = {
  Open:     ['Moderate', 'Complex'],
  Moderate: ['Open',     'Complex'],
  Complex:  ['Moderate', 'Open']
};

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

function getAvgTpS(envSet, comp, qual, matches) {
  var qm = matches.filter(p => p.quality_setting === qual);
  if (qm.length > 0) {
    return qm.reduce((a, p) => a + (p.actual_hours * 3600 / p.actual_scans), 0) / qm.length;
  }

  var targetComp = COMP_MULT[comp] || 1.0;
  var targetEnv  = getEnvMult(envSet);
  var adjComps   = COMP_FALLBACK[comp] || [];

  // 1. Same env(s), adjacent complexity
  for (var ci = 0; ci < adjComps.length; ci++) {
    var ac = adjComps[ci];
    var acm = AppState.DB.filter(function(p) {
      return envMatch(envSet, p.env_type) && p.complexity === ac && p.delay_profile !== 'Major' && p.quality_setting === qual;
    });
    if (acm.length > 0) {
      var tps1 = acm.reduce(function(a, p) { return a + (p.actual_hours * 3600 / p.actual_scans); }, 0) / acm.length;
      return tps1 * (targetComp / (COMP_MULT[ac] || 1.0));
    }
  }

  // Adjacent environments sorted by how close their multiplier is to the target
  var adjEnvs = Object.keys(ENV_TPS_MULT)
    .filter(function(e) { return !envSet.has(e); })
    .sort(function(a, b) {
      return Math.abs(ENV_TPS_MULT[a] - targetEnv) - Math.abs(ENV_TPS_MULT[b] - targetEnv);
    });

  // 2. Adjacent env, same complexity
  for (var ei = 0; ei < adjEnvs.length; ei++) {
    var ae = adjEnvs[ei];
    var aem = AppState.DB.filter(function(p) {
      var t = Array.isArray(p.env_type) ? p.env_type : [p.env_type];
      return t.indexOf(ae) !== -1 && p.complexity === comp && p.delay_profile !== 'Major' && p.quality_setting === qual;
    });
    if (aem.length > 0) {
      var tps2 = aem.reduce(function(a, p) { return a + (p.actual_hours * 3600 / p.actual_scans); }, 0) / aem.length;
      return tps2 * (targetEnv / (ENV_TPS_MULT[ae] || 1.0));
    }
  }

  // 3. Adjacent env + adjacent complexity
  for (var ei2 = 0; ei2 < adjEnvs.length; ei2++) {
    var ae2 = adjEnvs[ei2];
    for (var ci2 = 0; ci2 < adjComps.length; ci2++) {
      var ac2 = adjComps[ci2];
      var both = AppState.DB.filter(function(p) {
        var t = Array.isArray(p.env_type) ? p.env_type : [p.env_type];
        return t.indexOf(ae2) !== -1 && p.complexity === ac2 && p.delay_profile !== 'Major' && p.quality_setting === qual;
      });
      if (both.length > 0) {
        var tps3 = both.reduce(function(a, p) { return a + (p.actual_hours * 3600 / p.actual_scans); }, 0) / both.length;
        return tps3 * (targetComp / (COMP_MULT[ac2] || 1.0)) * (targetEnv / (ENV_TPS_MULT[ae2] || 1.0));
      }
    }
  }

  // 4. No data anywhere — pure spec-based fallback
  return QUALITY[qual].tps * targetComp * targetEnv;
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

  var chip = document.getElementById('conf-chip');
  if (chip) {
    chip.className = 'chip ' + conf.cls;
    document.getElementById('conf-dot').style.background = conf.dot;
    document.getElementById('conf-lbl').textContent      = conf.label;
  }

  document.getElementById('db-matches').textContent = matches.length;
  document.getElementById('db-src').textContent     = matches.length > 0 ? 'Historic look-alikes' : 'Global baseline';

  var fill = document.getElementById('dbc-fill');
  if (fill) {
    fill.style.width      = Math.min(100, (matches.length / 20) * 100) + '%';
    fill.style.background = conf.dot;
  }

  // Env button counts — all logs for that environment regardless of complexity
  document.querySelectorAll('#env-tags .btn[data-env]').forEach(function(btn) {
    var n = AppState.DB.filter(function(p) {
      var t = Array.isArray(p.env_type) ? p.env_type : [p.env_type];
      return t.indexOf(btn.dataset.env) !== -1 && p.delay_profile !== 'Major';
    }).length;
    var s = btn.querySelector('.btn-cnt');
    if (s) s.textContent = n > 0 ? ' (' + n + ')' : '';
  });

  // Complexity button counts — logs matching current env(s) + that complexity
  document.querySelectorAll('#complexity-grp .btn[data-comp]').forEach(function(btn) {
    var n = AppState.DB.filter(function(p) {
      return envMatch(AppState.selEnvs, p.env_type) && p.complexity === btn.dataset.comp && p.delay_profile !== 'Major';
    }).length;
    var s = btn.querySelector('.btn-cnt');
    if (s) s.textContent = n > 0 ? ' (' + n + ')' : '';
  });
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
