/**
 * LevelLoader — 关卡数据解析器
 *
 * 解析 LevelData，输出：
 *   - 所有已占用的逻辑格坐标
 *   - 不同 block 相邻格子之间需要添加的 wall 列表
 *
 * Wall 自动推断规则：
 *   - 对每个 block 中的每个格子，检查其四方向（上下左右）邻居
 *   - 若邻居存在且属于不同的 block，则在两者之间添加一条 wall
 *   - 重复 wall 自动去重（使用与 BlockManager.wallKey 相同的标准化方式）
 *
 * 零 Cocos 依赖 — 可在 Jest 中直接测试。
 */

import { LevelData, CellCoord, TargetBoxData } from './LevelTypes';

// ──────────────────── types ────────────────────

/** LevelLoader 解析结果 */
export interface LevelLoadResult {
  /** 网格列数 */
  gridCols: number;
  /** 网格行数 */
  gridRows: number;
  /** 所有已占用的逻辑格 */
  occupiedCells: CellCoord[];
  /** 需要添加的 wall（每条 wall 用两个相邻格坐标表示） */
  walls: [CellCoord, CellCoord][];
  /** 目标盒子列表（原始结构，便于运行时匹配） */
  targetBoxes: TargetBoxData[];
  /** 目标盒子覆盖的所有逻辑格（去重后） */
  targetCells: CellCoord[];
}

// ──────────────────── helpers ────────────────────

/** 四方向偏移 */
const DIRS: CellCoord[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/**
 * 生成标准化 wall key（与 BlockManager.wallKey 保持一致）。
 * 保证较小坐标在前（先比 x，再比 y）。
 */
function wallKey(a: CellCoord, b: CellCoord): string {
  if (a.x < b.x || (a.x === b.x && a.y < b.y)) {
    return `${a.x},${a.y}|${b.x},${b.y}`;
  }
  return `${b.x},${b.y}|${a.x},${a.y}`;
}

// ──────────────────── class ────────────────────

export class LevelLoader {
  /**
   * 解析关卡数据，返回已占用格列表和 wall 列表。
   *
   * @param data 关卡 JSON 数据
   * @returns 解析结果，含已占用格和 wall
   */
  static load(data: LevelData): LevelLoadResult {
    // 建立格子坐标 → blockId 的映射
    const cellToBlock = new Map<string, string>();

    for (const block of data.blocks) {
      for (const cell of block.cells) {
        const key = `${cell.x},${cell.y}`;
        cellToBlock.set(key, block.id);
      }
    }

    // 收集已占用格
    const occupiedCells: CellCoord[] = [];
    for (const [coordKey] of cellToBlock) {
      const [x, y] = coordKey.split(',').map(Number);
      occupiedCells.push({ x, y });
    }

    // 推断 wall：遍历每个已占用格，检查四方向邻居
    const wallKeySet = new Set<string>();
    const walls: [CellCoord, CellCoord][] = [];

    for (const [coordKey, blockId] of cellToBlock) {
      const [x, y] = coordKey.split(',').map(Number);
      const cell: CellCoord = { x, y };

      for (const dir of DIRS) {
        const nx = x + dir.x;
        const ny = y + dir.y;
        const neighborKey = `${nx},${ny}`;
        const neighborBlockId = cellToBlock.get(neighborKey);

        // 邻居存在且属于不同 block → 需要 wall
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

    // 收集目标盒子数据
    const targetBoxes = (data.targetBoxes ?? []).map(tb => ({
      id: tb.id,
      acceptBlockId: tb.acceptBlockId,
      cells: tb.cells.map(c => ({ x: c.x, y: c.y })),
    }));
    const targetCellSet = new Set<string>();
    for (const tb of targetBoxes) {
      for (const c of tb.cells) {
        targetCellSet.add(`${c.x},${c.y}`);
      }
    }
    const targetCells: CellCoord[] = [...targetCellSet].map(key => {
      const [x, y] = key.split(',').map(Number);
      return { x, y };
    });

    return {
      gridCols: data.gridCols,
      gridRows: data.gridRows,
      occupiedCells,
      walls,
      targetBoxes,
      targetCells,
    };
  }
}
