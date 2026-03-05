import { OccupancyGrid } from '../../assets/scripts/tile-map/OccupancyGrid';
import { AutoTileResolver } from '../../assets/scripts/tile-map/AutoTileResolver';
import {
  BIT,
  CANONICAL_MASKS,
  applyDiagonalMask,
  createDefaultConfig,
  createDefaultMaskTable,
} from '../../assets/scripts/tile-map/TileMapConfig';

/**
 * Helper: set the 8 neighbors of (cx, cy) according to a 3×3 pattern.
 * pattern is [topRow, midRow, botRow] where each row is [left, center, right].
 * center values are ignored (that's the cell itself).
 *
 * Grid layout (y-up coordinate):
 *   topRow = y+1:  TL  T  TR
 *   midRow = y  :  L   x  R
 *   botRow = y-1:  BL  B  BR
 */
function setNeighborPattern(g: OccupancyGrid, cx: number, cy: number, pattern: number[][]): void {
  const [top, mid, bot] = pattern;
  // Top row (y+1)
  if (top[0]) g.setCell(cx - 1, cy + 1, 1); // TL
  if (top[1]) g.setCell(cx, cy + 1, 1); // T
  if (top[2]) g.setCell(cx + 1, cy + 1, 1); // TR
  // Mid row (y)
  if (mid[0]) g.setCell(cx - 1, cy, 1); // L
  // mid[1] is self — set occupied
  g.setCell(cx, cy, 1);
  if (mid[2]) g.setCell(cx + 1, cy, 1); // R
  // Bot row (y-1)
  if (bot[0]) g.setCell(cx - 1, cy - 1, 1); // BL
  if (bot[1]) g.setCell(cx, cy - 1, 1); // B
  if (bot[2]) g.setCell(cx + 1, cy - 1, 1); // BR
}

/**
 * The 16 canonical patterns from docs/bit_mask.md.
 * Each entry: [tileIndex, [topRow, midRow, botRow]].
 */
const PATTERNS: [number, number[][]][] = [
  [
    0,
    [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ],
  ], // isolated
  [
    1,
    [
      [1, 1, 1],
      [1, 0, 1],
      [1, 1, 1],
    ],
  ], // full interior
  [
    2,
    [
      [0, 0, 0],
      [1, 0, 1],
      [1, 1, 1],
    ],
  ], // top edge
  [
    3,
    [
      [0, 1, 1],
      [0, 0, 1],
      [0, 1, 1],
    ],
  ], // left edge
  [
    4,
    [
      [1, 1, 1],
      [1, 0, 1],
      [0, 0, 0],
    ],
  ], // bottom edge
  [
    5,
    [
      [1, 1, 0],
      [1, 0, 0],
      [1, 1, 0],
    ],
  ], // right edge
  [
    6,
    [
      [0, 1, 1],
      [1, 0, 1],
      [1, 1, 1],
    ],
  ], // inner corner TL
  [
    7,
    [
      [1, 1, 1],
      [1, 0, 1],
      [0, 1, 1],
    ],
  ], // inner corner BL
  [
    8,
    [
      [1, 1, 1],
      [1, 0, 1],
      [1, 1, 0],
    ],
  ], // inner corner BR
  [
    9,
    [
      [1, 1, 0],
      [1, 0, 1],
      [1, 1, 1],
    ],
  ], // inner corner TR
  [
    10,
    [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
    ],
  ], // outer corner BR
  [
    11,
    [
      [0, 1, 1],
      [0, 0, 1],
      [0, 0, 0],
    ],
  ], // outer corner TR
  [
    12,
    [
      [1, 1, 0],
      [1, 0, 0],
      [0, 0, 0],
    ],
  ], // outer corner TL
  [
    13,
    [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
    ],
  ], // outer corner BL
  [
    14,
    [
      [0, 1, 1],
      [1, 0, 1],
      [1, 1, 0],
    ],
  ], // double inner TL+BR
  [
    15,
    [
      [1, 1, 0],
      [1, 0, 1],
      [0, 1, 1],
    ],
  ], // double inner TR+BL
];

describe('AutoTileResolver', () => {
  // ── empty cell ──────────────────────────────────

  test('empty cell returns tileIndex = -1', () => {
    const g = new OccupancyGrid(3, 3);
    const r = new AutoTileResolver(g);
    const result = r.resolve(1, 1);
    expect(result.tileIndex).toBe(-1);
    expect(result.mask).toBe(-1);
  });

  // ── all 16 canonical patterns ───────────────────

  test.each(PATTERNS)('tile %i: canonical pattern resolves correctly', (expectedTile, pattern) => {
    const g = new OccupancyGrid(7, 7);
    setNeighborPattern(g, 3, 3, pattern);
    g.getDirtyAndClear();

    const r = new AutoTileResolver(g);
    const result = r.resolve(3, 3);
    expect(result.tileIndex).toBe(expectedTile);
  });

  // ── canonical mask values match ─────────────────

  test('CANONICAL_MASKS match computed raw masks for each pattern', () => {
    for (const [tileIdx, pattern] of PATTERNS) {
      const g = new OccupancyGrid(7, 7);
      setNeighborPattern(g, 3, 3, pattern);
      g.getDirtyAndClear();

      const r = new AutoTileResolver(g);
      const result = r.resolve(3, 3);
      // The raw mask (before diagonal masking in the table) should equal the canonical value
      expect(result.mask).toBe(CANONICAL_MASKS[tileIdx]);
    }
  });

  // ── diagonal masking ────────────────────────────

  test('diagonal bits are ignored when adjacent cardinals are absent', () => {
    // Set all 8 neighbors: raw mask = 255
    // But remove T (top cardinal) — this should zero out TL and TR diagonals
    const g = new OccupancyGrid(7, 7);
    g.setCell(3, 3, 1); // self
    // All 8 neighbors except T
    g.setCell(4, 4, 1); // TR
    g.setCell(4, 3, 1); // R
    g.setCell(4, 2, 1); // BR
    g.setCell(3, 2, 1); // B
    g.setCell(2, 2, 1); // BL
    g.setCell(2, 3, 1); // L
    g.setCell(2, 4, 1); // TL
    g.getDirtyAndClear();

    const r = new AutoTileResolver(g);
    const result = r.resolve(3, 3);
    // Raw mask has R+BR+B+BL+L+TL+TR = 4+8+16+32+64+128+2 = 254 (all except T)
    // After diagonal masking: TL zeroed (no T), TR zeroed (no T)
    // Effective: R+BR+B+BL+L = 4+8+16+32+64 = 124 → tile 2 (top edge)
    expect(result.tileIndex).toBe(2);
  });

  test('applyDiagonalMask zeros diagonals correctly', () => {
    // Only T and TL set, no L → TL should be zeroed
    const mask1 = BIT.T | BIT.TL;
    expect(applyDiagonalMask(mask1)).toBe(BIT.T);

    // T + R + TR → TR stays (both cardinals present)
    const mask2 = BIT.T | BIT.R | BIT.TR;
    expect(applyDiagonalMask(mask2)).toBe(BIT.T | BIT.R | BIT.TR);

    // All bits set → no change
    expect(applyDiagonalMask(255)).toBe(255);

    // No bits set → no change
    expect(applyDiagonalMask(0)).toBe(0);
  });

  // ── fallback patterns ───────────────────────────

  test('single cardinal neighbor maps to tile 0', () => {
    const g = new OccupancyGrid(7, 7);
    g.setCell(3, 3, 1); // self
    g.setCell(3, 4, 1); // T only
    g.getDirtyAndClear();

    const r = new AutoTileResolver(g);
    expect(r.resolve(3, 3).tileIndex).toBe(0);
  });

  test('opposite cardinals (T+B) maps to tile 0', () => {
    const g = new OccupancyGrid(7, 7);
    g.setCell(3, 3, 1);
    g.setCell(3, 4, 1); // T
    g.setCell(3, 2, 1); // B
    g.getDirtyAndClear();

    const r = new AutoTileResolver(g);
    expect(r.resolve(3, 3).tileIndex).toBe(0);
  });

  test('4 cardinals + 2 adjacent missing diags fallback to tile 1', () => {
    const g = new OccupancyGrid(7, 7);
    g.setCell(3, 3, 1); // self
    // 4 cardinals
    g.setCell(3, 4, 1); // T
    g.setCell(4, 3, 1); // R
    g.setCell(3, 2, 1); // B
    g.setCell(2, 3, 1); // L
    // Only BL and BR diagonals (TL and TR missing)
    g.setCell(2, 2, 1); // BL
    g.setCell(4, 2, 1); // BR
    g.getDirtyAndClear();

    const r = new AutoTileResolver(g);
    expect(r.resolve(3, 3).tileIndex).toBe(1);
  });

  // ── custom config ───────────────────────────────

  test('custom maskTable maps to different tile indices', () => {
    const g = new OccupancyGrid(7, 7);
    g.setCell(3, 3, 1);
    g.getDirtyAndClear();

    // Map raw mask 0 (isolated) → tile 7
    const config = createDefaultConfig();
    config.maskTable[0] = 7;

    const r = new AutoTileResolver(g, config);
    expect(r.resolve(3, 3).tileIndex).toBe(7);
  });

  // ── batch / resolveAll ──────────────────────────

  test('resolveAll returns only occupied cells', () => {
    const g = new OccupancyGrid(3, 3);
    g.setCell(0, 0, 1);
    g.setCell(2, 2, 1);
    g.getDirtyAndClear();

    const r = new AutoTileResolver(g);
    const all = r.resolveAll();
    expect(all).toHaveLength(2);
    expect(all.map(a => `${a.x},${a.y}`).sort()).toEqual(['0,0', '2,2']);
  });

  test('resolveBatch resolves specific coords (including empty)', () => {
    const g = new OccupancyGrid(7, 7);
    g.setCell(1, 1, 1);
    g.getDirtyAndClear();

    const r = new AutoTileResolver(g);
    const batch = r.resolveBatch([
      { x: 1, y: 1 },
      { x: 0, y: 0 },
    ]);
    expect(batch).toHaveLength(2);
    expect(batch[0].tileIndex).toBeGreaterThanOrEqual(0); // occupied
    expect(batch[1].tileIndex).toBe(-1); // empty
  });

  // ── edge: border cells ──────────────────────────

  test('border cell treats out-of-bounds neighbours as empty', () => {
    const g = new OccupancyGrid(3, 3);
    // Fill entire grid
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        g.setCell(x, y, 1);
      }
    }
    g.getDirtyAndClear();

    const r = new AutoTileResolver(g);

    // Corner (0,0): T, TR, R occupied in-bounds;
    // B, BL, L, TL, BR are out of bounds → treated as 0
    const corner = r.resolve(0, 0);
    // Raw mask: T(1) + TR(2) + R(4) = 7
    // After diagonal masking: TR stays (T and R both present)
    // → tile 11 (outer corner TR)
    expect(corner.tileIndex).toBe(11);

    // Edge (1,0): T(1), TR(2), R(4), L(64), TL(128) in bounds
    // B, BL, BR out of bounds
    const edge = r.resolve(1, 0);
    // Raw mask: T+TR+R+L+TL = 1+2+4+64+128 = 199
    // After diagonal masking: TR stays (T+R), TL stays (T+L)
    // Cardinals: T+R+L (3 cardinals, missing B) → tile 4 (bottom edge)
    expect(edge.tileIndex).toBe(4);

    // Center (1,1): all 8 neighbors within bounds and occupied
    const center = r.resolve(1, 1);
    // Raw mask: 255 → tile 1 (full)
    expect(center.tileIndex).toBe(1);
  });

  // ── mask table coverage ─────────────────────────

  test('default mask table covers all 256 raw masks', () => {
    const table = createDefaultMaskTable();
    for (let raw = 0; raw < 256; raw++) {
      expect(table[raw]).toBeGreaterThanOrEqual(0);
      expect(table[raw]).toBeLessThanOrEqual(15);
    }
  });
});
