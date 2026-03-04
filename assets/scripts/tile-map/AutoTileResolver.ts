/**
 * AutoTileResolver — 规则解析器
 *
 * 给定一个格子坐标，从 OccupancyGrid 读取 4 邻域占用状态，
 * 计算 4-bit mask，再通过 TileMapConfig.maskTable 查表得到 tileIndex。
 *
 * 零 Cocos 依赖 — 可在 Jest 中直接测试。
 */

import { OccupancyGrid } from './OccupancyGrid';
import { BIT, TileMapConfig, createDefaultConfig } from './TileMapConfig';

export interface ResolveResult {
  x: number;
  y: number;
  mask: number;
  tileIndex: number;
}

export class AutoTileResolver {
  private grid: OccupancyGrid;
  private config: TileMapConfig;

  constructor(grid: OccupancyGrid, config?: TileMapConfig) {
    this.grid = grid;
    this.config = config ?? createDefaultConfig();
  }

  /** Update the config (e.g. when switching tileset). */
  setConfig(config: TileMapConfig): void {
    this.config = config;
  }

  /**
   * Resolve a single cell.
   * Returns tileIndex = -1 for empty (unoccupied) cells.
   */
  resolve(x: number, y: number): ResolveResult {
    if (this.grid.getCell(x, y) === 0) {
      return { x, y, mask: -1, tileIndex: -1 };
    }

    const mask = this.computeMask(x, y);
    const tileIndex = this.config.maskTable[mask] ?? 0;
    return { x, y, mask, tileIndex };
  }

  /**
   * Resolve a batch of coordinates (typically dirty cells).
   * Skips cells that are not occupied.
   */
  resolveBatch(coords: { x: number; y: number }[]): ResolveResult[] {
    const results: ResolveResult[] = [];
    for (const { x, y } of coords) {
      results.push(this.resolve(x, y));
    }
    return results;
  }

  /**
   * Resolve every cell in the grid (for full refresh).
   * Returns only occupied cells.
   */
  resolveAll(): ResolveResult[] {
    const results: ResolveResult[] = [];
    for (let y = 0; y < this.grid.rows; y++) {
      for (let x = 0; x < this.grid.cols; x++) {
        if (this.grid.getCell(x, y) === 1) {
          results.push(this.resolve(x, y));
        }
      }
    }
    return results;
  }

  // ──────────────────── private ────────────────────

  /**
   * Compute the 4-bit neighbour mask for an occupied cell.
   *   bit0 = Up    occupied?  → +1
   *   bit1 = Right occupied?  → +2
   *   bit2 = Down  occupied?  → +4
   *   bit3 = Left  occupied?  → +8
   */
  private computeMask(x: number, y: number): number {
    let mask = 0;
    if (this.grid.getCell(x, y + 1) === 1) mask |= BIT.UP;
    if (this.grid.getCell(x + 1, y) === 1) mask |= BIT.RIGHT;
    if (this.grid.getCell(x, y - 1) === 1) mask |= BIT.DOWN;
    if (this.grid.getCell(x - 1, y) === 1) mask |= BIT.LEFT;
    return mask;
  }
}
