#!/usr/bin/env node
/**
 * generate-tileset.mjs
 *
 * Generates a 640×40 placeholder tileset PNG (16 tiles × 40px each).
 * Each tile represents a 4-bit mask:
 *   bit0 = Up(1), bit1 = Right(2), bit2 = Down(4), bit3 = Left(8)
 *
 * Tile visual:
 *   - Grey (#888) fill for occupied area
 *   - Green (#4a4) border on "connected" sides (neighbour present)
 *   - Red   (#a44) border on "open" sides (no neighbour)
 *   - White text showing mask number (approximated with pixel font)
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

function generateTileset() {
  const pixels = new Uint8Array(W * H * 3);

  // Background fill
  fillRect(pixels, W, 0, 0, W, H, BG);

  for (let mask = 0; mask < 16; mask++) {
    const ox = mask * TILE; // tile origin x

    // Fill interior
    fillRect(pixels, W, ox + BORDER, BORDER, TILE - BORDER * 2, TILE - BORDER * 2, FILL);

    const up = !!(mask & 1);
    const right = !!(mask & 2);
    const down = !!(mask & 4);
    const left = !!(mask & 8);

    // Top border
    fillRect(pixels, W, ox, 0, TILE, BORDER, up ? CONNECTED : OPEN);
    // Right border
    fillRect(pixels, W, ox + TILE - BORDER, 0, BORDER, TILE, right ? CONNECTED : OPEN);
    // Bottom border
    fillRect(pixels, W, ox, TILE - BORDER, TILE, BORDER, down ? CONNECTED : OPEN);
    // Left border
    fillRect(pixels, W, ox, 0, BORDER, TILE, left ? CONNECTED : OPEN);

    // Draw mask number in center (white)
    const numStr = String(mask);
    const textW = numStr.length * 4 - 1; // 3px char + 1px gap
    const tx = ox + Math.floor((TILE - textW) / 2);
    const ty = Math.floor((TILE - 5) / 2);
    drawNumber(pixels, W, tx, ty, mask, [0xff, 0xff, 0xff]);
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

// ── Main ──────────────────────────────────────────

const pixels = generateTileset();
const png = encodePNG(pixels, W, H);

const outDir = resolve(__dirname, '..', 'assets', 'textures');
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, 'tileset-placeholder.png');
writeFileSync(outPath, png);

console.log(`✅ Generated ${outPath}  (${W}×${H}, ${png.length} bytes)`);
