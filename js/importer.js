// Scanner data importer — reads BLK360 session folders and extracts per-scan
// timestamps from each .blk file's modification time (mtime). Windows preserves
// mtime when copying from the scanner, so file.lastModified = when that scan
// was written on the device.

var ImportState = {
  dirHandle: null,
  extracted: null
};

// ── Open / close ──────────────────────────────────────────────────────────────

function openImportPanel() {
  ImportState.dirHandle = null;
  ImportState.extracted = null;
  _impStep1();
  document.getElementById('import-ov').classList.add('show');
}

function closeImportPanel() {
  document.getElementById('import-ov').classList.remove('show');
}

// ── Step 1 — instructions ─────────────────────────────────────────────────────

function _impStep1(errMsg) {
  document.getElementById('import-body').innerHTML =
    '<div class="imp-intro">' +
      '<div class="imp-icon-lg">&#x1F4C2;</div>' +
      '<div class="imp-intro-title">Select a scanner session folder</div>' +
      '<p class="imp-intro-desc">' +
        'Choose a BLK360 session folder such as ' +
        '<code>26-06-24_STG6_LVL1_K.1.1_PT2</code>. ' +
        'The tool reads each <code>.blk</code> file\'s modification time — Windows preserves ' +
        'this when copying from the scanner, so it reflects when each scan was captured.' +
      '</p>' +
      (errMsg ? '<div class="imp-err-msg">' + escHtml(errMsg) + '</div>' : '') +
      '<button class="imp-pick-btn" id="imp-pick-btn" onclick="pickScannerFolder()">Choose session folder</button>' +
      '<div class="imp-privacy">&#x1F512; Files are read locally — nothing is uploaded.</div>' +
    '</div>';
}

// ── Folder selection ──────────────────────────────────────────────────────────

async function pickScannerFolder() {
  if (!window.showDirectoryPicker) {
    _impStep1('Folder import requires Chrome or Edge. Please open the app in one of those browsers.');
    return;
  }
  var btn = document.getElementById('imp-pick-btn');
  if (btn) { btn.textContent = 'Reading…'; btn.disabled = true; }

  try {
    var dir = await window.showDirectoryPicker({ mode: 'read' });
    ImportState.dirHandle = dir;
    _impProcessing();
    var data = await _processFolder(dir);
    ImportState.extracted = data;
    _impPreview(data);
  } catch (err) {
    if (err.name === 'AbortError') {
      _impStep1();
    } else {
      _impStep1('Could not read folder: ' + err.message);
    }
  }
}

function _impProcessing() {
  document.getElementById('import-body').innerHTML =
    '<div class="imp-intro">' +
      '<div class="imp-icon-lg">&#x23F3;</div>' +
      '<div class="imp-intro-title">Extracting scan data…</div>' +
      '<p class="imp-intro-desc">Reading modification timestamps from each <code>.blk</code> file.</p>' +
    '</div>';
}

// ── Built-in file inspector (no HxD needed) ───────────────────────────────────

async function openFileInspector() {
  if (!window.showOpenFilePicker) {
    alert('File inspector requires Chrome or Edge.');
    return;
  }
  try {
    var [fh] = await window.showOpenFilePicker({
      types: [{ description: 'BLK scan file', accept: { '*/*': ['.blk', '.blkjob'] } }],
      multiple: false
    });
    var file = await fh.getFile();
    var size = file.size;

    document.getElementById('import-body').innerHTML =
      '<div class="imp-intro"><div class="imp-icon-lg">&#x23F3;</div>' +
      '<div class="imp-intro-title">Scanning file…</div></div>';

    // Read entire file (up to 4 MB) and XOR-decode
    var readSize = Math.min(size, 4 * 1024 * 1024);
    var buf      = await file.slice(0, readSize).arrayBuffer();
    var bytes    = _xorDecode(buf);
    var text     = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

    // --- Scan for ctime strings: "Wed Jun 10 13:24:02 2026" ---
    var MONTHS = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
    var ctimeRe = /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) {1,2}(\d{1,2}) (\d{2}:\d{2}:\d{2}) (20\d{2})/g;
    var ctimeHits = [], m;
    while ((m = ctimeRe.exec(text)) !== null) {
      ctimeHits.push({ offset: m.index, raw: m[0] });
    }

    // --- Scan for ISO 8601 strings ---
    var isoRe = /(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/g;
    var isoHits = [];
    while ((m = isoRe.exec(text)) !== null) {
      isoHits.push({ offset: m.index, raw: m[0] });
    }

    // --- Scan for binary 32-bit Unix timestamps (little-endian, after XOR) ---
    var view = new DataView(bytes.buffer);
    var binHits = [];
    var lo = Math.floor(new Date(2023,0,1)/1000);
    var hi = Math.floor(new Date(2028,0,1)/1000);
    for (var off = 0; off + 4 <= bytes.byteLength; off += 4) {
      var v = view.getUint32(off, true);
      if (v >= lo && v <= hi) {
        binHits.push({ offset: off, dt: new Date(v * 1000), raw: v });
      }
    }

    // --- Build hex dump of first 512 bytes ---
    var lines = [];
    var dump = bytes.slice(0, 512);
    for (var i = 0; i < dump.length; i += 16) {
      var chunk = dump.slice(i, i + 16);
      var hex   = Array.from(chunk).map(function(b) { return b.toString(16).padStart(2,'0'); });
      var ascii = Array.from(chunk).map(function(b) { return (b>=32&&b<127)?String.fromCharCode(b):'.'; });
      lines.push(i.toString(16).padStart(6,'0') + '  ' + hex.join(' ').padEnd(47) + '  ' + ascii.join(''));
    }

    // --- Render ---
    var ctimeBlock = ctimeHits.length
      ? ctimeHits.map(function(h) {
          return '<div style="font-family:monospace;font-size:11px;padding:3px 0;border-bottom:1px solid #eee">'
            + '<span style="color:#aaa;margin-right:8px">0x' + h.offset.toString(16).padStart(6,'0') + '</span>'
            + escHtml(h.raw) + '</div>';
        }).join('')
      : '<em style="color:#aaa;font-size:12px">None found in first 4 MB</em>';

    var isoBlock = isoHits.length
      ? isoHits.map(function(h) {
          return '<span style="font-family:monospace;font-size:11px;margin-right:12px">0x' + h.offset.toString(16).padStart(6,'0') + ': ' + escHtml(h.raw) + '</span>';
        }).join('')
      : '<em style="color:#aaa;font-size:12px">None</em>';

    var binBlock = binHits.length
      ? binHits.slice(0,20).map(function(h) {
          return '<div style="font-family:monospace;font-size:11px;padding:2px 0">'
            + '<span style="color:#aaa;margin-right:8px">0x' + h.offset.toString(16).padStart(6,'0') + '</span>'
            + h.dt.toLocaleString() + '</div>';
        }).join('')
      : '<em style="color:#aaa;font-size:12px">None</em>';

    document.getElementById('import-body').innerHTML =
      '<div class="imp-inspect">' +
        '<div class="imp-inspect-title">&#x1F50D; ' + escHtml(file.name) +
          ' <span class="imp-inspect-size">' + (size/1024).toFixed(1) + ' KB</span></div>' +

        '<div class="imp-inspect-sub" style="margin-top:12px;font-weight:700;color:#111">ctime strings (what Cyclone stores)</div>' +
        '<div style="background:#F8F8F6;border:1px solid #E8E6E3;border-radius:8px;padding:10px;margin:6px 0 12px">' + ctimeBlock + '</div>' +

        '<div class="imp-inspect-sub" style="font-weight:700;color:#111">ISO 8601 strings</div>' +
        '<div style="background:#F8F8F6;border:1px solid #E8E6E3;border-radius:8px;padding:10px;margin:6px 0 12px">' + isoBlock + '</div>' +

        '<div class="imp-inspect-sub" style="font-weight:700;color:#111">Binary 32-bit Unix timestamps (first 20)</div>' +
        '<div style="background:#F8F8F6;border:1px solid #E8E6E3;border-radius:8px;padding:10px;margin:6px 0 12px">' + binBlock + '</div>' +

        '<div class="imp-inspect-sub" style="font-weight:700;color:#111">Raw hex dump (first 512 bytes, XOR decoded)</div>' +
        '<pre class="imp-hex" style="max-height:200px;overflow:auto">' + escHtml(lines.join('\n')) + '</pre>' +

        '<div class="imp-inspect-note" style="margin-top:12px">Share a screenshot of the ctime and binary sections above — that identifies exactly where the per-scan timestamp lives.</div>' +
        '<div class="imp-actions" style="margin-top:14px">' +
          '<button class="imp-back-btn" onclick="openImportPanel()">&#x2190; Back to import</button>' +
          '<button class="imp-send-btn" onclick="openFileInspector()">Inspect another file</button>' +
        '</div>' +
      '</div>';
  } catch(err) {
    if (err.name !== 'AbortError') alert('Error: ' + err.message);
  }
}

// ── Timestamp offset finder ────────────────────────────────────────────────────
// Searches the full .blk file for any 4-byte value that falls on the known scan
// date (from the folder name). Tries Unix seconds, GPS seconds (since Jan 6 1980),
// and milliseconds — both raw and XOR-decoded bytes.
// Finding the same offset across multiple files confirms it's the timestamp field.

var GPS_EPOCH = 315964782; // Unix seconds between Jan 1 1970 and Jan 6 1980 (incl. 18 leap secs)

function openTimestampFinder() {
  if (!window.showOpenFilePicker) { alert('Requires Chrome or Edge.'); return; }

  var knownDate = (ImportState.extracted && ImportState.extracted.meta.date)
    ? ImportState.extracted.meta.date : null;

  document.getElementById('import-body').innerHTML =
    '<div class="imp-intro">' +
      '<div class="imp-icon-lg">&#x1F9EC;</div>' +
      '<div class="imp-intro-title">Timestamp offset finder</div>' +
      '<p class="imp-intro-desc">' +
        (knownDate
          ? 'Scanning for timestamps matching <strong>' + escHtml(knownDate) + '</strong> — derived from the folder name. '
          : 'Enter the scan date so we know what value to search for. ') +
        'Select 2–5 .blk files from the same session. The tool scans each file end-to-end for matching timestamp values and finds the consistent byte offset.' +
      '</p>' +
      (!knownDate ? '<input class="fi" id="ts-date" type="date" style="margin-bottom:14px" placeholder="Scan date">' : '') +
      '<button class="imp-pick-btn" id="ts-pick-btn" onclick="_runTsFinder(' + (knownDate ? JSON.stringify(knownDate) : 'document.getElementById(\'ts-date\').value') + ')">Choose .blk files</button>' +
      '<div style="text-align:center;margin-top:10px">' +
        '<a href="#" class="imp-inspect-link" onclick="openImportPanel();return false;">&#x2190; Back to import</a>' +
      '</div>' +
    '</div>';
}

async function _runTsFinder(knownDate) {
  if (!knownDate) { alert('Please enter the scan date first.'); return; }

  var btn = document.getElementById('ts-pick-btn');
  if (btn) { btn.textContent = 'Opening…'; btn.disabled = true; }

  try {
    var handles = await window.showOpenFilePicker({
      types: [{ description: 'BLK scan files', accept: { '*/*': ['.blk'] } }],
      multiple: true
    });
    if (handles.length < 2) { alert('Select at least 2 .blk files.'); openTimestampFinder(); return; }
    handles.sort(function(a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); });

    // Compute expected value ranges for the known date
    var dayStart = Math.floor(new Date(knownDate + 'T00:00:00Z') / 1000);
    var dayEnd   = dayStart + 86400;
    // Unix seconds range for that day
    var unix_lo = dayStart, unix_hi = dayEnd;
    // GPS seconds range (GPS = Unix - GPS_EPOCH)
    var gps_lo  = unix_lo - GPS_EPOCH, gps_hi = unix_hi - GPS_EPOCH;
    // Millisecond range
    var ms_lo   = unix_lo * 1000, ms_hi = unix_hi * 1000;

    function _classify(v) {
      if (v >= unix_lo && v <= unix_hi) return { type: 'Unix seconds', dt: new Date(v * 1000) };
      if (v >= gps_lo  && v <= gps_hi)  return { type: 'GPS seconds',  dt: new Date((v + GPS_EPOCH) * 1000) };
      if (v >= ms_lo   && v <= ms_hi)   return { type: 'Milliseconds', dt: new Date(v) };
      return null;
    }

    // Scan each file in 2 MB chunks — start (first 8 MB) + end (last 8 MB)
    var CHUNK = 2 * 1024 * 1024;
    var SCAN_HEAD = 8 * 1024 * 1024;
    var SCAN_TAIL = 8 * 1024 * 1024;

    document.getElementById('import-body').innerHTML =
      '<div class="imp-intro"><div class="imp-icon-lg">&#x23F3;</div>' +
      '<div class="imp-intro-title">Scanning ' + handles.length + ' files…</div>' +
      '<p class="imp-intro-desc" id="ts-prog">Starting…</p></div>';

    // hitMaps[i] = Map<offset, {val, type, dt}>
    var hitMaps = [];

    for (var fi = 0; fi < handles.length; fi++) {
      var prog = document.getElementById('ts-prog');
      if (prog) prog.textContent = 'Scanning ' + handles[fi].name + ' (' + (fi+1) + '/' + handles.length + ')…';

      var file   = await handles[fi].getFile();
      var size   = file.size;
      var hitMap = new Map();

      async function _scanRange(startByte, endByte) {
        for (var base = startByte; base < endByte; base += CHUNK) {
          var end = Math.min(base + CHUNK, endByte);
          var buf = await file.slice(base, end).arrayBuffer();
          var raw = new Uint8Array(buf);
          var view = new DataView(buf);

          for (var i = 0; i + 4 <= buf.byteLength; i += 4) {
            // Try raw bytes as uint32 LE
            var rv = view.getUint32(i, true);
            var rc = _classify(rv);
            if (rc) { hitMap.set(base + i, Object.assign({ raw: rv }, rc)); continue; }

            // Try XOR-decoded bytes as uint32 LE
            var xv = ((raw[i]^0xAA)) | ((raw[i+1]^0xAA)<<8) | ((raw[i+2]^0xAA)<<16) | (((raw[i+3]^0xAA))<<24);
            xv = xv >>> 0; // unsigned
            var xc = _classify(xv);
            if (xc) hitMap.set(base + i, Object.assign({ raw: xv, xorDecoded: true }, xc));
          }
        }
      }

      await _scanRange(0, Math.min(SCAN_HEAD, size));
      if (size > SCAN_HEAD + SCAN_TAIL) {
        await _scanRange(size - SCAN_TAIL, size);
      }

      hitMaps.push({ name: handles[fi].name, map: hitMap });
    }

    // Find offsets present in ALL files
    var firstMap = hitMaps[0].map;
    var candidates = [];

    firstMap.forEach(function(hit0, offset) {
      var row = [{ name: hitMaps[0].name, hit: hit0 }];
      for (var k = 1; k < hitMaps.length; k++) {
        var h = hitMaps[k].map.get(offset);
        if (!h) return;
        row.push({ name: hitMaps[k].name, hit: h });
      }
      // All files have a hit at this offset — check monotonically increasing
      var vals = row.map(function(r) { return r.hit.raw; });
      var mono = vals.every(function(v, i) { return i === 0 || v > vals[i-1]; });
      candidates.push({ offset: offset, rows: row, mono: mono, type: hit0.type });
    });

    // Sort: monotone first, then by offset
    candidates.sort(function(a, b) {
      if (a.mono !== b.mono) return a.mono ? -1 : 1;
      return a.offset - b.offset;
    });

    // Render
    var fNames = handles.map(function(h) { return h.name; }).join(', ');
    var resHtml;

    if (candidates.length === 0) {
      resHtml = '<div style="padding:16px;color:#A32D2D;background:#FFF5F5;border-radius:10px;font-size:13px">' +
        '<strong>No timestamp found</strong> in the first/last 8 MB of these files for date ' + escHtml(knownDate) + '.<br><br>' +
        'Possible reasons:<br>' +
        '• Timestamp is stored in a format we haven\'t tried (64-bit, float, big-endian)<br>' +
        '• It\'s in the middle of the file (between 8 MB and end−8 MB)<br>' +
        '• Try selecting different files or checking with Leica\'s BLK Data Manager.' +
        '</div>';
    } else {
      resHtml = '<div style="font-size:12px;color:#555;margin-bottom:12px">Found <strong>' + candidates.length + '</strong> matching offset' + (candidates.length !== 1 ? 's' : '') + ' across all files' + (candidates.length > 0 ? ' — monotonically increasing ones are most likely timestamps:' : '.') + '</div>';
      resHtml += candidates.slice(0, 8).map(function(c) {
        var mono = c.mono ? '<span style="color:#0F6E56;font-weight:700">&#x2191; increasing</span>' : '<span style="color:#aaa">not monotone</span>';
        var rows = c.rows.map(function(r) {
          return '<div style="font-size:11px;font-family:monospace;padding:2px 0">' +
            escHtml(r.name) + ': ' + r.hit.dt.toLocaleString() +
            (r.hit.xorDecoded ? ' <span style="color:#aaa">(XOR decoded)</span>' : '') +
            '</div>';
        }).join('');
        return '<div style="background:#F0FBF6;border:1px solid #C8EFE0;border-radius:10px;padding:12px;margin-bottom:8px">' +
          '<div style="font-weight:800;font-size:12px;margin-bottom:4px">' +
            'Offset 0x' + c.offset.toString(16).padStart(8,'0') + ' &nbsp;' + mono +
            ' &nbsp;<span style="color:#aaa;font-weight:400">' + c.type + '</span>' +
          '</div>' + rows + '</div>';
      }).join('');

      if (candidates.length > 0 && candidates[0].mono) {
        var best = candidates[0];
        resHtml += '<div style="background:#111;color:#fff;border-radius:10px;padding:14px;margin-top:4px;font-size:12px">' +
          '<strong style="color:#5DCAA5">Best candidate: offset 0x' + best.offset.toString(16).padStart(8,'0') + '</strong><br>' +
          'Share this offset — once confirmed we hardcode it and timestamps auto-extract from every future import.' +
          '</div>';
      }
    }

    document.getElementById('import-body').innerHTML =
      '<div class="imp-inspect">' +
        '<div class="imp-inspect-title">&#x1F9EC; Timestamp offset finder</div>' +
        '<div style="font-size:11px;color:#aaa;margin-bottom:14px">Date searched: ' + escHtml(knownDate) + ' &nbsp;|&nbsp; Files: ' + escHtml(fNames) + '</div>' +
        resHtml +
        '<div class="imp-actions" style="margin-top:16px">' +
          '<button class="imp-back-btn" onclick="openTimestampFinder()">&#x1F501; Try again</button>' +
          '<button class="imp-send-btn" onclick="openImportPanel()">Back to import</button>' +
        '</div>' +
      '</div>';

  } catch(err) {
    if (err.name !== 'AbortError') { alert('Error: ' + err.message); }
    openTimestampFinder();
  }
}

// ── Folder name parser ────────────────────────────────────────────────────────

function _parseFolderName(name) {
  var result = { date: null, location: null, level: null, zone: null, part: null, projectName: name };
  var parts  = name.split('_');
  if (!parts.length) return result;

  var dm = parts[0].match(/^(\d{2,4})-(\d{2})-(\d{2})$/);
  if (dm) {
    var yr = dm[1].length === 2 ? '20' + dm[1] : dm[1];
    result.date = yr + '-' + dm[2] + '-' + dm[3];
  }

  result.location = parts[1] || null;
  result.level    = parts[2] || null;
  result.zone     = parts[3] || null;
  result.part     = parts[4] || null;

  var label = [result.location, result.level, result.zone, result.part]
    .filter(Boolean).join(' — ');
  result.projectName = result.date ? result.date + ' · ' + label : (label || name);
  return result;
}

// ── .blkjob parser ────────────────────────────────────────────────────────────
// Returns density counts: { Standard, Medium, Dense, DensePlus, total }

async function _parseBlkJob(fh) {
  try {
    var file = await fh.getFile();
    var text = await file.text();
    var doc  = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) return null;

    var counts = { Standard: 0, Medium: 0, Dense: 0, DensePlus: 0 };
    doc.querySelectorAll('setup[scanDensity]').forEach(function(el) {
      var d = el.getAttribute('scanDensity');
      if      (d === 'Standard')   counts.Standard++;
      else if (d === 'Medium')     counts.Medium++;
      else if (d === 'Dense')      counts.Dense++;
      else if (d === 'DensePlus')  counts.DensePlus++;
    });
    counts.total = counts.Standard + counts.Medium + counts.Dense + counts.DensePlus;
    return counts.total > 0 ? counts : null;
  } catch(e) { return null; }
}

// ── XOR decode helper ─────────────────────────────────────────────────────────
// Leica .blk files are XOR-encoded with 0xAA throughout.
// Raw bytes must be decoded before any text or binary parsing.

function _xorDecode(buffer) {
  var src = new Uint8Array(buffer);
  var out = new Uint8Array(src.length);
  for (var i = 0; i < src.length; i++) out[i] = src[i] ^ 0xAA;
  return out;
}

// ── EXIF timestamp extraction ─────────────────────────────────────────────────
// The BLK360 embeds a panoramic JPEG in each .blk file (marked by "MPHOTO").
// That JPEG carries EXIF DateTimeOriginal — the scanner's real-time clock value.
// We XOR-decode the file header, find the JPEG SOI bytes (FF D8 FF), then parse
// the EXIF IFD to extract the per-scan acquisition time.

function _parseTiffDateTime(bytes, base) {
  if (base + 8 > bytes.length) return null;
  var le = (bytes[base] === 0x49 && bytes[base+1] === 0x49); // 'II' = little-endian

  function r16(o) { return le ? bytes[base+o]|(bytes[base+o+1]<<8) : (bytes[base+o]<<8)|bytes[base+o+1]; }
  function r32(o) {
    return le
      ? (bytes[base+o]|(bytes[base+o+1]<<8)|(bytes[base+o+2]<<16)|(bytes[base+o+3]<<24))>>>0
      : ((bytes[base+o]<<24)|(bytes[base+o+1]<<16)|(bytes[base+o+2]<<8)|bytes[base+o+3])>>>0;
  }
  function rStr(o, maxLen) {
    var s = '';
    for (var i = 0; i < maxLen && base+o+i < bytes.length; i++) {
      var c = bytes[base+o+i]; if (c === 0) break; s += String.fromCharCode(c);
    }
    return s;
  }

  if (r16(2) !== 42) return null; // not valid TIFF
  var ifd0 = r32(4);

  function scanIFD(ifdOff) {
    if (ifdOff + 2 > bytes.length - base) return null;
    var n = r16(ifdOff);
    for (var e = 0; e < n; e++) {
      var eo = ifdOff + 2 + e * 12;
      if (eo + 12 > bytes.length - base) break;
      var tag = r16(eo), type = r16(eo+2), cnt = r32(eo+4);
      // DateTimeOriginal (0x9003) or DateTime (0x0132) — ASCII type (2)
      if ((tag === 0x9003 || tag === 0x0132) && type === 2) {
        var voff = cnt <= 4 ? eo+8 : r32(eo+8);
        return rStr(voff, cnt);
      }
      // Follow ExifIFD sub-directory (0x8769)
      if (tag === 0x8769) { var sub = scanIFD(r32(eo+8)); if (sub) return sub; }
    }
    return null;
  }

  var s = scanIFD(ifd0);
  if (!s) return null;
  var m = s.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  var dt = new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +m[6]);
  return (!isNaN(dt) && dt.getFullYear() >= 2020 && dt.getFullYear() <= 2032) ? dt : null;
}

function _parseJpegExif(bytes, start) {
  var pos = start + 2, end = Math.min(start + 800*1024, bytes.length);
  while (pos < end - 4) {
    if (bytes[pos] !== 0xFF) { pos++; continue; }
    var marker = (bytes[pos]<<8)|bytes[pos+1]; pos += 2;
    if (marker === 0xFFD9 || marker === 0xFFDA) break; // EOI / SOS
    if (marker === 0xFFD8) continue;
    if (pos + 2 > end) break;
    var segLen = (bytes[pos]<<8)|bytes[pos+1];
    if (marker === 0xFFE1 && segLen > 10) { // APP1
      // "Exif\0\0" header at pos+2
      if (bytes[pos+2]===0x45&&bytes[pos+3]===0x78&&bytes[pos+4]===0x69&&
          bytes[pos+5]===0x66&&bytes[pos+6]===0x00&&bytes[pos+7]===0x00) {
        var dt = _parseTiffDateTime(bytes, pos+8);
        if (dt) return dt;
      }
    }
    pos += segLen;
  }
  return null;
}

// ── .blk file timestamp extractor ────────────────────────────────────────────

function _searchJpeg(bytes) {
  for (var i = 0; i < bytes.length - 3; i++) {
    if (bytes[i] === 0xFF && bytes[i+1] === 0xD8 && bytes[i+2] === 0xFF) {
      var dt = _parseJpegExif(bytes, i);
      if (dt) return dt;
    }
  }
  return null;
}

async function _blkTimestamp(fh) {
  try {
    var file = await fh.getFile();
    var size = file.size;

    // Strategy: search start, middle, and end of file.
    // Try both raw bytes AND XOR-decoded — Leica may store the JPEG unencoded.
    var regions = [
      [0,              Math.min(size, 10 * 1024 * 1024)],          // first 10 MB
      [Math.max(0, Math.floor(size/2) - 5*1024*1024),
       Math.min(size,  Math.floor(size/2) + 5*1024*1024)],         // middle 10 MB
      [Math.max(0, size - 10 * 1024 * 1024), size]                 // last 10 MB
    ];

    for (var r = 0; r < regions.length; r++) {
      var buf   = await file.slice(regions[r][0], regions[r][1]).arrayBuffer();
      var raw   = new Uint8Array(buf);
      var xored = _xorDecode(buf);

      // Try XOR-decoded first (most sections are XOR'd), then raw
      var dt = _searchJpeg(xored) || _searchJpeg(raw);
      if (dt) return { dt: dt, sessionLevel: false };
    }
  } catch(e) {}
  return null;
}

// ── Main folder processor ─────────────────────────────────────────────────────

async function _processFolder(dirHandle) {
  var meta     = _parseFolderName(dirHandle.name);
  var blkFiles = [];
  var blkjobFH = null;

  for await (var entry of dirHandle.values()) {
    if (entry.kind !== 'file') continue;
    var nl = entry.name.toLowerCase();
    if (nl.endsWith('.blk') && /setup\s*\d+/i.test(entry.name)) {
      blkFiles.push(entry);
    } else if (nl.endsWith('.blkjob')) {
      blkjobFH = entry;
    }
  }

  var densityCounts = blkjobFH ? await _parseBlkJob(blkjobFH) : null;

  blkFiles.sort(function(a, b) {
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });

  var scanCount  = blkFiles.length;
  var rawResults = [];

  for (var i = 0; i < blkFiles.length; i++) {
    var res = await _blkTimestamp(blkFiles[i]);
    if (res) rawResults.push({ file: blkFiles[i].name, dt: res.dt, sessionLevel: res.sessionLevel });
  }

  // Detect if every file returned the exact same timestamp (session-level constant, not per-scan)
  var allSame = rawResults.length > 1 && rawResults.every(function(r) {
    return r.dt.getTime() === rawResults[0].dt.getTime();
  });
  var allSessionLevel = rawResults.length > 0 && rawResults.every(function(r) { return r.sessionLevel; });

  var timestamps  = [];
  var tsStatus    = 'none'; // 'unique' | 'session-dupe' | 'none'

  if (allSame || allSessionLevel) {
    // Found the same constant in all files — this is a session-level value, not per-scan
    tsStatus = 'session-dupe';
  } else if (rawResults.length > 0) {
    timestamps = rawResults.filter(function(r) { return !r.sessionLevel; });
    if (!timestamps.length) timestamps = rawResults; // fallback
    timestamps.sort(function(a, b) { return a.dt - b.dt; });
    tsStatus = 'unique';
  }

  var scanStart    = timestamps.length     ? timestamps[0].dt                                : null;
  var scanEnd      = timestamps.length > 1 ? timestamps[timestamps.length - 1].dt            : null;
  var durationMins = (scanStart && scanEnd) ? Math.round((scanEnd - scanStart) / 60000)      : null;
  var avgTps       = (scanStart && scanEnd && scanCount > 1)
    ? Math.round((scanEnd - scanStart) / 1000 / (scanCount - 1)) : null;

  // Quality percentages from .blkjob scanDensity (use file count as denominator if blkjob total differs)
  var qTotal = densityCounts ? densityCounts.total : scanCount;
  var quality = densityCounts && qTotal > 0 ? {
    standard:  Math.round(densityCounts.Standard  / qTotal * 100),
    medium:    Math.round(densityCounts.Medium     / qTotal * 100),
    dense:     Math.round(densityCounts.Dense      / qTotal * 100),
    densePlus: Math.round(densityCounts.DensePlus  / qTotal * 100)
  } : null;

  return {
    folderName:   dirHandle.name,
    meta:         meta,
    scanner:      'BLK360',
    scanCount:    scanCount,
    tsFound:      timestamps.length,
    tsStatus:     tsStatus,
    scanStart:    scanStart,
    scanEnd:      scanEnd,
    durationMins: durationMins,
    avgTps:       avgTps,
    quality:      quality
  };
}

// ── Preview ───────────────────────────────────────────────────────────────────

function _fmt24(dt) {
  if (!dt) return '';
  return dt.getHours().toString().padStart(2, '0') + ':' + dt.getMinutes().toString().padStart(2, '0');
}

function _impPreview(d) {
  var bannerCls, bannerTxt;

  if (d.tsStatus === 'unique' && d.tsFound === d.scanCount && d.scanCount > 0) {
    bannerCls = 'imp-ts-ok';
    bannerTxt = '&#x2713; Per-scan timestamps extracted from all ' + d.scanCount + ' scans';
  } else if (d.tsStatus === 'unique' && d.tsFound > 0) {
    bannerCls = 'imp-ts-partial';
    bannerTxt = '&#x26A0; Timestamps extracted from ' + d.tsFound + ' of ' + d.scanCount + ' scans';
  } else if (d.tsStatus === 'session-dupe') {
    bannerCls = 'imp-ts-none';
    bannerTxt = '&#x26A0; Only a session-level timestamp found (same in all files). '
      + '<a href="#" class="imp-inspect-link" onclick="openFileInspector();return false;">Run File Inspector on one .blk file &#x2192;</a>';
  } else {
    bannerCls = 'imp-ts-none';
    bannerTxt = '&#x26A0; No timestamps found in .blk file headers — enter times manually below';
  }

  document.getElementById('import-body').innerHTML =
    '<div class="imp-preview">' +
      '<div class="imp-prev-hdr">' +
        '<div class="imp-prev-title">Session extracted</div>' +
        '<div class="imp-prev-folder">' + escHtml(d.folderName) + '</div>' +
      '</div>' +
      '<div class="imp-ts-banner ' + bannerCls + '">' + bannerTxt + '</div>' +
      '<div class="imp-fields">' +
        '<div class="imp-fg">' +
          '<label class="imp-lbl">Project name</label>' +
          '<input class="fi" id="imp-name" type="text" value="' + escHtml(d.meta.projectName) + '">' +
        '</div>' +
        '<div class="imp-frow">' +
          '<div class="imp-fg">' +
            '<label class="imp-lbl">Scanner</label>' +
            '<select class="fi" id="imp-scanner">' +
              '<option value="BLK360"' + (d.scanner === 'BLK360' ? ' selected' : '') + '>BLK360 G2</option>' +
              '<option value="RTC360"' + (d.scanner === 'RTC360' ? ' selected' : '') + '>RTC360</option>' +
              '<option value="VLX"'    + (d.scanner === 'VLX'    ? ' selected' : '') + '>NavVis VLX</option>' +
            '</select>' +
          '</div>' +
          '<div class="imp-fg">' +
            '<label class="imp-lbl">Scan date</label>' +
            '<input class="fi" id="imp-date" type="date" value="' + (d.meta.date || '') + '">' +
          '</div>' +
        '</div>' +
        '<div class="imp-frow3">' +
          '<div class="imp-fg">' +
            '<label class="imp-lbl">Scan start</label>' +
            '<input class="fi" id="imp-start" type="time" value="' + _fmt24(d.scanStart) + '">' +
          '</div>' +
          '<div class="imp-fg">' +
            '<label class="imp-lbl">Scan end</label>' +
            '<input class="fi" id="imp-end" type="time" value="' + _fmt24(d.scanEnd) + '">' +
          '</div>' +
          '<div class="imp-fg">' +
            '<label class="imp-lbl">Duration</label>' +
            '<input class="fi imp-disabled" id="imp-dur" type="text" value="' + (d.durationMins ? d.durationMins + ' mins' : '—') + '" disabled>' +
          '</div>' +
        '</div>' +
        '<div class="imp-frow">' +
          '<div class="imp-fg">' +
            '<label class="imp-lbl">Scan count</label>' +
            '<input class="fi" id="imp-scans" type="number" value="' + d.scanCount + '" min="0">' +
          '</div>' +
          '<div class="imp-fg">' +
            '<label class="imp-lbl">Avg time / scan</label>' +
            '<input class="fi imp-disabled" id="imp-tps" type="text" value="' + (d.avgTps ? d.avgTps + ' sec' : '—') + '" disabled>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="imp-actions">' +
        '<button class="imp-back-btn" onclick="_impStep1()">&#x2190; Different folder</button>' +
        '<button class="imp-send-btn" onclick="sendImportToLog()">Open in Post-Scan Log &#x2192;</button>' +
      '</div>' +
      '<div style="text-align:center;margin-top:10px;display:flex;gap:16px;justify-content:center;flex-wrap:wrap">' +
        '<a href="#" class="imp-inspect-link" onclick="openFileInspector();return false;">&#x1F50D; Inspect a .blk file</a>' +
        '<a href="#" class="imp-inspect-link" onclick="openTimestampFinder();return false;">&#x1F9EC; Find timestamp offset</a>' +
      '</div>' +
    '</div>';
}

// ── Send to log modal ─────────────────────────────────────────────────────────

function sendImportToLog() {
  var d = ImportState.extracted;
  if (!d) return;

  var name    = document.getElementById('imp-name').value.trim();
  var scanner = document.getElementById('imp-scanner').value;
  var date    = document.getElementById('imp-date').value;
  var start   = document.getElementById('imp-start').value;
  var end     = document.getElementById('imp-end').value;
  var scans   = parseInt(document.getElementById('imp-scans').value) || d.scanCount;

  closeImportPanel();
  openNewModal();

  if (name)  document.getElementById('m-name').value      = name;
  if (date)  document.getElementById('m-scan-date').value = date;
  if (start) document.getElementById('m-start').value     = start;
  if (end)   document.getElementById('m-end').value       = end;
  if (scans) document.getElementById('m-scans').value     = scans;

  document.getElementById('m-scanner').value = scanner;
  renderModalQTSliders(scanner);
  document.getElementById('modal-title-text').textContent = 'New post-scan feedback log — imported';

  // Auto-fill quality sliders from .blkjob scanDensity
  if (d.quality) {
    var qMap = {
      'quality_standard':  d.quality.standard,
      'quality_medium':    d.quality.medium,
      'quality_dense':     d.quality.dense,
      'quality_denseplus': d.quality.densePlus
    };
    Object.keys(qMap).forEach(function(id) {
      var el = document.getElementById('m-' + id.replace('quality_', 'qt-'));
      if (el) { el.value = qMap[id]; el.dispatchEvent(new Event('input')); }
    });
  }

  var note = 'Imported from: ' + d.folderName;
  if (d.avgTps) note += ' | Avg time/scan: ' + d.avgTps + 's';
  document.getElementById('m-notes').value = note;
}
