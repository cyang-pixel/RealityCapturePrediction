// App initialization — runs once after all scripts are loaded.

// Populate hour dropdown: 12, 1, 2 … 11
(function buildFinishHour() {
  var sel = document.getElementById('finish-hr');
  var hours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  hours.forEach(function(h) {
    var o = document.createElement('option');
    o.value = h;
    o.textContent = h;
    if (h === 5) o.selected = true;  // default 5 PM
    sel.appendChild(o);
  });
})();

// Seed the planner confidence display from the database.
loadApprovedLogs();
renderSaved();
