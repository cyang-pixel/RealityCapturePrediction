const SUPA_URL = 'https://tgepwqqbywccythbzxxe.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnZXB3cXFieXdjY3l0aGJ6eHhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTc4MzYsImV4cCI6MjA5NTk5MzgzNn0.nTEZShGy8chVz2XeNhHEVwbFqcXLHhHJ1Z4SSHsQQc4';

const SETUP_BUFFER = 30;
const TOTAL_BATT   = 6;

const QTC = {
  'Fast+ (50mm)': '#C0DD97',
  'Fast (25mm)':  '#5DCAA5',
  'Dense (12mm)': '#0F6E56',
  'Dense+ (6mm)': '#085041'
};

const QT_KEYS = ['s', 'm', 'd', 'dp'];

const SCANNERS = {
  BLK360: {
    name: 'Leica BLK360 G2',
    sub: 'Compact field scanner optimised for rapid deployment.',
    available: true,
    specs: [
      '1.87 lbs ultra-light unit',
      '360° × 270° field-of-view',
      'Fast+ 50mm · 7s',
      'Fast 25mm · 13s',
      'Dense 12mm · 30s',
      'Dense+ 6mm · 75s'
    ],
    img: 'https://turningpointsystemsgroup.com/wp-content/uploads/2022/08/BLK360-Front.png'
  },
  RTC360: {
    name: 'Leica RTC360',
    sub: 'High-speed terrestrial precision scanner. Coming soon.',
    available: false,
    specs: ['High precision terrestrial', 'Multi-project rotation', 'Enriched range registration'],
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
  'Fast+ (50mm)': { tps: 7,  battLifeHrs: 0.38, dataGbScan: 0.10, sfScanMult: 0.55, hint: '7 sec/scan · 50mm @ 10m' },
  'Fast (25mm)':  { tps: 13, battLifeHrs: 0.50, dataGbScan: 0.18, sfScanMult: 0.80, hint: '13 sec/scan · 25mm @ 10m' },
  'Dense (12mm)': { tps: 30, battLifeHrs: 0.70, dataGbScan: 0.29, sfScanMult: 1.00, hint: '30 sec/scan · 12mm @ 10m' },
  'Dense+ (6mm)': { tps: 75, battLifeHrs: 0.88, dataGbScan: 0.48, sfScanMult: 1.85, hint: '75 sec/scan · 6mm @ 10m' }
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
