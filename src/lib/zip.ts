import pako from 'pako';

/**
 * Extract a single named file from a raw ZIP ArrayBuffer.
 * Pure browser implementation — no dependencies beyond pako for inflate.
 */
export function zipExtract(buf: Uint8Array, filename: string): Uint8Array {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  // Locate End of Central Directory record
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error('Invalid ZIP: no EOCD');

  const cdOffset = view.getUint32(eocd + 16, true);
  const cdSize = view.getUint32(eocd + 12, true);
  let offset = cdOffset;

  while (offset < cdOffset + cdSize) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compSize = view.getUint32(offset + 20, true);
    const fnLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localOff = view.getUint32(offset + 42, true);
    const entryName = new TextDecoder().decode(buf.subarray(offset + 46, offset + 46 + fnLen));

    if (entryName === filename) {
      const lhFnLen = view.getUint16(localOff + 26, true);
      const lhExtraLen = view.getUint16(localOff + 28, true);
      const dataOff = localOff + 30 + lhFnLen + lhExtraLen;
      const compressed = buf.subarray(dataOff, dataOff + compSize);
      if (method === 0) return compressed;
      if (method === 8) return pako.inflateRaw(compressed);
      throw new Error('Unsupported ZIP compression: ' + method);
    }
    offset += 46 + fnLen + extraLen + commentLen;
  }
  throw new Error('File not found in ZIP: ' + filename);
}

/**
 * List all file entries in a ZIP archive.
 */
export function zipList(buf: Uint8Array): string[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const names: string[] = [];

  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return names;

  const cdOffset = view.getUint32(eocd + 16, true);
  const cdSize = view.getUint32(eocd + 12, true);
  let offset = cdOffset;

  while (offset < cdOffset + cdSize) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const fnLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const entryName = new TextDecoder().decode(buf.subarray(offset + 46, offset + 46 + fnLen));
    names.push(entryName);
    offset += 46 + fnLen + extraLen + commentLen;
  }

  return names;
}
