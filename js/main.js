// App initialization — runs once after all scripts are loaded.

// Populate finish-time dropdown (00:00 – 23:45 in 15-min steps).
(function buildFinishTimeDropdown() {
  var sel = document.getElementById('finish-time');
  for (var h = 0; h < 24; h++) {
    for (var mi of [0, 15, 30, 45]) {
      var o = document.createElement('option');
      o.value       = h * 60 + mi;
      o.textContent = h.toString().padStart(2, '0') + ':' + mi.toString().padStart(2, '0');
      if (h === 17 && mi === 0) o.selected = true;
      sel.appendChild(o);
    }
  }
})();

// Seed the planner confidence display from the database.
loadApprovedLogs();
