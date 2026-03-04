/**
 * TileMapConfig — mask→tileIndex 映射配置
 *
 * bit 顺序约定（固定，不可更改）：
 *   bit0 = Up      (1)
 *   bit1 = Right    (2)
 *   bit2 = Down     (4)
 *   bit3 = Left     (8)
 *
 * 4-bit mask 共 16 种组合 (0–15)，天然匹配 16 张 tileset。
 *
 * 零 Cocos 依赖。
 */

/** Bit flags for the 4-directional mask. */
export const BIT = {
  UP: 1,
  RIGHT: 2,
  DOWN: 4,
  LEFT: 8,
} as const;

/** All 16 mask values (0–15). */
export type MaskValue = number;

/**
 * Configuration for mask → tile index mapping.
 * Keys and values are both in range [0, 15].
 */
export interface TileMapConfig {
  /** Maps a 4-bit neighbour mask to a tile index in the spritesheet. */
  maskTable: Record<number, number>;
}

/**
 * Default identity mapping: tileIndex === mask.
 * Works when the tileset is arranged in mask order (0–15).
 */
export function createDefaultMaskTable(): Record<number, number> {
  const table: Record<number, number> = {};
  for (let i = 0; i < 16; i++) {
    table[i] = i;
  }
  return table;
}

/** Convenience: build a TileMapConfig with the default identity table. */
export function createDefaultConfig(): TileMapConfig {
  return { maskTable: createDefaultMaskTable() };
}

/**
 * Human-readable description of what each mask means.
 * Useful for debug overlays and documentation.
 */
export const MASK_DESCRIPTIONS: Record<number, string> = {
  0: 'isolated',
  1: 'U',
  2: 'R',
  3: 'U+R',
  4: 'D',
  5: 'U+D',
  6: 'R+D',
  7: 'U+R+D',
  8: 'L',
  9: 'U+L',
  10: 'R+L',
  11: 'U+R+L',
  12: 'D+L',
  13: 'U+D+L',
  14: 'R+D+L',
  15: 'U+R+D+L (full)',
};
