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

/**
 * Parse a Playwright HTML report file.
 * The report embeds a ZIP containing report.json and image attachments.
 */
export async function parsePlaywrightReport(htmlFile: File | Uint8Array): Promise<DiffEntry[]> {
  let htmlText: string;

  if (htmlFile instanceof File) {
    htmlText = await htmlFile.text();
  } else {
    htmlText = new TextDecoder().decode(htmlFile);
  }

  // Extract base64 ZIP from the HTML
  const match = htmlText.match(
    /<script[^>]*playwrightReportBase64[^>]*>(?:data:application\/zip;base64,)?([A-Za-z0-9+/=\s]+)<\/script>/
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

  // Extract report.json from ZIP
  const reportJson = zipExtract(zipBytes, 'report.json');
  const report: PlaywrightReport = JSON.parse(new TextDecoder().decode(reportJson));

  // List all files in the ZIP for image extraction
  const zipEntries = zipList(zipBytes);

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

        // Extract images from ZIP
        let diffBlob: string | null = null;
        let actualBlob: string | null = null;
        let expectedBlob: string | null = null;

        const extractImage = (att: PlaywrightAttachment | undefined): string | null => {
          if (!att) return null;

          // Try body (base64 inline)
          if (att.body) {
            try {
              const binaryStr = atob(att.body);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
              }
              return createBlobUrl(bytes, 'image/png');
            } catch {
              // fall through
            }
          }

          // Try path (reference to file in ZIP's data/ directory)
          if (att.path) {
            const zipPath = att.path;
            if (zipEntries.includes(zipPath)) {
              try {
                const data = zipExtract(zipBytes, zipPath);
                return createBlobUrl(data, 'image/png');
              } catch {
                // fall through
              }
            }
          }

          return null;
        };

        diffBlob = extractImage(diffAtt);
        actualBlob = extractImage(actualAtt);
        expectedBlob = extractImage(expAtt);

        // Count diff pixels from diff image
        let pixelCount: number | null = null;
        if (diffAtt.path && zipEntries.includes(diffAtt.path)) {
          try {
            const diffData = zipExtract(zipBytes, diffAtt.path);
            pixelCount = countDiffPixels(diffData);
          } catch {
            // ignore
          }
        } else if (diffAtt.body) {
          try {
            const binaryStr = atob(diffAtt.body);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }
            pixelCount = countDiffPixels(bytes);
          } catch {
            // ignore
          }
        }

        diffs.push({
          id,
          baseName,
          suite,
          retailer: fileMeta.retailer,
          viewport,
          description: fileMeta.description,
          index: fileMeta.index,
          hasDiff: true,
          pixelCount,
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
 * Parse a Playwright report from a dropped folder.
 * Looks for index.html in the folder's files.
 */
export async function parsePlaywrightFolder(files: File[]): Promise<DiffEntry[]> {
  const indexFile = files.find(f => {
    const rp = f.webkitRelativePath || f.name;
    return rp === 'index.html' || rp.endsWith('/index.html');
  });

  if (!indexFile) {
    throw new Error('index.html not found. Please drop the playwright-report folder.');
  }

  return parsePlaywrightReport(indexFile);
}
