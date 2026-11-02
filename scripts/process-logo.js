const sharp = require('sharp');
const path = require('path');

async function processLogo() {
  const input = path.join(__dirname, '..', 'logo.png');
  const outputPng = path.join(__dirname, '..', 'assets', 'logo.png');
  const outputIco = path.join(__dirname, '..', 'assets', 'icon.png');

  const image = sharp(input);
  const { width, height } = await image.metadata();

  // Remove black background by making near-black pixels transparent
  const raw = await image.ensureAlpha().raw().toBuffer();
  const channels = 4;
  const pixels = Buffer.from(raw);

  for (let i = 0; i < pixels.length; i += channels) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    // If pixel is very dark (near black), make transparent
    if (r < 30 && g < 30 && b < 30) {
      pixels[i + 3] = 0;
    }
  }

  await sharp(pixels, { raw: { width, height, channels } })
    .png()
    .toFile(outputPng);

  // Create 256x256 version for icon
  await sharp(pixels, { raw: { width, height, channels } })
    .resize(256, 256)
    .png()
    .toFile(outputIco);

  console.log('Logo processed: background removed, icon created.');
}

processLogo().catch(console.error);
