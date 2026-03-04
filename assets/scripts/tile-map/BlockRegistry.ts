/**
 * BlockRegistry — 运行时 Block 成员关系注册表
 *
 * 解决 LevelLoader 丢弃 block 成员信息的问题，在运行时维护：
 *   - 格子坐标 → blockId 的快速查找
 *   - blockId → 当前格子列表
 *
 * 支持 moveBlock（平移整个 block）以及基于当前位置重新推断所有
 * 跨 block 墙壁（与 LevelLoader 算法一致）。
 *
 * 零 Cocos 依赖 — 可在 Jest 中直接测试。
 */

import { LevelData, CellCoord } from './LevelTypes';

// ──────────────────── helpers ────────────────────

/** 四方向偏移 */
const DIRS: CellCoord[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/**
 * 生成标准化 wall key（与 BlockManager.wallKey / LevelLoader 保持一致）。
 * 较小坐标在前（先比 x，再比 y）。
 */
function wallKey(a: CellCoord, b: CellCoord): string {
  if (a.x < b.x || (a.x === b.x && a.y < b.y)) {
    return `${a.x},${a.y}|${b.x},${b.y}`;
  }
  return `${b.x},${b.y}|${a.x},${a.y}`;
}

// ──────────────────── class ────────────────────

export class BlockRegistry {
  /** "x,y" → blockId */
  private cellToBlock: Map<string, string> = new Map();
  /** blockId → 可变格子列表（直接修改以支持 moveBlock） */
  private blockToCells: Map<string, CellCoord[]> = new Map();

  constructor(data: LevelData) {
    for (const block of data.blocks) {
      const cells: CellCoord[] = [];
      for (const cell of block.cells) {
        const key = `${cell.x},${cell.y}`;
        this.cellToBlock.set(key, block.id);
        cells.push({ x: cell.x, y: cell.y });
      }
      this.blockToCells.set(block.id, cells);
    }
  }

  // ──────────────────── queries ────────────────────

  /**
   * 返回占用 (x, y) 的 blockId，如果该格子不属于任何 block 则返回 undefined。
   */
  getBlockIdAt(x: number, y: number): string | undefined {
    return this.cellToBlock.get(`${x},${y}`);
  }

  /**
   * 返回 blockId 当前所有格子的副本列表。
   * 若 blockId 不存在则返回空数组。
   */
  getBlockCells(blockId: string): CellCoord[] {
    return (this.blockToCells.get(blockId) ?? []).map(c => ({ x: c.x, y: c.y }));
  }

  /**
   * 返回所有 blockId。
   */
  getAllBlockIds(): string[] {
    return [...this.blockToCells.keys()];
  }

  // ──────────────────── mutation ────────────────────

  /**
   * 将 blockId 的所有格子平移 (dx, dy)。
   * 更新内部的双向映射，不操作任何外部网格。
   *
   * @param blockId 要移动的 block
   * @param dx 水平偏移（列数）
   * @param dy 垂直偏移（行数）
   */
  moveBlock(blockId: string, dx: number, dy: number): void {
    const cells = this.blockToCells.get(blockId);
    if (!cells) return;

    // 删除旧坐标的映射
    for (const cell of cells) {
      this.cellToBlock.delete(`${cell.x},${cell.y}`);
    }

    // 更新坐标
    for (const cell of cells) {
      cell.x += dx;
      cell.y += dy;
    }

    // 建立新坐标的映射
    for (const cell of cells) {
      this.cellToBlock.set(`${cell.x},${cell.y}`, blockId);
    }
  }

  // ──────────────────── wall inference ────────────────────

  /**
   * 根据当前所有 block 的格子位置重新推断全部跨 block 墙壁。
   *
   * 规则与 LevelLoader.load 一致：
   *   - 对每个占用格检查四方向邻居
   *   - 若邻居属于不同 block → wall
   *   - 自动去重
   *
   * @returns 墙壁列表，每条以两个格子坐标表示
   */
  getAllWalls(): [CellCoord, CellCoord][] {
    const wallKeySet = new Set<string>();
    const walls: [CellCoord, CellCoord][] = [];

    for (const [coordKey, blockId] of this.cellToBlock) {
      const [x, y] = coordKey.split(',').map(Number);
      const cell: CellCoord = { x, y };

      for (const dir of DIRS) {
        const nx = x + dir.x;
        const ny = y + dir.y;
        const neighborBlockId = this.cellToBlock.get(`${nx},${ny}`);

        if (neighborBlockId !== undefined && neighborBlockId !== blockId) {
          const neighbor: CellCoord = { x: nx, y: ny };
          const key = wallKey(cell, neighbor);
          if (!wallKeySet.has(key)) {
            wallKeySet.add(key);
            walls.push([cell, neighbor]);
          }
        }
      }
    }

    return walls;
  }
}
