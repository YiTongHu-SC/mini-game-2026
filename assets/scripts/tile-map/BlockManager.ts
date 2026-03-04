/**
 * BlockManager — 墙壁（Wall）管理器
 *
 * 管理逻辑格之间的墙壁。两个相邻逻辑格之间可以放置一堵墙，
 * 墙会阻断它们之间的边（edge）和相关角（corner）的视觉表现。
 *
 * 术语：
 *   - **WallEdge**：两个四方向相邻逻辑格之间的墙壁，用一对坐标表示。
 *   - **Wall Key**：标准化字符串 `"ax,ay|bx,by"`，其中 (a) < (b) 按字典序。
 *
 * 零 Cocos 依赖 — 可在 Jest 中直接测试。
 */

import { GridCoord } from './OccupancyGrid';

// ──────────────────── types ────────────────────

/** 两个相邻逻辑格之间的墙壁 */
export interface WallEdge {
  a: GridCoord;
  b: GridCoord;
}

// ──────────────────── class ────────────────────

export class BlockManager {
  /** Normalized wall key set */
  private walls: Set<string> = new Set();

  // ──────────────────── static helpers ────────────────────

  /**
   * 判断两个逻辑格是否四方向相邻（曼哈顿距离 === 1）。
   */
  static isAdjacent(a: GridCoord, b: GridCoord): boolean {
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
  }

  /**
   * 生成标准化的墙壁 key。
   * 保证 a < b（先比 x，再比 y），使得 (a,b) 和 (b,a) 产生相同 key。
   * 如果不相邻返回 null。
   */
  static wallKey(a: GridCoord, b: GridCoord): string | null {
    if (!BlockManager.isAdjacent(a, b)) return null;
    // Normalize: smaller coord first
    if (a.x < b.x || (a.x === b.x && a.y < b.y)) {
      return `${a.x},${a.y}|${b.x},${b.y}`;
    }
    return `${b.x},${b.y}|${a.x},${a.y}`;
  }

  // ──────────────────── CRUD ────────────────────

  /** 检查两个逻辑格之间是否有墙。不相邻的格子返回 false。 */
  hasWall(a: GridCoord, b: GridCoord): boolean {
    const key = BlockManager.wallKey(a, b);
    if (key === null) return false;
    return this.walls.has(key);
  }

  /**
   * 在两个相邻逻辑格之间添加墙壁。
   * @returns true 如果墙是新增的，false 如果已存在或不相邻。
   */
  addWall(a: GridCoord, b: GridCoord): boolean {
    const key = BlockManager.wallKey(a, b);
    if (key === null) return false;
    if (this.walls.has(key)) return false;
    this.walls.add(key);
    return true;
  }

  /**
   * 移除两个相邻逻辑格之间的墙壁。
   * @returns true 如果墙被移除了，false 如果不存在或不相邻。
   */
  removeWall(a: GridCoord, b: GridCoord): boolean {
    const key = BlockManager.wallKey(a, b);
    if (key === null) return false;
    return this.walls.delete(key);
  }

  /**
   * 切换墙壁状态。
   * @returns 操作后的墙壁状态：true = 有墙，false = 无墙。null = 不相邻。
   */
  toggleWall(a: GridCoord, b: GridCoord): boolean | null {
    const key = BlockManager.wallKey(a, b);
    if (key === null) return null;
    if (this.walls.has(key)) {
      this.walls.delete(key);
      return false;
    }
    this.walls.add(key);
    return true;
  }

  /** 清除所有墙壁。 */
  clearWalls(): void {
    this.walls.clear();
  }

  /** 获取所有墙壁的标准化 key 列表（用于序列化/debug）。 */
  getWalls(): string[] {
    return Array.from(this.walls);
  }

  /** 当前墙壁数量。 */
  get wallCount(): number {
    return this.walls.size;
  }
}
