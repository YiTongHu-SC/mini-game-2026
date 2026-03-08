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
// 2. Wall-aware occupancy (3×3 border-cell model)
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

  test('without wall: right border of (0,0) is occupied', () => {
    // rx=2 border cells at vx=2: all occupied when no wall
    expect(mapper.computeVisualOccupancy(2, 0, logicGrid)).toBe(1);
    expect(mapper.computeVisualOccupancy(2, 1, logicGrid)).toBe(1);
    expect(mapper.computeVisualOccupancy(2, 2, logicGrid)).toBe(1);
  });

  test('with wall: right border of (0,0) and left border of (1,0) are empty', () => {
    bm.addWall({ x: 0, y: 0 }, { x: 1, y: 0 });
    // Right border of (0,0): vx=2
    expect(mapper.computeVisualOccupancy(2, 0, logicGrid)).toBe(0);
    expect(mapper.computeVisualOccupancy(2, 1, logicGrid)).toBe(0);
    expect(mapper.computeVisualOccupancy(2, 2, logicGrid)).toBe(0);
    // Left border of (1,0): vx=3
    expect(mapper.computeVisualOccupancy(3, 0, logicGrid)).toBe(0);
    expect(mapper.computeVisualOccupancy(3, 1, logicGrid)).toBe(0);
    expect(mapper.computeVisualOccupancy(3, 2, logicGrid)).toBe(0);
  });

  test('without wall: top border of (0,0) is occupied', () => {
    // ry=2 border cells at vy=2: all occupied
    expect(mapper.computeVisualOccupancy(0, 2, logicGrid)).toBe(1);
    expect(mapper.computeVisualOccupancy(1, 2, logicGrid)).toBe(1);
    expect(mapper.computeVisualOccupancy(2, 2, logicGrid)).toBe(1);
  });

  test('with wall: top border of (0,0) and bottom border of (0,1) are empty', () => {
    bm.addWall({ x: 0, y: 0 }, { x: 0, y: 1 });
    // Top border of (0,0): vy=2
    expect(mapper.computeVisualOccupancy(0, 2, logicGrid)).toBe(0);
    expect(mapper.computeVisualOccupancy(1, 2, logicGrid)).toBe(0);
    expect(mapper.computeVisualOccupancy(2, 2, logicGrid)).toBe(0);
    // Bottom border of (0,1): vy=3
    expect(mapper.computeVisualOccupancy(0, 3, logicGrid)).toBe(0);
    expect(mapper.computeVisualOccupancy(1, 3, logicGrid)).toBe(0);
    expect(mapper.computeVisualOccupancy(2, 3, logicGrid)).toBe(0);
  });

  test('wall does not affect center cells', () => {
    bm.addWall({ x: 0, y: 0 }, { x: 1, y: 0 });
    // Center of (0,0): vx=1, vy=1
    expect(mapper.computeVisualOccupancy(1, 1, logicGrid)).toBe(1);
    // Center of (1,0): vx=4, vy=1
    expect(mapper.computeVisualOccupancy(4, 1, logicGrid)).toBe(1);
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

  test('adding wall clears affected border cells', () => {
    bm.addWall({ x: 0, y: 0 }, { x: 1, y: 0 });
    const dirty = mapper.syncWallChange({ x: 0, y: 0 }, { x: 1, y: 0 }, logicGrid, visualGrid);
    expect(dirty.length).toBeGreaterThan(0);
    // Right border of (0,0): vx=2, vy=0,1,2 should be 0
    expect(visualGrid.getCell(2, 0)).toBe(0);
    expect(visualGrid.getCell(2, 1)).toBe(0);
    expect(visualGrid.getCell(2, 2)).toBe(0);
    // Left border of (1,0): vx=3, vy=0,1,2 should be 0
    expect(visualGrid.getCell(3, 0)).toBe(0);
    expect(visualGrid.getCell(3, 1)).toBe(0);
    expect(visualGrid.getCell(3, 2)).toBe(0);
  });

  test('removing wall restores affected border cells', () => {
    bm.addWall({ x: 0, y: 0 }, { x: 1, y: 0 });
    mapper.syncWallChange({ x: 0, y: 0 }, { x: 1, y: 0 }, logicGrid, visualGrid);

    bm.removeWall({ x: 0, y: 0 }, { x: 1, y: 0 });
    mapper.syncWallChange({ x: 0, y: 0 }, { x: 1, y: 0 }, logicGrid, visualGrid);

    // Should be restored to 1
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
});

// ════════════════════════════════════════════════════════════════
// 5. Full integration with walls
// ════════════════════════════════════════════════════════════════

describe('Full integration with walls', () => {
  test('2×2 all occupied with wall: border cells are empty', () => {
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

    // Right border of (0,0): vx=2, vy=0,1,2 should be 0
    expect(visualGrid.getCell(2, 0)).toBe(0);
    expect(visualGrid.getCell(2, 1)).toBe(0);
    expect(visualGrid.getCell(2, 2)).toBe(0);
    // Left border of (1,0): vx=3, vy=0,1,2 should be 0
    expect(visualGrid.getCell(3, 0)).toBe(0);
    expect(visualGrid.getCell(3, 1)).toBe(0);
    expect(visualGrid.getCell(3, 2)).toBe(0);
    // Border between (0,1) and (1,1) should still be 1 (no wall there)
    expect(visualGrid.getCell(2, 3)).toBe(1);
    expect(visualGrid.getCell(2, 4)).toBe(1);
    expect(visualGrid.getCell(2, 5)).toBe(1);
    expect(visualGrid.getCell(3, 3)).toBe(1);
    expect(visualGrid.getCell(3, 4)).toBe(1);
    expect(visualGrid.getCell(3, 5)).toBe(1);
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
