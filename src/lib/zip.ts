import pako from 'pako';

interface ZipEntry {
  name: string;
  method: number;
  compSize: number;
  localOff: number;
}

/**
 * Read the central directory of a ZIP archive.
 * Entry names use "/" as separator: some Windows tools (e.g. PowerShell's
 * Compress-Archive) write "\" instead, which the ZIP spec doesn't allow.
 */
function readEntries(buf: Uint8Array): ZipEntry[] | null {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  // Locate End of Central Directory record
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return null;

  const cdOffset = view.getUint32(eocd + 16, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const entries: ZipEntry[] = [];
  let offset = cdOffset;

  while (offset < cdOffset + cdSize) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const fnLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    entries.push({
      name: new TextDecoder().decode(buf.subarray(offset + 46, offset + 46 + fnLen)).replace(/\\/g, '/'),
      method: view.getUint16(offset + 10, true),
      compSize: view.getUint32(offset + 20, true),
      localOff: view.getUint32(offset + 42, true),
    });
    offset += 46 + fnLen + extraLen + commentLen;
  }

  return entries;
}

/**
 * Extract a single named file from a raw ZIP ArrayBuffer.
 * Pure browser implementation — no dependencies beyond pako for inflate.
 */
export function zipExtract(buf: Uint8Array, filename: string): Uint8Array {
  const entries = readEntries(buf);
  if (!entries) throw new Error('Invalid ZIP: no EOCD');

  const entry = entries.find(e => e.name === filename);
  if (!entry) throw new Error('File not found in ZIP: ' + filename);

  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const lhFnLen = view.getUint16(entry.localOff + 26, true);
  const lhExtraLen = view.getUint16(entry.localOff + 28, true);
  const dataOff = entry.localOff + 30 + lhFnLen + lhExtraLen;
  const compressed = buf.subarray(dataOff, dataOff + entry.compSize);
  if (entry.method === 0) return compressed;
  if (entry.method === 8) return pako.inflateRaw(compressed);
  throw new Error('Unsupported ZIP compression: ' + entry.method);
}

/**
 * List all file entries in a ZIP archive.
 */
export function zipList(buf: Uint8Array): string[] {
  return (readEntries(buf) ?? []).map(e => e.name);
}
