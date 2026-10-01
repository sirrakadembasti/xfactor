import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from '../backend/node_modules/jszip/lib/index.js';
import { inflateRawSync } from 'node:zlib';
import { ARTIFACT_LIMITS } from '../backend/artifactLimits.js';

const utf8 = new TextDecoder('utf-8', { fatal: true });
const ownedDirectories = new Set(['.home', '.tmp', '.npm']);
function invalid(reason) { throw new Error(`Archive metadata rejected: ${reason}`); }
function bounded(bytes, offset, length) {
  if (!Number.isSafeInteger(offset) || offset < 0 || length < 0 || offset + length > bytes.length) invalid('header bounds mismatch');
}
function canonicalName(raw) {
  if (!raw || /[\u0000-\u001f\u007f-\u009f\\]/u.test(raw) || raw.startsWith('/') || raw.includes(':')) invalid('unsafe archive filename');
  const segments = raw.replace(/\/$/, '').split('/');
  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..' || /[. ]$/.test(segment) || /[<>"|?*]/.test(segment)) invalid('unsafe archive path');
    const lower = segment.toLowerCase();
    if (/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])$/iu.test(segment.split('.')[0].trimEnd())) invalid('reserved Windows filename');
    if (['node_modules', '.git', '.npmrc', 'artifact.zip'].includes(lower) || ownedDirectories.has(lower)
      || (lower.startsWith('.env') && lower !== '.env.example')
      || /\.(?:db|sqlite|sqlite3)(?:-(?:wal|shm|journal))?$/i.test(segment)) invalid('forbidden reserved archive path');
  }
  return segments.join('/');
}
function extras(bytes, start, length) {
  const end = start + length;
  for (let pos = start; pos < end;) {
    if (pos + 4 > end) invalid('extra header bounds mismatch');
    const id = bytes.readUInt16LE(pos), size = bytes.readUInt16LE(pos + 2);
    if (pos + 4 + size > end) invalid('extra header bounds mismatch');
    if (id === 1) invalid('zip64 is unsupported');
    pos += 4 + size;
  }
}
function parseEntries(bytes, limits) {
  if (bytes.length > limits.maxArchiveBytes) invalid('archive size limit exceeded');
  let end = -1;
  for (let pos = bytes.length - 22; pos >= Math.max(0, bytes.length - 65557); pos--) {
    if (bytes.readUInt32LE(pos) === 0x06054b50 && pos + 22 + bytes.readUInt16LE(pos + 20) === bytes.length) { end = pos; break; }
  }
  if (end < 0) invalid('end of central directory missing');
  const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12), start = bytes.readUInt32LE(end + 16);
  if (count === 0xffff || size === 0xffffffff || start === 0xffffffff) invalid('zip64 is unsupported');
  if (bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0 || bytes.readUInt16LE(end + 8) !== count) invalid('multi-disk metadata unsupported');
  if (!count || count > limits.maxFiles) invalid('file count limit exceeded');
  if (start + size !== end) invalid('central directory bounds mismatch');
  bounded(bytes, start, size);
  const entries = [], seen = new Map(); let total = 0, pos = start;
  for (let index = 0; index < count; index++) {
    bounded(bytes, pos, 46);
    if (bytes.readUInt32LE(pos) !== 0x02014b50) invalid('central directory header mismatch');
    const flags = bytes.readUInt16LE(pos + 8), method = bytes.readUInt16LE(pos + 10);
    if (flags & (1 | 0x40 | 0x2000)) invalid('encrypted archive unsupported');
    if (flags & ~0x080e || ![0, 8].includes(method)) invalid('unsupported archive flags or compression method');
    const crc = bytes.readUInt32LE(pos + 16), compressed = bytes.readUInt32LE(pos + 20), uncompressed = bytes.readUInt32LE(pos + 24);
    const nameLength = bytes.readUInt16LE(pos + 28), extraLength = bytes.readUInt16LE(pos + 30), commentLength = bytes.readUInt16LE(pos + 32);
    if (bytes.readUInt16LE(pos + 34) !== 0 || [compressed, uncompressed, bytes.readUInt32LE(pos + 42)].includes(0xffffffff)) invalid('zip64 or multi-disk metadata unsupported');
    bounded(bytes, pos + 46, nameLength + extraLength + commentLength);
    const rawBytes = bytes.subarray(pos + 46, pos + 46 + nameLength);
    let raw; try { raw = utf8.decode(rawBytes); } catch { invalid('invalid UTF8 filename'); }
    const name = canonicalName(raw), key = name.toLowerCase(), directory = raw.endsWith('/');
    if (seen.has(key)) invalid('duplicate canonical archive entry');
    const mode = bytes.readUInt32LE(pos + 38) >>> 16, kind = mode & 0xf000;
    if (kind === 0xa000) invalid('symlink archive entry');
    if (kind && kind !== 0x8000 && kind !== 0x4000) invalid('unsupported archive file type');
    if (kind === 0x4000 && !directory || directory && kind === 0x8000) invalid('directory mode header mismatch');
    if (directory && (uncompressed || compressed)) invalid('directory size mismatch');
    if (uncompressed > limits.maxFileBytes) invalid('file size limit exceeded');
    if (method === 0 && compressed !== uncompressed) invalid('stored file size header mismatch');
    total += uncompressed;
    if (total > limits.maxExtractedBytes) invalid('extracted size limit exceeded');
    if (uncompressed > 1024 && uncompressed / Math.max(1, compressed) > limits.maxCompressionRatio) invalid('compression ratio limit exceeded');
    extras(bytes, pos + 46 + nameLength, extraLength);
    const local = bytes.readUInt32LE(pos + 42); bounded(bytes, local, 30);
    if (bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method) invalid('local header mismatch');
    const localNameLength = bytes.readUInt16LE(local + 26), localExtraLength = bytes.readUInt16LE(local + 28);
    bounded(bytes, local + 30, localNameLength + localExtraLength + compressed);
    if (!rawBytes.equals(bytes.subarray(local + 30, local + 30 + localNameLength))) invalid('local filename header mismatch');
    extras(bytes, local + 30 + localNameLength, localExtraLength);
    const dataStart = local + 30 + localNameLength + localExtraLength;
    let localEnd = dataStart + compressed;
    if (flags & 8) {
      for (const offset of [14, 18, 22]) if (bytes.readUInt32LE(local + offset) !== 0) invalid('local descriptor header mismatch');
      bounded(bytes, localEnd, 4);
      if (bytes.readUInt32LE(localEnd) === 0x08074b50) localEnd += 4;
      bounded(bytes, localEnd, 12);
      if (bytes.readUInt32LE(localEnd) !== crc || bytes.readUInt32LE(localEnd + 4) !== compressed || bytes.readUInt32LE(localEnd + 8) !== uncompressed) invalid('data descriptor header mismatch');
      localEnd += 12;
    } else if (bytes.readUInt32LE(local + 14) !== crc || bytes.readUInt32LE(local + 18) !== compressed || bytes.readUInt32LE(local + 22) !== uncompressed) invalid('local size or CRC header mismatch');
    if (localEnd > start) invalid('local header overlaps central directory');
    const entry = { name, raw, key, directory, uncompressed, compressed, method, dataStart, local, localEnd };
    seen.set(key, entry); entries.push(entry); pos += 46 + nameLength + extraLength + commentLength;
  }
  if (pos !== end) invalid('central directory count or size mismatch');
  let cursor = 0;
  for (const entry of [...entries].sort((a, b) => a.local - b.local)) {
    if (entry.local !== cursor) invalid('local header metadata overlap or gap');
    cursor = entry.localEnd;
    const parts = entry.key.split('/');
    for (let length = 1; length < parts.length; length++) {
      const parent = seen.get(parts.slice(0, length).join('/'));
      if (parent && !parent.directory) invalid('file/directory path conflict');
    }
  }
  if (cursor !== start) invalid('local header metadata bounds mismatch');
  return entries;
}
async function assertNoLinks(target) {
  const absolute = path.resolve(target); let current = absolute;
  while (true) {
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink()) invalid('existing symlink or junction component');
    const parent = path.dirname(current); if (parent === current) break; current = parent;
  }
  return absolute;
}
export async function extractLocalArchive(bytes, workspace, requestedLimits = ARTIFACT_LIMITS) {
  bytes = Buffer.from(bytes);
  const limits = { ...ARTIFACT_LIMITS, ...requestedLimits,
    maxExtractedBytes: requestedLimits.maxTotalBytes ?? requestedLimits.maxExtractedBytes ?? ARTIFACT_LIMITS.maxExtractedBytes,
    maxCompressionRatio: requestedLimits.maxRatio ?? requestedLimits.maxCompressionRatio ?? ARTIFACT_LIMITS.maxCompressionRatio };
  for (const value of Object.values(limits)) if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) invalid('invalid size limit');
  const entries = parseEntries(bytes, limits);
  const root = await assertNoLinks(workspace);
  if (!(await fs.lstat(root)).isDirectory()) invalid('workspace is not a directory');
  for (const name of await fs.readdir(root)) {
    const stat = await fs.lstat(path.join(root, name));
    if (stat.isSymbolicLink()) invalid('existing symlink or junction component');
    if (name === 'artifact.zip' && stat.isFile() || ownedDirectories.has(name) && stat.isDirectory()) continue;
    invalid('workspace must be fresh; existing target data');
  }
  // Inflate and validate every CRC before writing any archive-controlled file.
  // ZIP length fields are attacker controlled; cap real DEFLATE output independently.
  for (const entry of entries) {
    if (entry.method !== 8) continue;
    let actual;
    try { actual = inflateRawSync(bytes.subarray(entry.dataStart, entry.dataStart + entry.compressed), { maxOutputLength: Math.max(1, entry.uncompressed) }); }
    catch { invalid('inflation output limit exceeded or invalid compressed data'); }
    if (actual.length !== entry.uncompressed) invalid('inflated size metadata mismatch');
  }
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true, createFolders: false });
  const inflated = [];
  for (const entry of entries) {
    const member = zip.files[entry.raw];
    if (!member || member.dir !== entry.directory || member.unsafeOriginalName && member.unsafeOriginalName !== entry.raw) invalid('JSZip filename metadata mismatch');
    const content = entry.directory ? null : await member.async('nodebuffer');
    if (content && content.length !== entry.uncompressed) invalid('inflated size metadata mismatch');
    inflated.push({ ...entry, content });
  }
  for (const entry of inflated) {
    const target = path.join(root, ...entry.name.split('/'));
    await fs.mkdir(entry.directory ? target : path.dirname(target), { recursive: true });
    await assertNoLinks(entry.directory ? target : path.dirname(target));
    if (!entry.directory) await fs.writeFile(target, entry.content, { flag: 'wx' });
  }
  return { files: entries.filter(entry => !entry.directory).length, extractedBytes: inflated.reduce((sum, entry) => sum + (entry.content?.length || 0), 0) };
}
