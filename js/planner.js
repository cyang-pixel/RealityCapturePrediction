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

function calculate() {
  var qp          = QUALITY[AppState.quality];
  var finishMins  = parseInt(document.getElementById('finish-time').value) || 1020;
  var floorCount  = AppState.floorsMode === 'multi'
    ? parseInt(document.getElementById('floor-count').value) || 2
    : 1;
  var fm      = getFriction();
  var matches = lookAlikes(AppState.selEnvs, AppState.complexity);

  var Ps;
  if (AppState.calcMode === 'area') {
    Ps = Math.ceil((getRaw('calc-value') / getBaseSF(AppState.selEnvs, AppState.complexity, matches)) * qp.sfScanMult);
  } else {
    Ps = Math.max(1, Math.round(getRaw('calc-value')));
  }
  Ps = Math.max(1, Ps);

  var tps    = getAvgTpS(AppState.selEnvs, AppState.complexity, AppState.quality, matches);
  var Vf     = AppState.floorsMode === 'single' ? 1.0 : 1.0 + (0.07 * (floorCount - 1));
  var D_adj  = (Ps * tps / 60) * Vf * fm;
  var D_min  = D_adj * 0.875;
  var D_max  = D_adj * 1.125;

  var battLife = getBattLife(matches, AppState.quality);
  var battMin  = Math.ceil((D_adj / 60) / battLife);
  var battRec  = battMin + 1;
  var totalData = Ps * getAvgData(matches, AppState.quality);

  document.getElementById('arr-time').textContent = minsToStr(finishMins - (D_max + SETUP_BUFFER));
  document.getElementById('arr-note').textContent = Ps + ' setups · ' + AppState.quality + ' · +30min buffer';

  function setResult(id, val, cls) {
    var el = document.getElementById(id);
    el.textContent = val;
    el.className   = 'rv' + (cls ? ' ' + cls : '');
  }

  setResult('res-setups', Ps + ' positions');
  setResult('res-dur',    Math.round(D_min) + ' – ' + Math.round(D_max) + ' mins');
  setResult('res-hours',  (D_min / 60).toFixed(1) + ' – ' + (D_max / 60).toFixed(1) + ' hrs');
  setResult('res-bmin',   battMin + ' packs',           battMin > TOTAL_BATT ? 'danger' : '');
  setResult('res-brec',   battRec + ' packs (+1 buffer)', battRec > TOTAL_BATT ? 'warn' : '');
  setResult('res-data',   (totalData * 0.875).toFixed(1) + ' – ' + (totalData * 1.125).toFixed(1) + ' GB');

  var ab = document.getElementById('alert-box');
  if (battRec > TOTAL_BATT) {
    ab.className  = 'ab adanger show';
    ab.textContent = 'Battery shortage — ' + battRec + ' packs recommended, kit holds ' + TOTAL_BATT + '.';
  } else if (battRec === TOTAL_BATT) {
    ab.className  = 'ab awarn show';
    ab.textContent = 'Full kit in use. Plan a mid-scan charge window.';
  } else {
    ab.className = 'ab';
  }

  updConf();
}
