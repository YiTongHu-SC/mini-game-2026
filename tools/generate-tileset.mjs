#!/usr/bin/env node
/**
 * generate-tileset.mjs
 *
 * Generates a 640×40 placeholder tileset PNG (16 tiles × 40px each).
 * Each tile represents one of 16 canonical 8-neighbor patterns
 * defined in docs/bit_mask.md.
 *
 * Tile visual:
 *   - Grey (#888) fill for occupied area
 *   - 3×3 dot grid showing neighbor pattern:
 *     Green (#4a4) dot = neighbor present
 *     Red   (#a44) dot = neighbor absent
 *     White dot   = center cell (self)
 *   - White text showing tile index
 *
 * Uses only Node.js built-in modules (no native deps).
 *
 * Usage:
 *   node tools/generate-tileset.mjs
 *   → outputs assets/textures/tileset-placeholder.png
 */

import { writeFileSync, mkdirSync } from 'fs';
import { deflateSync } from 'zlib';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TILE = 40;
const COLS = 16;
const W = TILE * COLS; // 640
const H = TILE; // 40
const BORDER = 3;

// Colours [R,G,B]
const BG = [0x66, 0x66, 0x66]; // dark grey background
const FILL = [0x88, 0x88, 0x88]; // occupied fill
const CONNECTED = [0x44, 0xaa, 0x44]; // green = connected side
const OPEN = [0xaa, 0x44, 0x44]; // red = open side

// Tiny 3×5 pixel font for digits 0-9 and letter A-F
// Each char is a 3-wide × 5-tall bitmap (15 bits packed)
const GLYPH = {
  0: [0b111, 0b101, 0b101, 0b101, 0b111],
  1: [0b010, 0b110, 0b010, 0b010, 0b111],
  2: [0b111, 0b001, 0b111, 0b100, 0b111],
  3: [0b111, 0b001, 0b111, 0b001, 0b111],
  4: [0b101, 0b101, 0b111, 0b001, 0b001],
  5: [0b111, 0b100, 0b111, 0b001, 0b111],
  6: [0b111, 0b100, 0b111, 0b101, 0b111],
  7: [0b111, 0b001, 0b010, 0b010, 0b010],
  8: [0b111, 0b101, 0b111, 0b101, 0b111],
  9: [0b111, 0b101, 0b111, 0b001, 0b111],
};

/**
 * Draw a character at (cx, cy) in the pixel buffer.
 */
function drawChar(pixels, imgW, cx, cy, ch, color) {
  const g = GLYPH[ch];
  if (!g) return;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      if (g[row] & (1 << (2 - col))) {
        setPixel(pixels, imgW, cx + col, cy + row, color);
      }
    }
  }
}

/**
 * Draw a number string at (cx, cy).
 */
function drawNumber(pixels, imgW, cx, cy, num, color) {
  const s = String(num);
  for (let i = 0; i < s.length; i++) {
    drawChar(pixels, imgW, cx + i * 4, cy, s[i], color);
  }
}

function setPixel(pixels, imgW, x, y, color) {
  if (x < 0 || x >= imgW || y < 0 || y >= H) return;
  const idx = (y * imgW + x) * 3;
  pixels[idx] = color[0];
  pixels[idx + 1] = color[1];
  pixels[idx + 2] = color[2];
}

function fillRect(pixels, imgW, x0, y0, w, h, color) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setPixel(pixels, imgW, x0 + dx, y0 + dy, color);
    }
  }
}

// 16 canonical 8-neighbor patterns from docs/bit_mask.md
// Each entry: [topRow, midRow, botRow] where 1 = neighbor present
const PATTERNS = [
  [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ], // 0: isolated
  [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
  ], // 1: full interior
  [
    [0, 0, 0],
    [1, 0, 1],
    [1, 1, 1],
  ], // 2: top edge
  [
    [0, 1, 1],
    [0, 0, 1],
    [0, 1, 1],
  ], // 3: left edge
  [
    [1, 1, 1],
    [1, 0, 1],
    [0, 0, 0],
  ], // 4: bottom edge
  [
    [1, 1, 0],
    [1, 0, 0],
    [1, 1, 0],
  ], // 5: right edge
  [
    [0, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
  ], // 6: inner corner TL
  [
    [1, 1, 1],
    [1, 0, 1],
    [0, 1, 1],
  ], // 7: inner corner BL
  [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 0],
  ], // 8: inner corner BR
  [
    [1, 1, 0],
    [1, 0, 1],
    [1, 1, 1],
  ], // 9: inner corner TR
  [
    [0, 0, 0],
    [0, 0, 1],
    [0, 1, 1],
  ], // 10: outer corner BR
  [
    [0, 1, 1],
    [0, 0, 1],
    [0, 0, 0],
  ], // 11: outer corner TR
  [
    [1, 1, 0],
    [1, 0, 0],
    [0, 0, 0],
  ], // 12: outer corner TL
  [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
  ], // 13: outer corner BL
  [
    [0, 1, 1],
    [1, 0, 1],
    [1, 1, 0],
  ], // 14: double inner TL+BR
  [
    [1, 1, 0],
    [1, 0, 1],
    [0, 1, 1],
  ], // 15: double inner TR+BL
];

const DOT_SIZE = 5; // pixel size of each dot in 3×3 grid
const WHITE = [0xff, 0xff, 0xff];

function generateTileset() {
  const pixels = new Uint8Array(W * H * 3);

  // Background fill
  fillRect(pixels, W, 0, 0, W, H, BG);

  for (let tileIdx = 0; tileIdx < 16; tileIdx++) {
    const ox = tileIdx * TILE; // tile origin x
    const pattern = PATTERNS[tileIdx];

    // Fill interior with grey
    fillRect(pixels, W, ox + BORDER, BORDER, TILE - BORDER * 2, TILE - BORDER * 2, FILL);

    // Draw 3×3 dot grid showing the neighbor pattern
    // Grid layout (screen coordinates, y-down):
    //   row 0: TL T TR  (top of tile = y+1 in game coords)
    //   row 1: L  x R
    //   row 2: BL B BR  (bottom of tile = y-1 in game coords)
    const gridStartX = ox + Math.floor((TILE - 3 * DOT_SIZE - 2 * 2) / 2);
    const gridStartY = 4; // top padding

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const dx = gridStartX + col * (DOT_SIZE + 2);
        const dy = gridStartY + row * (DOT_SIZE + 2);

        if (row === 1 && col === 1) {
          // Center cell (self) — always white
          fillRect(pixels, W, dx, dy, DOT_SIZE, DOT_SIZE, WHITE);
        } else {
          const isPresent = pattern[row][col] === 1;
          fillRect(pixels, W, dx, dy, DOT_SIZE, DOT_SIZE, isPresent ? CONNECTED : OPEN);
        }
      }
    }

    // Draw tile index number below the dot grid
    const numStr = String(tileIdx);
    const textW = numStr.length * 4 - 1;
    const tx = ox + Math.floor((TILE - textW) / 2);
    const ty = TILE - 7; // near bottom
    drawNumber(pixels, W, tx, ty, tileIdx, WHITE);
  }

  return pixels;
}

// ── Minimal PNG encoder (RGB, no alpha) ──────────────────

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length);
  const payload = Buffer.concat([typeBytes, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(payload));
  return Buffer.concat([lenBuf, payload, crcBuf]);
}

function encodePNG(pixels, w, h) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT: filter byte (0 = None) + row data
  const rawRows = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const rowOff = y * (1 + w * 3);
    rawRows[rowOff] = 0; // filter: None
    pixels.copy
      ? pixels.copy(rawRows, rowOff + 1, y * w * 3, (y + 1) * w * 3)
      : rawRows.set(pixels.subarray(y * w * 3, (y + 1) * w * 3), rowOff + 1);
  }
  const compressed = deflateSync(Buffer.from(rawRows));

  // IEND
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', iend),
  ]);
}

// ── Helpers ──────────────────────────────────────

/**
 * Extract a single tile's TILE×TILE pixels from the full strip.
 */
function extractTile(allPixels, tileIdx) {
  const tilePixels = new Uint8Array(TILE * TILE * 3);
  const ox = tileIdx * TILE;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const srcIdx = (y * W + ox + x) * 3;
      const dstIdx = (y * TILE + x) * 3;
      tilePixels[dstIdx] = allPixels[srcIdx];
      tilePixels[dstIdx + 1] = allPixels[srcIdx + 1];
      tilePixels[dstIdx + 2] = allPixels[srcIdx + 2];
    }
  }
  return tilePixels;
}

// ── Main ──────────────────────────────────────────

const pixels = generateTileset();
const png = encodePNG(pixels, W, H);

const outDir = resolve(__dirname, '..', 'assets', 'textures');
const tilesDir = resolve(outDir, 'tileset-tiles');
mkdirSync(outDir, { recursive: true });
mkdirSync(tilesDir, { recursive: true });

// 1. Full strip (for SpriteEditor slicing)
const outPath = resolve(outDir, 'tileset-placeholder.png');
writeFileSync(outPath, png);
console.log(`✅ Generated ${outPath}  (${W}×${H}, ${png.length} bytes)`);

// 2. Individual tiles tile-00.png … tile-15.png (drag-and-drop friendly)
for (let tileIdx = 0; tileIdx < 16; tileIdx++) {
  const tilePixels = extractTile(pixels, tileIdx);
  const tilePng = encodePNG(tilePixels, TILE, TILE);
  const name = `tile-${String(tileIdx).padStart(2, '0')}.png`;
  writeFileSync(resolve(tilesDir, name), tilePng);
}
console.log(`✅ Generated ${tilesDir}/tile-00.png … tile-15.png  (${TILE}×${TILE} each)`);
