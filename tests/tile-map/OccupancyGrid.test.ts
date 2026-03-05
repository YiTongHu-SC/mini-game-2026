import { OccupancyGrid, GridCoord } from '../../assets/scripts/tile-map/OccupancyGrid';

/** Helper: convert GridCoord[] to a Set of "x,y" strings for easy comparison */
function coordSet(coords: GridCoord[]): Set<string> {
  return new Set(coords.map(c => `${c.x},${c.y}`));
}

describe('OccupancyGrid', () => {
  // ── Basic read / write ──────────────────────────────

  test('new grid initialises all cells to 0', () => {
    const g = new OccupancyGrid(4, 3);
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 4; x++) {
        expect(g.getCell(x, y)).toBe(0);
      }
    }
  });

  test('setCell / getCell round-trip', () => {
    const g = new OccupancyGrid(5, 5);
    g.setCell(2, 3, 1);
    expect(g.getCell(2, 3)).toBe(1);

    g.setCell(2, 3, 0);
    expect(g.getCell(2, 3)).toBe(0);
  });

  test('out-of-bounds getCell returns 0', () => {
    const g = new OccupancyGrid(3, 3);
    expect(g.getCell(-1, 0)).toBe(0);
    expect(g.getCell(3, 0)).toBe(0);
    expect(g.getCell(0, -1)).toBe(0);
    expect(g.getCell(0, 3)).toBe(0);
    expect(g.getCell(100, 100)).toBe(0);
  });

  test('out-of-bounds setCell is a no-op', () => {
    const g = new OccupancyGrid(3, 3);
    g.setCell(-1, 0, 1);
    g.setCell(3, 0, 1);
    // Should produce no dirty entries
    const dirty = g.getDirtyAndClear();
    expect(dirty).toHaveLength(0);
  });

  // ── Dirty tracking ─────────────────────────────────

  test('setCell marks self + 8 neighbours as dirty', () => {
    const g = new OccupancyGrid(5, 5);
    g.setCell(2, 2, 1);
    const dirty = coordSet(g.getDirtyAndClear());

    // Self
    expect(dirty.has('2,2')).toBe(true);
    // Cardinals
    expect(dirty.has('2,3')).toBe(true); // T
    expect(dirty.has('3,2')).toBe(true); // R
    expect(dirty.has('2,1')).toBe(true); // B
    expect(dirty.has('1,2')).toBe(true); // L
    // Diagonals
    expect(dirty.has('3,3')).toBe(true); // TR
    expect(dirty.has('3,1')).toBe(true); // BR
    expect(dirty.has('1,1')).toBe(true); // BL
    expect(dirty.has('1,3')).toBe(true); // TL

    expect(dirty.size).toBe(9);
  });

  test('setCell at corner clips out-of-bounds neighbours from dirty set', () => {
    const g = new OccupancyGrid(3, 3);
    g.setCell(0, 0, 1);
    const dirty = coordSet(g.getDirtyAndClear());

    // Self + Right + Up + TR (Down, Left, BL, TL, BR are out of bounds)
    expect(dirty.has('0,0')).toBe(true);
    expect(dirty.has('1,0')).toBe(true); // R
    expect(dirty.has('0,1')).toBe(true); // T
    expect(dirty.has('1,1')).toBe(true); // TR
    expect(dirty.size).toBe(4);
  });

  test('repeated setCell with same value produces no dirty entry', () => {
    const g = new OccupancyGrid(5, 5);
    g.setCell(2, 2, 1);
    g.getDirtyAndClear(); // flush

    g.setCell(2, 2, 1); // same value again
    const dirty = g.getDirtyAndClear();
    expect(dirty).toHaveLength(0);
  });

  test('getDirtyAndClear clears the set', () => {
    const g = new OccupancyGrid(5, 5);
    g.setCell(1, 1, 1);
    expect(g.getDirtyAndClear().length).toBeGreaterThan(0);

    // Second call should be empty
    expect(g.getDirtyAndClear()).toHaveLength(0);
  });

  test('multiple setCells merge dirty entries (no duplicates)', () => {
    const g = new OccupancyGrid(5, 5);
    // Two adjacent cells share neighbours
    g.setCell(2, 2, 1);
    g.setCell(3, 2, 1);
    const dirty = coordSet(g.getDirtyAndClear());

    // Both should be present, and shared neighbours counted once
    expect(dirty.has('2,2')).toBe(true);
    expect(dirty.has('3,2')).toBe(true);
    // self(2,2)+8 = 9 cells, self(3,2)+8 = 9 cells, overlap includes
    // (2,2), (3,2), (3,1), (3,3), (2,1), (2,3) = 6 shared
    // Unique: (1,1),(1,2),(1,3),(2,1),(2,2),(2,3),(3,1),(3,2),(3,3),(4,1),(4,2),(4,3) = 12
    expect(dirty.size).toBe(12);
  });

  // ── Bulk helpers ────────────────────────────────────

  test('fillRect fills a rectangular region', () => {
    const g = new OccupancyGrid(5, 5);
    g.fillRect(1, 1, 3, 2, 1);

    expect(g.getCell(1, 1)).toBe(1);
    expect(g.getCell(3, 2)).toBe(1);
    expect(g.getCell(0, 0)).toBe(0);
    expect(g.getCell(4, 4)).toBe(0);
  });

  test('clear resets all cells to 0', () => {
    const g = new OccupancyGrid(3, 3);
    g.fillRect(0, 0, 3, 3, 1);
    g.getDirtyAndClear();

    g.clear();
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        expect(g.getCell(x, y)).toBe(0);
      }
    }
  });
});
