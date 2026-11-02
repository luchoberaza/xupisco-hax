const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function pngToIco(pngPath, icoPath) {
  const sizes = [16, 32, 48, 256];
  const images = [];

  for (const size of sizes) {
    const buf = await sharp(pngPath)
      .resize(size, size)
      .png()
      .toBuffer();
    images.push({ size, buf });
  }

  // ICO format: header + directory entries + image data
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = dirEntrySize * images.length;
  let dataOffset = headerSize + dirSize;

  const parts = [];

  // Header: reserved(2) + type(2) + count(2)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  parts.push(header);

  // Directory entries
  const offsets = [];
  let currentOffset = dataOffset;
  for (const img of images) {
    offsets.push(currentOffset);
    currentOffset += img.buf.length;
  }

  for (let i = 0; i < images.length; i++) {
    const entry = Buffer.alloc(16);
    const s = images[i].size === 256 ? 0 : images[i].size;
    entry.writeUInt8(s, 0);      // width
    entry.writeUInt8(s, 1);      // height
    entry.writeUInt8(0, 2);      // color palette
    entry.writeUInt8(0, 3);      // reserved
    entry.writeUInt16LE(1, 4);   // color planes
    entry.writeUInt16LE(32, 6);  // bits per pixel
    entry.writeUInt32LE(images[i].buf.length, 8);  // size
    entry.writeUInt32LE(offsets[i], 12);            // offset
    parts.push(entry);
  }

  // Image data (PNG)
  for (const img of images) {
    parts.push(img.buf);
  }

  fs.writeFileSync(icoPath, Buffer.concat(parts));
  console.log('icon.ico created');
}

const png = path.join(__dirname, '..', 'assets', 'icon.png');
const ico = path.join(__dirname, '..', 'assets', 'icon.ico');
pngToIco(png, ico).catch(console.error);
