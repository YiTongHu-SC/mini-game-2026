/**
 * DualGridMapper — 双网格坐标映射与同步
 *
 * 负责逻辑网格与表现网格之间的：
 *   1. 坐标分类 — 判断每个表现格属于哪个逻辑格
 *   2. 占用计算 — 从逻辑格推导表现格的 0/1 状态（含墙壁感知）
 *   3. 受影响范围 — 当逻辑格/墙壁变化时，列出需要重算的表现格
 *   4. 同步操作 — 全量同步 / 局部同步
 *
 * 每个逻辑格对应 3×3 表现格，相邻逻辑格之间不共享边界。
 * 墙壁通过 AutoTileResolver 的 neighborFilter 在 bitmask 层面断开，
 * 不修改表现格的占用值（所有被占据逻辑格的 9 个表现格始终为 1）。
 *
 * 零 Cocos 依赖 — 可在 Jest 中直接测试。
 */

import { OccupancyGrid, GridCoord } from './OccupancyGrid';
import { STRIDE, VisualCellInfo, OccupancyRule, visualGridSize } from './DualGridTypes';
import { BlockManager } from './BlockManager';

export class DualGridMapper {
  readonly logicCols: number;
  readonly logicRows: number;
  readonly visualCols: number;
  readonly visualRows: number;
  private rule: OccupancyRule;
  private blockManager: BlockManager | null = null;

  constructor(logicCols: number, logicRows: number, rule: OccupancyRule = 'and') {
    this.logicCols = logicCols;
    this.logicRows = logicRows;
    const size = visualGridSize(logicCols, logicRows);
    this.visualCols = size.cols;
    this.visualRows = size.rows;
    this.rule = rule;
  }

  /** 设置 BlockManager 实例以启用墙壁感知的占用计算。 */
  setBlockManager(bm: BlockManager | null): void {
    this.blockManager = bm;
  }

  // ──────────────────── classification ────────────────────

  /**
   * 根据表现格坐标 (vx, vy) 判断其关联的逻辑格。
   *
   * 每个逻辑格对应 3×3 表现格，无共享边界。
   * 所有表现格类型均为 'interior'，关联 1 个逻辑格：
   *   lx = ⌊vx / STRIDE⌋, ly = ⌊vy / STRIDE⌋
   */
  classifyVisualCell(vx: number, vy: number): VisualCellInfo {
    const lx = Math.floor(vx / STRIDE);
    const ly = Math.floor(vy / STRIDE);
    return { type: 'interior', logicNeighbors: [{ x: lx, y: ly }] };
  }

  // ──────────────────── occupancy computation ────────────────────

  /**
   * 计算单个表现格的占用状态。
   *
   * 表现格直接跟随其所属逻辑格的状态：
   *   - 逻辑格 occupied → 9 个表现格全部为 1
   *   - 逻辑格 empty → 9 个表现格全部为 0
   *
   * 墙壁不影响占用值。墙壁的视觉效果通过 AutoTileResolver 的
   * neighborFilter 在 bitmask 计算阶段实现（使跨墙邻居不计入 mask）。
   */
  computeVisualOccupancy(vx: number, vy: number, logicGrid: OccupancyGrid): 0 | 1 {
    const lx = Math.floor(vx / STRIDE);
    const ly = Math.floor(vy / STRIDE);
    return logicGrid.getCell(lx, ly) === 0 ? 0 : 1;
  }

  /**
   * 创建一个 neighbor filter 供 AutoTileResolver 使用。
   *
   * 当两个表现格分属不同逻辑格且之间有墙时，返回 false，
   * 使 autotile bitmask 不将跨墙邻居计为已占用，从而在墙壁处
   * 产生 autotile 边缘（而非空缺格）。
   */
  createNeighborFilter(): (x: number, y: number, nx: number, ny: number) => boolean {
    return (x: number, y: number, nx: number, ny: number): boolean => {
      if (!this.blockManager) return true;
      const lx = Math.floor(x / STRIDE);
      const ly = Math.floor(y / STRIDE);
      const nlx = Math.floor(nx / STRIDE);
      const nly = Math.floor(ny / STRIDE);
      if (lx === nlx && ly === nly) return true;
      return !this.blockManager.hasWall({ x: lx, y: ly }, { x: nlx, y: nly });
    };
  }

  // ──────────────────── affected cells ────────────────────

  /**
   * 获取当逻辑格 (lx, ly) 变化时需要重算的所有表现格坐标。
   *
   * 每个逻辑格对应 3×3 = 9 个表现格。
   */
  getAffectedVisualCells(lx: number, ly: number): GridCoord[] {
    const result: GridCoord[] = [];
    const baseX = lx * STRIDE;
    const baseY = ly * STRIDE;

    for (let dy = 0; dy < STRIDE; dy++) {
      for (let dx = 0; dx < STRIDE; dx++) {
        this.pushIfValid(result, baseX + dx, baseY + dy);
      }
    }

    return result;
  }

  // ──────────────────── sync operations ────────────────────

  /**
   * 全量同步：遍历所有表现格，从逻辑网格推导占用状态并写入表现网格。
   * 调用后应执行 renderer.refreshAll()。
   * 内部会清除 visualGrid 的 dirty 集合。
   */
  syncAll(logicGrid: OccupancyGrid, visualGrid: OccupancyGrid): void {
    for (let vy = 0; vy < this.visualRows; vy++) {
      for (let vx = 0; vx < this.visualCols; vx++) {
        const occ = this.computeVisualOccupancy(vx, vy, logicGrid);
        visualGrid.setCell(vx, vy, occ);
      }
    }
    // Discard dirty — full refresh should follow
    visualGrid.getDirtyAndClear();
  }

  /**
   * 局部同步：当逻辑格 (lx, ly) 变化后，更新受影响的表现格。
   * 返回 visualGrid 产生的脏格列表（包含直接变化格及其邻居），
   * 可直接传给 renderer.refreshLocal()。
   */
  syncLogicCell(
    lx: number,
    ly: number,
    logicGrid: OccupancyGrid,
    visualGrid: OccupancyGrid,
  ): GridCoord[] {
    const affected = this.getAffectedVisualCells(lx, ly);
    for (const { x, y } of affected) {
      const occ = this.computeVisualOccupancy(x, y, logicGrid);
      visualGrid.setCell(x, y, occ);
    }
    return visualGrid.getDirtyAndClear();
  }

  // ──────────────────── wall-related sync ────────────────────

  /**
   * 获取当墙壁 (a, b) 变化时需要重算的表现格坐标。
   *
   * 水平墙 (a 和 b 横向相邻)：a 的右边界列 3 格 + b 的左边界列 3 格 = 6
   * 垂直墙 (a 和 b 纵向相邻)：a 的上边界行 3 格 + b 的下边界行 3 格 = 6
   */
  getAffectedVisualCellsForWall(a: GridCoord, b: GridCoord): GridCoord[] {
    if (!BlockManager.isAdjacent(a, b)) return [];

    const result: GridCoord[] = [];
    const dx = b.x - a.x;

    if (dx !== 0) {
      // Horizontal adjacency — left cell's right border + right cell's left border
      const left = dx > 0 ? a : b;
      const right = dx > 0 ? b : a;
      // Left cell right border: vx = left.x * STRIDE + 2, vy = left.y * STRIDE + {0,1,2}
      for (let i = 0; i < STRIDE; i++) {
        this.pushIfValid(result, left.x * STRIDE + 2, left.y * STRIDE + i);
      }
      // Right cell left border: vx = right.x * STRIDE, vy = right.y * STRIDE + {0,1,2}
      for (let i = 0; i < STRIDE; i++) {
        this.pushIfValid(result, right.x * STRIDE, right.y * STRIDE + i);
      }
    } else {
      // Vertical adjacency — bottom cell's top border + top cell's bottom border
      const dy = b.y - a.y;
      const bottom = dy > 0 ? a : b;
      const top = dy > 0 ? b : a;
      // Bottom cell top border: vy = bottom.y * STRIDE + 2, vx = bottom.x * STRIDE + {0,1,2}
      for (let i = 0; i < STRIDE; i++) {
        this.pushIfValid(result, bottom.x * STRIDE + i, bottom.y * STRIDE + 2);
      }
      // Top cell bottom border: vy = top.y * STRIDE, vx = top.x * STRIDE + {0,1,2}
      for (let i = 0; i < STRIDE; i++) {
        this.pushIfValid(result, top.x * STRIDE + i, top.y * STRIDE);
      }
    }

    return result;
  }

  /**
   * 局部同步：当墙壁 (a, b) 变化后，返回需要刷新 bitmask 的表现格。
   *
   * 墙壁不改变占用值（均为 1），但影响 autotile bitmask（通过 neighborFilter）。
   * 因此直接返回受影响的 6 个边界格，供 renderer.refreshLocal() 重新 resolve。
   */
  syncWallChange(
    a: GridCoord,
    b: GridCoord,
    _logicGrid: OccupancyGrid,
    _visualGrid: OccupancyGrid,
  ): GridCoord[] {
    return this.getAffectedVisualCellsForWall(a, b);
  }

  // ──────────────────── private ────────────────────

  private pushIfValid(result: GridCoord[], vx: number, vy: number): void {
    if (vx >= 0 && vx < this.visualCols && vy >= 0 && vy < this.visualRows) {
      result.push({ x: vx, y: vy });
    }
  }
}
