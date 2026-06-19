export interface ZipFileEntry {
  name: string;
  blob: Blob;
}

const CRC32_TABLE = new Uint32Array(256);

for (let index = 0; index < CRC32_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC32_TABLE[index] = value >>> 0;
}

function crc32(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

function localFileHeader(nameBytes: Uint8Array, bytes: Uint8Array, checksum: number, date: number, time: number) {
  const header = new Uint8Array(30 + nameBytes.length);
  const view = new DataView(header.buffer);

  writeUint32(view, 0, 0x04034b50);
  writeUint16(view, 4, 20);
  writeUint16(view, 6, 0x0800);
  writeUint16(view, 8, 0);
  writeUint16(view, 10, time);
  writeUint16(view, 12, date);
  writeUint32(view, 14, checksum);
  writeUint32(view, 18, bytes.length);
  writeUint32(view, 22, bytes.length);
  writeUint16(view, 26, nameBytes.length);
  writeUint16(view, 28, 0);
  header.set(nameBytes, 30);

  return header;
}

function centralDirectoryHeader(
  nameBytes: Uint8Array,
  bytes: Uint8Array,
  checksum: number,
  date: number,
  time: number,
  offset: number,
) {
  const header = new Uint8Array(46 + nameBytes.length);
  const view = new DataView(header.buffer);

  writeUint32(view, 0, 0x02014b50);
  writeUint16(view, 4, 20);
  writeUint16(view, 6, 20);
  writeUint16(view, 8, 0x0800);
  writeUint16(view, 10, 0);
  writeUint16(view, 12, time);
  writeUint16(view, 14, date);
  writeUint32(view, 16, checksum);
  writeUint32(view, 20, bytes.length);
  writeUint32(view, 24, bytes.length);
  writeUint16(view, 28, nameBytes.length);
  writeUint16(view, 30, 0);
  writeUint16(view, 32, 0);
  writeUint16(view, 34, 0);
  writeUint16(view, 36, 0);
  writeUint32(view, 38, 0);
  writeUint32(view, 42, offset);
  header.set(nameBytes, 46);

  return header;
}

function endOfCentralDirectory(entryCount: number, centralDirectorySize: number, centralDirectoryOffset: number) {
  const footer = new Uint8Array(22);
  const view = new DataView(footer.buffer);

  writeUint32(view, 0, 0x06054b50);
  writeUint16(view, 4, 0);
  writeUint16(view, 6, 0);
  writeUint16(view, 8, entryCount);
  writeUint16(view, 10, entryCount);
  writeUint32(view, 12, centralDirectorySize);
  writeUint32(view, 16, centralDirectoryOffset);
  writeUint16(view, 20, 0);

  return footer;
}

export async function createZipBlob(entries: ZipFileEntry[], modifiedAt = new Date()) {
  const encoder = new TextEncoder();
  const { date, time } = dosDateTime(modifiedAt);
  const localParts: Array<BlobPart> = [];
  const centralParts: Array<BlobPart> = [];
  let offset = 0;
  let centralDirectorySize = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const bytes = new Uint8Array(await entry.blob.arrayBuffer());
    const checksum = crc32(bytes);
    const localHeader = localFileHeader(nameBytes, bytes, checksum, date, time);
    const centralHeader = centralDirectoryHeader(nameBytes, bytes, checksum, date, time, offset);

    localParts.push(localHeader, bytes);
    centralParts.push(centralHeader);
    offset += localHeader.length + bytes.length;
    centralDirectorySize += centralHeader.length;
  }

  return new Blob(
    [...localParts, ...centralParts, endOfCentralDirectory(entries.length, centralDirectorySize, offset)],
    { type: "application/zip" },
  );
}
