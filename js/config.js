const SUPA_URL = 'https://tgepwqqbywccythbzxxe.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnZXB3cXFieXdjY3l0aGJ6eHhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTc4MzYsImV4cCI6MjA5NTk5MzgzNn0.nTEZShGy8chVz2XeNhHEVwbFqcXLHhHJ1Z4SSHsQQc4';

const SETUP_BUFFER = 30;
const TOTAL_BATT   = 6;

const QTC = {
  'Fast+ (50mm)': '#C0DD97',
  'Fast (25mm)':  '#5DCAA5',
  'Dense (12mm)': '#0F6E56',
  'Dense+ (6mm)': '#085041',
  'RTC Low':      '#A8C8F0',
  'RTC Medium':   '#4A8FD4',
  'RTC High':     '#1A5FA8'
};

// Per-scanner quality tier configuration
const SCANNER_QT = {
  BLK360: {
    keys:      ['s', 'm', 'd', 'dp'],
    map:       { s: 'Fast+ (50mm)', m: 'Fast (25mm)', d: 'Dense (12mm)', dp: 'Dense+ (6mm)' },
    labels:    { s: 'Fast+ 50mm', m: 'Fast 25mm', d: 'Dense 12mm', dp: 'Dense+ 6mm' },
    hints:     { s: '· 7s', m: '· 13s', d: '· 30s', dp: '· 75s' },
    defaults:  { s: 0, m: 0, d: 100, dp: 0 },
    battTotal: 6
  },
  RTC360: {
    keys:      ['l', 'm', 'h'],
    map:       { l: 'RTC Low', m: 'RTC Medium', h: 'RTC High' },
    labels:    { l: 'Low · 12mm', m: 'Medium · 6mm', h: 'High · 3mm' },
    hints:     { l: '· 1:26', m: '· 1:51', h: '· 2:42' },
    defaults:  { l: 0, m: 100, h: 0 },
    battTotal: 4,
    battPerUnit: 2
  }
};

const QT_KEYS = ['s', 'm', 'd', 'dp']; // BLK360 default — use SCANNER_QT for dynamic access

const SCANNERS = {
  BLK360: {
    name: 'Leica BLK360 G2',
    sub: 'Compact 3D scanner with integrated spherical imaging and thermal panorama sensor.',
    available: true,
    specs: [
      '1.87 lbs / 0.85 kg ultra-light',
      '360° × 300° field of view',
      'Up to 60 m range',
      '360,000 pts/sec',
      '6mm accuracy @ 10m',
      'Fast+ 50mm · 7s',
      'Fast 25mm · 13s',
      'Dense 12mm · 30s',
      'Dense+ 6mm · 75s',
      'Integrated FLIR thermal camera'
    ],
    img: 'https://turningpointsystemsgroup.com/wp-content/uploads/2022/08/BLK360-Front.png'
  },
  RTC360: {
    name: 'Leica RTC360',
    sub: 'High-speed 3D scanner with integrated HDR imaging and VIS real-time registration.',
    available: true,
    beta: true,
    specs: [
      '5.35 kg / 11.7 lbs',
      '360° × 300° field of view',
      'Up to 130 m range',
      '2,000,000 pts/sec',
      'Low 12mm · 1:26/scan',
      'Medium 6mm · 1:51/scan',
      'High 3mm · 2:42/scan',
      '2 × GEB461 battery · ~4 hrs total'
    ],
    img: 'https://shop.leica-geosystems.com/sites/default/files/styles/product_large/public/2024-03/Leica%20RTC360%20-%20Hero%20with%20Shadow%20-%20300dpi.png.webp'
  },
  VLX: {
    name: 'NavVis VLX Wearable',
    sub: 'Wearable SLAM ecosystem. JFK Terminal 1 deployment.',
    available: false,
    specs: ['Wearable LiDAR frame', 'JFK Airport T1 active', 'Rapid walkthrough mapping'],
    img: 'https://3339696.fs1.hubspotusercontent-eu1.net/hub/3339696/hubfs/product-navvis-VLX-3-Front-800x800-2024.png?width=300&name=product-navvis-VLX-3-Front-800x800-2024.png'
  }
};

const QUALITY = {
  // BLK360
  'Fast+ (50mm)': { tps: 7,   battLifeHrs: 0.38, dataGbScan: 0.10, sfScanMult: 0.55, hint: '7 sec/scan · 50mm @ 10m' },
  'Fast (25mm)':  { tps: 13,  battLifeHrs: 0.50, dataGbScan: 0.18, sfScanMult: 0.80, hint: '13 sec/scan · 25mm @ 10m' },
  'Dense (12mm)': { tps: 30,  battLifeHrs: 0.70, dataGbScan: 0.29, sfScanMult: 1.00, hint: '30 sec/scan · 12mm @ 10m' },
  'Dense+ (6mm)': { tps: 75,  battLifeHrs: 0.88, dataGbScan: 0.48, sfScanMult: 1.85, hint: '75 sec/scan · 6mm @ 10m' },
  // RTC360 — tps = full position time (scan + tripod setup + levelling + movement overhead)
  // Anchored to field estimate: 65–80 scans / 8am–3pm = ~348s effective at Medium 6mm
  // Overhead per position ≈ 237s constant across tiers (heavy tripod scanner)
  'RTC Low':      { tps: 323, battLifeHrs: 2.00, dataGbScan: 0.40, sfScanMult: 0.75, hint: '1:26 scan · ~5:23 total' },
  'RTC Medium':   { tps: 348, battLifeHrs: 1.80, dataGbScan: 0.80, sfScanMult: 0.90, hint: '1:51 scan · ~5:48 total' },
  'RTC High':     { tps: 399, battLifeHrs: 1.50, dataGbScan: 1.50, sfScanMult: 1.00, hint: '2:42 scan · ~6:39 total' }
};

const BASELINE = {
  'Office':      { Open: 620,  Moderate: 430, Complex: 285 },
  'Airport':     { Open: 950,  Moderate: 680, Complex: 420 },
  'Warehouse':   { Open: 1100, Moderate: 800, Complex: 550 },
  'Retail':      { Open: 700,  Moderate: 500, Complex: 320 },
  'Hospital':    { Open: 500,  Moderate: 350, Complex: 230 },
  'Industrial':  { Open: 900,  Moderate: 640, Complex: 420 },
  'Residential': { Open: 480,  Moderate: 340, Complex: 210 },
  'Mixed Use':   { Open: 660,  Moderate: 470, Complex: 305 }
};
