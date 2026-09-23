#!/usr/bin/env node
// Extracts the screenshot diffs of a Playwright HTML report into a working
// directory so Claude can look at them. Zero dependencies (Node >= 18).
//
// Usage: node extract-report.mjs <report> [--out <dir>]
//   <report>  playwright-report/ folder, its index.html, or a .zip of it
//
// Writes <out>/manifest.json plus, per diff, <out>/<id>/{expected,actual,diff}.png
// and cropped close-ups of the changed regions. Prints a short JSON summary.
// Diff ids are computed exactly like Diffscope (src/lib/report-parser.ts) so the
// suggestions file written from this manifest maps back onto the right cards.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

// --- ZIP ---------------------------------------------------------------------

function zipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('Invalid ZIP: no end of central directory');

  const entries = new Map();
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  let offset = cdOffset;
  while (offset < cdOffset + cdSize && buf.readUInt32LE(offset) === 0x02014b50) {
    const method = buf.readUInt16LE(offset + 10);
    const compSize = buf.readUInt32LE(offset + 20);
    const fnLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOff = buf.readUInt32LE(offset + 42);
    // Some Windows zip tools write backslash separators; normalize them.
    const name = buf.subarray(offset + 46, offset + 46 + fnLen).toString('utf8').replace(/\\/g, '/');
    entries.set(name, { method, compSize, localOff });
    offset += 46 + fnLen + extraLen + commentLen;
  }

  return {
    names: [...entries.keys()],
    has: (name) => entries.has(name),
    read(name) {
      const e = entries.get(name);
      if (!e) throw new Error(`File not found in ZIP: ${name}`);
      const dataOff = e.localOff + 30 + buf.readUInt16LE(e.localOff + 26) + buf.readUInt16LE(e.localOff + 28);
      const data = buf.subarray(dataOff, dataOff + e.compSize);
      if (e.method === 0) return data;
      if (e.method === 8) return zlib.inflateRawSync(data);
      throw new Error(`Unsupported ZIP compression: ${e.method}`);
    },
  };
}

// --- PNG ---------------------------------------------------------------------

function decodePng(bytes) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!sig.every((b, i) => bytes[i] === b)) return null;

  let offset = 8, width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (offset < bytes.length - 12) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    if (type === 'IHDR') {
      width = bytes.readUInt32BE(offset + 8);
      height = bytes.readUInt32BE(offset + 12);
      bitDepth = bytes[offset + 16];
      colorType = bytes[offset + 17];
    } else if (type === 'IDAT') {
      idat.push(bytes.subarray(offset + 8, offset + 8 + length));
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) return null;

  const ch = colorType === 6 ? 4 : 3;
  const stride = width * ch;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const rgba = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);

  for (let y = 0; y < height; y++) {
    const base = y * (stride + 1);
    const filter = raw[base];
    const rec = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const x = raw[base + 1 + i];
      const a = i >= ch ? rec[i - ch] : 0;
      const b = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      switch (filter) {
        case 1: rec[i] = (x + a) & 0xff; break;
        case 2: rec[i] = (x + b) & 0xff; break;
        case 3: rec[i] = (x + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          rec[i] = (x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
          break;
        }
        default: rec[i] = x;
      }
    }
    for (let px = 0; px < width; px++) {
      const o = (y * width + px) * 4;
      rgba[o] = rec[px * ch];
      rgba[o + 1] = rec[px * ch + 1];
      rgba[o + 2] = rec[px * ch + 2];
      rgba[o + 3] = ch === 4 ? rec[px * ch + 3] : 255;
    }
    prev = rec;
  }
  return { width, height, rgba };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng({ width, height, rgba }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function crop(img, { x, y, width, height }) {
  const x0 = Math.min(x, img.width), y0 = Math.min(y, img.height);
  const w = Math.min(width, img.width - x0), h = Math.min(height, img.height - y0);
  if (w <= 0 || h <= 0) return null;
  const rgba = Buffer.alloc(w * h * 4);
  for (let row = 0; row < h; row++) {
    const src = ((y0 + row) * img.width + x0) * 4;
    img.rgba.copy(rgba, row * w * 4, src, src + w * 4);
  }
  return { width: w, height: h, rgba };
}

// Same "changed pixel" rule as Diffscope's countDiffPixels (src/lib/png.ts):
// Playwright paints changes in saturated colors over a greyscale background.
function isChanged(rgba, o) {
  const r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
  return Math.max(Math.abs(r - g), Math.abs(r - b), Math.abs(g - b)) > 30;
}

// Groups changed pixels into horizontal bands (rows closer than ROW_GAP merge),
// so a change in the header and one in the footer give two close-ups instead of
// one crop covering the whole page.
const ROW_GAP = 120;
const MARGIN = 48;
const MAX_REGIONS = 4;

function findRegions(diff) {
  const { width, height, rgba } = diff;
  let changedPixels = 0;
  const bands = [];
  let current = null;

  for (let y = 0; y < height; y++) {
    let minX = -1, maxX = -1;
    for (let x = 0; x < width; x++) {
      if (isChanged(rgba, (y * width + x) * 4)) {
        changedPixels++;
        if (minX === -1) minX = x;
        maxX = x;
      }
    }
    if (minX === -1) continue;
    if (current && y - current.maxY <= ROW_GAP) {
      current.maxY = y;
      current.minX = Math.min(current.minX, minX);
      current.maxX = Math.max(current.maxX, maxX);
    } else {
      current = { minY: y, maxY: y, minX, maxX };
      bands.push(current);
    }
  }

  // Too many separate bands: merge the closest neighbours until we're under the cap.
  while (bands.length > MAX_REGIONS) {
    let best = 0;
    for (let i = 1; i < bands.length - 1; i++) {
      if (bands[i + 1].minY - bands[i].maxY < bands[best + 1].minY - bands[best].maxY) best = i;
    }
    const [a, b] = bands.splice(best, 2);
    bands.splice(best, 0, {
      minY: a.minY, maxY: b.maxY, minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX),
    });
  }

  const regions = bands.map(b => {
    const x = Math.max(0, b.minX - MARGIN);
    const y = Math.max(0, b.minY - MARGIN);
    return {
      x, y,
      width: Math.min(width, b.maxX + 1 + MARGIN) - x,
      height: Math.min(height, b.maxY + 1 + MARGIN) - y,
    };
  });
  return { changedPixels, regions };
}

// --- Playwright report ---------------------------------------------------------

// Must stay identical to hashCode() in src/lib/report-parser.ts.
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).slice(0, 8).padStart(8, '0');
}

function extractEmbeddedZip(html) {
  const match = html.match(
    /<(?:script|template)[^>]*playwrightReportBase64[^>]*>(?:data:application\/zip;base64,)([A-Za-z0-9+/=\s]+)<\/(?:script|template)>/
  );
  if (!match) throw new Error('Could not find Playwright report data in index.html');
  return Buffer.from(match[1].replace(/\s/g, ''), 'base64');
}

// Returns { html, readAttachment(path) } whatever the report shape.
function openReport(input) {
  const stat = fs.statSync(input);

  if (stat.isDirectory() || input.endsWith('.html')) {
    const dir = stat.isDirectory() ? input : path.dirname(input);
    const indexPath = stat.isDirectory() ? path.join(dir, 'index.html') : input;
    if (!fs.existsSync(indexPath)) throw new Error(`index.html not found in ${dir}`);
    const inner = zipEntries(extractEmbeddedZip(fs.readFileSync(indexPath, 'utf8')));
    return {
      inner,
      readAttachment(p) {
        const onDisk = path.join(dir, p);
        if (fs.existsSync(onDisk)) return fs.readFileSync(onDisk);
        return inner.has(p) ? inner.read(p) : null;
      },
    };
  }

  if (input.endsWith('.zip')) {
    const outer = zipEntries(fs.readFileSync(input));
    const indexEntry = outer.names.find(n => n === 'index.html' || n.endsWith('/index.html'));
    if (!indexEntry) throw new Error('index.html not found in ZIP archive');
    const prefix = indexEntry.slice(0, -'index.html'.length);
    const inner = zipEntries(extractEmbeddedZip(outer.read(indexEntry).toString('utf8')));
    return {
      inner,
      readAttachment(p) {
        if (outer.has(prefix + p)) return outer.read(prefix + p);
        return inner.has(p) ? inner.read(p) : null;
      },
    };
  }

  throw new Error('Expected a playwright-report folder, an index.html or a .zip');
}

// --- Main ----------------------------------------------------------------------

function parseArgs(argv) {
  const args = { input: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') args.out = argv[++i];
    else if (!args.input) args.input = argv[i];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error('Usage: node extract-report.mjs <playwright-report dir | index.html | report.zip> [--out <dir>]');
    process.exit(1);
  }

  const input = path.resolve(args.input);
  const out = path.resolve(args.out || path.join(os.tmpdir(), `diffscope-review-${hashCode(input)}`));
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  const report = openReport(input);
  const reportJson = JSON.parse(report.inner.read('report.json').toString('utf8'));
  const byId = new Map();

  for (const file of reportJson.files || []) {
    const specFile = file.fileName || '';
    const suite = specFile.replace(/\.spec\.\w+$/, '') || 'unknown';

    for (const test of file.tests || []) {
      for (const result of test.results || []) {
        const attachments = result.attachments || [];
        const diffAtt = attachments.find(a => a.name.endsWith('-diff.png'));
        if (!diffAtt) continue;
        const actualAtt = attachments.find(a => a.name.endsWith('-actual.png'));
        const expectedAtt = attachments.find(a => a.name.endsWith('-expected.png'));

        const snapshot = diffAtt.name.replace(/-diff\.png$/, '');
        const viewport = test.projectName === 'phone' ? 'phone' : 'desktop';
        const id = hashCode(`pw-report/${snapshot}/${viewport}`);
        const dir = path.join(out, id);
        fs.mkdirSync(dir, { recursive: true });

        const images = {};
        const decoded = {};
        for (const [kind, att] of [['expected', expectedAtt], ['actual', actualAtt], ['diff', diffAtt]]) {
          const bytes = att?.path ? report.readAttachment(att.path) : null;
          if (!bytes) continue;
          images[kind] = path.join(dir, `${kind}.png`);
          fs.writeFileSync(images[kind], bytes);
          decoded[kind] = decodePng(Buffer.from(bytes));
        }

        let changedPixels = null;
        let regions = [];
        if (decoded.diff) {
          ({ changedPixels, regions } = findRegions(decoded.diff));
          regions = regions.map((region, i) => {
            const closeUps = {};
            for (const kind of ['expected', 'actual', 'diff']) {
              const cropped = decoded[kind] && crop(decoded[kind], region);
              if (!cropped) continue;
              closeUps[kind] = path.join(dir, `region-${i + 1}-${kind}.png`);
              fs.writeFileSync(closeUps[kind], encodePng(cropped));
            }
            return { ...region, images: closeUps };
          });
        }

        // Retries produce one result each; keep the last one, like the report UI.
        byId.set(id, {
          id,
          snapshot,
          suite,
          specFile,
          testTitle: test.title ?? null,
          projectName: test.projectName ?? null,
          viewport,
          size: decoded.diff ? { width: decoded.diff.width, height: decoded.diff.height } : null,
          expectedSize: decoded.expected ? { width: decoded.expected.width, height: decoded.expected.height } : null,
          actualSize: decoded.actual ? { width: decoded.actual.width, height: decoded.actual.height } : null,
          changedPixels,
          images,
          regions,
        });
      }
    }
  }

  const diffs = [...byId.values()].sort((a, b) =>
    a.suite.localeCompare(b.suite) || a.snapshot.localeCompare(b.snapshot) || a.viewport.localeCompare(b.viewport));

  // Suggestions go next to the report so they're easy to find and drop into Diffscope.
  const reportDir = fs.statSync(input).isDirectory() ? input : path.dirname(input);
  const suggestionsPath = path.join(reportDir, 'diffscope-suggestions.json');

  const manifest = { report: input, extractedAt: new Date().toISOString(), suggestionsPath, diffs };
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(JSON.stringify({
    manifest: path.join(out, 'manifest.json'),
    suggestionsPath,
    diffCount: diffs.length,
    diffs: diffs.map(d => ({
      id: d.id, snapshot: d.snapshot, viewport: d.viewport, changedPixels: d.changedPixels, regions: d.regions.length,
    })),
  }, null, 2));
}

try {
  main();
} catch (err) {
  console.error(`extract-report: ${err.message}`);
  process.exit(1);
}
