// Pure utility functions — no DOM side-effects, no AppState dependencies.

function fmtComma(el) {
  var r = el.value.replace(/[^0-9]/g, '');
  if (!r) { el.value = ''; return; }
  el.value = parseInt(r, 10).toLocaleString('en-US');
}

function getRaw(id) {
  return parseFloat((document.getElementById(id).value || '0').replace(/,/g, '')) || 0;
}

function timeToMins(t) {
  if (!t) return 0;
  var p = t.split(':').map(Number);
  return p[0] * 60 + (p[1] || 0);
}

function minsToStr(m) {
  var n = ((m % 1440) + 1440) % 1440;
  var h  = Math.floor(n / 60);
  var mn = Math.round(n % 60);
  return (h % 12 || 12) + ':' + mn.toString().padStart(2, '0') + ' ' + (h >= 12 ? 'PM' : 'AM');
}

function calcHours(arr, dep) {
  if (!arr || !dep) return 0;
  return ((timeToMins(dep) - timeToMins(arr) + 1440) % 1440) / 60;
}

// Returns the dominant quality tier name for a scan_log row, using the
// tier vocabulary and Airtable column mapping of the row's own scanner.
function getDomQ(r) {
  var cfg = SCANNER_QT[normScanner(r.scanner)] || SCANNER_QT.BLK360;
  return cfg.keys
    .map(function(k) { return [cfg.map[k], parseFloat(r[cfg.cols[k]]) || 0]; })
    .sort(function(a, b) { return b[1] - a[1]; })[0][0];
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmtDateTime(iso) {
  if (!iso) return { date: '', time: '' };
  var d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  };
}
