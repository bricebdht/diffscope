import pako from 'pako';

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Count "diff" pixels in a Playwright diff image (non-grey/non-black pixels).
 * Pure browser implementation — reads raw PNG bytes.
 */
export function countDiffPixels(pngBytes: Uint8Array): number | null {
  try {
    const view = new DataView(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength);

    // Verify PNG signature
    if (
      pngBytes[0] !== 0x89 || pngBytes[1] !== 0x50 || pngBytes[2] !== 0x4e ||
      pngBytes[3] !== 0x47 || pngBytes[4] !== 0x0d || pngBytes[5] !== 0x0a ||
      pngBytes[6] !== 0x1a || pngBytes[7] !== 0x0a
    ) {
      return null;
    }

    let offset = 8;
    let width = 0, height = 0, colorType = 0, bitDepth = 0;
    const idatChunks: Uint8Array[] = [];

    while (offset < pngBytes.length - 12) {
      const length = view.getUint32(offset);
      const type = String.fromCharCode(
        pngBytes[offset + 4], pngBytes[offset + 5],
        pngBytes[offset + 6], pngBytes[offset + 7]
      );
      const data = pngBytes.subarray(offset + 8, offset + 8 + length);

      if (type === 'IHDR') {
        width = view.getUint32(offset + 8);
        height = view.getUint32(offset + 12);
        bitDepth = pngBytes[offset + 16];
        colorType = pngBytes[offset + 17];
      } else if (type === 'IDAT') {
        idatChunks.push(data);
      } else if (type === 'IEND') {
        break;
      }
      offset += 12 + length;
    }

    if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) return null;
    const ch = colorType === 6 ? 4 : 3;
    const stride = width * ch;

    // Concatenate IDAT chunks and inflate
    const totalLen = idatChunks.reduce((sum, c) => sum + c.length, 0);
    const combined = new Uint8Array(totalLen);
    let pos = 0;
    for (const chunk of idatChunks) {
      combined.set(chunk, pos);
      pos += chunk.length;
    }
    const raw = pako.inflate(combined);

    const prev = new Uint8Array(stride);
    let diffPixels = 0;

    for (let y = 0; y < height; y++) {
      const base = y * (stride + 1);
      const ft = raw[base];
      const row = raw.subarray(base + 1, base + 1 + stride);
      const rec = new Uint8Array(stride);

      for (let i = 0; i < stride; i++) {
        const x = row[i];
        const a = i >= ch ? rec[i - ch] : 0;
        const b = prev[i];
        const c = i >= ch ? prev[i - ch] : 0;
        switch (ft) {
          case 0: rec[i] = x; break;
          case 1: rec[i] = (x + a) & 0xff; break;
          case 2: rec[i] = (x + b) & 0xff; break;
          case 3: rec[i] = (x + Math.floor((a + b) / 2)) & 0xff; break;
          case 4: rec[i] = (x + paethPredictor(a, b, c)) & 0xff; break;
          default: rec[i] = x;
        }
      }

      for (let px = 0; px < width; px++) {
        const p = px * ch;
        const r = rec[p], g = rec[p + 1], b2 = rec[p + 2];
        const maxDiff = Math.max(Math.abs(r - g), Math.abs(r - b2), Math.abs(g - b2));
        if (maxDiff > 30) diffPixels++;
      }

      prev.set(rec);
    }

    return diffPixels;
  } catch {
    return null;
  }
}
