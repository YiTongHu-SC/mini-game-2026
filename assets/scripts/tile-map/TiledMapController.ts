/**
 * TiledMapController — 场景挂载组件
 *
 * 整合 OccupancyGrid、AutoTileResolver、VisualTilemapRenderer，
 * 提供编辑器属性配置和运行时交互（点击切换格子、预览所有 16 种 mask）。
 *
 * 挂载到一个空 Node 上，在 Cocos Creator 编辑器中配置属性后运行。
 */

import {
  _decorator,
  Component,
  Node,
  Sprite,
  SpriteFrame,
  EventTouch,
  UITransform,
  Vec3,
  CCInteger,
} from 'cc';
import { OccupancyGrid, GridCoord } from './OccupancyGrid';
import { AutoTileResolver } from './AutoTileResolver';
import { TileMapConfig, createDefaultConfig } from './TileMapConfig';
import { VisualTilemapRenderer } from './VisualTilemapRenderer';
import { getConnectedRegion, getAllRegions } from './ConnectedRegion';

const { ccclass, property } = _decorator;

@ccclass('TiledMapController')
export class TiledMapController extends Component {
  @property({ type: CCInteger, tooltip: 'Grid column count' })
  cols: number = 10;

  @property({ type: CCInteger, tooltip: 'Grid row count' })
  rows: number = 10;

  @property({ type: CCInteger, tooltip: 'Tile size in pixels' })
  tileSize: number = 40;

  @property({ tooltip: 'Show mask debug labels' })
  showDebugMask: boolean = true;

  @property({ type: [SpriteFrame], tooltip: 'Tileset sprite frames (16 items, index = mask)' })
  tileFrames: SpriteFrame[] = [];

  // ── Runtime instances ──
  private grid!: OccupancyGrid;
  private resolver!: AutoTileResolver;
  private renderer!: VisualTilemapRenderer;
  private config!: TileMapConfig;
  private _pendingRefresh = 2; // countdown frames for deferred refresh

  // ──────────────────── lifecycle ────────────────────

  start(): void {
    this.config = createDefaultConfig();
    this.grid = new OccupancyGrid(this.cols, this.rows);
    this.resolver = new AutoTileResolver(this.grid, this.config);
    this.renderer = new VisualTilemapRenderer(
      this.node,
      this.cols,
      this.rows,
      this.tileSize,
      this.tileFrames,
      this.showDebugMask,
    );

    // Resize parent UITransform to cover the full grid so touch hit-testing works everywhere
    const ut = this.node.getComponent(UITransform);
    if (ut) {
      ut.setContentSize(this.cols * this.tileSize, this.rows * this.tileSize);
    }

    // Load a default test pattern: hollow rectangle
    this.loadHollowRect();

    // Enable touch input
    this.node.on(Node.EventType.TOUCH_END, this.onTouch, this);

    console.log(
      `[TiledMapController] Initialized ${this.cols}×${this.rows} grid, ` +
        `tileSize=${this.tileSize}, tileFrames=${this.tileFrames.length}, ` +
        `nodeLayer=${this.node.layer}, validFrames=${this.tileFrames.filter(f => !!f).length}`,
    );
  }

  update(): void {
    if (this._pendingRefresh <= 0) return;
    this._pendingRefresh--;
    if (this._pendingRefresh === 0) {
      // Deferred refresh — ensures render pipeline has had time to register dynamic nodes
      this.renderer.refreshAll(this.resolver, this.grid);
      const firstChild = this.node.children[0];
      const sprite = firstChild?.getComponent(Sprite) ?? null;
      console.log(
        `[TiledMapController] Deferred refresh done. children=${this.node.children.length}, ` +
          `firstChild.layer=${firstChild?.layer}, firstChild.active=${firstChild?.active}, ` +
          `sprite=${!!sprite}, spriteFrame=${!!sprite?.spriteFrame}`,
      );
    }
  }

  // ──────────────────── input ────────────────────

  private onTouch(event: EventTouch): void {
    const touchPos = event.getUILocation();
    const worldPos = new Vec3(touchPos.x, touchPos.y, 0);
    const ut = this.node.getComponent(UITransform);
    if (!ut) return;
    const localPos = ut.convertToNodeSpaceAR(worldPos);

    const offsetX = (this.cols * this.tileSize) / 2;
    const offsetY = (this.rows * this.tileSize) / 2;

    const gx = Math.floor((localPos.x + offsetX) / this.tileSize);
    const gy = Math.floor((localPos.y + offsetY) / this.tileSize);

    if (gx < 0 || gx >= this.cols || gy < 0 || gy >= this.rows) return;

    // Toggle cell
    const current = this.grid.getCell(gx, gy);
    this.grid.setCell(gx, gy, current === 0 ? 1 : 0);
    const dirty = this.grid.getDirtyAndClear();
    this.renderer.refreshLocal(dirty, this.resolver, this.grid);

    console.log(
      `[TiledMapController] Toggled (${gx},${gy}) → ${current === 0 ? 1 : 0}, ` +
        `refreshed ${dirty.length} cells`,
    );
  }

  // ──────────────────── test patterns ────────────────────

  /** Fill a hollow rectangle as initial test pattern. */
  loadHollowRect(): void {
    const margin = 1;
    for (let y = margin; y < this.rows - margin; y++) {
      for (let x = margin; x < this.cols - margin; x++) {
        const isBorder =
          y === margin ||
          y === this.rows - margin - 1 ||
          x === margin ||
          x === this.cols - margin - 1;
        const isInner = !isBorder;
        this.grid.setCell(x, y, isBorder || isInner ? 1 : 0);
      }
    }
    // Cut a cross out of the middle to make it more interesting
    const cx = Math.floor(this.cols / 2);
    const cy = Math.floor(this.rows / 2);
    this.grid.setCell(cx, cy, 0);
    this.grid.setCell(cx - 1, cy, 0);
    this.grid.setCell(cx + 1, cy, 0);
    this.grid.setCell(cx, cy - 1, 0);
    this.grid.setCell(cx, cy + 1, 0);

    this.grid.getDirtyAndClear(); // discard dirty — full refresh follows
    this.renderer.refreshAll(this.resolver, this.grid);

    // Log connected regions
    const regions = getAllRegions(this.grid);
    console.log(`[TiledMapController] Loaded hollow rect — ${regions.length} region(s)`);
  }

  /**
   * Preview all 16 mask cases in a 4×4 grid.
   * Call from a UI button for tileset verification.
   */
  runMaskPreview(): void {
    // Reset grid to fit 4×4 in top-left
    this.grid.clear();
    // We need at least a 6×6 grid to fit 4×4 island cells with borders
    // Approach: place each mask case as an isolated cell surrounded by
    // exactly the right neighbours

    // Simpler: just fill a 4×4 and manually set neighbours
    // Actually, let's use a specialized layout:
    // For each mask 0..15, place an occupied cell at known position
    // and add neighbors that produce exactly that mask.

    const startX = 1;
    const startY = 1;

    for (let mask = 0; mask < 16; mask++) {
      const col = mask % 4;
      const row = Math.floor(mask / 4);
      // Each "cell island" occupies a 3×3 area, spaced by 3
      const cx = startX + col * 3;
      const cy = startY + row * 3;

      if (cx >= this.cols || cy >= this.rows) continue;

      this.grid.setCell(cx, cy, 1);
      if (mask & 1 && cy + 1 < this.rows) this.grid.setCell(cx, cy + 1, 1); // Up
      if (mask & 2 && cx + 1 < this.cols) this.grid.setCell(cx + 1, cy, 1); // Right
      if (mask & 4 && cy - 1 >= 0) this.grid.setCell(cx, cy - 1, 1); // Down
      if (mask & 8 && cx - 1 >= 0) this.grid.setCell(cx - 1, cy, 1); // Left
    }

    this.grid.getDirtyAndClear();
    this.renderer.refreshAll(this.resolver, this.grid);
    console.log('[TiledMapController] Mask preview: 16 cases displayed');
  }

  /** Clear the grid entirely. */
  clearGrid(): void {
    this.grid.clear();
    this.renderer.refreshAll(this.resolver, this.grid);
    console.log('[TiledMapController] Grid cleared');
  }

  /** Toggle debug mask labels. */
  toggleDebugMask(): void {
    this.showDebugMask = !this.showDebugMask;
    this.renderer.setDebugMask(this.showDebugMask);
    this.renderer.refreshAll(this.resolver, this.grid);
    console.log(`[TiledMapController] Debug mask: ${this.showDebugMask}`);
  }

  /**
   * Query connected region from a given cell (for gameplay use).
   */
  queryRegion(x: number, y: number): GridCoord[] {
    return getConnectedRegion(this.grid, x, y);
  }
}
