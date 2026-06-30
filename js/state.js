// Shared mutable application state — all modules read/write through this object.
const AppState = {
  DB:           [],
  allLogs:      [],
  logFilter:    'all',
  selLogId:     null,
  editingLogId: null,
  selEnvs:      new Set(['Airport']),
  selConds:     new Set(['none']),
  spacing:      '20ft',
  quality:      'Dense (12mm)',
  plannerQT:    { s: 0, m: 0, d: 100, dp: 0 },
  floorsMode:   'single',
  mDelay:       'None',
  calcMode:     'setups',
  selScanner:   'BLK360'
};
