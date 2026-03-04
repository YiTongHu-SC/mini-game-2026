/**
 * DualGridTypes — 双网格系统类型与常量
 *
 * 定义双网格（逻辑网格 + 表现网格）的类型、常量和工具函数。
 * 逻辑网格尺寸更大（用于数据/交互/连通），表现网格更小（仅视觉）。
 * 每个逻辑格对应 3×3 内部表现格 + 共享的 edge/corner 表现格。
 *
 * 零 Cocos 依赖 — 可在 Jest 中直接测试。
 */

import { GridCoord } from './OccupancyGrid';

// ──────────────────── constants ────────────────────

/**
 * 相邻逻辑格在表现坐标系中的步幅。
 * 每个逻辑格包含 3 个内部表现列/行 + 1 个共享 edge 列/行 = 4。
 */
export const STRIDE = 4;

// ──────────────────── types ────────────────────

/** 表现格单元类型 */
export type VisualCellType = 'interior' | 'h-edge' | 'v-edge' | 'corner';

/**
 * 表现格单元信息。
 * - `type` 标识该表现格在双网格中的角色
 * - `logicNeighbors` 列出关联的逻辑格坐标（可能越界，由 OccupancyGrid.getCell 安全处理）
 */
export interface VisualCellInfo {
  type: VisualCellType;
  /** interior: 1 个, edge: 2 个, corner: 4 个 */
  logicNeighbors: GridCoord[];
}

/**
 * 占用判定规则：
 * - `'and'`：所有关联逻辑格都 occupied 才 occupied（产生最窄连接）
 * - `'or'`：任一关联逻辑格 occupied 即 occupied（产生最宽填充）
 */
export type OccupancyRule = 'and' | 'or';

// ──────────────────── helpers ────────────────────

/**
 * 根据逻辑网格尺寸计算表现网格尺寸。
 *
 *   V_cols = L_cols × STRIDE + 1
 *   V_rows = L_rows × STRIDE + 1
 *
 * 例：逻辑 5×5 → 表现 21×21
 */
export function visualGridSize(
  logicCols: number,
  logicRows: number,
): { cols: number; rows: number } {
  return {
    cols: logicCols * STRIDE + 1,
    rows: logicRows * STRIDE + 1,
  };
}
