#!/usr/bin/env node
/**
 * split-image.mjs
 *
 * Splits a PNG image into a grid of sub-images.
 * Supports configuring by rows/cols or by tile width/height.
 *
 * Uses only Node.js built-in modules (no native deps).
 *
 * Usage:
 *   # Split by rows & cols
 *   node tools/split-image.mjs -i input.png --rows 4 --cols 4
 *
 *   # Split by tile width & height
 *   node tools/split-image.mjs -i input.png --width 64 --height 64
 *
 *   # Mix: cols + height (rows/width auto-calculated)
 *   node tools/split-image.mjs -i input.png --cols 4 --height 64
 *
 *   # Custom output directory
 *   node tools/split-image.mjs -i input.png --rows 2 --cols 3 -o ./out
 *
 * Options:
 *   -i, --input    Input PNG file path (required)
 *   -o, --output   Output directory (default: <input_basename>_split)
 *   --rows         Number of rows to split into
 *   --cols         Number of columns to split into
 *   --width        Tile width in pixels
 *   --height       Tile height in pixels
 *   --prefix       Filename prefix for tiles (default: "tile")
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { inflateSync, deflateSync } from 'zlib';
import { basename, dirname, extname, resolve } from 'path';

// ── CLI Argument Parsing ─────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '-i':
      case '--input':
        args.input = argv[++i];
        break;
      case '-o':
      case '--output':
        args.output = argv[++i];
        break;
      case '--rows':
        args.rows = Number(argv[++i]);
        break;
      case '--cols':
        args.cols = Number(argv[++i]);
        break;
      case '--width':
        args.width = Number(argv[++i]);
        break;
      case '--height':
        args.height = Number(argv[++i]);
        break;
      case '--prefix':
        args.prefix = argv[++i];
        break;
      case '-h':
      case '--help':
        args.help = true;
        break;
      default:
        // If no flag yet and looks like a file, treat as input
        if (!args.input && !arg.startsWith('-')) {
          args.input = arg;
        } else {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
    }
  }
  return args;
}

function printUsage() {
  console.log(`
Usage: node tools/split-image.mjs -i <input.png> [options]

Options:
  -i, --input    Input PNG file path (required)
  -o, --output   Output directory (default: <input_basename>_split)
  --rows         Number of rows to split into
  --cols         Number of columns to split into
  --width        Tile width in pixels
  --height       Tile height in pixels
  --prefix       Filename prefix for tiles (default: "tile")
  -h, --help     Show this help message

Examples:
  node tools/split-image.mjs -i spritesheet.png --rows 4 --cols 4
  node tools/split-image.mjs -i tileset.png --width 32 --height 32
  node tools/split-image.mjs -i atlas.png --cols 8 --height 64 -o ./tiles
`);
}

// ── Minimal PNG Decoder (RGBA output) ────────────────────

/**
 * Decode a PNG file buffer into { width, height, channels, pixels }.
 * pixels is a Uint8Array in RGBA format (4 bytes per pixel).
 * Supports colour types: greyscale(0), RGB(2), indexed(3), grey+alpha(4), RGBA(6).
 * Supports bit depth 8 only.
 */
function decodePNG(buf) {
  // Verify PNG signature
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== SIG[i]) throw new Error('Not a valid PNG file');
  }

  let offset = 8;
  let width = 0,
    height = 0,
    bitDepth = 0,
    colourType = 0;
  const idatChunks = [];
  let palette = null; // for indexed colour
  let trns = null; // transparency info

  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    offset += 8 + length + 4; // skip CRC

    switch (type) {
      case 'IHDR':
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        bitDepth = data[8];
        colourType = data[9];
        if (bitDepth !== 8) {
          throw new Error(`Unsupported bit depth: ${bitDepth} (only 8 is supported)`);
        }
        break;
      case 'PLTE':
        palette = data;
        break;
      case 'tRNS':
        trns = data;
        break;
      case 'IDAT':
        idatChunks.push(data);
        break;
      case 'IEND':
        break;
    }
  }

  if (width === 0 || height === 0) {
    throw new Error('Missing IHDR chunk');
  }

  // Determine bytes per pixel in the raw scanline
  let bpp; // bytes per pixel in the filtered data
  switch (colourType) {
    case 0:
      bpp = 1;
      break; // greyscale
    case 2:
      bpp = 3;
      break; // RGB
    case 3:
      bpp = 1;
      break; // indexed
    case 4:
      bpp = 2;
      break; // grey + alpha
    case 6:
      bpp = 4;
      break; // RGBA
    default:
      throw new Error(`Unsupported colour type: ${colourType}`);
  }

  // Decompress IDAT
  const compressed = Buffer.concat(idatChunks);
  const raw = inflateSync(compressed);

  const rowBytes = width * bpp;
  const pixels = new Uint8Array(width * height * 4); // output RGBA

  // Reconstruct filtered rows
  const prevRow = new Uint8Array(rowBytes); // all zeros for the first row
  const curRow = new Uint8Array(rowBytes);

  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + rowBytes);
    const filterType = raw[rowStart];

    // Copy raw row data
    for (let i = 0; i < rowBytes; i++) {
      curRow[i] = raw[rowStart + 1 + i];
    }

    // Apply un-filter
    for (let i = 0; i < rowBytes; i++) {
      const a = i >= bpp ? curRow[i - bpp] : 0; // left
      const b = prevRow[i]; // up
      const c = i >= bpp ? prevRow[i - bpp] : 0; // upper-left

      switch (filterType) {
        case 0: // None
          break;
        case 1: // Sub
          curRow[i] = (curRow[i] + a) & 0xff;
          break;
        case 2: // Up
          curRow[i] = (curRow[i] + b) & 0xff;
          break;
        case 3: // Average
          curRow[i] = (curRow[i] + ((a + b) >>> 1)) & 0xff;
          break;
        case 4: // Paeth
          curRow[i] = (curRow[i] + paethPredictor(a, b, c)) & 0xff;
          break;
        default:
          throw new Error(`Unknown row filter type: ${filterType}`);
      }
    }

    // Convert to RGBA
    for (let x = 0; x < width; x++) {
      const dstIdx = (y * width + x) * 4;
      switch (colourType) {
        case 0: {
          // greyscale
          const g = curRow[x];
          pixels[dstIdx] = g;
          pixels[dstIdx + 1] = g;
          pixels[dstIdx + 2] = g;
          pixels[dstIdx + 3] = trns && g === trns.readUInt16BE(0) ? 0 : 255;
          break;
        }
        case 2: {
          // RGB
          const si = x * 3;
          pixels[dstIdx] = curRow[si];
          pixels[dstIdx + 1] = curRow[si + 1];
          pixels[dstIdx + 2] = curRow[si + 2];
          pixels[dstIdx + 3] = 255;
          if (
            trns &&
            curRow[si] === trns.readUInt16BE(0) &&
            curRow[si + 1] === trns.readUInt16BE(2) &&
            curRow[si + 2] === trns.readUInt16BE(4)
          ) {
            pixels[dstIdx + 3] = 0;
          }
          break;
        }
        case 3: {
          // indexed
          const idx = curRow[x];
          if (!palette) throw new Error('Missing PLTE chunk for indexed PNG');
          pixels[dstIdx] = palette[idx * 3];
          pixels[dstIdx + 1] = palette[idx * 3 + 1];
          pixels[dstIdx + 2] = palette[idx * 3 + 2];
          pixels[dstIdx + 3] = trns && idx < trns.length ? trns[idx] : 255;
          break;
        }
        case 4: {
          // grey + alpha
          const si4 = x * 2;
          const g4 = curRow[si4];
          pixels[dstIdx] = g4;
          pixels[dstIdx + 1] = g4;
          pixels[dstIdx + 2] = g4;
          pixels[dstIdx + 3] = curRow[si4 + 1];
          break;
        }
        case 6: {
          // RGBA
          const si6 = x * 4;
          pixels[dstIdx] = curRow[si6];
          pixels[dstIdx + 1] = curRow[si6 + 1];
          pixels[dstIdx + 2] = curRow[si6 + 2];
          pixels[dstIdx + 3] = curRow[si6 + 3];
          break;
        }
      }
    }

    // Save current row as previous
    prevRow.set(curRow);
  }

  return { width, height, pixels };
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

// ── Minimal PNG Encoder (RGBA) ───────────────────────────

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

/**
 * Encode RGBA pixels into a PNG buffer.
 * @param {Uint8Array} pixels - RGBA pixel data (4 bytes per pixel)
 * @param {number} w - width
 * @param {number} h - height
 * @returns {Buffer} PNG file buffer
 */
function encodePNG(pixels, w, h) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT: filter byte (0 = None) + row data
  const rowDataLen = w * 4;
  const rawRows = Buffer.alloc(h * (1 + rowDataLen));
  for (let y = 0; y < h; y++) {
    const rowOff = y * (1 + rowDataLen);
    rawRows[rowOff] = 0; // filter: None
    const srcOff = y * rowDataLen;
    for (let i = 0; i < rowDataLen; i++) {
      rawRows[rowOff + 1 + i] = pixels[srcOff + i];
    }
  }
  const compressed = deflateSync(rawRows);

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Sub-image Extraction ─────────────────────────────────

/**
 * Extract a rectangular region from RGBA pixel data.
 * @param {Uint8Array} srcPixels - source RGBA pixels
 * @param {number} srcW - source image width
 * @param {number} x - region top-left x
 * @param {number} y - region top-left y
 * @param {number} w - region width
 * @param {number} h - region height
 * @returns {Uint8Array} extracted RGBA pixels
 */
function extractRegion(srcPixels, srcW, x, y, w, h) {
  const dst = new Uint8Array(w * h * 4);
  for (let row = 0; row < h; row++) {
    const srcOff = ((y + row) * srcW + x) * 4;
    const dstOff = row * w * 4;
    for (let col = 0; col < w * 4; col++) {
      dst[dstOff + col] = srcPixels[srcOff + col];
    }
  }
  return dst;
}

// ── Main ─────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  if (!args.input) {
    console.error('Error: input file is required. Use -i <file.png>');
    printUsage();
    process.exit(1);
  }

  // Read and decode source PNG
  const inputPath = resolve(args.input);
  const inputBuf = readFileSync(inputPath);
  const img = decodePNG(inputBuf);

  console.log(`Input: ${inputPath} (${img.width}×${img.height})`);

  // Determine tile dimensions
  let tileW, tileH, cols, rows;

  if (args.width && args.cols) {
    tileW = args.width;
    cols = args.cols;
  } else if (args.width) {
    tileW = args.width;
    cols = Math.ceil(img.width / tileW);
  } else if (args.cols) {
    cols = args.cols;
    tileW = Math.floor(img.width / cols);
  } else {
    console.error('Error: must specify at least --cols or --width');
    process.exit(1);
  }

  if (args.height && args.rows) {
    tileH = args.height;
    rows = args.rows;
  } else if (args.height) {
    tileH = args.height;
    rows = Math.ceil(img.height / tileH);
  } else if (args.rows) {
    rows = args.rows;
    tileH = Math.floor(img.height / rows);
  } else {
    console.error('Error: must specify at least --rows or --height');
    process.exit(1);
  }

  console.log(`Splitting into ${rows} rows × ${cols} cols (tile: ${tileW}×${tileH})`);

  // Determine output directory
  const inputBase = basename(inputPath, extname(inputPath));
  const outDir = args.output
    ? resolve(args.output)
    : resolve(dirname(inputPath), `${inputBase}_split`);
  mkdirSync(outDir, { recursive: true });

  const prefix = args.prefix || 'tile';
  const padR = String(rows - 1).length;
  const padC = String(cols - 1).length;
  let count = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * tileW;
      const y = r * tileH;

      // Clamp to image bounds
      const w = Math.min(tileW, img.width - x);
      const h = Math.min(tileH, img.height - y);

      if (w <= 0 || h <= 0) continue;

      const tilePixels = extractRegion(img.pixels, img.width, x, y, w, h);
      const tilePng = encodePNG(tilePixels, w, h);

      const rStr = String(r).padStart(padR, '0');
      const cStr = String(c).padStart(padC, '0');
      const fileName = `${prefix}_r${rStr}_c${cStr}.png`;
      writeFileSync(resolve(outDir, fileName), tilePng);
      count++;
    }
  }

  console.log(`✅ Generated ${count} tiles in ${outDir}`);
}

main();
