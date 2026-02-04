import sharp from 'sharp';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const inputSvg = join(__dirname, '../client/public/icons/icon.svg');
const outputDir = join(__dirname, '../client/public/icons');

// Ensure output directory exists
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

// Read SVG file
const svgBuffer = readFileSync(inputSvg);

// Generate icons for each size
async function generateIcons() {
  console.log('Generating PWA icons...');

  for (const size of sizes) {
    const outputPath = join(outputDir, `icon-${size}x${size}.png`);

    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);

    console.log(`✓ Generated ${size}x${size} icon`);
  }

  // Generate Apple Touch Icon (180x180)
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(join(__dirname, '../client/public/apple-touch-icon.png'));
  console.log('✓ Generated Apple Touch Icon (180x180)');

  // Generate favicon (32x32)
  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(join(__dirname, '../client/public/favicon-32x32.png'));
  console.log('✓ Generated Favicon 32x32');

  // Generate favicon (16x16)
  await sharp(svgBuffer)
    .resize(16, 16)
    .png()
    .toFile(join(__dirname, '../client/public/favicon-16x16.png'));
  console.log('✓ Generated Favicon 16x16');

  console.log('\nAll icons generated successfully!');
}

generateIcons().catch(console.error);
