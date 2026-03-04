/**
 * DualGridMapper — 双网格坐标映射与同步
 *
 * 负责逻辑网格与表现网格之间的：
 *   1. 坐标分类 — 判断每个表现格属于 interior / edge / corner
 *   2. 占用计算 — 根据 AND/OR 规则从逻辑格推导表现格的 0/1 状态
 *   3. 受影响范围 — 当逻辑格变化时，列出需要重算的表现格
 *   4. 同步操作 — 全量同步 / 局部同步
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
   * 根据表现格坐标 (vx, vy) 判断其类型及关联的逻辑格。
   *
   * 分类规则（基于 vx % STRIDE, vy % STRIDE）：
   *   rx ∈ {1,2,3} 且 ry ∈ {1,2,3} → interior  — 关联 1 个逻辑格
   *   rx == 0      且 ry ∈ {1,2,3} → v-edge     — 关联 2 个逻辑格（左/右）
   *   rx ∈ {1,2,3} 且 ry == 0      → h-edge     — 关联 2 个逻辑格（下/上）
   *   rx == 0      且 ry == 0      → corner     — 关联 4 个逻辑格
   *
   * 注意：logicNeighbors 中的坐标可能越界（如 -1 或 >= logicCols），
   * 由 OccupancyGrid.getCell 返回 0 来安全处理。
   */
  classifyVisualCell(vx: number, vy: number): VisualCellInfo {
    const rx = vx % STRIDE;
    const ry = vy % STRIDE;

    if (rx !== 0 && ry !== 0) {
      // Interior — belongs to exactly one logic cell
      const lx = Math.floor(vx / STRIDE);
      const ly = Math.floor(vy / STRIDE);
      return { type: 'interior', logicNeighbors: [{ x: lx, y: ly }] };
    }

    if (rx === 0 && ry !== 0) {
      // Vertical edge — shared between left and right logic cells
      const lxLeft = vx / STRIDE - 1;
      const lxRight = vx / STRIDE;
      const ly = Math.floor(vy / STRIDE);
      return {
        type: 'v-edge',
        logicNeighbors: [
          { x: lxLeft, y: ly },
          { x: lxRight, y: ly },
        ],
      };
    }

    if (rx !== 0 && ry === 0) {
      // Horizontal edge — shared between bottom and top logic cells
      const lx = Math.floor(vx / STRIDE);
      const lyBottom = vy / STRIDE - 1;
      const lyTop = vy / STRIDE;
      return {
        type: 'h-edge',
        logicNeighbors: [
          { x: lx, y: lyBottom },
          { x: lx, y: lyTop },
        ],
      };
    }

    // Corner — shared by 4 logic cells
    const lxLeft = vx / STRIDE - 1;
    const lxRight = vx / STRIDE;
    const lyBottom = vy / STRIDE - 1;
    const lyTop = vy / STRIDE;
    return {
      type: 'corner',
      logicNeighbors: [
        { x: lxLeft, y: lyBottom },
        { x: lxRight, y: lyBottom },
        { x: lxLeft, y: lyTop },
        { x: lxRight, y: lyTop },
      ],
    };
  }

  // ──────────────────── occupancy computation ────────────────────

  /**
   * 计算单个表现格的占用状态。
   *
   * AND 规则（默认）：所有关联逻辑格都 occupied → 1，否则 → 0
   * OR 规则：任一关联逻辑格 occupied → 1，否则 → 0
   *
   * 墙壁感知（仅 AND 规则，需 setBlockManager）：
   *   - Edge：两侧逻辑格之间有墙 → 0
   *   - Corner：4 个关联逻辑格中的任意相邻对之间有墙 → 0
   *     角的 4 对相邻关系：BL↔BR, TL↔TR, BL↔TL, BR↔TR
   *
   * 越界逻辑格由 OccupancyGrid.getCell 返回 0，
   * 因此边界上的 edge/corner 在 AND 模式下永远为 0。
   */
  computeVisualOccupancy(vx: number, vy: number, logicGrid: OccupancyGrid): 0 | 1 {
    const info = this.classifyVisualCell(vx, vy);
    const neighbors = info.logicNeighbors;

    if (this.rule === 'and') {
      // All neighbors must be occupied
      for (const n of neighbors) {
        if (logicGrid.getCell(n.x, n.y) === 0) return 0;
      }

      // Wall check (only when blockManager is set)
      if (this.blockManager) {
        if (info.type === 'v-edge' || info.type === 'h-edge') {
          // Edge: check wall between the two neighbors
          if (this.blockManager.hasWall(neighbors[0], neighbors[1])) return 0;
        } else if (info.type === 'corner') {
          // Corner: 4 neighbors = [BL, BR, TL, TR]
          // Check all 4 adjacent pairs among them:
          //   BL↔BR (horizontal bottom), TL↔TR (horizontal top)
          //   BL↔TL (vertical left), BR↔TR (vertical right)
          const [bl, br, tl, tr] = neighbors;
          if (
            this.blockManager.hasWall(bl, br) ||
            this.blockManager.hasWall(tl, tr) ||
            this.blockManager.hasWall(bl, tl) ||
            this.blockManager.hasWall(br, tr)
          ) {
            return 0;
          }
        }
      }

      return 1;
    } else {
      for (const n of neighbors) {
        if (logicGrid.getCell(n.x, n.y) === 1) return 1;
      }
      return 0;
    }
  }

  // ──────────────────── affected cells ────────────────────

  /**
   * 获取当逻辑格 (lx, ly) 变化时需要重算的所有表现格坐标。
   *
   * 包括（过滤越界后）：
   *   - 9 个 interior（3×3）
   *   - 12 个 edge（左/右/下/上各 3）
   *   - 4 个 corner
   *   合计最多 25 个
   */
  getAffectedVisualCells(lx: number, ly: number): GridCoord[] {
    const result: GridCoord[] = [];
    const baseX = lx * STRIDE;
    const baseY = ly * STRIDE;

    // Interior: 3×3
    for (let dy = 1; dy <= 3; dy++) {
      for (let dx = 1; dx <= 3; dx++) {
        this.pushIfValid(result, baseX + dx, baseY + dy);
      }
    }

    // Left v-edge: 3 cells at x = baseX
    for (let dy = 1; dy <= 3; dy++) {
      this.pushIfValid(result, baseX, baseY + dy);
    }
    // Right v-edge: 3 cells at x = baseX + STRIDE
    for (let dy = 1; dy <= 3; dy++) {
      this.pushIfValid(result, baseX + STRIDE, baseY + dy);
    }

    // Bottom h-edge: 3 cells at y = baseY
    for (let dx = 1; dx <= 3; dx++) {
      this.pushIfValid(result, baseX + dx, baseY);
    }
    // Top h-edge: 3 cells at y = baseY + STRIDE
    for (let dx = 1; dx <= 3; dx++) {
      this.pushIfValid(result, baseX + dx, baseY + STRIDE);
    }

    // 4 corners
    this.pushIfValid(result, baseX, baseY); // bottom-left
    this.pushIfValid(result, baseX + STRIDE, baseY); // bottom-right
    this.pushIfValid(result, baseX, baseY + STRIDE); // top-left
    this.pushIfValid(result, baseX + STRIDE, baseY + STRIDE); // top-right

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
   * 返回 visualGrid 产生的脏格列表（包含直接变化格及其 4 邻居），
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
   * 水平墙 (a 和 b 横向相邻)：3 个 V-Edge + 2 个 Corner = 5
   * 垂直墙 (a 和 b 纵向相邻)：3 个 H-Edge + 2 个 Corner = 5
   */
  getAffectedVisualCellsForWall(a: GridCoord, b: GridCoord): GridCoord[] {
    if (!BlockManager.isAdjacent(a, b)) return [];

    const result: GridCoord[] = [];
    const dx = b.x - a.x;
    const dy = b.y - a.y;

    if (dx !== 0) {
      // Horizontal adjacency → shared V-Edge column
      // a is left, b is right (or vice versa)
      const left = dx > 0 ? a : b;
      const vx = (left.x + 1) * STRIDE; // shared v-edge column
      const baseY = left.y * STRIDE;
      // 3 v-edge cells
      for (let i = 1; i <= 3; i++) {
        this.pushIfValid(result, vx, baseY + i);
      }
      // 2 corner cells
      this.pushIfValid(result, vx, baseY); // bottom corner
      this.pushIfValid(result, vx, baseY + STRIDE); // top corner
    } else {
      // Vertical adjacency → shared H-Edge row
      // a is bottom, b is top (or vice versa)
      const bottom = dy > 0 ? a : b;
      const vy = (bottom.y + 1) * STRIDE; // shared h-edge row
      const baseX = bottom.x * STRIDE;
      // 3 h-edge cells
      for (let i = 1; i <= 3; i++) {
        this.pushIfValid(result, baseX + i, vy);
      }
      // 2 corner cells
      this.pushIfValid(result, baseX, vy); // left corner
      this.pushIfValid(result, baseX + STRIDE, vy); // right corner
    }

    return result;
  }

  /**
   * 局部同步：当墙壁 (a, b) 变化后，更新受影响的表现格。
   * 返回 visualGrid 产生的脏格列表，可直接传给 renderer.refreshLocal()。
   */
  syncWallChange(
    a: GridCoord,
    b: GridCoord,
    logicGrid: OccupancyGrid,
    visualGrid: OccupancyGrid,
  ): GridCoord[] {
    const affected = this.getAffectedVisualCellsForWall(a, b);
    for (const { x, y } of affected) {
      const occ = this.computeVisualOccupancy(x, y, logicGrid);
      visualGrid.setCell(x, y, occ);
    }
    return visualGrid.getDirtyAndClear();
  }

  // ──────────────────── private ────────────────────

  private pushIfValid(result: GridCoord[], vx: number, vy: number): void {
    if (vx >= 0 && vx < this.visualCols && vy >= 0 && vy < this.visualRows) {
      result.push({ x: vx, y: vy });
    }
  }
}
