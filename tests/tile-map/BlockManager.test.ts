import { OccupancyGrid, GridCoord } from '../../assets/scripts/tile-map/OccupancyGrid';
import { BlockManager } from '../../assets/scripts/tile-map/BlockManager';
import { DualGridMapper } from '../../assets/scripts/tile-map/DualGridMapper';
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
// 2. Wall-aware occupancy (AND rule)
// ════════════════════════════════════════════════════════════════

describe('Wall-aware computeVisualOccupancy (AND)', () => {
  // 3×3 logic grid (13×13 visual)
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

  test('without wall: v-edge between (0,0) and (1,0) is occupied', () => {
    // V-Edge at vx=4, vy=1 between logic (0,0) and (1,0)
    expect(mapper.computeVisualOccupancy(4, 1, logicGrid)).toBe(1);
  });

  test('with wall: v-edge between (0,0) and (1,0) is empty', () => {
    bm.addWall({ x: 0, y: 0 }, { x: 1, y: 0 });
    expect(mapper.computeVisualOccupancy(4, 1, logicGrid)).toBe(0);
    expect(mapper.computeVisualOccupancy(4, 2, logicGrid)).toBe(0);
    expect(mapper.computeVisualOccupancy(4, 3, logicGrid)).toBe(0);
  });

  test('without wall: h-edge between (0,0) and (0,1) is occupied', () => {
    // H-Edge at vx=1, vy=4 between logic (0,0) and (0,1)
    expect(mapper.computeVisualOccupancy(1, 4, logicGrid)).toBe(1);
  });

  test('with wall: h-edge between (0,0) and (0,1) is empty', () => {
    bm.addWall({ x: 0, y: 0 }, { x: 0, y: 1 });
    expect(mapper.computeVisualOccupancy(1, 4, logicGrid)).toBe(0);
    expect(mapper.computeVisualOccupancy(2, 4, logicGrid)).toBe(0);
    expect(mapper.computeVisualOccupancy(3, 4, logicGrid)).toBe(0);
  });

  test('corner with no walls: occupied', () => {
    // Corner at (4,4) — shared by (0,0), (1,0), (0,1), (1,1)
    expect(mapper.computeVisualOccupancy(4, 4, logicGrid)).toBe(1);
  });

  test('corner with one horizontal wall: empty', () => {
    // Wall between (0,0) and (1,0) — one of the 4 adjacent pairs
    bm.addWall({ x: 0, y: 0 }, { x: 1, y: 0 });
    expect(mapper.computeVisualOccupancy(4, 4, logicGrid)).toBe(0);
  });

  test('corner with one vertical wall: empty', () => {
    // Wall between (0,0) and (0,1) — another of the 4 adjacent pairs
    bm.addWall({ x: 0, y: 0 }, { x: 0, y: 1 });
    expect(mapper.computeVisualOccupancy(4, 4, logicGrid)).toBe(0);
  });

  test('wall does not affect interior cells', () => {
    bm.addWall({ x: 0, y: 0 }, { x: 1, y: 0 });
    // Interior of (0,0): vx=1..3, vy=1..3
    expect(mapper.computeVisualOccupancy(1, 1, logicGrid)).toBe(1);
    expect(mapper.computeVisualOccupancy(2, 2, logicGrid)).toBe(1);
    // Interior of (1,0): vx=5..7, vy=1..3
    expect(mapper.computeVisualOccupancy(5, 1, logicGrid)).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════
// 3. getAffectedVisualCellsForWall
// ════════════════════════════════════════════════════════════════

describe('getAffectedVisualCellsForWall', () => {
  // 3×3 logic → 13×13 visual
  const mapper = new DualGridMapper(3, 3);

  test('horizontal wall (0,0)↔(1,0): returns 3 v-edge + 2 corner = 5', () => {
    const cells = mapper.getAffectedVisualCellsForWall({ x: 0, y: 0 }, { x: 1, y: 0 });
    expect(cells).toHaveLength(5);
    const set = coordSet(cells);
    // 3 V-Edge cells at vx=4, vy=1,2,3
    expect(set.has('4,1')).toBe(true);
    expect(set.has('4,2')).toBe(true);
    expect(set.has('4,3')).toBe(true);
    // 2 Corner cells at (4,0) and (4,4)
    expect(set.has('4,0')).toBe(true);
    expect(set.has('4,4')).toBe(true);
  });

  test('vertical wall (1,0)↔(1,1): returns 3 h-edge + 2 corner = 5', () => {
    const cells = mapper.getAffectedVisualCellsForWall({ x: 1, y: 0 }, { x: 1, y: 1 });
    expect(cells).toHaveLength(5);
    const set = coordSet(cells);
    // 3 H-Edge cells at vy=4, vx=5,6,7
    expect(set.has('5,4')).toBe(true);
    expect(set.has('6,4')).toBe(true);
    expect(set.has('7,4')).toBe(true);
    // 2 Corner cells at (4,4) and (8,4)
    expect(set.has('4,4')).toBe(true);
    expect(set.has('8,4')).toBe(true);
  });

  test('non-adjacent pair returns empty', () => {
    const cells = mapper.getAffectedVisualCellsForWall({ x: 0, y: 0 }, { x: 2, y: 0 });
    expect(cells).toHaveLength(0);
  });

  test('boundary wall still returns valid cells (filtered)', () => {
    // Wall between (0,0) and (0,1) — left edge
    const cells = mapper.getAffectedVisualCellsForWall({ x: 0, y: 0 }, { x: 0, y: 1 });
    expect(cells).toHaveLength(5);
    const set = coordSet(cells);
    // 3 H-Edge at vy=4, vx=1,2,3
    expect(set.has('1,4')).toBe(true);
    expect(set.has('2,4')).toBe(true);
    expect(set.has('3,4')).toBe(true);
    // 2 Corners at (0,4) and (4,4)
    expect(set.has('0,4')).toBe(true);
    expect(set.has('4,4')).toBe(true);
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

  test('adding wall clears affected edge cells', () => {
    bm.addWall({ x: 0, y: 0 }, { x: 1, y: 0 });
    const dirty = mapper.syncWallChange({ x: 0, y: 0 }, { x: 1, y: 0 }, logicGrid, visualGrid);
    expect(dirty.length).toBeGreaterThan(0);
    // V-Edge cells at vx=4, vy=1,2,3 should now be 0
    expect(visualGrid.getCell(4, 1)).toBe(0);
    expect(visualGrid.getCell(4, 2)).toBe(0);
    expect(visualGrid.getCell(4, 3)).toBe(0);
    // Corner at (4,0) on boundary is already 0
    // Corner at (4,4) should be 0 due to wall
    expect(visualGrid.getCell(4, 4)).toBe(0);
  });

  test('removing wall restores affected edge cells', () => {
    bm.addWall({ x: 0, y: 0 }, { x: 1, y: 0 });
    mapper.syncWallChange({ x: 0, y: 0 }, { x: 1, y: 0 }, logicGrid, visualGrid);

    bm.removeWall({ x: 0, y: 0 }, { x: 1, y: 0 });
    mapper.syncWallChange({ x: 0, y: 0 }, { x: 1, y: 0 }, logicGrid, visualGrid);

    // Should be restored to 1
    expect(visualGrid.getCell(4, 1)).toBe(1);
    expect(visualGrid.getCell(4, 2)).toBe(1);
    expect(visualGrid.getCell(4, 3)).toBe(1);
  });

  test('wall does not affect unrelated edges', () => {
    bm.addWall({ x: 0, y: 0 }, { x: 1, y: 0 });
    mapper.syncWallChange({ x: 0, y: 0 }, { x: 1, y: 0 }, logicGrid, visualGrid);

    // V-Edge between (1,0) and (2,0): vx=8, vy=1,2,3 — should still be 1
    expect(visualGrid.getCell(8, 1)).toBe(1);
    expect(visualGrid.getCell(8, 2)).toBe(1);
    expect(visualGrid.getCell(8, 3)).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════
// 5. Full integration with walls
// ════════════════════════════════════════════════════════════════

describe('Full integration with walls', () => {
  test('2×2 all occupied with center wall: center corner is empty', () => {
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

    // Center corner at (4,4) should be 1 without walls
    mapper.syncAll(logicGrid, visualGrid);
    expect(visualGrid.getCell(4, 4)).toBe(1);

    // Add wall between (0,0) and (1,0) — bottom row horizontal
    bm.addWall({ x: 0, y: 0 }, { x: 1, y: 0 });
    mapper.syncAll(logicGrid, visualGrid);

    // Center corner at (4,4) should now be 0
    expect(visualGrid.getCell(4, 4)).toBe(0);
    // V-Edge at vx=4, vy=1..3 should be 0
    expect(visualGrid.getCell(4, 1)).toBe(0);
    expect(visualGrid.getCell(4, 2)).toBe(0);
    expect(visualGrid.getCell(4, 3)).toBe(0);
    // V-Edge at vx=4, vy=5..7 should still be 1 (no wall between (0,1) and (1,1))
    expect(visualGrid.getCell(4, 5)).toBe(1);
    expect(visualGrid.getCell(4, 6)).toBe(1);
    expect(visualGrid.getCell(4, 7)).toBe(1);
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

    // V-Edge at vx=4, vy=1..3 should be 1 (no wall awareness)
    expect(visualGrid.getCell(4, 1)).toBe(1);
    expect(visualGrid.getCell(4, 2)).toBe(1);
    expect(visualGrid.getCell(4, 3)).toBe(1);
    // Corner at (4,4) should be 1
    expect(visualGrid.getCell(4, 4)).toBe(1);
  });
});
