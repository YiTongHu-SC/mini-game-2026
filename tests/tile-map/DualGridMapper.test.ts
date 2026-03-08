import { OccupancyGrid, GridCoord } from '../../assets/scripts/tile-map/OccupancyGrid';
import { DualGridMapper } from '../../assets/scripts/tile-map/DualGridMapper';
import { AutoTileResolver } from '../../assets/scripts/tile-map/AutoTileResolver';
import { BIT, createDefaultConfig } from '../../assets/scripts/tile-map/TileMapConfig';
import { BlockManager } from '../../assets/scripts/tile-map/BlockManager';
import { STRIDE, visualGridSize } from '../../assets/scripts/tile-map/DualGridTypes';

/** Helper: convert GridCoord[] to a Set of "x,y" strings for easy comparison */
function coordSet(coords: GridCoord[]): Set<string> {
  return new Set(coords.map(c => `${c.x},${c.y}`));
}

// ════════════════════════════════════════════════════════════════
// 1. Visual grid size calculation
// ════════════════════════════════════════════════════════════════

describe('visualGridSize', () => {
  test('1×1 logic → 3×3 visual', () => {
    expect(visualGridSize(1, 1)).toEqual({ cols: 3, rows: 3 });
  });

  test('3×3 logic → 9×9 visual', () => {
    expect(visualGridSize(3, 3)).toEqual({ cols: 9, rows: 9 });
  });

  test('5×5 logic → 15×15 visual', () => {
    expect(visualGridSize(5, 5)).toEqual({ cols: 15, rows: 15 });
  });

  test('asymmetric 2×4 logic → 6×12 visual', () => {
    expect(visualGridSize(2, 4)).toEqual({ cols: 6, rows: 12 });
  });
});

// ════════════════════════════════════════════════════════════════
// 2. Cell classification (all cells are interior in 3×3 model)
// ════════════════════════════════════════════════════════════════

describe('classifyVisualCell', () => {
  const mapper = new DualGridMapper(3, 3);

  test('cell (0,0) → interior, logic (0,0)', () => {
    const info = mapper.classifyVisualCell(0, 0);
    expect(info.type).toBe('interior');
    expect(info.logicNeighbors).toEqual([{ x: 0, y: 0 }]);
  });

  test('cell (1,1) center of logic (0,0)', () => {
    const info = mapper.classifyVisualCell(1, 1);
    expect(info.type).toBe('interior');
    expect(info.logicNeighbors).toEqual([{ x: 0, y: 0 }]);
  });

  test('cell (2,2) → interior, logic (0,0)', () => {
    const info = mapper.classifyVisualCell(2, 2);
    expect(info.type).toBe('interior');
    expect(info.logicNeighbors).toEqual([{ x: 0, y: 0 }]);
  });

  test('cell (3,0) → interior, logic (1,0)', () => {
    const info = mapper.classifyVisualCell(3, 0);
    expect(info.type).toBe('interior');
    expect(info.logicNeighbors).toEqual([{ x: 1, y: 0 }]);
  });

  test('cell (4,4) → interior, logic (1,1)', () => {
    const info = mapper.classifyVisualCell(4, 4);
    expect(info.type).toBe('interior');
    expect(info.logicNeighbors).toEqual([{ x: 1, y: 1 }]);
  });

  test('cell (6,6) → interior, logic (2,2)', () => {
    const info = mapper.classifyVisualCell(6, 6);
    expect(info.type).toBe('interior');
    expect(info.logicNeighbors).toEqual([{ x: 2, y: 2 }]);
  });

  test('cell (8,8) → interior, logic (2,2)', () => {
    const info = mapper.classifyVisualCell(8, 8);
    expect(info.type).toBe('interior');
    expect(info.logicNeighbors).toEqual([{ x: 2, y: 2 }]);
  });

  test('cell (5,2) → interior, logic (1,0)', () => {
    const info = mapper.classifyVisualCell(5, 2);
    expect(info.type).toBe('interior');
    expect(info.logicNeighbors).toEqual([{ x: 1, y: 0 }]);
  });
});

// ════════════════════════════════════════════════════════════════
// 3. Occupancy computation (no walls)
// ════════════════════════════════════════════════════════════════

describe('computeVisualOccupancy (no walls)', () => {
  test('empty logic cell → all 9 visual cells empty', () => {
    const mapper = new DualGridMapper(2, 2);
    const logic = new OccupancyGrid(2, 2);

    for (let vy = 0; vy < 3; vy++) {
      for (let vx = 0; vx < 3; vx++) {
        expect(mapper.computeVisualOccupancy(vx, vy, logic)).toBe(0);
      }
    }
  });

  test('occupied logic cell → all 9 visual cells occupied', () => {
    const mapper = new DualGridMapper(2, 2);
    const logic = new OccupancyGrid(2, 2);

    logic.setCell(0, 0, 1);
    for (let vy = 0; vy < 3; vy++) {
      for (let vx = 0; vx < 3; vx++) {
        expect(mapper.computeVisualOccupancy(vx, vy, logic)).toBe(1);
      }
    }
  });

  test('adjacent occupied cells → both 3×3 regions occupied independently', () => {
    const mapper = new DualGridMapper(2, 1);
    const logic = new OccupancyGrid(2, 1);

    logic.setCell(0, 0, 1);
    logic.setCell(1, 0, 1);

    // Cell 0: visual (0-2, 0-2)
    for (let vy = 0; vy < 3; vy++) {
      for (let vx = 0; vx < 3; vx++) {
        expect(mapper.computeVisualOccupancy(vx, vy, logic)).toBe(1);
      }
    }
    // Cell 1: visual (3-5, 0-2)
    for (let vy = 0; vy < 3; vy++) {
      for (let vx = 3; vx < 6; vx++) {
        expect(mapper.computeVisualOccupancy(vx, vy, logic)).toBe(1);
      }
    }
  });

  test('only one cell occupied → neighbor region stays empty', () => {
    const mapper = new DualGridMapper(2, 1);
    const logic = new OccupancyGrid(2, 1);

    logic.setCell(0, 0, 1);

    for (let vy = 0; vy < 3; vy++) {
      for (let vx = 3; vx < 6; vx++) {
        expect(mapper.computeVisualOccupancy(vx, vy, logic)).toBe(0);
      }
    }
  });
});

// ════════════════════════════════════════════════════════════════
// 4. Occupancy computation with walls (no zeroing — walls handled by bitmask filter)
// ════════════════════════════════════════════════════════════════

describe('computeVisualOccupancy (with walls)', () => {
  test('wall does NOT zero border cells — all cells stay occupied', () => {
    const mapper = new DualGridMapper(2, 1);
    const logic = new OccupancyGrid(2, 1);
    const bm = new BlockManager();
    mapper.setBlockManager(bm);

    logic.setCell(0, 0, 1);
    logic.setCell(1, 0, 1);
    bm.addWall({ x: 0, y: 0 }, { x: 1, y: 0 });

    // All 6×3 visual cells should be 1
    for (let vx = 0; vx < 6; vx++) {
      for (let vy = 0; vy < 3; vy++) {
        expect(mapper.computeVisualOccupancy(vx, vy, logic)).toBe(1);
      }
    }
  });

  test('vertical wall does NOT zero border cells', () => {
    const mapper = new DualGridMapper(1, 2);
    const logic = new OccupancyGrid(1, 2);
    const bm = new BlockManager();
    mapper.setBlockManager(bm);

    logic.setCell(0, 0, 1);
    logic.setCell(0, 1, 1);
    bm.addWall({ x: 0, y: 0 }, { x: 0, y: 1 });

    for (let vx = 0; vx < 3; vx++) {
      for (let vy = 0; vy < 6; vy++) {
        expect(mapper.computeVisualOccupancy(vx, vy, logic)).toBe(1);
      }
    }
  });

  test('empty logic cell remains 0 regardless of walls', () => {
    const mapper = new DualGridMapper(2, 1);
    const logic = new OccupancyGrid(2, 1);
    const bm = new BlockManager();
    mapper.setBlockManager(bm);

    logic.setCell(0, 0, 1);
    // (1,0) stays empty
    bm.addWall({ x: 0, y: 0 }, { x: 1, y: 0 });

    // Right cell empty → all its visual cells 0
    for (let vx = 3; vx < 6; vx++) {
      for (let vy = 0; vy < 3; vy++) {
        expect(mapper.computeVisualOccupancy(vx, vy, logic)).toBe(0);
      }
    }
  });

  test('no wall → border cells stay occupied', () => {
    const mapper = new DualGridMapper(2, 1);
    const logic = new OccupancyGrid(2, 1);
    const bm = new BlockManager();
    mapper.setBlockManager(bm);

    logic.setCell(0, 0, 1);
    logic.setCell(1, 0, 1);

    for (let vx = 0; vx < 6; vx++) {
      for (let vy = 0; vy < 3; vy++) {
        expect(mapper.computeVisualOccupancy(vx, vy, logic)).toBe(1);
      }
    }
  });
});

// ════════════════════════════════════════════════════════════════
// 4b. createNeighborFilter — wall-aware bitmask filtering
// ════════════════════════════════════════════════════════════════

describe('createNeighborFilter', () => {
  test('same logic cell → always true', () => {
    const mapper = new DualGridMapper(3, 3);
    const bm = new BlockManager();
    mapper.setBlockManager(bm);

    const filter = mapper.createNeighborFilter();
    // (1,1) and (2,1) both in logic (0,0) → true
    expect(filter(1, 1, 2, 1)).toBe(true);
    // (0,0) and (2,2) both in logic (0,0) → true
    expect(filter(0, 0, 2, 2)).toBe(true);
  });

  test('different logic cells without wall → true', () => {
    const mapper = new DualGridMapper(3, 3);
    const bm = new BlockManager();
    mapper.setBlockManager(bm);

    const filter = mapper.createNeighborFilter();
    // (2,1) in logic (0,0) and (3,1) in logic (1,0), no wall → true
    expect(filter(2, 1, 3, 1)).toBe(true);
  });

  test('different logic cells with wall → false', () => {
    const mapper = new DualGridMapper(3, 3);
    const bm = new BlockManager();
    mapper.setBlockManager(bm);
    bm.addWall({ x: 0, y: 0 }, { x: 1, y: 0 });

    const filter = mapper.createNeighborFilter();
    // (2,1) in logic (0,0) and (3,1) in logic (1,0), wall → false
    expect(filter(2, 1, 3, 1)).toBe(false);
    // Reverse direction also false
    expect(filter(3, 1, 2, 1)).toBe(false);
  });

  test('vertical wall blocks vertical border', () => {
    const mapper = new DualGridMapper(3, 3);
    const bm = new BlockManager();
    mapper.setBlockManager(bm);
    bm.addWall({ x: 0, y: 0 }, { x: 0, y: 1 });

    const filter = mapper.createNeighborFilter();
    // (1,2) in logic (0,0) and (1,3) in logic (0,1), wall → false
    expect(filter(1, 2, 1, 3)).toBe(false);
    // Horizontal neighbor of same row not affected
    // (2,1) in logic (0,0) and (3,1) in logic (1,0), no wall → true
    expect(filter(2, 1, 3, 1)).toBe(true);
  });

  test('no blockManager → always true', () => {
    const mapper = new DualGridMapper(3, 3);
    // no setBlockManager call
    const filter = mapper.createNeighborFilter();
    expect(filter(2, 1, 3, 1)).toBe(true);
  });

  test('wall affects autotile bitmask via resolver', () => {
    const mapper = new DualGridMapper(2, 1);
    const logic = new OccupancyGrid(2, 1);
    const visual = new OccupancyGrid(6, 3);
    const bm = new BlockManager();
    mapper.setBlockManager(bm);

    logic.setCell(0, 0, 1);
    logic.setCell(1, 0, 1);
    mapper.syncAll(logic, visual);

    const resolver = new AutoTileResolver(visual, createDefaultConfig());
    resolver.setNeighborFilter(mapper.createNeighborFilter());

    // Without wall: center of (0,0) at vx=1,vy=1 should have R bit set
    const maskNoWall = resolver.resolve(1, 1).mask;
    expect(maskNoWall & BIT.R).toBeTruthy();

    // Add wall
    bm.addWall({ x: 0, y: 0 }, { x: 1, y: 0 });

    // Right border of (0,0) at vx=2,vy=1: R neighbor is (3,1) in logic(1,0) → blocked
    const maskBorder = resolver.resolve(2, 1).mask;
    expect(maskBorder & BIT.R).toBeFalsy();

    // Center of (0,0) at vx=1,vy=1: R neighbor is (2,1) in same logic cell → not blocked
    const maskCenter = resolver.resolve(1, 1).mask;
    expect(maskCenter & BIT.R).toBeTruthy();
  });
});

// ════════════════════════════════════════════════════════════════
// 5. Affected visual cells
// ════════════════════════════════════════════════════════════════

describe('getAffectedVisualCells', () => {
  test('logic cell returns exactly 9 visual cells', () => {
    const mapper = new DualGridMapper(3, 3);
    const affected = mapper.getAffectedVisualCells(1, 1);
    expect(affected).toHaveLength(9);

    const set = coordSet(affected);
    // Logic (1,1) → visual (3,3) to (5,5)
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        expect(set.has(`${3 + dx},${3 + dy}`)).toBe(true);
      }
    }
  });

  test('logic cell (0,0) → visual (0,0) to (2,2)', () => {
    const mapper = new DualGridMapper(3, 3);
    const affected = mapper.getAffectedVisualCells(0, 0);
    expect(affected).toHaveLength(9);

    const set = coordSet(affected);
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        expect(set.has(`${dx},${dy}`)).toBe(true);
      }
    }
  });

  test('logic cell (2,2) → visual (6,6) to (8,8)', () => {
    const mapper = new DualGridMapper(3, 3);
    const affected = mapper.getAffectedVisualCells(2, 2);
    expect(affected).toHaveLength(9);

    const set = coordSet(affected);
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        expect(set.has(`${6 + dx},${6 + dy}`)).toBe(true);
      }
    }
  });

  test('no duplicate coordinates', () => {
    const mapper = new DualGridMapper(3, 3);
    const affected = mapper.getAffectedVisualCells(1, 1);
    const set = coordSet(affected);
    expect(set.size).toBe(affected.length);
  });
});

// ════════════════════════════════════════════════════════════════
// 5b. Affected visual cells for wall
// ════════════════════════════════════════════════════════════════

describe('getAffectedVisualCellsForWall', () => {
  test('horizontal wall returns 6 border cells', () => {
    const mapper = new DualGridMapper(3, 3);
    const a = { x: 0, y: 0 };
    const b = { x: 1, y: 0 };
    const affected = mapper.getAffectedVisualCellsForWall(a, b);
    expect(affected).toHaveLength(6);

    const set = coordSet(affected);
    // Left cell right border: (2, 0), (2, 1), (2, 2)
    expect(set.has('2,0')).toBe(true);
    expect(set.has('2,1')).toBe(true);
    expect(set.has('2,2')).toBe(true);
    // Right cell left border: (3, 0), (3, 1), (3, 2)
    expect(set.has('3,0')).toBe(true);
    expect(set.has('3,1')).toBe(true);
    expect(set.has('3,2')).toBe(true);
  });

  test('vertical wall returns 6 border cells', () => {
    const mapper = new DualGridMapper(3, 3);
    const a = { x: 0, y: 0 };
    const b = { x: 0, y: 1 };
    const affected = mapper.getAffectedVisualCellsForWall(a, b);
    expect(affected).toHaveLength(6);

    const set = coordSet(affected);
    // Bottom cell top border: (0, 2), (1, 2), (2, 2)
    expect(set.has('0,2')).toBe(true);
    expect(set.has('1,2')).toBe(true);
    expect(set.has('2,2')).toBe(true);
    // Top cell bottom border: (0, 3), (1, 3), (2, 3)
    expect(set.has('0,3')).toBe(true);
    expect(set.has('1,3')).toBe(true);
    expect(set.has('2,3')).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════
// 6. Sync operations
// ════════════════════════════════════════════════════════════════

describe('syncAll', () => {
  test('single logic cell occupied → 3×3 visual region occupied', () => {
    const mapper = new DualGridMapper(3, 3);
    const logic = new OccupancyGrid(3, 3);
    const visual = new OccupancyGrid(9, 9);

    logic.setCell(1, 1, 1);
    logic.getDirtyAndClear();
    mapper.syncAll(logic, visual);

    // Visual cells (3,3) to (5,5) should be occupied
    for (let dy = 3; dy <= 5; dy++) {
      for (let dx = 3; dx <= 5; dx++) {
        expect(visual.getCell(dx, dy)).toBe(1);
      }
    }

    // Adjacent cell (0,1) at visual (0-2, 3-5) should be empty
    for (let dy = 3; dy <= 5; dy++) {
      for (let dx = 0; dx <= 2; dx++) {
        expect(visual.getCell(dx, dy)).toBe(0);
      }
    }
  });

  test('2×2 logic block → 6×6 visual block (no shared edges)', () => {
    const mapper = new DualGridMapper(3, 3);
    const logic = new OccupancyGrid(3, 3);
    const visual = new OccupancyGrid(9, 9);

    logic.setCell(0, 0, 1);
    logic.setCell(1, 0, 1);
    logic.setCell(0, 1, 1);
    logic.setCell(1, 1, 1);
    logic.getDirtyAndClear();
    mapper.syncAll(logic, visual);

    // All 4 cells → visual (0-5, 0-5) occupied
    for (let vy = 0; vy <= 5; vy++) {
      for (let vx = 0; vx <= 5; vx++) {
        expect(visual.getCell(vx, vy)).toBe(1);
      }
    }

    // Unoccupied cell (2,0) at visual (6-8, 0-2) empty
    for (let vy = 0; vy <= 2; vy++) {
      for (let vx = 6; vx <= 8; vx++) {
        expect(visual.getCell(vx, vy)).toBe(0);
      }
    }
  });

  test('two adjacent horizontal logic cells → two independent 3×3 blocks', () => {
    const mapper = new DualGridMapper(3, 1);
    const logic = new OccupancyGrid(3, 1);
    const visual = new OccupancyGrid(9, 3);

    logic.setCell(0, 0, 1);
    logic.setCell(1, 0, 1);
    logic.getDirtyAndClear();
    mapper.syncAll(logic, visual);

    // Cell 0 visual (0-2, 0-2) occupied
    for (let vy = 0; vy < 3; vy++) {
      for (let vx = 0; vx < 3; vx++) {
        expect(visual.getCell(vx, vy)).toBe(1);
      }
    }
    // Cell 1 visual (3-5, 0-2) occupied
    for (let vy = 0; vy < 3; vy++) {
      for (let vx = 3; vx < 6; vx++) {
        expect(visual.getCell(vx, vy)).toBe(1);
      }
    }
    // Cell 2 visual (6-8, 0-2) empty
    for (let vy = 0; vy < 3; vy++) {
      for (let vx = 6; vx < 9; vx++) {
        expect(visual.getCell(vx, vy)).toBe(0);
      }
    }
  });
});

describe('syncLogicCell', () => {
  test('toggling logic cell returns dirty list', () => {
    const mapper = new DualGridMapper(2, 2);
    const logic = new OccupancyGrid(2, 2);
    const visual = new OccupancyGrid(6, 6);

    logic.setCell(0, 0, 1);
    logic.getDirtyAndClear();

    const dirty = mapper.syncLogicCell(0, 0, logic, visual);
    expect(dirty.length).toBeGreaterThan(0);

    // Visual (0-2, 0-2) should be occupied
    for (let dy = 0; dy <= 2; dy++) {
      for (let dx = 0; dx <= 2; dx++) {
        expect(visual.getCell(dx, dy)).toBe(1);
      }
    }
  });

  test('enabling then disabling adjacent cell keeps regions independent', () => {
    const mapper = new DualGridMapper(2, 1);
    const logic = new OccupancyGrid(2, 1);
    const visual = new OccupancyGrid(6, 3);

    // Enable (0,0)
    logic.setCell(0, 0, 1);
    logic.getDirtyAndClear();
    mapper.syncLogicCell(0, 0, logic, visual);

    // Enable (1,0)
    logic.setCell(1, 0, 1);
    logic.getDirtyAndClear();
    mapper.syncLogicCell(1, 0, logic, visual);

    // Both regions occupied
    expect(visual.getCell(2, 1)).toBe(1); // cell 0 right border
    expect(visual.getCell(3, 1)).toBe(1); // cell 1 left border

    // Disable (1,0) — cell 1 region clears
    logic.setCell(1, 0, 0);
    logic.getDirtyAndClear();
    mapper.syncLogicCell(1, 0, logic, visual);

    expect(visual.getCell(3, 1)).toBe(0);
    expect(visual.getCell(4, 1)).toBe(0);

    // (0,0) still occupied
    expect(visual.getCell(0, 0)).toBe(1);
    expect(visual.getCell(1, 1)).toBe(1);
  });

  test('2×2 block forms 6×6 then removing one cell breaks it', () => {
    const mapper = new DualGridMapper(2, 2);
    const logic = new OccupancyGrid(2, 2);
    const visual = new OccupancyGrid(6, 6);

    // Enable all 4 logic cells
    for (let ly = 0; ly < 2; ly++) {
      for (let lx = 0; lx < 2; lx++) {
        logic.setCell(lx, ly, 1);
        logic.getDirtyAndClear();
        mapper.syncLogicCell(lx, ly, logic, visual);
      }
    }

    // All 6×6 should be occupied
    for (let vy = 0; vy < 6; vy++) {
      for (let vx = 0; vx < 6; vx++) {
        expect(visual.getCell(vx, vy)).toBe(1);
      }
    }

    // Remove logic cell (1,1) → visual (3-5, 3-5) clears
    logic.setCell(1, 1, 0);
    logic.getDirtyAndClear();
    mapper.syncLogicCell(1, 1, logic, visual);

    expect(visual.getCell(3, 3)).toBe(0);
    expect(visual.getCell(4, 4)).toBe(0);
    expect(visual.getCell(5, 5)).toBe(0);

    // (0,0) still occupied
    expect(visual.getCell(1, 1)).toBe(1);
    // (1,0) still occupied
    expect(visual.getCell(4, 1)).toBe(1);
    // (0,1) still occupied
    expect(visual.getCell(1, 4)).toBe(1);
  });
});
