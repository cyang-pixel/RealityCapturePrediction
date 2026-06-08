// UI controls — navigation, scanner selection, environment/condition toggles, option setters.

function showPage(id, btn) {
  document.querySelectorAll('.page').forEach(p    => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  if (btn) btn.classList.add('active');
  if (id === 'logs') loadLogs();
}

function selHW(el) {
  document.querySelectorAll('.scb').forEach(b => b.classList.remove('active'));
  el.classList.add('active');

  var s = SCANNERS[el.dataset.hw];
  document.getElementById('sc-name').textContent  = s.name;
  document.getElementById('sc-sub').textContent   = s.sub;
  document.getElementById('sc-specs').innerHTML   = s.specs
    .map(x => '<div class="spi"><div class="spd"></div>' + x + '</div>')
    .join('');
  document.getElementById('sc-img').src           = s.img;
  document.getElementById('mh-name').textContent  = s.name;
  document.getElementById('mh-status').innerHTML  = s.available
    ? '<div class="dot dg"></div><span class="sg">Available</span>'
    : '<div class="dot dof"></div><span class="sof">Coming soon</span>';

  var banner = document.getElementById('cs-banner');
  var pa     = document.getElementById('params-area');
  var gb     = document.getElementById('gen-btn');
  if (!s.available) {
    banner.classList.add('show');
    pa.style.opacity       = '.4';
    pa.style.pointerEvents = 'none';
    gb.disabled            = true;
  } else {
    banner.classList.remove('show');
    pa.style.opacity       = '1';
    pa.style.pointerEvents = '';
    gb.disabled            = false;
  }

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
}

function setOpt(key, val, btn) {
  if (key === 'complexity') AppState.complexity = val;
  btn.parentElement.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function setQuality(val, btn) {
  AppState.quality = val;
  document.getElementById('quality-grp').querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('quality-hint').innerHTML = QUALITY[val].hint;
}

function setFloors(mode, btn) {
  AppState.floorsMode = mode;
  document.getElementById('floors-grp').querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('flr-row').className = 'flrr' + (mode === 'multi' ? ' show' : '');
}
