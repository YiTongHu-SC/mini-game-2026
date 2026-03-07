/**
 * KnifeEdges — 刀具边计算与吸附
 *
 * 纯函数，用于：
 *   - 计算刀具覆盖的逻辑格边对
 *   - 将像素位置吸附到最近的合法边界位置
 *   - 验证刀具位置是否在网格范围内
 *
 * 零 Cocos 依赖 — 可在 Jest 中直接测试。
 */

import { CellCoord, KnifeData } from './LevelTypes';

/**
 * 计算刀具覆盖的所有逻辑格边对。
 *
 * 对于 'v'（竖线）刀具：沿列边界 edge，从行 start 到 start+length-1，
 *   每段边对为 (edge-1, row) ↔ (edge, row)。
 *
 * 对于 'h'（横线）刀具：沿行边界 edge，从列 start 到 start+length-1，
 *   每段边对为 (col, edge-1) ↔ (col, edge)。
 *
 * @returns 格子对数组，每对表示一条被覆盖的逻辑格边
 */
export function getKnifeEdges(knife: KnifeData): [CellCoord, CellCoord][] {
  const edges: [CellCoord, CellCoord][] = [];
  for (let i = 0; i < knife.length; i++) {
    if (knife.orientation === 'v') {
      const row = knife.start + i;
      edges.push([
        { x: knife.edge - 1, y: row },
        { x: knife.edge, y: row },
      ]);
    } else {
      const col = knife.start + i;
      edges.push([
        { x: col, y: knife.edge - 1 },
        { x: col, y: knife.edge },
      ]);
    }
  }
  return edges;
}

/**
 * 检测刀具位置是否在网格范围内。
 */
export function isKnifePositionValid(
  orientation: 'h' | 'v',
  length: number,
  edge: number,
  start: number,
  gridCols: number,
  gridRows: number,
): boolean {
  if (length < 1) return false;
  if (orientation === 'v') {
    // 列边界 [1, gridCols-1]，行范围 [0, gridRows - length]
    if (edge < 1 || edge > gridCols - 1) return false;
    if (start < 0 || start + length > gridRows) return false;
  } else {
    // 行边界 [1, gridRows-1]，列范围 [0, gridCols - length]
    if (edge < 1 || edge > gridRows - 1) return false;
    if (start < 0 || start + length > gridCols) return false;
  }
  return true;
}

/**
 * 将像素坐标吸附到最近的合法刀具边界位置。
 *
 * @param orientation 刀具方向
 * @param length 刀具长度（逻辑格边数）
 * @param gridCols 网格列数
 * @param gridRows 网格行数
 * @param px 像素 x（0 原点坐标系，即 mouseToLocalPixel 的输出）
 * @param py 像素 y
 * @param stride 表现格步幅（通常为 4）
 * @param tileSize 表现格像素大小
 * @returns 吸附后的 { edge, start }
 */
export function snapKnifePosition(
  orientation: 'h' | 'v',
  length: number,
  gridCols: number,
  gridRows: number,
  px: number,
  py: number,
  stride: number,
  tileSize: number,
): { edge: number; start: number } {
  const cellPixel = stride * tileSize;
  // 偏移半个表现格使边界对齐到整数 cellPixel 位置
  const halfVts = tileSize * 0.5;

  if (orientation === 'v') {
    // 列边界：像素 x → 最近列边界
    const rawEdge = Math.round((px - halfVts) / cellPixel);
    const edge = Math.max(1, Math.min(gridCols - 1, rawEdge));
    // 行位置：像素 y → 最近行，使刀具中心对齐
    const rawStart = Math.round((py - halfVts) / cellPixel - length / 2);
    const start = Math.max(0, Math.min(gridRows - length, rawStart));
    return { edge, start };
  } else {
    // 行边界：像素 y → 最近行边界
    const rawEdge = Math.round((py - halfVts) / cellPixel);
    const edge = Math.max(1, Math.min(gridRows - 1, rawEdge));
    // 列位置：像素 x → 最近列
    const rawStart = Math.round((px - halfVts) / cellPixel - length / 2);
    const start = Math.max(0, Math.min(gridCols - length, rawStart));
    return { edge, start };
  }
}
