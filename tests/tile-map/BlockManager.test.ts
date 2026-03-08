import { OccupancyGrid, GridCoord } from '../../assets/scripts/tile-map/OccupancyGrid';
import { BlockManager } from '../../assets/scripts/tile-map/BlockManager';
import { DualGridMapper } from '../../assets/scripts/tile-map/DualGridMapper';
import { AutoTileResolver } from '../../assets/scripts/tile-map/AutoTileResolver';
import { BIT, createDefaultConfig } from '../../assets/scripts/tile-map/TileMapConfig';
import { STRIDE, visualGridSize } from '../../assets/scripts/tile-map/DualGridTypes';

/** Helper: convert GridCoord[] to a Set of "x,y" strings for easy comparison */
function coordSet(coords: GridCoord[]): Set<string> {
  return new Set(coords.map(c => `${c.x},${c.y}`));
}

// ════════════════════════════════════════════════════════════════
// 1. BlockManager — wall CRUD
// ════════════════════════════════════════════════════════════════

describe('BlockManager — wall CRUD', () => {
  let bm: BlockManager;

  beforeEach(() => {
    bm = new BlockManager();
  });

  test('isAdjacent: horizontal neighbors', () => {
    expect(BlockManager.isAdjacent({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(true);
  });

  test('isAdjacent: vertical neighbors', () => {
    expect(BlockManager.isAdjacent({ x: 2, y: 3 }, { x: 2, y: 4 })).toBe(true);
  });

  test('isAdjacent: diagonal → false', () => {
    expect(BlockManager.isAdjacent({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(false);
  });

  test('isAdjacent: same cell → false', () => {
    expect(BlockManager.isAdjacent({ x: 1, y: 1 }, { x: 1, y: 1 })).toBe(false);
  });

  test('isAdjacent: distance 2 → false', () => {
    expect(BlockManager.isAdjacent({ x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
  });

  test('wallKey normalizes order', () => {
    const k1 = BlockManager.wallKey({ x: 1, y: 0 }, { x: 0, y: 0 });
    const k2 = BlockManager.wallKey({ x: 0, y: 0 }, { x: 1, y: 0 });
    expect(k1).toBe(k2);
    expect(k1).toBe('0,0|1,0');
  });

  test('wallKey: non-adjacent → null', () => {
    expect(BlockManager.wallKey({ x: 0, y: 0 }, { x: 2, y: 0 })).toBeNull();
  });

  test('addWall: new wall returns true', () => {
    expect(bm.addWall({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(true);
    expect(bm.wallCount).toBe(1);
  });

  test('addWall: duplicate returns false', () => {
    bm.addWall({ x: 0, y: 0 }, { x: 1, y: 0 });
    expect(bm.addWall({ x: 1, y: 0 }, { x: 0, y: 0 })).toBe(false);
  });

  test('addWall: non-adjacent returns false', () => {
    expect(bm.addWall({ x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
  });

  test('hasWall checks correctly', () => {
    bm.addWall({ x: 0, y: 0 }, { x: 0, y: 1 });
    expect(bm.hasWall({ x: 0, y: 0 }, { x: 0, y: 1 })).toBe(true);
    expect(bm.hasWall({ x: 0, y: 1 }, { x: 0, y: 0 })).toBe(true); // reversed order
    expect(bm.hasWall({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(false); // different wall
  });

  test('removeWall: existing wall returns true', () => {
    bm.addWall({ x: 1, y: 1 }, { x: 1, y: 2 });
    expect(bm.removeWall({ x: 1, y: 2 }, { x: 1, y: 1 })).toBe(true);
    expect(bm.wallCount).toBe(0);
  });

  test('removeWall: non-existing returns false', () => {
    expect(bm.removeWall({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(false);
  });

  test('toggleWall: off → on → off', () => {
    const a = { x: 2, y: 3 };
    const b = { x: 3, y: 3 };
    expect(bm.toggleWall(a, b)).toBe(true); // add
    expect(bm.wallCount).toBe(1);
    expect(bm.toggleWall(a, b)).toBe(false); // remove
    expect(bm.wallCount).toBe(0);
  });

  test('toggleWall: non-adjacent → null', () => {
    expect(bm.toggleWall({ x: 0, y: 0 }, { x: 0, y: 2 })).toBeNull();
  });

  test('clearWalls removes all', () => {
    bm.addWall({ x: 0, y: 0 }, { x: 1, y: 0 });
    bm.addWall({ x: 0, y: 0 }, { x: 0, y: 1 });
    bm.clearWalls();
    expect(bm.wallCount).toBe(0);
    expect(bm.getWalls()).toEqual([]);
  });

  test('getWalls returns all keys', () => {
    bm.addWall({ x: 0, y: 0 }, { x: 1, y: 0 });
    bm.addWall({ x: 2, y: 2 }, { x: 2, y: 3 });
    const keys = bm.getWalls();
    expect(keys).toHaveLength(2);
    expect(keys).toContain('0,0|1,0');
    expect(keys).toContain('2,2|2,3');
  });
});

// ════════════════════════════════════════════════════════════════
// 2. Wall-aware occupancy (walls no longer zero cells; bitmask filter instead)
// ════════════════════════════════════════════════════════════════

describe('Wall-aware computeVisualOccupancy', () => {
  // 3×3 logic grid (9×9 visual)
  let mapper: DualGridMapper;
  let logicGrid: OccupancyGrid;
  let bm: BlockManager;

  beforeEach(() => {
    mapper = new DualGridMapper(3, 3);
    logicGrid = new OccupancyGrid(3, 3);
    bm = new BlockManager();
    mapper.setBlockManager(bm);
    // Fill all logic cells
    for (let ly = 0; ly < 3; ly++) {
      for (let lx = 0; lx < 3; lx++) {
        logicGrid.setCell(lx, ly, 1);
      }
    }
    logicGrid.getDirtyAndClear();
  });

  test('without wall: border cells are occupied', () => {
    expect(mapper.computeVisualOccupancy(2, 0, logicGrid)).toBe(1);
    expect(mapper.computeVisualOccupancy(2, 1, logicGrid)).toBe(1);
    expect(mapper.computeVisualOccupancy(2, 2, logicGrid)).toBe(1);
  });

  test('with wall: border cells STILL occupied (walls affect bitmask, not occupancy)', () => {
    bm.addWall({ x: 0, y: 0 }, { x: 1, y: 0 });
    // All cells remain 1
    expect(mapper.computeVisualOccupancy(2, 0, logicGrid)).toBe(1);
    expect(mapper.computeVisualOccupancy(2, 1, logicGrid)).toBe(1);
    expect(mapper.computeVisualOccupancy(2, 2, logicGrid)).toBe(1);
    expect(mapper.computeVisualOccupancy(3, 0, logicGrid)).toBe(1);
    expect(mapper.computeVisualOccupancy(3, 1, logicGrid)).toBe(1);
    expect(mapper.computeVisualOccupancy(3, 2, logicGrid)).toBe(1);
  });

  test('without wall: top border of (0,0) is occupied', () => {
    expect(mapper.computeVisualOccupancy(0, 2, logicGrid)).toBe(1);
    expect(mapper.computeVisualOccupancy(1, 2, logicGrid)).toBe(1);
    expect(mapper.computeVisualOccupancy(2, 2, logicGrid)).toBe(1);
  });

  test('with wall: top/bottom border cells STILL occupied', () => {
    bm.addWall({ x: 0, y: 0 }, { x: 0, y: 1 });
    expect(mapper.computeVisualOccupancy(0, 2, logicGrid)).toBe(1);
    expect(mapper.computeVisualOccupancy(1, 2, logicGrid)).toBe(1);
    expect(mapper.computeVisualOccupancy(2, 2, logicGrid)).toBe(1);
    expect(mapper.computeVisualOccupancy(0, 3, logicGrid)).toBe(1);
    expect(mapper.computeVisualOccupancy(1, 3, logicGrid)).toBe(1);
    expect(mapper.computeVisualOccupancy(2, 3, logicGrid)).toBe(1);
  });

  test('wall does not affect center cells', () => {
    bm.addWall({ x: 0, y: 0 }, { x: 1, y: 0 });
    expect(mapper.computeVisualOccupancy(1, 1, logicGrid)).toBe(1);
    expect(mapper.computeVisualOccupancy(4, 1, logicGrid)).toBe(1);
  });

  test('wall affects autotile bitmask via neighborFilter', () => {
    const visualGrid = new OccupancyGrid(9, 9);
    mapper.syncAll(logicGrid, visualGrid);

    const resolver = new AutoTileResolver(visualGrid, createDefaultConfig());
    resolver.setNeighborFilter(mapper.createNeighborFilter());

    // Without wall: border cell (2,1) R neighbor (3,1) counts → R bit set
    const maskBefore = resolver.resolve(2, 1).mask;
    expect(maskBefore & BIT.R).toBeTruthy();

    // Add wall
    bm.addWall({ x: 0, y: 0 }, { x: 1, y: 0 });

    // Border cell (2,1) R neighbor (3,1) crosses wall → R bit cleared
    const maskAfter = resolver.resolve(2, 1).mask;
    expect(maskAfter & BIT.R).toBeFalsy();

    // Left border of (1,0): (3,1) L neighbor (2,1) crosses wall → L bit cleared
    const maskLeft = resolver.resolve(3, 1).mask;
    expect(maskLeft & BIT.L).toBeFalsy();
  });
});

// ════════════════════════════════════════════════════════════════
// 3. getAffectedVisualCellsForWall
// ════════════════════════════════════════════════════════════════

describe('getAffectedVisualCellsForWall', () => {
  // 3×3 logic → 9×9 visual
  const mapper = new DualGridMapper(3, 3);

  test('horizontal wall (0,0)↔(1,0): returns 6 border cells', () => {
    const cells = mapper.getAffectedVisualCellsForWall({ x: 0, y: 0 }, { x: 1, y: 0 });
    expect(cells).toHaveLength(6);
    const set = coordSet(cells);
    // Left cell right border: vx=2, vy=0,1,2
    expect(set.has('2,0')).toBe(true);
    expect(set.has('2,1')).toBe(true);
    expect(set.has('2,2')).toBe(true);
    // Right cell left border: vx=3, vy=0,1,2
    expect(set.has('3,0')).toBe(true);
    expect(set.has('3,1')).toBe(true);
    expect(set.has('3,2')).toBe(true);
  });

  test('vertical wall (1,0)↔(1,1): returns 6 border cells', () => {
    const cells = mapper.getAffectedVisualCellsForWall({ x: 1, y: 0 }, { x: 1, y: 1 });
    expect(cells).toHaveLength(6);
    const set = coordSet(cells);
    // Bottom cell top border: vy=2, vx=3,4,5
    expect(set.has('3,2')).toBe(true);
    expect(set.has('4,2')).toBe(true);
    expect(set.has('5,2')).toBe(true);
    // Top cell bottom border: vy=3, vx=3,4,5
    expect(set.has('3,3')).toBe(true);
    expect(set.has('4,3')).toBe(true);
    expect(set.has('5,3')).toBe(true);
  });

  test('non-adjacent pair returns empty', () => {
    const cells = mapper.getAffectedVisualCellsForWall({ x: 0, y: 0 }, { x: 2, y: 0 });
    expect(cells).toHaveLength(0);
  });

  test('boundary wall still returns valid cells', () => {
    // Wall between (0,0) and (0,1)
    const cells = mapper.getAffectedVisualCellsForWall({ x: 0, y: 0 }, { x: 0, y: 1 });
    expect(cells).toHaveLength(6);
    const set = coordSet(cells);
    // Bottom cell top border: vy=2, vx=0,1,2
    expect(set.has('0,2')).toBe(true);
    expect(set.has('1,2')).toBe(true);
    expect(set.has('2,2')).toBe(true);
    // Top cell bottom border: vy=3, vx=0,1,2
    expect(set.has('0,3')).toBe(true);
    expect(set.has('1,3')).toBe(true);
    expect(set.has('2,3')).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════
// 4. syncWallChange
// ════════════════════════════════════════════════════════════════

describe('syncWallChange', () => {
  let mapper: DualGridMapper;
  let logicGrid: OccupancyGrid;
  let visualGrid: OccupancyGrid;
  let bm: BlockManager;

  beforeEach(() => {
    mapper = new DualGridMapper(3, 3);
    logicGrid = new OccupancyGrid(3, 3);
    const vSize = visualGridSize(3, 3);
    visualGrid = new OccupancyGrid(vSize.cols, vSize.rows);
    bm = new BlockManager();
    mapper.setBlockManager(bm);
    // Fill all logic cells
    for (let ly = 0; ly < 3; ly++) {
      for (let lx = 0; lx < 3; lx++) {
        logicGrid.setCell(lx, ly, 1);
      }
    }
    logicGrid.getDirtyAndClear();
    // Initial full sync
    mapper.syncAll(logicGrid, visualGrid);
  });

  test('adding wall: visual grid stays 1, returns affected cells', () => {
    bm.addWall({ x: 0, y: 0 }, { x: 1, y: 0 });
    const affected = mapper.syncWallChange({ x: 0, y: 0 }, { x: 1, y: 0 }, logicGrid, visualGrid);
    expect(affected.length).toBe(6);
    // All visual cells remain 1 — wall doesn't zero occupancy
    expect(visualGrid.getCell(2, 0)).toBe(1);
    expect(visualGrid.getCell(2, 1)).toBe(1);
    expect(visualGrid.getCell(2, 2)).toBe(1);
    expect(visualGrid.getCell(3, 0)).toBe(1);
    expect(visualGrid.getCell(3, 1)).toBe(1);
    expect(visualGrid.getCell(3, 2)).toBe(1);
  });

  test('removing wall: visual grid stays 1, returns affected cells', () => {
    bm.addWall({ x: 0, y: 0 }, { x: 1, y: 0 });
    mapper.syncWallChange({ x: 0, y: 0 }, { x: 1, y: 0 }, logicGrid, visualGrid);

    bm.removeWall({ x: 0, y: 0 }, { x: 1, y: 0 });
    const affected = mapper.syncWallChange({ x: 0, y: 0 }, { x: 1, y: 0 }, logicGrid, visualGrid);
    expect(affected.length).toBe(6);

    // Still all 1
    expect(visualGrid.getCell(2, 0)).toBe(1);
    expect(visualGrid.getCell(2, 1)).toBe(1);
    expect(visualGrid.getCell(2, 2)).toBe(1);
    expect(visualGrid.getCell(3, 0)).toBe(1);
    expect(visualGrid.getCell(3, 1)).toBe(1);
    expect(visualGrid.getCell(3, 2)).toBe(1);
  });

  test('wall does not affect unrelated borders', () => {
    bm.addWall({ x: 0, y: 0 }, { x: 1, y: 0 });
    mapper.syncWallChange({ x: 0, y: 0 }, { x: 1, y: 0 }, logicGrid, visualGrid);

    // Right border of (1,0) → left border of (2,0): vx=5 should still be 1
    expect(visualGrid.getCell(5, 0)).toBe(1);
    expect(visualGrid.getCell(5, 1)).toBe(1);
    expect(visualGrid.getCell(5, 2)).toBe(1);
  });

  test('syncWallChange bitmask verification via resolver', () => {
    const resolver = new AutoTileResolver(visualGrid, createDefaultConfig());
    resolver.setNeighborFilter(mapper.createNeighborFilter());

    // Before wall: border cell (2,1) has R bit
    expect(resolver.resolve(2, 1).mask & BIT.R).toBeTruthy();

    bm.addWall({ x: 0, y: 0 }, { x: 1, y: 0 });
    const affected = mapper.syncWallChange({ x: 0, y: 0 }, { x: 1, y: 0 }, logicGrid, visualGrid);

    // After wall: border cell bitmask changes
    expect(resolver.resolve(2, 1).mask & BIT.R).toBeFalsy();
    expect(resolver.resolve(3, 1).mask & BIT.L).toBeFalsy();

    // Affected list covers both sides
    const xs = affected.map(c => c.x);
    expect(xs).toContain(2);
    expect(xs).toContain(3);
  });
});

// ════════════════════════════════════════════════════════════════
// 5. Full integration with walls (bitmask-based)
// ════════════════════════════════════════════════════════════════

describe('Full integration with walls', () => {
  test('2×2 all occupied with wall: all cells stay 1, bitmasks differ at boundary', () => {
    const mapper = new DualGridMapper(2, 2);
    const logicGrid = new OccupancyGrid(2, 2);
    const vSize = visualGridSize(2, 2);
    const visualGrid = new OccupancyGrid(vSize.cols, vSize.rows);
    const bm = new BlockManager();
    mapper.setBlockManager(bm);

    // Fill all 4 logic cells
    logicGrid.setCell(0, 0, 1);
    logicGrid.setCell(1, 0, 1);
    logicGrid.setCell(0, 1, 1);
    logicGrid.setCell(1, 1, 1);
    logicGrid.getDirtyAndClear();

    // Without walls: all 6×6 should be occupied
    mapper.syncAll(logicGrid, visualGrid);
    for (let vy = 0; vy < 6; vy++) {
      for (let vx = 0; vx < 6; vx++) {
        expect(visualGrid.getCell(vx, vy)).toBe(1);
      }
    }

    // Add wall between (0,0) and (1,0) — bottom row horizontal
    bm.addWall({ x: 0, y: 0 }, { x: 1, y: 0 });
    mapper.syncAll(logicGrid, visualGrid);

    // All 6×6 cells STILL occupied (wall doesn't zero occupancy)
    for (let vy = 0; vy < 6; vy++) {
      for (let vx = 0; vx < 6; vx++) {
        expect(visualGrid.getCell(vx, vy)).toBe(1);
      }
    }

    // Verify bitmask difference at wall boundary via resolver
    const resolver = new AutoTileResolver(visualGrid, createDefaultConfig());
    resolver.setNeighborFilter(mapper.createNeighborFilter());

    // Right border of (0,0) at vx=2: R bit NOT set (wall blocks)
    expect(resolver.resolve(2, 1).mask & BIT.R).toBeFalsy();
    // Left border of (1,0) at vx=3: L bit NOT set (wall blocks)
    expect(resolver.resolve(3, 1).mask & BIT.L).toBeFalsy();
    // Border between (0,1) and (1,1) at vx=2,vy=4: R bit IS set (no wall)
    expect(resolver.resolve(2, 4).mask & BIT.R).toBeTruthy();
    expect(resolver.resolve(3, 4).mask & BIT.L).toBeTruthy();
  });

  test('no blockManager: wall-unaware behavior preserved', () => {
    const mapper = new DualGridMapper(2, 2);
    const logicGrid = new OccupancyGrid(2, 2);
    const vSize = visualGridSize(2, 2);
    const visualGrid = new OccupancyGrid(vSize.cols, vSize.rows);
    // Deliberately NOT calling setBlockManager

    logicGrid.setCell(0, 0, 1);
    logicGrid.setCell(1, 0, 1);
    logicGrid.setCell(0, 1, 1);
    logicGrid.setCell(1, 1, 1);
    logicGrid.getDirtyAndClear();

    mapper.syncAll(logicGrid, visualGrid);

    // All 6×6 should be occupied (no wall awareness)
    for (let vy = 0; vy < 6; vy++) {
      for (let vx = 0; vx < 6; vx++) {
        expect(visualGrid.getCell(vx, vy)).toBe(1);
      }
    }
  });
});
