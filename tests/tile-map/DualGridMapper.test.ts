import { OccupancyGrid, GridCoord } from '../../assets/scripts/tile-map/OccupancyGrid';
import { DualGridMapper } from '../../assets/scripts/tile-map/DualGridMapper';
import { STRIDE, visualGridSize } from '../../assets/scripts/tile-map/DualGridTypes';

/** Helper: convert GridCoord[] to a Set of "x,y" strings for easy comparison */
function coordSet(coords: GridCoord[]): Set<string> {
  return new Set(coords.map(c => `${c.x},${c.y}`));
}

// ════════════════════════════════════════════════════════════════
// 1. Visual grid size calculation
// ════════════════════════════════════════════════════════════════

describe('visualGridSize', () => {
  test('1×1 logic → 5×5 visual', () => {
    expect(visualGridSize(1, 1)).toEqual({ cols: 5, rows: 5 });
  });

  test('3×3 logic → 13×13 visual', () => {
    expect(visualGridSize(3, 3)).toEqual({ cols: 13, rows: 13 });
  });

  test('5×5 logic → 21×21 visual', () => {
    expect(visualGridSize(5, 5)).toEqual({ cols: 21, rows: 21 });
  });

  test('asymmetric 2×4 logic → 9×17 visual', () => {
    expect(visualGridSize(2, 4)).toEqual({ cols: 9, rows: 17 });
  });
});

// ════════════════════════════════════════════════════════════════
// 2. Cell classification
// ════════════════════════════════════════════════════════════════

describe('classifyVisualCell', () => {
  const mapper = new DualGridMapper(3, 3);

  test('interior cell (1,1) → type interior, logic (0,0)', () => {
    const info = mapper.classifyVisualCell(1, 1);
    expect(info.type).toBe('interior');
    expect(info.logicNeighbors).toEqual([{ x: 0, y: 0 }]);
  });

  test('interior cell (2,3) → type interior, logic (0,0)', () => {
    const info = mapper.classifyVisualCell(2, 3);
    expect(info.type).toBe('interior');
    expect(info.logicNeighbors).toEqual([{ x: 0, y: 0 }]);
  });

  test('interior cell (5,5) → type interior, logic (1,1)', () => {
    const info = mapper.classifyVisualCell(5, 5);
    expect(info.type).toBe('interior');
    expect(info.logicNeighbors).toEqual([{ x: 1, y: 1 }]);
  });

  test('v-edge at (0,1) → left logic (-1,0), right logic (0,0)', () => {
    const info = mapper.classifyVisualCell(0, 1);
    expect(info.type).toBe('v-edge');
    expect(info.logicNeighbors).toEqual([
      { x: -1, y: 0 },
      { x: 0, y: 0 },
    ]);
  });

  test('v-edge at (4,2) → left logic (0,0), right logic (1,0)', () => {
    const info = mapper.classifyVisualCell(4, 2);
    expect(info.type).toBe('v-edge');
    expect(info.logicNeighbors).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
  });

  test('h-edge at (1,0) → bottom logic (0,-1), top logic (0,0)', () => {
    const info = mapper.classifyVisualCell(1, 0);
    expect(info.type).toBe('h-edge');
    expect(info.logicNeighbors).toEqual([
      { x: 0, y: -1 },
      { x: 0, y: 0 },
    ]);
  });

  test('h-edge at (2,4) → bottom logic (0,0), top logic (0,1)', () => {
    const info = mapper.classifyVisualCell(2, 4);
    expect(info.type).toBe('h-edge');
    expect(info.logicNeighbors).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 1 },
    ]);
  });

  test('corner at (0,0) → 4 logic cells including (-1,-1)', () => {
    const info = mapper.classifyVisualCell(0, 0);
    expect(info.type).toBe('corner');
    expect(info.logicNeighbors).toHaveLength(4);
    expect(info.logicNeighbors).toEqual([
      { x: -1, y: -1 },
      { x: 0, y: -1 },
      { x: -1, y: 0 },
      { x: 0, y: 0 },
    ]);
  });

  test('corner at (4,4) → logic cells (0,0), (1,0), (0,1), (1,1)', () => {
    const info = mapper.classifyVisualCell(4, 4);
    expect(info.type).toBe('corner');
    expect(info.logicNeighbors).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
  });
});

// ════════════════════════════════════════════════════════════════
// 3. Occupancy computation (AND rule)
// ════════════════════════════════════════════════════════════════

describe('computeVisualOccupancy (AND)', () => {
  test('interior follows its logic cell', () => {
    const mapper = new DualGridMapper(2, 2);
    const logic = new OccupancyGrid(2, 2);

    // Logic (0,0) empty → interior (1,1) empty
    expect(mapper.computeVisualOccupancy(1, 1, logic)).toBe(0);

    // Logic (0,0) occupied → interior (1,1) occupied
    logic.setCell(0, 0, 1);
    expect(mapper.computeVisualOccupancy(1, 1, logic)).toBe(1);
    expect(mapper.computeVisualOccupancy(2, 2, logic)).toBe(1);
    expect(mapper.computeVisualOccupancy(3, 3, logic)).toBe(1);
  });

  test('v-edge requires both sides occupied (AND)', () => {
    const mapper = new DualGridMapper(2, 1);
    const logic = new OccupancyGrid(2, 1);

    // v-edge at (4,1) between logic (0,0) and (1,0)
    logic.setCell(0, 0, 1);
    expect(mapper.computeVisualOccupancy(4, 1, logic)).toBe(0); // only left side

    logic.setCell(1, 0, 1);
    expect(mapper.computeVisualOccupancy(4, 1, logic)).toBe(1); // both sides
  });

  test('h-edge requires both sides occupied (AND)', () => {
    const mapper = new DualGridMapper(1, 2);
    const logic = new OccupancyGrid(1, 2);

    // h-edge at (1,4) between logic (0,0) and (0,1)
    logic.setCell(0, 0, 1);
    expect(mapper.computeVisualOccupancy(1, 4, logic)).toBe(0); // only bottom

    logic.setCell(0, 1, 1);
    expect(mapper.computeVisualOccupancy(1, 4, logic)).toBe(1); // both sides
  });

  test('corner requires all 4 logic cells occupied (AND)', () => {
    const mapper = new DualGridMapper(2, 2);
    const logic = new OccupancyGrid(2, 2);

    // Corner at (4,4) between logic (0,0), (1,0), (0,1), (1,1)
    logic.setCell(0, 0, 1);
    logic.setCell(1, 0, 1);
    logic.setCell(0, 1, 1);
    expect(mapper.computeVisualOccupancy(4, 4, logic)).toBe(0); // 3 of 4

    logic.setCell(1, 1, 1);
    expect(mapper.computeVisualOccupancy(4, 4, logic)).toBe(1); // all 4
  });

  test('boundary edge always 0 (one side out-of-bounds)', () => {
    const mapper = new DualGridMapper(2, 2);
    const logic = new OccupancyGrid(2, 2);
    logic.setCell(0, 0, 1);
    logic.setCell(1, 0, 1);

    // Left boundary v-edge at (0,1) — left neighbor is (-1,0) → OOB → 0
    expect(mapper.computeVisualOccupancy(0, 1, logic)).toBe(0);

    // Bottom boundary h-edge at (1,0) — bottom neighbor is (0,-1) → OOB → 0
    expect(mapper.computeVisualOccupancy(1, 0, logic)).toBe(0);
  });

  test('boundary corner always 0 (at least one neighbor OOB)', () => {
    const mapper = new DualGridMapper(2, 2);
    const logic = new OccupancyGrid(2, 2);
    logic.setCell(0, 0, 1);
    logic.setCell(1, 0, 1);
    logic.setCell(0, 1, 1);
    logic.setCell(1, 1, 1);

    // Corner (0,0) → neighbors include (-1,-1) → OOB
    expect(mapper.computeVisualOccupancy(0, 0, logic)).toBe(0);
    // Corner (8,8) → neighbors include (2,2) → OOB
    expect(mapper.computeVisualOccupancy(8, 8, logic)).toBe(0);

    // Internal corner (4,4) → all 4 neighbors in-bounds and occupied
    expect(mapper.computeVisualOccupancy(4, 4, logic)).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════
// 4. Occupancy computation (OR rule)
// ════════════════════════════════════════════════════════════════

describe('computeVisualOccupancy (OR)', () => {
  test('v-edge occupied if either side occupied', () => {
    const mapper = new DualGridMapper(2, 1, 'or');
    const logic = new OccupancyGrid(2, 1);

    logic.setCell(0, 0, 1);
    expect(mapper.computeVisualOccupancy(4, 1, logic)).toBe(1); // just left side
  });

  test('corner occupied if any of 4 neighbors occupied', () => {
    const mapper = new DualGridMapper(2, 2, 'or');
    const logic = new OccupancyGrid(2, 2);

    logic.setCell(1, 1, 1); // top-right only
    expect(mapper.computeVisualOccupancy(4, 4, logic)).toBe(1);
  });

  test('boundary edge can be occupied with OR rule', () => {
    const mapper = new DualGridMapper(1, 1, 'or');
    const logic = new OccupancyGrid(1, 1);

    logic.setCell(0, 0, 1);
    // Left boundary v-edge at (0,1) — one neighbor is OOB but (0,0) is occupied
    expect(mapper.computeVisualOccupancy(0, 1, logic)).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════
// 5. Affected visual cells
// ════════════════════════════════════════════════════════════════

describe('getAffectedVisualCells', () => {
  test('center logic cell in 3×3 grid returns 25 cells', () => {
    const mapper = new DualGridMapper(3, 3);
    const affected = mapper.getAffectedVisualCells(1, 1);
    expect(affected).toHaveLength(25);

    const set = coordSet(affected);
    // Interior 3×3: (5,5) to (7,7)
    for (let dy = 1; dy <= 3; dy++) {
      for (let dx = 1; dx <= 3; dx++) {
        expect(set.has(`${4 + dx},${4 + dy}`)).toBe(true);
      }
    }
    // Left v-edge: (4,5), (4,6), (4,7)
    expect(set.has('4,5')).toBe(true);
    expect(set.has('4,6')).toBe(true);
    expect(set.has('4,7')).toBe(true);
    // Right v-edge: (8,5), (8,6), (8,7)
    expect(set.has('8,5')).toBe(true);
    expect(set.has('8,6')).toBe(true);
    expect(set.has('8,7')).toBe(true);
    // 4 corners
    expect(set.has('4,4')).toBe(true);
    expect(set.has('8,4')).toBe(true);
    expect(set.has('4,8')).toBe(true);
    expect(set.has('8,8')).toBe(true);
  });

  test('corner logic cell (0,0) in 2×2 grid filters OOB', () => {
    const mapper = new DualGridMapper(2, 2);
    // Logic (0,0): baseX=0, baseY=0
    // Interior (1-3, 1-3): 9 cells, all in bounds (visual 9×9)
    // Left v-edge: (0, 1-3): 3 cells, in bounds
    // Right v-edge: (4, 1-3): 3 cells, in bounds
    // Bottom h-edge: (1-3, 0): 3 cells, in bounds
    // Top h-edge: (1-3, 4): 3 cells, in bounds
    // Corners: (0,0), (4,0), (0,4), (4,4): all in bounds for 9×9 grid
    const affected = mapper.getAffectedVisualCells(0, 0);
    expect(affected).toHaveLength(25);
  });

  test('no duplicate coordinates', () => {
    const mapper = new DualGridMapper(3, 3);
    const affected = mapper.getAffectedVisualCells(1, 1);
    const set = coordSet(affected);
    expect(set.size).toBe(affected.length);
  });
});

// ════════════════════════════════════════════════════════════════
// 6. Sync operations
// ════════════════════════════════════════════════════════════════

describe('syncAll', () => {
  test('single logic cell occupied → 3×3 interior occupied, edges/corners empty', () => {
    const mapper = new DualGridMapper(3, 3);
    const logic = new OccupancyGrid(3, 3);
    const visual = new OccupancyGrid(13, 13);

    logic.setCell(1, 1, 1);
    logic.getDirtyAndClear();
    mapper.syncAll(logic, visual);

    // Interior cells (5,5) to (7,7) should be occupied
    for (let dy = 5; dy <= 7; dy++) {
      for (let dx = 5; dx <= 7; dx++) {
        expect(visual.getCell(dx, dy)).toBe(1);
      }
    }

    // Left v-edge (4,5-7) should be empty (left neighbor (0,1) is empty)
    for (let dy = 5; dy <= 7; dy++) {
      expect(visual.getCell(4, dy)).toBe(0);
    }

    // Corner (4,4) should be empty
    expect(visual.getCell(4, 4)).toBe(0);
  });

  test('2×2 logic block → 7×7 visual block with interior corner filled', () => {
    const mapper = new DualGridMapper(3, 3);
    const logic = new OccupancyGrid(3, 3);
    const visual = new OccupancyGrid(13, 13);

    // Fill a 2×2 block at logic (0,0)-(1,1)
    logic.setCell(0, 0, 1);
    logic.setCell(1, 0, 1);
    logic.setCell(0, 1, 1);
    logic.setCell(1, 1, 1);
    logic.getDirtyAndClear();
    mapper.syncAll(logic, visual);

    // The entire 7×7 region from (1,1) to (7,7) should be occupied
    for (let vy = 1; vy <= 7; vy++) {
      for (let vx = 1; vx <= 7; vx++) {
        expect(visual.getCell(vx, vy)).toBe(1);
      }
    }

    // The internal shared edge at (4,1-3), (4,5-7) should be occupied
    for (let vy = 1; vy <= 7; vy++) {
      expect(visual.getCell(4, vy)).toBe(1);
    }

    // The internal corner at (4,4) should be occupied
    expect(visual.getCell(4, 4)).toBe(1);

    // Boundary edges at (0,1) should be empty
    expect(visual.getCell(0, 1)).toBe(0);
  });

  test('two adjacent horizontal logic cells → shared edge occupied', () => {
    const mapper = new DualGridMapper(3, 1);
    const logic = new OccupancyGrid(3, 1);
    const visual = new OccupancyGrid(13, 5);

    logic.setCell(0, 0, 1);
    logic.setCell(1, 0, 1);
    logic.getDirtyAndClear();
    mapper.syncAll(logic, visual);

    // Shared v-edge at (4, 1-3) should be occupied
    expect(visual.getCell(4, 1)).toBe(1);
    expect(visual.getCell(4, 2)).toBe(1);
    expect(visual.getCell(4, 3)).toBe(1);

    // Non-shared v-edge at (8, 1-3) — right side of cell 1, left of cell 2 (empty)
    expect(visual.getCell(8, 1)).toBe(0);
  });
});

describe('syncLogicCell', () => {
  test('toggling logic cell returns dirty list', () => {
    const mapper = new DualGridMapper(2, 2);
    const logic = new OccupancyGrid(2, 2);
    const visual = new OccupancyGrid(9, 9);

    logic.setCell(0, 0, 1);
    logic.getDirtyAndClear();

    const dirty = mapper.syncLogicCell(0, 0, logic, visual);
    // dirty should contain the affected visual cells AND their neighbors
    expect(dirty.length).toBeGreaterThan(0);

    // Interior (1,1)-(3,3) should now be occupied in visual grid
    for (let dy = 1; dy <= 3; dy++) {
      for (let dx = 1; dx <= 3; dx++) {
        expect(visual.getCell(dx, dy)).toBe(1);
      }
    }
  });

  test('enabling then disabling adjacent cell updates shared edge', () => {
    const mapper = new DualGridMapper(2, 1);
    const logic = new OccupancyGrid(2, 1);
    const visual = new OccupancyGrid(9, 5);

    // Enable (0,0)
    logic.setCell(0, 0, 1);
    logic.getDirtyAndClear();
    mapper.syncLogicCell(0, 0, logic, visual);

    // Enable (1,0) — shared v-edge at (4,1-3) should now be occupied
    logic.setCell(1, 0, 1);
    logic.getDirtyAndClear();
    mapper.syncLogicCell(1, 0, logic, visual);

    expect(visual.getCell(4, 1)).toBe(1);
    expect(visual.getCell(4, 2)).toBe(1);
    expect(visual.getCell(4, 3)).toBe(1);

    // Disable (1,0) — shared edge should return to 0
    logic.setCell(1, 0, 0);
    logic.getDirtyAndClear();
    mapper.syncLogicCell(1, 0, logic, visual);

    expect(visual.getCell(4, 1)).toBe(0);
    expect(visual.getCell(4, 2)).toBe(0);
    expect(visual.getCell(4, 3)).toBe(0);

    // (0,0) interior should still be occupied
    expect(visual.getCell(1, 1)).toBe(1);
  });

  test('2×2 block forms solid 7×7 then removing one cell breaks it', () => {
    const mapper = new DualGridMapper(2, 2);
    const logic = new OccupancyGrid(2, 2);
    const visual = new OccupancyGrid(9, 9);

    // Enable all 4 logic cells
    for (let ly = 0; ly < 2; ly++) {
      for (let lx = 0; lx < 2; lx++) {
        logic.setCell(lx, ly, 1);
        logic.getDirtyAndClear();
        mapper.syncLogicCell(lx, ly, logic, visual);
      }
    }

    // Internal corner (4,4) should be occupied
    expect(visual.getCell(4, 4)).toBe(1);
    // Internal v-edge (4,1-3) occupied
    expect(visual.getCell(4, 2)).toBe(1);

    // Remove logic cell (1,1)
    logic.setCell(1, 1, 0);
    logic.getDirtyAndClear();
    mapper.syncLogicCell(1, 1, logic, visual);

    // Internal corner (4,4) should now be empty
    expect(visual.getCell(4, 4)).toBe(0);
    // v-edge at (4,5-7) — between (0,1) and (1,1) — should now be empty
    expect(visual.getCell(4, 5)).toBe(0);
    // But v-edge at (4,1-3) — between (0,0) and (1,0) — still occupied
    expect(visual.getCell(4, 2)).toBe(1);
  });
});
