import sharp from 'sharp';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logoDir = join(__dirname, '../client/public/logo');

// Ensure output directory exists
if (!existsSync(logoDir)) {
  mkdirSync(logoDir, { recursive: true });
}

async function generateLogos() {
  console.log('Generating logos...\n');

  // Logo full (horizontal)
  const logoFull = readFileSync(join(logoDir, 'logo-full.svg'));
  await sharp(logoFull)
    .resize(800, 240)
    .png()
    .toFile(join(logoDir, 'logo-full.png'));
  console.log('✓ logo-full.png (800x240)');

  await sharp(logoFull)
    .resize(400, 120)
    .png()
    .toFile(join(logoDir, 'logo-full-small.png'));
  console.log('✓ logo-full-small.png (400x120)');

  // Logo full dark
  const logoFullDark = readFileSync(join(logoDir, 'logo-full-dark.svg'));
  await sharp(logoFullDark)
    .resize(800, 240)
    .png()
    .toFile(join(logoDir, 'logo-full-dark.png'));
  console.log('✓ logo-full-dark.png (800x240)');

  await sharp(logoFullDark)
    .resize(400, 120)
    .png()
    .toFile(join(logoDir, 'logo-full-dark-small.png'));
  console.log('✓ logo-full-dark-small.png (400x120)');

  // Logo stacked (vertical)
  const logoStacked = readFileSync(join(logoDir, 'logo-stacked.svg'));
  await sharp(logoStacked)
    .resize(400, 440)
    .png()
    .toFile(join(logoDir, 'logo-stacked.png'));
  console.log('✓ logo-stacked.png (400x440)');

  await sharp(logoStacked)
    .resize(200, 220)
    .png()
    .toFile(join(logoDir, 'logo-stacked-small.png'));
  console.log('✓ logo-stacked-small.png (200x220)');

  // Logo icon
  const logoIcon = readFileSync(join(logoDir, 'logo-icon.svg'));
  await sharp(logoIcon)
    .resize(512, 512)
    .png()
    .toFile(join(logoDir, 'logo-icon-512.png'));
  console.log('✓ logo-icon-512.png (512x512)');

  await sharp(logoIcon)
    .resize(256, 256)
    .png()
    .toFile(join(logoDir, 'logo-icon-256.png'));
  console.log('✓ logo-icon-256.png (256x256)');

  await sharp(logoIcon)
    .resize(128, 128)
    .png()
    .toFile(join(logoDir, 'logo-icon-128.png'));
  console.log('✓ logo-icon-128.png (128x128)');

  console.log('\n✅ All logos generated successfully!');
}

generateLogos().catch(console.error);
