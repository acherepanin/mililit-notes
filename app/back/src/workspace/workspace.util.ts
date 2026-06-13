import { BadRequestException } from '@nestjs/common';
import { basename, extname } from 'node:path';

export interface ZipEntry {
  fileName: string;
  content: Buffer;
}

const CRC32_TABLE = new Uint32Array(256);
for (let index = 0; index < CRC32_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC32_TABLE[index] = value >>> 0;
}

export function sanitizeFolderName(name: string): string {
  const safeName = name
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .slice(0, 120);
  if (!safeName) {
    throw new BadRequestException('Folder name is invalid');
  }
  return safeName;
}

export function sanitizeAttachmentName(fileName: string): string {
  const safeName = basename(fileName)
    .replace(/[^\p{L}\p{N}._ -]/gu, '_')
    .trim();
  if (!safeName || safeName === '.' || safeName === '..') {
    throw new BadRequestException('File name is invalid');
  }
  return safeName;
}

export function sanitizeZipFolderSegment(segment: string): string {
  const safeSegment = segment
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ');
  if (!safeSegment || safeSegment === '.' || safeSegment === '..') {
    return 'folder';
  }
  return safeSegment;
}

export function makeUniqueZipPath(path: string, usedPaths: Set<string>): string {
  const safePath = path
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => sanitizeZipFolderSegment(segment))
    .filter(Boolean)
    .join('/');
  if (!safePath) {
    throw new BadRequestException('Archive path is invalid');
  }

  let candidate = safePath;
  let index = 2;
  while (usedPaths.has(candidate.toLowerCase())) {
    const segments = candidate.split('/');
    const fileName = segments.pop() ?? 'file';
    const directory = segments.join('/');
    const extension = extname(fileName);
    const baseName = extension ? fileName.slice(0, -extension.length) : fileName;
    const nextFileName = `${baseName} (${index})${extension}`;
    candidate = directory ? `${directory}/${nextFileName}` : nextFileName;
    index += 1;
  }
  usedPaths.add(candidate.toLowerCase());
  return candidate;
}

export function makeUniqueZipName(fileName: string, usedNames: Set<string>): string {
  return makeUniqueZipPath(sanitizeAttachmentName(fileName), usedNames);
}

function crc32(content: Buffer): number {
  let checksum = 0xffffffff;
  for (const byte of content) {
    checksum = CRC32_TABLE[(checksum ^ byte) & 0xff] ^ (checksum >>> 8);
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

function getDosDateTime(value: Date): { date: number; time: number } {
  const year = Math.max(value.getFullYear(), 1980);
  return {
    date: ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate(),
    time: (value.getHours() << 11) | (value.getMinutes() << 5) | Math.floor(value.getSeconds() / 2),
  };
}

/**
 * Builds a minimal (stored, uncompressed) ZIP archive in-memory. Kept as a
 * pure utility so attachment services stay focused on storage and metadata.
 */
export function createZip(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const { date, time } = getDosDateTime(new Date());

  for (const entry of entries) {
    const fileName = Buffer.from(entry.fileName, 'utf8');
    const checksum = crc32(entry.content);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(entry.content.byteLength, 18);
    localHeader.writeUInt32LE(entry.content.byteLength, 22);
    localHeader.writeUInt16LE(fileName.byteLength, 26);
    localHeader.writeUInt16LE(0, 28);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(entry.content.byteLength, 20);
    centralHeader.writeUInt32LE(entry.content.byteLength, 24);
    centralHeader.writeUInt16LE(fileName.byteLength, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    localParts.push(localHeader, fileName, entry.content);
    centralParts.push(centralHeader, fileName);
    offset += localHeader.byteLength + fileName.byteLength + entry.content.byteLength;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((size, part) => size + part.byteLength, 0);
  const endHeader = Buffer.alloc(22);
  endHeader.writeUInt32LE(0x06054b50, 0);
  endHeader.writeUInt16LE(0, 4);
  endHeader.writeUInt16LE(0, 6);
  endHeader.writeUInt16LE(entries.length, 8);
  endHeader.writeUInt16LE(entries.length, 10);
  endHeader.writeUInt32LE(centralSize, 12);
  endHeader.writeUInt32LE(centralOffset, 16);
  endHeader.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, endHeader]);
}
