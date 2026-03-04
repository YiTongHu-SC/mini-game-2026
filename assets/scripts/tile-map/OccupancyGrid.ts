/**
 * OccupancyGrid — Layer A（逻辑层）
 *
 * 维护一个 cols × rows 的二值网格，表示每个格子是否被占用。
 * 每次 setCell 会将变化格及其 4 邻居记入 dirty 集合，供视觉层局部刷新。
 *
 * 零 Cocos 依赖 — 可在 Jest 中直接测试。
 */

export interface GridCoord {
  x: number;
  y: number;
}

/** 4-directional neighbour offsets (Up / Right / Down / Left) */
const NEIGHBOURS: readonly GridCoord[] = [
  { x: 0, y: 1 }, // Up
  { x: 1, y: 0 }, // Right
  { x: 0, y: -1 }, // Down
  { x: -1, y: 0 }, // Left
];

export class OccupancyGrid {
  /** Column count */
  readonly cols: number;
  /** Row count */
  readonly rows: number;

  /** Internal grid — row-major: cells[y][x] */
  private cells: (0 | 1)[][];

  /** Set of "x,y" keys that need visual refresh */
  private dirtySet: Set<string> = new Set();

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.cells = Array.from({ length: rows }, () => new Array<0 | 1>(cols).fill(0));
  }

  // ──────────────────── read / write ────────────────────

  /** Returns 0 for out-of-bounds coordinates (safe border handling). */
  getCell(x: number, y: number): 0 | 1 {
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return 0;
    return this.cells[y][x];
  }

  /**
   * Set a cell to occupied (1) or empty (0).
   * If the value actually changes, the cell and its 4 neighbours are marked dirty.
   */
  setCell(x: number, y: number, value: 0 | 1): void {
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return;
    if (this.cells[y][x] === value) return; // no-op — no dirty entry

    this.cells[y][x] = value;
    this.markDirty(x, y);
  }

  // ──────────────────── dirty tracking ────────────────────

  /**
   * Consume and return all dirty coordinates accumulated since the last call.
   * The internal dirty set is cleared after this call.
   */
  getDirtyAndClear(): GridCoord[] {
    const result: GridCoord[] = [];
    for (const key of this.dirtySet) {
      const [sx, sy] = key.split(',');
      result.push({ x: Number(sx), y: Number(sy) });
    }
    this.dirtySet.clear();
    return result;
  }

  /** Mark a cell + its 4 neighbours as dirty (bounds-checked). */
  private markDirty(x: number, y: number): void {
    this.addDirty(x, y);
    for (const n of NEIGHBOURS) {
      this.addDirty(x + n.x, y + n.y);
    }
  }

  private addDirty(x: number, y: number): void {
    if (x >= 0 && x < this.cols && y >= 0 && y < this.rows) {
      this.dirtySet.add(`${x},${y}`);
    }
  }

  // ──────────────────── bulk helpers ────────────────────

  /** Fill a rectangular region. Returns all dirty coords. */
  fillRect(x0: number, y0: number, w: number, h: number, value: 0 | 1): GridCoord[] {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.setCell(x0 + dx, y0 + dy, value);
      }
    }
    return this.getDirtyAndClear();
  }

  /** Reset the entire grid to 0 and return dirty coords. */
  clear(): GridCoord[] {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        this.setCell(x, y, 0);
      }
    }
    return this.getDirtyAndClear();
  }
}
