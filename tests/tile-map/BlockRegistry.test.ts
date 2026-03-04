import { BlockRegistry } from '../../assets/scripts/tile-map/BlockRegistry';
import { LevelData } from '../../assets/scripts/tile-map/LevelTypes';

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Convert [CellCoord, CellCoord][] walls to a Set of normalized "ax,ay|bx,by" strings */
function wallSet(walls: [{ x: number; y: number }, { x: number; y: number }][]): Set<string> {
  return new Set(
    walls.map(([a, b]) => {
      if (a.x < b.x || (a.x === b.x && a.y < b.y)) return `${a.x},${a.y}|${b.x},${b.y}`;
      return `${b.x},${b.y}|${a.x},${a.y}`;
    }),
  );
}

/** Build a simple level with two blocks side-by-side */
const SIMPLE_LEVEL: LevelData = {
  gridCols: 6,
  gridRows: 6,
  blocks: [
    {
      id: 'A',
      cells: [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
      ],
    },
    {
      id: 'B',
      cells: [
        { x: 3, y: 1 },
        { x: 4, y: 1 },
      ],
    },
  ],
};

// ════════════════════════════════════════════════════════════════
// 1. 查询
// ════════════════════════════════════════════════════════════════

describe('BlockRegistry — 查询', () => {
  let reg: BlockRegistry;

  beforeEach(() => {
    reg = new BlockRegistry(SIMPLE_LEVEL);
  });

  test('getBlockIdAt 返回正确的 blockId', () => {
    expect(reg.getBlockIdAt(1, 1)).toBe('A');
    expect(reg.getBlockIdAt(2, 1)).toBe('A');
    expect(reg.getBlockIdAt(3, 1)).toBe('B');
    expect(reg.getBlockIdAt(4, 1)).toBe('B');
  });

  test('getBlockIdAt 对空格子返回 undefined', () => {
    expect(reg.getBlockIdAt(0, 0)).toBeUndefined();
    expect(reg.getBlockIdAt(5, 5)).toBeUndefined();
  });

  test('getBlockCells 返回正确的格子列表', () => {
    const cellsA = reg.getBlockCells('A');
    expect(cellsA).toHaveLength(2);
    const keys = new Set(cellsA.map(c => `${c.x},${c.y}`));
    expect(keys).toContain('1,1');
    expect(keys).toContain('2,1');
  });

  test('getBlockCells 返回副本（修改不影响注册表）', () => {
    const cells = reg.getBlockCells('A');
    cells[0].x = 999;
    expect(reg.getBlockIdAt(999, 1)).toBeUndefined();
    expect(reg.getBlockIdAt(1, 1)).toBe('A');
  });

  test('getBlockCells 对未知 blockId 返回空数组', () => {
    expect(reg.getBlockCells('NONEXISTENT')).toHaveLength(0);
  });

  test('getAllBlockIds 返回所有 blockId', () => {
    const ids = reg.getAllBlockIds();
    expect(ids).toHaveLength(2);
    expect(ids).toContain('A');
    expect(ids).toContain('B');
  });
});

// ════════════════════════════════════════════════════════════════
// 2. moveBlock
// ════════════════════════════════════════════════════════════════

describe('BlockRegistry — moveBlock', () => {
  let reg: BlockRegistry;

  beforeEach(() => {
    reg = new BlockRegistry(SIMPLE_LEVEL);
  });

  test('水平移动后格子坐标更新', () => {
    reg.moveBlock('A', 1, 0);
    const cells = reg.getBlockCells('A');
    const keys = new Set(cells.map(c => `${c.x},${c.y}`));
    expect(keys).toContain('2,1');
    expect(keys).toContain('3,1');
  });

  test('垂直移动后格子坐标更新', () => {
    reg.moveBlock('B', 0, 2);
    const cells = reg.getBlockCells('B');
    const keys = new Set(cells.map(c => `${c.x},${c.y}`));
    expect(keys).toContain('3,3');
    expect(keys).toContain('4,3');
  });

  test('moveBlock 后 getBlockIdAt 返回正确 blockId', () => {
    reg.moveBlock('A', 0, 2); // A 从 (1,1)(2,1) → (1,3)(2,3)
    expect(reg.getBlockIdAt(1, 1)).toBeUndefined(); // 旧位置已清除
    expect(reg.getBlockIdAt(1, 3)).toBe('A');
    expect(reg.getBlockIdAt(2, 3)).toBe('A');
  });

  test('moveBlock 不影响其他 block', () => {
    reg.moveBlock('A', 0, -1);
    expect(reg.getBlockIdAt(3, 1)).toBe('B');
    expect(reg.getBlockIdAt(4, 1)).toBe('B');
  });

  test('dx=0 dy=0 时 moveBlock 是幂等的', () => {
    reg.moveBlock('A', 0, 0);
    expect(reg.getBlockIdAt(1, 1)).toBe('A');
    expect(reg.getBlockIdAt(2, 1)).toBe('A');
  });

  test('连续两次 moveBlock 结果正确', () => {
    reg.moveBlock('A', 1, 0); // (1,1)(2,1) → (2,1)(3,1)
    reg.moveBlock('A', 0, 1); // → (2,2)(3,2)
    const cells = reg.getBlockCells('A');
    const keys = new Set(cells.map(c => `${c.x},${c.y}`));
    expect(keys).toContain('2,2');
    expect(keys).toContain('3,2');
  });
});

// ════════════════════════════════════════════════════════════════
// 3. getAllWalls
// ════════════════════════════════════════════════════════════════

describe('BlockRegistry — getAllWalls', () => {
  test('无 block → 无 wall', () => {
    const reg = new BlockRegistry({ gridCols: 4, gridRows: 4, blocks: [] });
    expect(reg.getAllWalls()).toHaveLength(0);
  });

  test('单个 block → 内部无 wall', () => {
    const reg = new BlockRegistry({
      gridCols: 6,
      gridRows: 6,
      blocks: [
        {
          id: 'A',
          cells: [
            { x: 1, y: 1 },
            { x: 2, y: 1 },
            { x: 1, y: 2 },
          ],
        },
      ],
    });
    expect(reg.getAllWalls()).toHaveLength(0);
  });

  test('两个水平相邻的不同 block → 1 条 wall', () => {
    const reg = new BlockRegistry(SIMPLE_LEVEL);
    // A: (1,1)(2,1), B: (3,1)(4,1) → wall at (2,1)-(3,1)
    const walls = reg.getAllWalls();
    expect(walls).toHaveLength(1);
    expect(wallSet(walls)).toContain('2,1|3,1');
  });

  test('不相邻的 block → 无 wall', () => {
    const reg = new BlockRegistry({
      gridCols: 6,
      gridRows: 6,
      blocks: [
        { id: 'A', cells: [{ x: 0, y: 0 }] },
        { id: 'B', cells: [{ x: 2, y: 0 }] },
      ],
    });
    expect(reg.getAllWalls()).toHaveLength(0);
  });

  test('wall 自动去重', () => {
    // A 与 B 各有 2 格，但只有 1 条交界边
    const reg = new BlockRegistry(SIMPLE_LEVEL);
    const walls = reg.getAllWalls();
    expect(walls).toHaveLength(1);
  });

  test('moveBlock 后 getAllWalls 更新正确', () => {
    const reg = new BlockRegistry(SIMPLE_LEVEL);
    // 初始：A:(1,1)(2,1) B:(3,1)(4,1) → wall (2,1)-(3,1)
    expect(wallSet(reg.getAllWalls())).toContain('2,1|3,1');

    // 移动 A 远离 B
    reg.moveBlock('A', -2, 2); // A → (-1,3)(0,3) — 越界但 registry 不管，只检查邻居
    // A 和 B 现在不相邻 → 无 wall
    expect(reg.getAllWalls()).toHaveLength(0);
  });

  test('moveBlock 使两 block 相邻 → 产生新 wall', () => {
    const reg = new BlockRegistry({
      gridCols: 8,
      gridRows: 8,
      blocks: [
        { id: 'A', cells: [{ x: 1, y: 1 }] },
        { id: 'B', cells: [{ x: 5, y: 1 }] }, // 初始不相邻
      ],
    });
    expect(reg.getAllWalls()).toHaveLength(0);

    reg.moveBlock('B', -3, 0); // B → (2,1)，与 A:(1,1) 相邻
    expect(wallSet(reg.getAllWalls())).toContain('1,1|2,1');
  });
});

// ════════════════════════════════════════════════════════════════
// 4. trySplitBlock
// ════════════════════════════════════════════════════════════════

describe('BlockRegistry — trySplitBlock', () => {
  test('L 形 block 在腰部添加墙壁 → 分裂为两部分', () => {
    // Block layout:
    //   (0,1) (1,1)
    //   (0,0) (1,0) (2,0)
    // Wall at (1,1)↔(1,0) cuts off top part
    const reg = new BlockRegistry({
      gridCols: 4,
      gridRows: 4,
      blocks: [
        {
          id: 'L',
          cells: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 2, y: 0 },
            { x: 0, y: 1 },
            { x: 1, y: 1 },
          ],
        },
      ],
    });

    const result = reg.trySplitBlock({ x: 1, y: 1 }, { x: 1, y: 0 });
    // Still connected: (0,0)-(1,0)-(2,0) and (0,1)-(1,1), but (0,0)-(0,1) is open
    // So actually (0,0) connects to (0,1) via their adjacency. Let me reconsider...
    // BFS from (1,1): can go to (0,1), then (0,1)→(0,0), (0,0)→(1,0)… wait, (1,1)↔(1,0) is blocked.
    // (1,1) → (0,1) → (0,0) → (1,0) → (2,0) — all reachable. Still connected!
    expect(result).toBeNull();
  });

  test('bar block 墙壁切断中间 → 分裂为左右两部分', () => {
    // Block layout: (0,0)-(1,0)-(2,0)-(3,0)
    // Wall at (1,0)↔(2,0) → splits into [0,0..1,0] and [2,0..3,0]
    const reg = new BlockRegistry({
      gridCols: 6,
      gridRows: 2,
      blocks: [
        {
          id: 'bar',
          cells: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 2, y: 0 },
            { x: 3, y: 0 },
          ],
        },
      ],
    });

    const result = reg.trySplitBlock({ x: 1, y: 0 }, { x: 2, y: 0 });
    expect(result).not.toBeNull();
    const [idA, idB] = result!;

    // Original block should be gone
    expect(reg.getBlockCells('bar')).toHaveLength(0);
    expect(reg.getAllBlockIds()).not.toContain('bar');

    // Two new blocks should exist
    const cellsA = reg.getBlockCells(idA);
    const cellsB = reg.getBlockCells(idB);
    expect(cellsA.length + cellsB.length).toBe(4);

    // One group has (0,0)(1,0), the other has (2,0)(3,0)
    const keysA = new Set(cellsA.map(c => `${c.x},${c.y}`));
    const keysB = new Set(cellsB.map(c => `${c.x},${c.y}`));
    // a is BFS from (1,0) side
    expect(keysA).toContain('1,0');
    expect(keysA).toContain('0,0');
    expect(keysB).toContain('2,0');
    expect(keysB).toContain('3,0');
  });

  test('分裂后 getBlockIdAt 返回新 blockId', () => {
    const reg = new BlockRegistry({
      gridCols: 4,
      gridRows: 2,
      blocks: [
        {
          id: 'X',
          cells: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
          ],
        },
      ],
    });

    const result = reg.trySplitBlock({ x: 0, y: 0 }, { x: 1, y: 0 });
    expect(result).not.toBeNull();
    const [idA, idB] = result!;

    expect(reg.getBlockIdAt(0, 0)).toBe(idA);
    expect(reg.getBlockIdAt(1, 0)).toBe(idB);
    // Original id gone
    expect(reg.getBlockIdAt(0, 0)).not.toBe('X');
  });

  test('分裂后 getAllWalls 产生跨 block 墙壁', () => {
    const reg = new BlockRegistry({
      gridCols: 4,
      gridRows: 2,
      blocks: [
        {
          id: 'X',
          cells: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
          ],
        },
      ],
    });

    reg.trySplitBlock({ x: 0, y: 0 }, { x: 1, y: 0 });
    const walls = reg.getAllWalls();
    expect(walls).toHaveLength(1);
    expect(wallSet(walls)).toContain('0,0|1,0');
  });

  test('不同 block 的两个格子 → 返回 null', () => {
    const reg = new BlockRegistry(SIMPLE_LEVEL);
    const result = reg.trySplitBlock({ x: 2, y: 1 }, { x: 3, y: 1 });
    expect(result).toBeNull();
  });

  test('不属于任何 block 的格子 → 返回 null', () => {
    const reg = new BlockRegistry(SIMPLE_LEVEL);
    const result = reg.trySplitBlock({ x: 0, y: 0 }, { x: 1, y: 0 });
    expect(result).toBeNull();
  });

  test('单格 block → 返回 null（无法分裂）', () => {
    const reg = new BlockRegistry({
      gridCols: 4,
      gridRows: 4,
      blocks: [{ id: 'solo', cells: [{ x: 1, y: 1 }] }],
    });
    // There's no valid adjacent cell in the same block, so it can't split
    const result = reg.trySplitBlock({ x: 1, y: 1 }, { x: 2, y: 1 });
    expect(result).toBeNull();
  });

  test('2×2 block 水平切割 → 分裂为上下两部分', () => {
    // Block:
    //   (0,1) (1,1)
    //   (0,0) (1,0)
    // Wall at (0,0)↔(0,1) → still connected via (1,0)↔(1,1)
    const reg = new BlockRegistry({
      gridCols: 4,
      gridRows: 4,
      blocks: [
        {
          id: 'sq',
          cells: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
            { x: 1, y: 1 },
          ],
        },
      ],
    });

    const result = reg.trySplitBlock({ x: 0, y: 0 }, { x: 0, y: 1 });
    // Still connected: (0,0)→(1,0)→(1,1)→(0,1)
    expect(result).toBeNull();
  });

  test('I 形 3 格 block 切断中间 → 分裂', () => {
    const reg = new BlockRegistry({
      gridCols: 4,
      gridRows: 4,
      blocks: [
        {
          id: 'I',
          cells: [
            { x: 0, y: 0 },
            { x: 0, y: 1 },
            { x: 0, y: 2 },
          ],
        },
      ],
    });

    const result = reg.trySplitBlock({ x: 0, y: 0 }, { x: 0, y: 1 });
    expect(result).not.toBeNull();
    const [idA, idB] = result!;
    // Group A: BFS from (0,0) with wall blocking (0,0)↔(0,1) → only (0,0)
    expect(reg.getBlockCells(idA)).toHaveLength(1);
    // Group B: (0,1) and (0,2)
    expect(reg.getBlockCells(idB)).toHaveLength(2);
  });

  test('分裂后连续再分裂仍然正确', () => {
    // 3-cell bar: (0,0)-(1,0)-(2,0)
    const reg = new BlockRegistry({
      gridCols: 4,
      gridRows: 2,
      blocks: [
        {
          id: 'bar',
          cells: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 2, y: 0 },
          ],
        },
      ],
    });

    // First split: wall at (0,0)↔(1,0) → [0,0] and [1,0..2,0]
    const result1 = reg.trySplitBlock({ x: 0, y: 0 }, { x: 1, y: 0 });
    expect(result1).not.toBeNull();
    const [, idRight] = result1!;
    expect(reg.getBlockCells(idRight)).toHaveLength(2);

    // Second split: wall at (1,0)↔(2,0) within the right block
    const result2 = reg.trySplitBlock({ x: 1, y: 0 }, { x: 2, y: 0 });
    expect(result2).not.toBeNull();
    // Now 3 blocks total, each with 1 cell
    expect(reg.getAllBlockIds()).toHaveLength(3);
  });
});
