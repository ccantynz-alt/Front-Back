/**
 * Generate PNG icons, favicons, and OG images from SVG sources.
 * Uses @resvg/resvg-js for high-quality SVG→PNG rendering.
 *
 * Usage: bun run scripts/generate-icons.ts
 */

import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const PUBLIC_DIR = join(import.meta.dir, "../apps/web/public");

interface IconConfig {
  source: string;
  output: string;
  width: number;
  height?: number;
}

const icons: IconConfig[] = [
  // Favicons
  { source: "logo-icon.svg", output: "favicon-16x16.png", width: 16 },
  { source: "logo-icon.svg", output: "favicon-32x32.png", width: 32 },
  { source: "logo-icon.svg", output: "favicon-48x48.png", width: 48 },

  // Apple Touch Icon
  { source: "logo-icon.svg", output: "apple-touch-icon.png", width: 180 },

  // Standard icon sizes
  { source: "logo-icon.svg", output: "icon-192.png", width: 192 },
  { source: "logo-icon.svg", output: "icon-512.png", width: 512 },

  // OG Image (1200x630)
  { source: "og-image.svg", output: "og-image.png", width: 1200, height: 630 },

  // Full logo PNGs
  { source: "logo-full.svg", output: "logo-full.png", width: 1200, height: 300 },
  { source: "logo-full.svg", output: "logo-full-2x.png", width: 2400, height: 600 },
];

function renderSvgToPng(svgPath: string, width: number, height?: number): Buffer {
  const svgContent = readFileSync(svgPath, "utf-8");

  const opts: any = {
    fitTo: height
      ? { mode: "width" as const, value: width }
      : { mode: "width" as const, value: width },
    font: {
      loadSystemFonts: true,
    },
    logLevel: "off",
  };

  const resvg = new Resvg(svgContent, opts);
  const rendered = resvg.render();
  return Buffer.from(rendered.asPng());
}

console.log("Generating icon assets...\n");

let success = 0;
let failed = 0;

for (const icon of icons) {
  const sourcePath = join(PUBLIC_DIR, icon.source);
  const outputPath = join(PUBLIC_DIR, icon.output);

  try {
    const png = renderSvgToPng(sourcePath, icon.width, icon.height);
    writeFileSync(outputPath, png);
    const sizeKB = (png.length / 1024).toFixed(1);
    console.log(`  ✅ ${icon.output} (${icon.width}${icon.height ? `x${icon.height}` : "px"}) — ${sizeKB} KB`);
    success++;
  } catch (err) {
    console.error(`  ❌ ${icon.output}: ${(err as Error).message}`);
    failed++;
  }
}

// Generate a simple ICO file (contains 16x16 and 32x32 PNGs)
// ICO format: header + directory entries + PNG data
function generateIco(pngPaths: { path: string; size: number }[]): Buffer {
  const pngBuffers = pngPaths.map(({ path: p }) => readFileSync(join(PUBLIC_DIR, p)));

  // ICO header: 3 x uint16 = 6 bytes
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = dirEntrySize * pngBuffers.length;
  let dataOffset = headerSize + dirSize;

  const totalSize = dataOffset + pngBuffers.reduce((sum, b) => sum + b.length, 0);
  const ico = Buffer.alloc(totalSize);

  // Header
  ico.writeUInt16LE(0, 0); // reserved
  ico.writeUInt16LE(1, 2); // type: 1 = ICO
  ico.writeUInt16LE(pngBuffers.length, 4); // count

  // Directory entries
  for (let i = 0; i < pngBuffers.length; i++) {
    const size = pngPaths[i].size;
    const offset = headerSize + i * dirEntrySize;
    ico.writeUInt8(size >= 256 ? 0 : size, offset); // width (0 = 256)
    ico.writeUInt8(size >= 256 ? 0 : size, offset + 1); // height
    ico.writeUInt8(0, offset + 2); // color palette
    ico.writeUInt8(0, offset + 3); // reserved
    ico.writeUInt16LE(1, offset + 4); // color planes
    ico.writeUInt16LE(32, offset + 6); // bits per pixel
    ico.writeUInt32LE(pngBuffers[i].length, offset + 8); // data size
    ico.writeUInt32LE(dataOffset, offset + 12); // data offset
    dataOffset += pngBuffers[i].length;
  }

  // PNG data
  let writeOffset = headerSize + dirSize;
  for (const buf of pngBuffers) {
    buf.copy(ico, writeOffset);
    writeOffset += buf.length;
  }

  return ico;
}

try {
  const ico = generateIco([
    { path: "favicon-16x16.png", size: 16 },
    { path: "favicon-32x32.png", size: 32 },
    { path: "favicon-48x48.png", size: 48 },
  ]);
  writeFileSync(join(PUBLIC_DIR, "favicon.ico"), ico);
  const sizeKB = (ico.length / 1024).toFixed(1);
  console.log(`  ✅ favicon.ico (multi-size) — ${sizeKB} KB`);
  success++;
} catch (err) {
  console.error(`  ❌ favicon.ico: ${(err as Error).message}`);
  failed++;
}

console.log(`\nDone! ${success} generated, ${failed} failed.`);

if (failed > 0) {
  process.exit(1);
}
