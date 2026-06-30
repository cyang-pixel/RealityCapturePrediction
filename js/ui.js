// UI controls — navigation, scanner selection, environment/condition toggles, option setters.

function showPage(id, btn) {
  document.querySelectorAll('.page').forEach(p    => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  if (btn) btn.classList.add('active');
  if (id === 'logs') loadLogs();
}

function selHW(el) {
  var hw = el.dataset.hw;
  document.querySelectorAll('.scb').forEach(b => b.classList.remove('active'));
  el.classList.add('active');

  AppState.selScanner = hw;
  var s = SCANNERS[hw];
  document.getElementById('sc-name').textContent  = s.name;
  document.getElementById('sc-sub').textContent   = s.sub;
  document.getElementById('sc-img').src           = s.img;
  document.getElementById('mh-name').textContent  = s.name;
  document.getElementById('mh-status').innerHTML  = s.available
    ? '<div class="dot dg"></div><span class="sg">Available</span>'
    : '<div class="dot dof"></div><span class="sof">Coming soon</span>';

  var csBanner   = document.getElementById('cs-banner');
  var betaBanner = document.getElementById('beta-banner');
  var pa         = document.getElementById('params-area');
  var gb         = document.getElementById('gen-btn');

  if (!s.available) {
    csBanner.classList.add('show');
    betaBanner.classList.remove('show');
    pa.style.opacity       = '.4';
    pa.style.pointerEvents = 'none';
    if (gb) gb.disabled    = true;
  } else {
    csBanner.classList.remove('show');
    betaBanner.classList.toggle('show', !!s.beta);
    pa.style.opacity       = '1';
    pa.style.pointerEvents = '';
    if (gb) gb.disabled    = false;
    renderQTSliders(hw);
  }

  // Refresh DB total, match counts, and saved missions for the newly selected scanner
  var scannerLogs = AppState.DB.filter(function(p) { return p.scanner === hw; });
  document.getElementById('db-total').textContent = scannerLogs.length;
  updConf();
  renderSaved();

  // Always jump to planner when a scanner is clicked.
  showPage('planner', document.getElementById('nav-planner'));
}

function toggleEnv(btn) {
  var env = btn.dataset.env;
  if (AppState.selEnvs.has(env)) {
    AppState.selEnvs.delete(env);
    btn.classList.remove('active');
  } else {
    AppState.selEnvs.add(env);
    btn.classList.add('active');
  }
  var n = AppState.selEnvs.size;
  document.getElementById('env-note').textContent = n === 0
    ? 'General prediction — all environments blended'
    : n + ' type' + (n > 1 ? 's' : '') + ' selected' + (n > 1 ? ' — baselines blended' : '');
  updConf();
}

function toggleCond(btn) {
  var val = btn.dataset.val;
  if (val === 'none') {
    AppState.selConds.clear();
    AppState.selConds.add('none');
    document.querySelectorAll('#site-cond-grp .btn').forEach(b =>
      b.classList.toggle('active', b.dataset.val === 'none')
    );
    return;
  }
  AppState.selConds.delete('none');
  document.querySelector('#site-cond-grp .btn[data-val="none"]').classList.remove('active');
  if (AppState.selConds.has(val)) {
    AppState.selConds.delete(val);
    btn.classList.remove('active');
  } else {
    AppState.selConds.add(val);
    btn.classList.add('active');
  }
  if (AppState.selConds.size === 0) {
    AppState.selConds.add('none');
    document.querySelector('#site-cond-grp .btn[data-val="none"]').classList.add('active');
  }
}

function setCalcMode(mode, btn) {
  AppState.calcMode = mode;
  document.getElementById('calc-mode-grp').querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  var lbl = document.getElementById('calc-label');
  var inp = document.getElementById('calc-value');
  if (mode === 'area') { lbl.textContent = 'Total area (sq ft)'; inp.value = '10,000'; }
  else                 { lbl.textContent = 'Scan count';          inp.value = '50';     }
  document.getElementById('area-beta-warn').style.display = mode === 'area' ? 'block' : 'none';
}

function setOpt(key, val, btn) {
  if (key === 'spacing') AppState.spacing = val;
  btn.parentElement.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function setQuality(val, btn) {
  AppState.quality = val;
  document.getElementById('quality-grp').querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('quality-hint').innerHTML = QUALITY[val].hint;
}

function setAmPm(val, btn) {
  document.getElementById('ampm-am').classList.toggle('active', val === 'AM');
  document.getElementById('ampm-pm').classList.toggle('active', val === 'PM');
}

function setFloors(mode, btn) {
  AppState.floorsMode = mode;
  document.getElementById('floors-grp').querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('flr-row').className = 'flrr' + (mode === 'multi' ? ' show' : '');
}
