import { LevelLoader } from '../../assets/scripts/tile-map/LevelLoader';
import { LevelData, CellCoord } from '../../assets/scripts/tile-map/LevelTypes';

// ─── helpers ───────────────────────────────────────────────────────────────

/** Convert CellCoord[] to a Set of "x,y" strings for easy comparison */
function cellSet(cells: CellCoord[]): Set<string> {
  return new Set(cells.map(c => `${c.x},${c.y}`));
}

/** Convert wall list to a Set of normalized "ax,ay|bx,by" strings */
function wallSet(walls: [CellCoord, CellCoord][]): Set<string> {
  return new Set(
    walls.map(([a, b]) => {
      if (a.x < b.x || (a.x === b.x && a.y < b.y)) return `${a.x},${a.y}|${b.x},${b.y}`;
      return `${b.x},${b.y}|${a.x},${a.y}`;
    }),
  );
}

// ════════════════════════════════════════════════════════════════
// 1. 基础解析
// ════════════════════════════════════════════════════════════════

describe('LevelLoader — 基础解析', () => {
  test('空关卡（无 block）→ 无格子、无 wall', () => {
    const data: LevelData = { gridCols: 4, gridRows: 4, blocks: [] };
    const result = LevelLoader.load(data);
    expect(result.gridCols).toBe(4);
    expect(result.gridRows).toBe(4);
    expect(result.occupiedCells).toHaveLength(0);
    expect(result.walls).toHaveLength(0);
    expect(result.targetBoxes).toHaveLength(0);
    expect(result.targetCells).toHaveLength(0);
  });

  test('单个 block 单格 → 一个格子、无 wall', () => {
    const data: LevelData = {
      gridCols: 4,
      gridRows: 4,
      blocks: [{ id: 'A', cells: [{ x: 1, y: 1 }] }],
    };
    const result = LevelLoader.load(data);
    expect(result.occupiedCells).toHaveLength(1);
    expect(cellSet(result.occupiedCells)).toContain('1,1');
    expect(result.walls).toHaveLength(0);
  });

  test('单个 block 多格 → 所有格子被占用、内部无 wall', () => {
    // 3 个相邻格属于同一 block
    const data: LevelData = {
      gridCols: 5,
      gridRows: 5,
      blocks: [
        {
          id: 'A',
          cells: [
            { x: 1, y: 1 },
            { x: 2, y: 1 },
            { x: 3, y: 1 },
          ],
        },
      ],
    };
    const result = LevelLoader.load(data);
    expect(result.occupiedCells).toHaveLength(3);
    expect(result.walls).toHaveLength(0);
  });

  test('关卡数据保留 gridCols / gridRows', () => {
    const data: LevelData = { gridCols: 10, gridRows: 8, blocks: [] };
    const result = LevelLoader.load(data);
    expect(result.gridCols).toBe(10);
    expect(result.gridRows).toBe(8);
  });
});

// ════════════════════════════════════════════════════════════════
// 4. 目标盒子解析
// ════════════════════════════════════════════════════════════════

describe('LevelLoader — targetBoxes 解析', () => {
  test('保留 targetBoxes 并展开 targetCells（去重）', () => {
    const data: LevelData = {
      gridCols: 8,
      gridRows: 8,
      blocks: [],
      targetBoxes: [
        {
          id: 'goal-A',
          acceptBlockId: 'block-A',
          cells: [
            { x: 1, y: 1 },
            { x: 2, y: 1 },
          ],
        },
        {
          id: 'goal-B',
          cells: [
            { x: 2, y: 1 },
            { x: 2, y: 2 },
          ],
        },
      ],
    };

    const result = LevelLoader.load(data);
    expect(result.targetBoxes).toHaveLength(2);
    expect(result.targetBoxes[0].id).toBe('goal-A');
    expect(result.targetBoxes[0].acceptBlockId).toBe('block-A');

    const targetSet = cellSet(result.targetCells);
    expect(targetSet.size).toBe(3);
    expect(targetSet).toContain('1,1');
    expect(targetSet).toContain('2,1');
    expect(targetSet).toContain('2,2');
  });
});

// ════════════════════════════════════════════════════════════════
// 2. Wall 推断
// ════════════════════════════════════════════════════════════════

describe('LevelLoader — wall 推断', () => {
  test('两个水平相邻的不同 block → 1 条 wall', () => {
    // A:(1,1)  B:(2,1) → wall between (1,1)-(2,1)
    const data: LevelData = {
      gridCols: 5,
      gridRows: 5,
      blocks: [
        { id: 'A', cells: [{ x: 1, y: 1 }] },
        { id: 'B', cells: [{ x: 2, y: 1 }] },
      ],
    };
    const result = LevelLoader.load(data);
    expect(result.walls).toHaveLength(1);
    const ws = wallSet(result.walls);
    expect(ws).toContain('1,1|2,1');
  });

  test('两个垂直相邻的不同 block → 1 条 wall', () => {
    // A:(1,1)  B:(1,2) → wall between (1,1)-(1,2)
    const data: LevelData = {
      gridCols: 5,
      gridRows: 5,
      blocks: [
        { id: 'A', cells: [{ x: 1, y: 1 }] },
        { id: 'B', cells: [{ x: 1, y: 2 }] },
      ],
    };
    const result = LevelLoader.load(data);
    expect(result.walls).toHaveLength(1);
    const ws = wallSet(result.walls);
    expect(ws).toContain('1,1|1,2');
  });

  test('不相邻的不同 block（中间有空格）→ 无 wall', () => {
    // A:(0,0)  B:(2,0) → 不相邻，无 wall
    const data: LevelData = {
      gridCols: 5,
      gridRows: 5,
      blocks: [
        { id: 'A', cells: [{ x: 0, y: 0 }] },
        { id: 'B', cells: [{ x: 2, y: 0 }] },
      ],
    };
    const result = LevelLoader.load(data);
    expect(result.walls).toHaveLength(0);
  });

  test('对角相邻的不同 block → 无 wall（只检查四方向）', () => {
    // A:(0,0)  B:(1,1) → 对角，无 wall
    const data: LevelData = {
      gridCols: 5,
      gridRows: 5,
      blocks: [
        { id: 'A', cells: [{ x: 0, y: 0 }] },
        { id: 'B', cells: [{ x: 1, y: 1 }] },
      ],
    };
    const result = LevelLoader.load(data);
    expect(result.walls).toHaveLength(0);
  });

  test('同一 block 内部相邻格 → 不生成 wall', () => {
    // A:(1,1), A:(2,1) 相邻但同属 block A → 无 wall
    const data: LevelData = {
      gridCols: 5,
      gridRows: 5,
      blocks: [
        {
          id: 'A',
          cells: [
            { x: 1, y: 1 },
            { x: 2, y: 1 },
          ],
        },
      ],
    };
    const result = LevelLoader.load(data);
    expect(result.walls).toHaveLength(0);
  });

  test('重复 wall 自动去重', () => {
    // A 和 B 各有多个格子，但交界只有一条边 (2,1)-(3,1)
    const data: LevelData = {
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
    const result = LevelLoader.load(data);
    // 只有 (2,1)-(3,1) 一条交界 wall
    expect(result.walls).toHaveLength(1);
    expect(wallSet(result.walls)).toContain('2,1|3,1');
  });

  test('多个 block 多条 wall', () => {
    // A:(2,2), B:(3,2), C:(2,3)
    // A-B → wall (2,2)-(3,2)
    // A-C → wall (2,2)-(2,3)
    const data: LevelData = {
      gridCols: 6,
      gridRows: 6,
      blocks: [
        { id: 'A', cells: [{ x: 2, y: 2 }] },
        { id: 'B', cells: [{ x: 3, y: 2 }] },
        { id: 'C', cells: [{ x: 2, y: 3 }] },
      ],
    };
    const result = LevelLoader.load(data);
    expect(result.walls).toHaveLength(2);
    const ws = wallSet(result.walls);
    expect(ws).toContain('2,2|3,2');
    expect(ws).toContain('2,2|2,3');
  });
});

// ════════════════════════════════════════════════════════════════
// 3. 完整场景：level-001 格式
// ════════════════════════════════════════════════════════════════

describe('LevelLoader — level-001 完整场景', () => {
  const levelData: LevelData = {
    gridCols: 6,
    gridRows: 6,
    blocks: [
      {
        id: 'block-A',
        cells: [
          { x: 1, y: 1 },
          { x: 2, y: 1 },
          { x: 1, y: 2 },
        ],
      },
      {
        id: 'block-B',
        cells: [
          { x: 3, y: 1 },
          { x: 3, y: 2 },
          { x: 4, y: 2 },
        ],
      },
    ],
  };

  let result: ReturnType<typeof LevelLoader.load>;

  beforeEach(() => {
    result = LevelLoader.load(levelData);
  });

  test('共 6 个已占用格', () => {
    expect(result.occupiedCells).toHaveLength(6);
  });

  test('所有格子均被收录', () => {
    const cs = cellSet(result.occupiedCells);
    expect(cs).toContain('1,1');
    expect(cs).toContain('2,1');
    expect(cs).toContain('1,2');
    expect(cs).toContain('3,1');
    expect(cs).toContain('3,2');
    expect(cs).toContain('4,2');
  });

  test('block-A 与 block-B 之间只有 1 条 wall：(2,1)-(3,1)', () => {
    // block-A:(2,1) 右邻 block-B:(3,1) → 唯一交界
    expect(result.walls).toHaveLength(1);
    expect(wallSet(result.walls)).toContain('2,1|3,1');
  });
});
