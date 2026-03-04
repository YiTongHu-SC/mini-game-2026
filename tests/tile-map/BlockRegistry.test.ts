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
