#!/usr/bin/env node

import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ID = 'project-b3f9c2b6-7b6a-4489-baea-aa9018774130';
const LIMITS = Object.freeze({
  maxArchiveBytes: 24 * 1024 * 1024,
  maxExtractedBytes: 20 * 1024 * 1024,
  maxFiles: 500,
  maxFileBytes: 2 * 1024 * 1024,
});
const EXCLUDED_ROOT_DIRECTORIES = new Set([
  'manager',
  'node_modules',
  '.next',
  'dist',
  'build',
  'out',
  'coverage',
  '.turbo',
]);
const UTF8_FLAG = 0x0800;
const DOS_EPOCH_DATE = 0x0021; // 1980-01-01
const MODE_REGULAR_FILE = 0x81a40000; // Unix regular file, 0644
const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const WORKTREE_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');
const REPOSITORY_ROOT = path.resolve(WORKTREE_ROOT, '..', '..');
const SOURCE_ROOT = path.join(REPOSITORY_ROOT, 'projects', PROJECT_ID);
const SANDBOX_ROOT = path.join(WORKTREE_ROOT, 'test-sandbox', 'quiz-app-test');
const ARCHIVE_PATH = path.join(SANDBOX_ROOT, 'quiz-master-source.zip');
const MANIFEST_PATH = path.join(SANDBOX_ROOT, 'quiz-master-source.manifest.json');
const RUN_ROOT = path.join(SANDBOX_ROOT, 'run');

const crcTable = new Uint32Array(256);
for (let index = 0; index < crcTable.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  crcTable[index] = value >>> 0;
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}


function fail(message) {
  throw new Error(`Quiz snapshot aborted: ${message}`);
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function crc32(content) {
  let value = 0xffffffff;
  for (const byte of content) value = (value >>> 8) ^ crcTable[(value ^ byte) & 0xff];
  return (value ^ 0xffffffff) >>> 0;
}

function assertRange(buffer, offset, length, label) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > buffer.length) {
    fail(`${label} is outside archive bounds.`);
  }
}

function assertContained(base, candidate, label) {
  const relative = path.relative(base, candidate);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    fail(`${label} escapes its controlled root.`);
  }
}

function canonicalRelativePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\0')) fail(`invalid relative path: ${String(value)}`);
  const posixValue = value.replaceAll('\\', '/');
  if (posixValue.startsWith('/') || /^[A-Za-z]:/.test(posixValue)) fail(`absolute path is not allowed: ${value}`);
  const normalized = path.posix.normalize(posixValue);
  if (
    normalized !== posixValue
    || normalized === '.'
    || normalized === '..'
    || normalized.startsWith('../')
    || normalized.includes('/../')
    || normalized.split('/').some(segment => !segment || segment === '.' || segment === '..')
  ) {
    fail(`path traversal is not allowed: ${value}`);
  }
  return normalized;
}

async function lstatIfPresent(target) {
  try {
    return await fs.lstat(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function assertDirectory(stat, label) {
  if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) fail(`${label} must be a real directory, not a symlink.`);
}

function assertRegularFile(stat, label) {
  if (!stat || stat.isSymbolicLink() || !stat.isFile()) fail(`${label} must be a regular file, not a symlink.`);
}

function sameFileIdentity(first, second) {
  return first.dev === second.dev
    && first.ino === second.ino
    && first.size === second.size
    && first.mtimeMs === second.mtimeMs
    && first.ctimeMs === second.ctimeMs;
}

async function ensureDirectoryChain(root, segments) {
  const rootStat = await fs.lstat(root);
  assertDirectory(rootStat, root);

  let current = root;
  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..' || segment.includes(path.sep)) fail(`unsafe controlled directory segment: ${segment}`);
    current = path.join(current, segment);
    assertContained(root, current, 'controlled directory');
    const stat = await lstatIfPresent(current);
    if (stat) {
      assertDirectory(stat, current);
      continue;
    }
    await fs.mkdir(current);
    assertDirectory(await fs.lstat(current), current);
  }
  return current;
}

async function readStableSourceFile(absolutePath, relativePath, totalBytes) {
  const before = await fs.lstat(absolutePath);
  assertRegularFile(before, `source file ${relativePath}`);
  if (before.size > LIMITS.maxFileBytes || totalBytes + before.size > LIMITS.maxExtractedBytes) {
    fail(`source size limit exceeded at ${relativePath}`);
  }

  const handle = await fs.open(absolutePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0));
  try {
    const opened = await handle.stat();
    assertRegularFile(opened, `opened source file ${relativePath}`);
    if (!sameFileIdentity(before, opened)) fail(`source file changed while opening: ${relativePath}`);
    const content = await handle.readFile();
    const after = await fs.lstat(absolutePath);
    assertRegularFile(after, `source file ${relativePath}`);
    if (!sameFileIdentity(before, after) || !sameFileIdentity(opened, after) || content.length !== before.size) {
      fail(`source file changed while reading: ${relativePath}`);
    }
    return content;
  } finally {
    await handle.close();
  }
}

async function collectSourceFiles(directory, relativeDirectory = '', files = [], totalBytes = 0) {
  const directoryStat = await fs.lstat(directory);
  assertDirectory(directoryStat, `source directory ${relativeDirectory || '.'}`);

  const entries = await fs.readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => compareUtf8(left.name, right.name));

  for (const entry of entries) {
    const relativePath = canonicalRelativePath(relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name);
    if (!relativeDirectory && EXCLUDED_ROOT_DIRECTORIES.has(entry.name)) continue;

    const absolutePath = path.join(directory, entry.name);
    const stat = await fs.lstat(absolutePath);
    if (stat.isSymbolicLink()) fail(`symbolic link found in source: ${relativePath}`);

    if (stat.isDirectory()) {
      totalBytes = await collectSourceFiles(absolutePath, relativePath, files, totalBytes);
      continue;
    }
    if (!stat.isFile()) fail(`unsupported source entry type: ${relativePath}`);
    if (files.length >= LIMITS.maxFiles) fail(`source file count exceeds ${LIMITS.maxFiles}.`);

    const content = await readStableSourceFile(absolutePath, relativePath, totalBytes);
    totalBytes += content.length;
    files.push({ path: relativePath, content, sha256: sha256(content), size: content.length });
  }

  return totalBytes;
}

function writeLocalFileHeader(file) {
  const name = Buffer.from(file.path, 'utf8');
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(UTF8_FLAG, 6);
  header.writeUInt16LE(0, 8); // Store, never compress: deterministic and binary-safe.
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(DOS_EPOCH_DATE, 12);
  header.writeUInt32LE(crc32(file.content), 14);
  header.writeUInt32LE(file.size, 18);
  header.writeUInt32LE(file.size, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, name, file.content]);
}

function writeCentralDirectoryHeader(file, localOffset) {
  const name = Buffer.from(file.path, 'utf8');
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(0x0314, 4); // made by Unix, ZIP spec 2.0
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(UTF8_FLAG, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt16LE(DOS_EPOCH_DATE, 14);
  header.writeUInt32LE(crc32(file.content), 16);
  header.writeUInt32LE(file.size, 20);
  header.writeUInt32LE(file.size, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(MODE_REGULAR_FILE, 38);
  header.writeUInt32LE(localOffset, 42);
  return Buffer.concat([header, name]);
}

function createDeterministicZip(sourceFiles) {
  if (sourceFiles.length > LIMITS.maxFiles || sourceFiles.length > 0xffff) fail('ZIP entry count limit exceeded.');
  const files = [...sourceFiles].sort((left, right) => compareUtf8(left.path, right.path));
  const localParts = [];
  const centralParts = [];
  const seen = new Set();
  let localOffset = 0;

  for (const file of files) {
    const canonicalPath = canonicalRelativePath(file.path);
    if (canonicalPath !== file.path || seen.has(canonicalPath)) fail(`duplicate or non-canonical source path: ${file.path}`);
    if (!Buffer.isBuffer(file.content) || file.content.length !== file.size || file.size > LIMITS.maxFileBytes) fail(`invalid source bytes: ${file.path}`);
    seen.add(canonicalPath);
    const local = writeLocalFileHeader(file);
    localParts.push(local);
    centralParts.push(writeCentralDirectoryHeader(file, localOffset));
    localOffset += local.length;
  }

  const centralOffset = localOffset;
  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  const archive = Buffer.concat([...localParts, ...centralParts, end]);
  if (archive.length > LIMITS.maxArchiveBytes) fail('archive size limit exceeded.');
  return archive;
}

function parseStoredZip(archive) {
  if (!Buffer.isBuffer(archive) || archive.length < 22 || archive.length > LIMITS.maxArchiveBytes) fail('invalid archive length.');
  const endOffset = archive.length - 22;
  if (archive.readUInt32LE(endOffset) !== 0x06054b50 || archive.readUInt16LE(endOffset + 20) !== 0) {
    fail('archive must have one deterministic, comment-free end record.');
  }
  if (archive.readUInt16LE(endOffset + 4) !== 0 || archive.readUInt16LE(endOffset + 6) !== 0) fail('multi-disk archives are not allowed.');
  const entryCount = archive.readUInt16LE(endOffset + 10);
  if (entryCount !== archive.readUInt16LE(endOffset + 8) || entryCount > LIMITS.maxFiles) fail('invalid archive entry count.');
  const centralSize = archive.readUInt32LE(endOffset + 12);
  const centralOffset = archive.readUInt32LE(endOffset + 16);
  assertRange(archive, centralOffset, centralSize, 'central directory');
  if (centralOffset + centralSize !== endOffset) fail('archive has bytes outside deterministic central directory layout.');

  let offset = centralOffset;
  let totalBytes = 0;
  const seen = new Set();
  const entries = [];
  for (let index = 0; index < entryCount; index += 1) {
    assertRange(archive, offset, 46, `central directory entry ${index}`);
    if (archive.readUInt32LE(offset) !== 0x02014b50) fail(`invalid central directory signature at entry ${index}.`);
    const flags = archive.readUInt16LE(offset + 8);
    const method = archive.readUInt16LE(offset + 10);
    const crc = archive.readUInt32LE(offset + 16);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const diskStart = archive.readUInt16LE(offset + 34);
    const externalAttributes = archive.readUInt32LE(offset + 38);
    const localOffset = archive.readUInt32LE(offset + 42);
    const entryLength = 46 + nameLength + extraLength + commentLength;
    assertRange(archive, offset, entryLength, `central directory entry ${index}`);

    if (flags !== UTF8_FLAG || method !== 0 || compressedSize !== uncompressedSize || extraLength !== 0 || commentLength !== 0 || diskStart !== 0) {
      fail(`unsupported archive metadata at entry ${index}.`);
    }
    const mode = externalAttributes >>> 16;
    if ((mode & 0xf000) === 0xa000) fail(`symbolic link entry rejected at archive entry ${index}.`);
    if (uncompressedSize > LIMITS.maxFileBytes || totalBytes + uncompressedSize > LIMITS.maxExtractedBytes) {
      fail(`archive extraction limit exceeded at entry ${index}.`);
    }

    const nameBytes = archive.subarray(offset + 46, offset + 46 + nameLength);
    const rawName = nameBytes.toString('utf8');
    if (!Buffer.from(rawName, 'utf8').equals(nameBytes)) fail(`archive entry ${index} has invalid UTF-8 path bytes.`);
    const entryPath = canonicalRelativePath(rawName);
    if (entryPath !== rawName || seen.has(entryPath)) fail(`duplicate or unsafe archive path: ${rawName}`);
    seen.add(entryPath);

    assertRange(archive, localOffset, 30, `local header ${entryPath}`);
    if (archive.readUInt32LE(localOffset) !== 0x04034b50) fail(`invalid local header for ${entryPath}.`);
    const localFlags = archive.readUInt16LE(localOffset + 6);
    const localMethod = archive.readUInt16LE(localOffset + 8);
    const localCrc = archive.readUInt32LE(localOffset + 14);
    const localCompressedSize = archive.readUInt32LE(localOffset + 18);
    const localUncompressedSize = archive.readUInt32LE(localOffset + 22);
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    if (
      localFlags !== flags
      || localMethod !== method
      || localCrc !== crc
      || localCompressedSize !== compressedSize
      || localUncompressedSize !== uncompressedSize
      || localExtraLength !== 0
      || localNameLength !== nameLength
    ) {
      fail(`local header metadata mismatch for ${entryPath}.`);
    }
    const localNameStart = localOffset + 30;
    assertRange(archive, localNameStart, localNameLength, `local path ${entryPath}`);
    if (!archive.subarray(localNameStart, localNameStart + localNameLength).equals(nameBytes)) fail(`local path mismatch for ${entryPath}.`);
    const contentStart = localNameStart + localNameLength;
    assertRange(archive, contentStart, uncompressedSize, `content ${entryPath}`);
    const content = archive.subarray(contentStart, contentStart + uncompressedSize);
    if (crc32(content) !== crc) fail(`CRC mismatch for ${entryPath}.`);

    totalBytes += content.length;
    entries.push({ path: entryPath, content, size: content.length, sha256: sha256(content) });
    offset += entryLength;
  }
  if (offset !== centralOffset + centralSize) fail('central directory trailing bytes are not allowed.');
  return entries;
}

async function assertRemovableTreeSafe(directory) {
  const stat = await fs.lstat(directory);
  if (stat.isSymbolicLink()) fail(`refusing to clean symlink in run directory: ${directory}`);
  if (stat.isFile()) return;
  if (!stat.isDirectory()) fail(`refusing to clean unsupported run entry: ${directory}`);
  const entries = await fs.readdir(directory);
  for (const name of entries) await assertRemovableTreeSafe(path.join(directory, name));
}

async function emptyRunDirectory() {
  assertContained(SANDBOX_ROOT, RUN_ROOT, 'run directory');
  const existing = await lstatIfPresent(RUN_ROOT);
  if (!existing) {
    await fs.mkdir(RUN_ROOT);
    return;
  }
  assertDirectory(existing, RUN_ROOT);
  await assertRemovableTreeSafe(RUN_ROOT);
  const entries = await fs.readdir(RUN_ROOT);
  for (const name of entries) await fs.rm(path.join(RUN_ROOT, name), { recursive: true, force: false });
}

async function writeExtractedFile(entry) {
  const target = path.join(RUN_ROOT, ...entry.path.split('/'));
  assertContained(RUN_ROOT, target, `archive entry ${entry.path}`);
  const parentRelative = path.relative(RUN_ROOT, path.dirname(target));
  if (parentRelative) await ensureDirectoryChain(RUN_ROOT, parentRelative.split(path.sep));
  if (await lstatIfPresent(target)) fail(`archive extraction target already exists: ${entry.path}`);
  await fs.writeFile(target, entry.content, { flag: 'wx', mode: 0o600 });
  const written = await fs.readFile(target);
  if (sha256(written) !== entry.sha256) fail(`extracted file digest mismatch: ${entry.path}`);
}

async function writeAtomically(target, content) {
  assertContained(SANDBOX_ROOT, target, 'snapshot output');
  const parentRelative = path.relative(SANDBOX_ROOT, path.dirname(target));
  if (parentRelative) await ensureDirectoryChain(SANDBOX_ROOT, parentRelative.split(path.sep));
  const temporary = `${target}.tmp`;
  for (const candidate of [target, temporary]) {
    const existing = await lstatIfPresent(candidate);
    if (!existing) continue;
    assertRegularFile(existing, `existing snapshot output ${candidate}`);
    await fs.rm(candidate, { force: false });
  }
  await fs.writeFile(temporary, content, { flag: 'wx', mode: 0o600 });
  await fs.rename(temporary, target);
}

async function main() {
  assertDirectory(await fs.lstat(WORKTREE_ROOT), 'worktree root');
  const sourceStat = await fs.lstat(SOURCE_ROOT);
  assertDirectory(sourceStat, 'source project root');
  await ensureDirectoryChain(WORKTREE_ROOT, ['test-sandbox', 'quiz-app-test']);

  const sourceFiles = [];
  await collectSourceFiles(SOURCE_ROOT, '', sourceFiles);
  sourceFiles.sort((left, right) => compareUtf8(left.path, right.path));
  if (sourceFiles.length === 0) fail('source project has no application files after exclusions.');

  const archive = createDeterministicZip(sourceFiles);
  const generatedArchiveDigest = sha256(archive);
  await writeAtomically(ARCHIVE_PATH, archive);
  const persistedArchive = await fs.readFile(ARCHIVE_PATH);
  const persistedArchiveDigest = sha256(persistedArchive);
  if (persistedArchiveDigest !== generatedArchiveDigest) fail('archive digest changed after atomic publication.');

  const archiveEntries = parseStoredZip(persistedArchive);
  if (archiveEntries.length !== sourceFiles.length) fail('archive file count differs from source file count.');
  const sourceByPath = new Map(sourceFiles.map(file => [file.path, file]));
  for (const entry of archiveEntries) {
    const source = sourceByPath.get(entry.path);
    if (!source || source.size !== entry.size || source.sha256 !== entry.sha256) {
      fail(`archive digest does not match source bytes: ${entry.path}`);
    }
  }

  await emptyRunDirectory();
  for (const entry of archiveEntries) await writeExtractedFile(entry);
  const extractedFiles = [];
  for (const source of sourceFiles) {
    const extractedPath = path.join(RUN_ROOT, ...source.path.split('/'));
    const extracted = await fs.readFile(extractedPath);
    const extractedDigest = sha256(extracted);
    if (extracted.length !== source.size || extractedDigest !== source.sha256) {
      fail(`extracted digest does not match source bytes: ${source.path}`);
    }
    extractedFiles.push({ path: source.path, size: extracted.length, sha256: extractedDigest });
  }

  const manifest = {
    schemaVersion: 1,
    source: {
      projectId: PROJECT_ID,
      relativeRoot: `projects/${PROJECT_ID}`,
      excludedRootDirectories: [...EXCLUDED_ROOT_DIRECTORIES].sort(compareUtf8),
      files: sourceFiles.map(({ path: filePath, size, sha256: digest }) => ({ path: filePath, size, sha256: digest })),
    },
    archive: {
      relativePath: 'quiz-master-source.zip',
      format: 'ZIP (store-only, UTF-8 paths, DOS timestamps fixed to 1980-01-01)',
      sha256: persistedArchiveDigest,
      size: persistedArchive.length,
    },
    extraction: {
      relativePath: 'run',
      files: extractedFiles,
    },
    limits: LIMITS,
    verification: {
      sourceFileCount: sourceFiles.length,
      archiveFileCount: archiveEntries.length,
      extractedFileCount: extractedFiles.length,
      archiveDigestMatchesPersistedBytes: true,
      everyExtractedFileMatchesSourceSha256: true,
    },
  };
  await writeAtomically(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(JSON.stringify({
    status: 'complete',
    archive: path.relative(WORKTREE_ROOT, ARCHIVE_PATH).replaceAll('\\', '/'),
    runDirectory: path.relative(WORKTREE_ROOT, RUN_ROOT).replaceAll('\\', '/'),
    manifest: path.relative(WORKTREE_ROOT, MANIFEST_PATH).replaceAll('\\', '/'),
    archiveSha256: persistedArchiveDigest,
    files: sourceFiles.length,
  }, null, 2));
}

main().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
