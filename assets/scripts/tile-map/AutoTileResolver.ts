/**
 * AutoTileResolver — 规则解析器
 *
 * 给定一个格子坐标，从 OccupancyGrid 读取 8 邻域占用状态，
 * 计算 8-bit mask，再通过 TileMapConfig.maskTable 查表得到 tileIndex。
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

export type NeighborFilter = (x: number, y: number, nx: number, ny: number) => boolean;

export class AutoTileResolver {
  private grid: OccupancyGrid;
  private config: TileMapConfig;
  private neighborFilter: NeighborFilter | null = null;

  constructor(grid: OccupancyGrid, config?: TileMapConfig) {
    this.grid = grid;
    this.config = config ?? createDefaultConfig();
  }

  /** Update the config (e.g. when switching tileset). */
  setConfig(config: TileMapConfig): void {
    this.config = config;
  }

  /**
   * Set an optional neighbor filter for bitmask computation.
   * When set, a neighbor cell is considered occupied only if the filter returns true.
   * Used by the dual-grid wall system to make wall-separated neighbors appear empty
   * for autotile purposes without changing the visual grid occupancy values.
   */
  setNeighborFilter(filter: NeighborFilter | null): void {
    this.neighborFilter = filter;
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
   * Compute the 8-bit neighbour mask for an occupied cell.
   *   bit0 = T   (1)   — (x, y+1)
   *   bit1 = TR  (2)   — (x+1, y+1)
   *   bit2 = R   (4)   — (x+1, y)
   *   bit3 = BR  (8)   — (x+1, y-1)
   *   bit4 = B   (16)  — (x, y-1)
   *   bit5 = BL  (32)  — (x-1, y-1)
   *   bit6 = L   (64)  — (x-1, y)
   *   bit7 = TL  (128) — (x-1, y+1)
   */
  private isNeighborOccupied(x: number, y: number, nx: number, ny: number): boolean {
    if (this.grid.getCell(nx, ny) !== 1) return false;
    if (this.neighborFilter && !this.neighborFilter(x, y, nx, ny)) return false;
    return true;
  }

  private computeMask(x: number, y: number): number {
    let mask = 0;
    if (this.isNeighborOccupied(x, y, x, y + 1)) mask |= BIT.T;
    if (this.isNeighborOccupied(x, y, x + 1, y + 1)) mask |= BIT.TR;
    if (this.isNeighborOccupied(x, y, x + 1, y)) mask |= BIT.R;
    if (this.isNeighborOccupied(x, y, x + 1, y - 1)) mask |= BIT.BR;
    if (this.isNeighborOccupied(x, y, x, y - 1)) mask |= BIT.B;
    if (this.isNeighborOccupied(x, y, x - 1, y - 1)) mask |= BIT.BL;
    if (this.isNeighborOccupied(x, y, x - 1, y)) mask |= BIT.L;
    if (this.isNeighborOccupied(x, y, x - 1, y + 1)) mask |= BIT.TL;
    return mask;
  }
}
