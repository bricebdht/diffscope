import { zipExtract, zipList } from './zip';
import { countDiffPixels } from './png';
import type { DiffEntry } from './types';
import { SUITES, RETAILERS } from './types';

interface PlaywrightAttachment {
  name: string;
  path?: string;
  body?: string;
  contentType?: string;
}

interface PlaywrightResult {
  attachments?: PlaywrightAttachment[];
}

interface PlaywrightTest {
  projectName?: string;
  results?: PlaywrightResult[];
}

interface PlaywrightFile {
  fileName?: string;
  tests?: PlaywrightTest[];
}

interface PlaywrightReport {
  files?: PlaywrightFile[];
}

function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).slice(0, 8).padStart(8, '0');
}

function parseFileName(baseName: string): { retailer: string; index: string; description: string } {
  const parts = baseName.split('-');
  let retailer = 'unknown';
  let index = '00';
  let description = baseName;

  const retailers = RETAILERS as readonly string[];
  if (parts.length >= 2 && retailers.includes(parts[0].toLowerCase())) {
    retailer = parts[0].toLowerCase();
    index = parts[1];
    description = parts.slice(2).join('-') || baseName;
  }
  return { retailer, index, description };
}

function createBlobUrl(data: Uint8Array, contentType: string): string {
  const copy = new Uint8Array(data.length);
  copy.set(data);
  const blob = new Blob([copy], { type: contentType });
  return URL.createObjectURL(blob);
}

function createBlobUrlFromFile(file: File): string {
  return URL.createObjectURL(file);
}

function extractZipFromHtml(htmlText: string): Uint8Array {
  // Match <script id="playwrightReportBase64" type="application/zip">data:application/zip;base64,...</script>
  // or <script ... playwrightReportBase64 ...>(data:application/zip;base64,...)</script>
  const match = htmlText.match(
    /<script[^>]*playwrightReportBase64[^>]*>(?:data:application\/zip;base64,)([A-Za-z0-9+/=\s]+)<\/script>/
  );
  if (!match) {
    throw new Error('Could not find Playwright report data in HTML file');
  }

  const base64 = match[1].replace(/\s/g, '');
  const binaryStr = atob(base64);
  const zipBytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    zipBytes[i] = binaryStr.charCodeAt(i);
  }
  return zipBytes;
}

function extractReport(zipBytes: Uint8Array): PlaywrightReport {
  const reportJson = zipExtract(zipBytes, 'report.json');
  return JSON.parse(new TextDecoder().decode(reportJson));
}

type ImageResolver = (attPath: string) => Promise<string | null>;

async function buildDiffs(
  report: PlaywrightReport,
  resolveImage: ImageResolver,
): Promise<DiffEntry[]> {
  const diffs: DiffEntry[] = [];

  for (const file of (report.files || [])) {
    const fileName = file.fileName || '';
    let suite = 'unknown';
    const suitesArr = SUITES as readonly string[];
    for (const s of suitesArr) {
      if (fileName.includes(s)) { suite = s; break; }
    }

    for (const test of (file.tests || [])) {
      for (const result of (test.results || [])) {
        const attachments = result.attachments || [];
        const diffAtt = attachments.find(a => a.name.endsWith('-diff.png'));
        const actualAtt = attachments.find(a => a.name.endsWith('-actual.png'));
        const expAtt = attachments.find(a => a.name.endsWith('-expected.png'));
        if (!diffAtt) continue;

        const baseName = diffAtt.name.replace(/-diff\.png$/, '');
        const fileMeta = parseFileName(baseName);
        const viewport = test.projectName === 'phone' ? 'phone' : 'desktop';
        const id = hashCode(`pw-report/${baseName}/${viewport}`);

        const [diffBlob, actualBlob, expectedBlob] = await Promise.all([
          diffAtt.path ? resolveImage(diffAtt.path) : null,
          actualAtt?.path ? resolveImage(actualAtt.path) : null,
          expAtt?.path ? resolveImage(expAtt.path) : null,
        ]);

        diffs.push({
          id,
          baseName,
          suite,
          retailer: fileMeta.retailer,
          viewport,
          description: fileMeta.description,
          index: fileMeta.index,
          hasDiff: true,
          pixelCount: null, // computed lazily below for perf
          diffBlob,
          actualBlob,
          expectedBlob,
          thumbBlob: diffBlob,
        });
      }
    }
  }

  // Sort: diffs first, then by suite order, retailer, index
  const suiteOrder = [...SUITES, 'unknown'];
  const retailerOrder = [...RETAILERS, 'unknown'];
  diffs.sort((a, b) => {
    if (a.hasDiff !== b.hasDiff) return a.hasDiff ? -1 : 1;
    const si = suiteOrder.indexOf(a.suite) - suiteOrder.indexOf(b.suite);
    if (si !== 0) return si;
    const ri = retailerOrder.indexOf(a.retailer) - retailerOrder.indexOf(b.retailer);
    if (ri !== 0) return ri;
    if (a.index !== b.index) return a.index.localeCompare(b.index);
    return a.description.localeCompare(b.description);
  });

  return diffs;
}

/**
 * Parse a Playwright report from a folder of files (drag & drop or file picker).
 * Reads index.html for report.json, resolves images from companion data/ files.
 */
export async function parsePlaywrightFolder(files: File[]): Promise<DiffEntry[]> {
  const indexFile = files.find(f => {
    const rp = f.webkitRelativePath || f.name;
    return rp === 'index.html' || rp.endsWith('/index.html');
  });

  if (!indexFile) {
    throw new Error('index.html not found. Please drop the playwright-report folder.');
  }

  const htmlText = await indexFile.text();
  const zipBytes = extractZipFromHtml(htmlText);
  const report = extractReport(zipBytes);
  const zipEntries = zipList(zipBytes);

  // Build a lookup map for companion data/ files by their relative path
  const dataFiles = new Map<string, File>();
  for (const f of files) {
    const rp = f.webkitRelativePath || f.name;
    // Normalize: strip leading folder name (e.g. "playwright-report/data/xxx.png" → "data/xxx.png")
    const dataIdx = rp.indexOf('data/');
    if (dataIdx !== -1) {
      const relPath = rp.slice(dataIdx);
      dataFiles.set(relPath, f);
    }
  }

  const resolveImage: ImageResolver = async (attPath: string) => {
    // 1. Try companion file from the dropped folder
    const file = dataFiles.get(attPath);
    if (file) {
      return createBlobUrlFromFile(file);
    }

    // 2. Try inside the embedded ZIP
    if (zipEntries.includes(attPath)) {
      try {
        const data = zipExtract(zipBytes, attPath);
        return createBlobUrl(data, 'image/png');
      } catch {
        // fall through
      }
    }

    return null;
  };

  return buildDiffs(report, resolveImage);
}

/**
 * Parse a Playwright report from a single HTML file.
 * Images must be embedded in the ZIP or as base64 in the report.
 */
export async function parsePlaywrightHtml(htmlFile: File): Promise<DiffEntry[]> {
  const htmlText = await htmlFile.text();
  const zipBytes = extractZipFromHtml(htmlText);
  const report = extractReport(zipBytes);
  const zipEntries = zipList(zipBytes);

  const resolveImage: ImageResolver = async (attPath: string) => {
    if (zipEntries.includes(attPath)) {
      try {
        const data = zipExtract(zipBytes, attPath);
        return createBlobUrl(data, 'image/png');
      } catch {
        // fall through
      }
    }
    return null;
  };

  return buildDiffs(report, resolveImage);
}

/**
 * Parse a Playwright report from a .zip archive.
 * The zip should contain index.html and data/ files at the root or inside a folder.
 */
export async function parsePlaywrightZip(zipFile: File): Promise<DiffEntry[]> {
  const arrayBuf = await zipFile.arrayBuffer();
  const outerZip = new Uint8Array(arrayBuf);
  const outerEntries = zipList(outerZip);

  // Find index.html (may be at root or inside a subfolder)
  const indexEntry = outerEntries.find(e => e === 'index.html' || e.endsWith('/index.html'));
  if (!indexEntry) {
    throw new Error('index.html not found in ZIP archive.');
  }

  const prefix = indexEntry.replace('index.html', '');
  const htmlBytes = zipExtract(outerZip, indexEntry);
  const htmlText = new TextDecoder().decode(htmlBytes);
  const innerZip = extractZipFromHtml(htmlText);
  const report = extractReport(innerZip);
  const innerEntries = zipList(innerZip);

  const resolveImage: ImageResolver = async (attPath: string) => {
    // 1. Try from the outer zip (data/ files alongside index.html)
    const outerPath = prefix + attPath;
    if (outerEntries.includes(outerPath)) {
      try {
        const data = zipExtract(outerZip, outerPath);
        return createBlobUrl(data, 'image/png');
      } catch {
        // fall through
      }
    }

    // 2. Try from the inner (embedded) zip
    if (innerEntries.includes(attPath)) {
      try {
        const data = zipExtract(innerZip, attPath);
        return createBlobUrl(data, 'image/png');
      } catch {
        // fall through
      }
    }

    return null;
  };

  return buildDiffs(report, resolveImage);
}

/**
 * Count diff pixels for a single entry.
 * Fetches the diff blob URL and decodes the PNG.
 */
export async function computePixelCount(diff: DiffEntry): Promise<number | null> {
  if (!diff.diffBlob) return null;
  try {
    const resp = await fetch(diff.diffBlob);
    const buf = await resp.arrayBuffer();
    return countDiffPixels(new Uint8Array(buf));
  } catch {
    return null;
  }
}
