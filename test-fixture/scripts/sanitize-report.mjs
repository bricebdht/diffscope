/**
 * Removes local absolute paths from a Playwright HTML report before it's
 * published (the demo report is public): error stack traces in the embedded
 * report data contain e.g. C:\Users\<name>\...\test-fixture\e2e\dashboard.spec.ts.
 * Paths under `root` become relative to it; any other home-directory path left
 * afterwards fails the build rather than being published.
 */
import { homedir } from "node:os";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";
import zlib from "node:zlib";

// Local absolute path in the forms it can take inside the report: as is,
// JSON-escaped (Windows backslashes doubled) and with forward slashes.
function pathVariants(p) {
  return [...new Set([p, p.replaceAll("\\", "\\\\"), p.replaceAll("\\", "/")])];
}

function scrub(text, root) {
  let out = text;
  for (const variant of pathVariants(root + sep)) out = out.replaceAll(variant, "");
  return out;
}

function assertClean(text, where) {
  for (const variant of pathVariants(homedir())) {
    if (text.includes(variant)) throw new Error(`Local path still present in ${where}`);
  }
}

// --- Minimal ZIP read/write (deflate), enough for Playwright's embedded report ---

function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error("Invalid ZIP: no end of central directory");
  const entries = [];
  let offset = buf.readUInt32LE(eocd + 16);
  const end = offset + buf.readUInt32LE(eocd + 12);
  while (offset < end) {
    const method = buf.readUInt16LE(offset + 10);
    const compSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOff = buf.readUInt32LE(offset + 42);
    const name = buf.subarray(offset + 46, offset + 46 + nameLen).toString("utf8");
    const dataOff = localOff + 30 + buf.readUInt16LE(localOff + 26) + buf.readUInt16LE(localOff + 28);
    const raw = buf.subarray(dataOff, dataOff + compSize);
    entries.push({ name, data: method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw) });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
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

function writeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const compressed = zlib.deflateRawSync(data);
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += 30 + nameBuf.length + compressed.length;
  }
  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, eocd]);
}

// --- Report ---------------------------------------------------------------------

/** Scrubs `reportDir`'s index.html (embedded report data) and text attachments in data/. */
export function sanitizeReport(reportDir, root) {
  const indexPath = join(reportDir, "index.html");
  const html = readFileSync(indexPath, "utf8");
  // Same embedding as Diffscope's extractZipFromHtml(): a <script> or <template> tag.
  const re = /(<(script|template)[^>]*playwrightReportBase64[^>]*>data:application\/zip;base64,)([A-Za-z0-9+/=\s]+)(<\/\2>)/;
  const match = html.match(re);
  if (!match) throw new Error("Could not find the embedded report data in index.html");

  const entries = readZip(Buffer.from(match[3].replace(/\s/g, ""), "base64")).map(({ name, data }) => {
    const text = scrub(data.toString("utf8"), root);
    assertClean(text, `index.html (${name})`);
    return { name, data: Buffer.from(text, "utf8") };
  });
  const cleanHtml = html.replace(re, (_, open, _tag, _b64, close) => open + writeZip(entries).toString("base64") + close);
  assertClean(cleanHtml, "index.html");
  writeFileSync(indexPath, cleanHtml);

  const dataDir = join(reportDir, "data");
  for (const file of readdirSync(dataDir).filter(f => /\.(md|txt|json)$/.test(f))) {
    const path = join(dataDir, file);
    const text = scrub(readFileSync(path, "utf8"), root);
    assertClean(text, `data/${file}`);
    writeFileSync(path, text);
  }
}
