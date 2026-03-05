/**
 * TileMapConfig — 8-neighbor mask → tileIndex 映射配置
 *
 * bit 顺序约定（顺时针，从上方开始，固定，不可更改）：
 *   bit0 = T   (1)    上
 *   bit1 = TR  (2)    右上
 *   bit2 = R   (4)    右
 *   bit3 = BR  (8)    右下
 *   bit4 = B   (16)   下
 *   bit5 = BL  (32)   左下
 *   bit6 = L   (64)   左
 *   bit7 = TL  (128)  左上
 *
 * 8-bit mask 共 256 种组合，映射到 16 张 tileset（0–15）。
 * 对角线遮罩规则：对角位仅在两个相邻基数方向均 occupied 时才生效。
 *
 * 零 Cocos 依赖。
 */

/** Bit flags for 8-directional neighbor mask (clockwise from top). */
export const BIT = {
  T: 1,
  TR: 2,
  R: 4,
  BR: 8,
  B: 16,
  BL: 32,
  L: 64,
  TL: 128,
} as const;

/** All 256 mask values (0–255). */
export type MaskValue = number;

/**
 * Configuration for mask → tile index mapping.
 * Keys are 8-bit neighbor masks (0–255), values are tile indices (0–15).
 */
export interface TileMapConfig {
  /** Maps an 8-bit neighbour mask to a tile index in the spritesheet. */
  maskTable: Record<number, number>;
}

/**
 * Canonical 8-bit masks for each of the 16 tile patterns.
 * Defined in docs/bit_mask.md.
 *
 * 3×3 grid → bit mapping:
 *   TL(128) T(1)  TR(2)
 *   L(64)   x     R(4)
 *   BL(32)  B(16) BR(8)
 */
export const CANONICAL_MASKS: Record<number, number> = {
  0: 0, // isolated
  1: 255, // full interior
  2: 124, // top edge      (L+R+B+BL+BR)
  3: 31, // left edge     (T+TR+R+BR+B)
  4: 199, // bottom edge   (T+R+L+TL+TR)
  5: 241, // right edge    (T+B+BL+L+TL)
  6: 127, // inner corner TL (all except TL)
  7: 223, // inner corner BL (all except BL)
  8: 247, // inner corner BR (all except BR)
  9: 253, // inner corner TR (all except TR)
  10: 28, // outer corner BR (R+BR+B)
  11: 7, // outer corner TR (T+TR+R)
  12: 193, // outer corner TL (L+TL+T)
  13: 112, // outer corner BL (B+BL+L)
  14: 119, // double inner TL+BR missing
  15: 221, // double inner TR+BL missing
};

/**
 * Apply diagonal masking: zero out each diagonal bit unless both adjacent
 * cardinal neighbors are present.
 */
export function applyDiagonalMask(raw: number): number {
  let m = raw;
  if (!(m & BIT.T) || !(m & BIT.R)) m &= ~BIT.TR;
  if (!(m & BIT.R) || !(m & BIT.B)) m &= ~BIT.BR;
  if (!(m & BIT.B) || !(m & BIT.L)) m &= ~BIT.BL;
  if (!(m & BIT.T) || !(m & BIT.L)) m &= ~BIT.TL;
  return m;
}

/**
 * Map an effective (diagonal-masked) 8-bit mask to a tile index (0–15).
 */
function effectiveToTile(mask: number): number {
  const t = (mask & BIT.T) !== 0;
  const r = (mask & BIT.R) !== 0;
  const b = (mask & BIT.B) !== 0;
  const l = (mask & BIT.L) !== 0;
  const tl = (mask & BIT.TL) !== 0;
  const tr = (mask & BIT.TR) !== 0;
  const bl = (mask & BIT.BL) !== 0;
  const br = (mask & BIT.BR) !== 0;

  const cards = +t + +r + +b + +l;

  switch (cards) {
    case 0:
      return 0;
    case 1:
      return 0;
    case 2:
      if (t && r) return 11;
      if (r && b) return 10;
      if (b && l) return 13;
      if (t && l) return 12;
      return 0; // opposite cardinals
    case 3:
      if (!t) return 2;
      if (!l) return 3;
      if (!b) return 4;
      if (!r) return 5;
      return 0;
    case 4: {
      const diags = +tl + +tr + +bl + +br;
      if (diags === 4) return 1;
      if (diags === 3) {
        if (!tl) return 6;
        if (!bl) return 7;
        if (!br) return 8;
        if (!tr) return 9;
      }
      if (diags === 2) {
        if (!tl && !br) return 14;
        if (!tr && !bl) return 15;
      }
      return 1; // fallback for rare diagonal combos with 4 cardinals
    }
    default:
      return 0;
  }
}

/**
 * Build the default 256-entry mask table.
 * For each raw 8-bit mask (0–255):
 *   1. Apply diagonal masking
 *   2. Map effective mask to tile index (0–15)
 */
export function createDefaultMaskTable(): Record<number, number> {
  const table: Record<number, number> = {};
  for (let raw = 0; raw < 256; raw++) {
    const effective = applyDiagonalMask(raw);
    table[raw] = effectiveToTile(effective);
  }
  return table;
}

/** Convenience: build a TileMapConfig with the default 256-entry table. */
export function createDefaultConfig(): TileMapConfig {
  return { maskTable: createDefaultMaskTable() };
}

/**
 * Human-readable description of each tile index.
 * Useful for debug overlays and documentation.
 */
export const MASK_DESCRIPTIONS: Record<number, string> = {
  0: 'isolated',
  1: 'full interior',
  2: 'top edge',
  3: 'left edge',
  4: 'bottom edge',
  5: 'right edge',
  6: 'inner corner TL',
  7: 'inner corner BL',
  8: 'inner corner BR',
  9: 'inner corner TR',
  10: 'outer corner BR',
  11: 'outer corner TR',
  12: 'outer corner TL',
  13: 'outer corner BL',
  14: 'double inner TL+BR',
  15: 'double inner TR+BL',
};
