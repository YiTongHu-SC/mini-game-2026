import { OccupancyGrid } from '../../assets/scripts/tile-map/OccupancyGrid';
import { AutoTileResolver } from '../../assets/scripts/tile-map/AutoTileResolver';
import { BIT, createDefaultConfig } from '../../assets/scripts/tile-map/TileMapConfig';

describe('AutoTileResolver', () => {
  // ── mask computation ─────────────────────────────

  test('empty cell returns tileIndex = -1', () => {
    const g = new OccupancyGrid(3, 3);
    const r = new AutoTileResolver(g);
    const result = r.resolve(1, 1);
    expect(result.tileIndex).toBe(-1);
    expect(result.mask).toBe(-1);
  });

  test('isolated cell (no neighbours) → mask=0', () => {
    const g = new OccupancyGrid(5, 5);
    g.setCell(2, 2, 1);
    g.getDirtyAndClear();

    const r = new AutoTileResolver(g);
    const result = r.resolve(2, 2);
    expect(result.mask).toBe(0);
    expect(result.tileIndex).toBe(0); // identity table
  });

  test('cell with all 4 neighbours → mask=15', () => {
    const g = new OccupancyGrid(5, 5);
    // Center + all 4 neighbours
    g.setCell(2, 2, 1);
    g.setCell(2, 3, 1); // Up
    g.setCell(3, 2, 1); // Right
    g.setCell(2, 1, 1); // Down
    g.setCell(1, 2, 1); // Left
    g.getDirtyAndClear();

    const r = new AutoTileResolver(g);
    const result = r.resolve(2, 2);
    expect(result.mask).toBe(15);
    expect(result.tileIndex).toBe(15);
  });

  test('cell with only Up neighbour → mask=1 (BIT.UP)', () => {
    const g = new OccupancyGrid(5, 5);
    g.setCell(2, 2, 1);
    g.setCell(2, 3, 1); // Up
    g.getDirtyAndClear();

    const r = new AutoTileResolver(g);
    expect(r.resolve(2, 2).mask).toBe(BIT.UP); // 1
  });

  test('cell with only Right neighbour → mask=2 (BIT.RIGHT)', () => {
    const g = new OccupancyGrid(5, 5);
    g.setCell(2, 2, 1);
    g.setCell(3, 2, 1); // Right
    g.getDirtyAndClear();

    const r = new AutoTileResolver(g);
    expect(r.resolve(2, 2).mask).toBe(BIT.RIGHT); // 2
  });

  test('cell with only Down neighbour → mask=4 (BIT.DOWN)', () => {
    const g = new OccupancyGrid(5, 5);
    g.setCell(2, 2, 1);
    g.setCell(2, 1, 1); // Down
    g.getDirtyAndClear();

    const r = new AutoTileResolver(g);
    expect(r.resolve(2, 2).mask).toBe(BIT.DOWN); // 4
  });

  test('cell with only Left neighbour → mask=8 (BIT.LEFT)', () => {
    const g = new OccupancyGrid(5, 5);
    g.setCell(2, 2, 1);
    g.setCell(1, 2, 1); // Left
    g.getDirtyAndClear();

    const r = new AutoTileResolver(g);
    expect(r.resolve(2, 2).mask).toBe(BIT.LEFT); // 8
  });

  // ── all 16 mask combos ──────────────────────────

  test('all 16 mask combinations resolve correctly (identity table)', () => {
    // For each mask 0–15, build a grid where center (2,2) has exactly
    // the neighbours indicated by the mask bits.
    const r_bit = [
      { bit: BIT.UP, dx: 0, dy: 1 },
      { bit: BIT.RIGHT, dx: 1, dy: 0 },
      { bit: BIT.DOWN, dx: 0, dy: -1 },
      { bit: BIT.LEFT, dx: -1, dy: 0 },
    ];

    for (let mask = 0; mask < 16; mask++) {
      const g = new OccupancyGrid(5, 5);
      g.setCell(2, 2, 1);
      for (const { bit, dx, dy } of r_bit) {
        if (mask & bit) {
          g.setCell(2 + dx, 2 + dy, 1);
        }
      }
      g.getDirtyAndClear();

      const resolver = new AutoTileResolver(g);
      const result = resolver.resolve(2, 2);
      expect(result.mask).toBe(mask);
      expect(result.tileIndex).toBe(mask); // identity table
    }
  });

  // ── custom config ───────────────────────────────

  test('custom maskTable maps to different tile indices', () => {
    const g = new OccupancyGrid(5, 5);
    g.setCell(2, 2, 1);
    g.getDirtyAndClear();

    // Map mask 0 (isolated) → tile 7
    const config = createDefaultConfig();
    config.maskTable[0] = 7;

    const r = new AutoTileResolver(g, config);
    expect(r.resolve(2, 2).tileIndex).toBe(7);
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
    const g = new OccupancyGrid(5, 5);
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

    // Corner (0,0): only Right and Up are occupied (within bounds)
    const corner = r.resolve(0, 0);
    expect(corner.mask).toBe(BIT.UP | BIT.RIGHT); // 1 + 2 = 3

    // Edge (1,0): Up, Right, Left are occupied
    const edge = r.resolve(1, 0);
    expect(edge.mask).toBe(BIT.UP | BIT.RIGHT | BIT.LEFT); // 1 + 2 + 8 = 11

    // Center (1,1): all 4
    const center = r.resolve(1, 1);
    expect(center.mask).toBe(15);
  });
});
