// Shared mutable application state — all modules read/write through this object.
const AppState = {
  DB:           [],
  allLogs:      [],
  logFilter:    'all',
  selLogId:     null,
  editingLogId: null,
  selEnvs:      new Set(['Office']),
  selConds:     new Set(['none']),
  complexity:   'Open',
  quality:      'Dense (12mm)',
  floorsMode:   'single',
  mDelay:       'None',
  calcMode:     'area'
};
