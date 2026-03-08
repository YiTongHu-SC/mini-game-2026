/**
 * DualGridController — 双网格测试场景组件
 *
 * 整合双网格系统（逻辑网格 + 表现网格），提供：
 *   - 点击逻辑格 → 自动同步表现网格并局部刷新
 *   - 逻辑网格叠加层可视化（半透明，按钮切换）
 *   - 预设测试图案、清空、debug mask 切换
 *
 * 挂载到一个空 Node 上，在 Cocos Creator 编辑器中配置属性后运行。
 * 需要创建一个独立的测试场景（如 dualGridTest.scene）。
 */

import {
  _decorator,
  Component,
  Node,
  Sprite,
  SpriteFrame,
  EventMouse,
  UITransform,
  Vec3,
  CCInteger,
  Color,
  Label,
  Layers,
} from 'cc';
import { OccupancyGrid } from './OccupancyGrid';
import { AutoTileResolver } from './AutoTileResolver';
import { createDefaultConfig } from './TileMapConfig';
import { VisualTilemapRenderer } from './VisualTilemapRenderer';
import { DualGridMapper } from './DualGridMapper';
import { BlockManager } from './BlockManager';
import { STRIDE, visualGridSize } from './DualGridTypes';

const { ccclass, property } = _decorator;

/** Fallback layer value for UI_2D (1 << 25). */
const UI_2D_LAYER = 1 << 25;

@ccclass('DualGridController')
export class DualGridController extends Component {
  // ── Editor properties ──

  @property({ type: CCInteger, tooltip: '逻辑网格列数' })
  logicCols: number = 5;

  @property({ type: CCInteger, tooltip: '逻辑网格行数' })
  logicRows: number = 5;

  @property({ type: CCInteger, tooltip: '表现格像素大小（逻辑格视觉大小 = 3 × 此值）' })
  visualTileSize: number = 24;

  @property({ tooltip: '显示表现格 mask debug 标签' })
  showDebugMask: boolean = true;

  @property({ tooltip: '显示逻辑网格叠加层（默认隐藏，按钮切换）' })
  showLogicOverlay: boolean = false;

  @property({ type: [SpriteFrame], tooltip: 'Tileset sprite frames (16 items, index = mask)' })
  tileFrames: SpriteFrame[] = [];

  // ── Runtime instances ──

  private logicGrid!: OccupancyGrid;
  private visualGrid!: OccupancyGrid;
  private mapper!: DualGridMapper;
  private resolver!: AutoTileResolver;
  private renderer!: VisualTilemapRenderer;
  private overlayNode!: Node;
  private overlayCells: (Node | null)[][] = [];
  private _pendingRefresh = 2;
  private blockManager!: BlockManager;
  private wallIndicatorLayer!: Node;
  /** Map from wall key → indicator Node */
  private wallIndicators: Map<string, Node> = new Map();

  // ──────────────────── lifecycle ────────────────────

  start(): void {
    // 1. Logic grid
    this.logicGrid = new OccupancyGrid(this.logicCols, this.logicRows);

    // 2. Visual grid (derived size)
    const vSize = visualGridSize(this.logicCols, this.logicRows);
    this.visualGrid = new OccupancyGrid(vSize.cols, vSize.rows);

    // 3. Mapper (logic → visual coordination)
    this.mapper = new DualGridMapper(this.logicCols, this.logicRows);

    // 3b. Block/Wall manager
    this.blockManager = new BlockManager();
    this.mapper.setBlockManager(this.blockManager);

    // 4. Resolver works on the VISUAL grid
    this.resolver = new AutoTileResolver(this.visualGrid, createDefaultConfig());

    // 5. Renderer for the visual grid
    this.renderer = new VisualTilemapRenderer(
      this.node,
      vSize.cols,
      vSize.rows,
      this.visualTileSize,
      this.tileFrames,
      this.showDebugMask,
    );

    // 6. Resize parent UITransform to cover the full visual grid (for touch hit-testing)
    const ut = this.node.getComponent(UITransform);
    if (ut) {
      ut.setContentSize(vSize.cols * this.visualTileSize, vSize.rows * this.visualTileSize);
    }

    // 7. Build logic overlay
    this.buildLogicOverlay();

    // 7b. Build wall indicator layer
    this.buildWallIndicatorLayer();

    // 8. Load default test pattern and do initial sync
    this.loadTestPattern();

    // 9. Mouse input — left-click: toggle logic cell
    this.node.on(Node.EventType.MOUSE_UP, this.onMouseUp, this);

    console.log(
      `[DualGridController] Initialized logic=${this.logicCols}×${this.logicRows}, ` +
        `visual=${vSize.cols}×${vSize.rows}, visualTileSize=${this.visualTileSize}, ` +
        `tileFrames=${this.tileFrames.length}`,
    );
  }

  update(): void {
    if (this._pendingRefresh <= 0) return;
    this._pendingRefresh--;
    if (this._pendingRefresh === 0) {
      // Deferred refresh — ensures render pipeline has registered dynamic nodes
      this.renderer.refreshAll(this.resolver, this.visualGrid);
      console.log('[DualGridController] Deferred refresh done');
    }
  }

  // ──────────────────── mouse input ────────────────────

  private onMouseUp(event: EventMouse): void {
    if (event.getButton() === EventMouse.BUTTON_LEFT) {
      this.handleLogicToggle(event);
    }
  }

  /**
   * 将鼠标事件的 UI 坐标转换为节点本地空间的像素偏移 (px, py)。
   * 返回 null 表示无法获取 UITransform。
   */
  private mouseToLocalPixel(event: EventMouse): { px: number; py: number } | null {
    const touchPos = event.getUILocation();
    const worldPos = new Vec3(touchPos.x, touchPos.y, 0);
    const ut = this.node.getComponent(UITransform);
    if (!ut) return null;
    const localPos = ut.convertToNodeSpaceAR(worldPos);

    const vSize = visualGridSize(this.logicCols, this.logicRows);
    const offsetX = (vSize.cols * this.visualTileSize) / 2;
    const offsetY = (vSize.rows * this.visualTileSize) / 2;

    return { px: localPos.x + offsetX, py: localPos.y + offsetY };
  }

  // ──────────────────── left-click: logic toggle ────────────────────

  private handleLogicToggle(event: EventMouse): void {
    const pixel = this.mouseToLocalPixel(event);
    if (!pixel) return;

    const logicCellSize = STRIDE * this.visualTileSize;
    const lx = Math.max(0, Math.min(this.logicCols - 1, Math.floor(pixel.px / logicCellSize)));
    const ly = Math.max(0, Math.min(this.logicRows - 1, Math.floor(pixel.py / logicCellSize)));

    // Toggle logic cell
    const current = this.logicGrid.getCell(lx, ly);
    const newVal: 0 | 1 = current === 0 ? 1 : 0;
    this.logicGrid.setCell(lx, ly, newVal);
    this.logicGrid.getDirtyAndClear(); // discard logic dirty — visual sync handles its own

    // Sync to visual grid and get dirty cells for rendering
    const dirty = this.mapper.syncLogicCell(lx, ly, this.logicGrid, this.visualGrid);
    this.renderer.refreshLocal(dirty, this.resolver, this.visualGrid);

    // Update logic overlay visual
    this.updateOverlayCell(lx, ly, newVal);

    console.log(
      `[DualGridController] Toggled logic (${lx},${ly}) → ${newVal}, ` +
        `refreshed ${dirty.length} visual cells`,
    );
  }

  // ──────────────────── logic overlay ────────────────────

  /**
   * Build semi-transparent overlay nodes showing the logic grid.
   * Each logic cell is displayed as a colored rectangle with coordinate label.
   */
  private buildLogicOverlay(): void {
    this.overlayNode = new Node('LogicOverlay');
    const layer = this.node.layer || Layers?.Enum?.UI_2D || UI_2D_LAYER;
    this.overlayNode.layer = layer;
    this.overlayNode.parent = this.node;
    this.overlayNode.setPosition(Vec3.ZERO);
    this.overlayNode.active = this.showLogicOverlay;

    // Visual cell offset (same formula as VisualTilemapRenderer.buildNodeGrid)
    const vSize = visualGridSize(this.logicCols, this.logicRows);
    const renderOffsetX = -(vSize.cols * this.visualTileSize) / 2 + this.visualTileSize / 2;
    const renderOffsetY = -(vSize.rows * this.visualTileSize) / 2 + this.visualTileSize / 2;
    const logicCellPixelSize = STRIDE * this.visualTileSize;

    this.overlayCells = [];

    for (let ly = 0; ly < this.logicRows; ly++) {
      const row: (Node | null)[] = [];
      for (let lx = 0; lx < this.logicCols; lx++) {
        const cellNode = new Node(`logic_${lx}_${ly}`);
        cellNode.layer = layer;
        cellNode.parent = this.overlayNode;

        // Position: center of logic cell's visual footprint
        // Logic cell (lx,ly) center visual cell is (lx*STRIDE+1, ly*STRIDE+1)
        const centerVx = lx * STRIDE + 1;
        const centerVy = ly * STRIDE + 1;
        const px = renderOffsetX + centerVx * this.visualTileSize;
        const py = renderOffsetY + centerVy * this.visualTileSize;
        cellNode.setPosition(new Vec3(px, py, 0));

        const cellUT = cellNode.addComponent(UITransform);
        cellUT.setContentSize(logicCellPixelSize, logicCellPixelSize);

        // Sprite for colored rectangle
        const sprite = cellNode.addComponent(Sprite);
        sprite.type = Sprite.Type.SIMPLE;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = null;
        sprite.color = new Color(100, 100, 100, 80); // empty: subtle grey

        // Coordinate label
        const labelNode = new Node('logicLabel');
        labelNode.layer = layer;
        labelNode.parent = cellNode;
        labelNode.setPosition(Vec3.ZERO);
        const labelUT = labelNode.addComponent(UITransform);
        labelUT.setContentSize(logicCellPixelSize, logicCellPixelSize);
        const label = labelNode.addComponent(Label);
        label.fontSize = 14;
        label.color = new Color(255, 255, 255, 180);
        label.string = `${lx},${ly}`;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;

        row.push(cellNode);
      }
      this.overlayCells.push(row);
    }
  }

  /** Update a single overlay cell's color based on occupancy. */
  private updateOverlayCell(lx: number, ly: number, value: 0 | 1): void {
    const node = this.overlayCells[ly]?.[lx];
    if (!node) return;
    const sprite = node.getComponent(Sprite);
    if (!sprite) return;
    sprite.color = value === 1 ? new Color(0, 180, 0, 100) : new Color(100, 100, 100, 80);
  }

  /** Refresh all overlay cells to match logic grid state. */
  private refreshAllOverlay(): void {
    for (let ly = 0; ly < this.logicRows; ly++) {
      for (let lx = 0; lx < this.logicCols; lx++) {
        this.updateOverlayCell(lx, ly, this.logicGrid.getCell(lx, ly));
      }
    }
  }

  // ──────────────────── wall indicator layer ────────────────────

  /** 创建墙壁指示器父节点。 */
  private buildWallIndicatorLayer(): void {
    this.wallIndicatorLayer = new Node('WallIndicators');
    const layer = this.node.layer || Layers?.Enum?.UI_2D || UI_2D_LAYER;
    this.wallIndicatorLayer.layer = layer;
    this.wallIndicatorLayer.parent = this.node;
    this.wallIndicatorLayer.setPosition(Vec3.ZERO);
  }

  /**
   * 更新单个墙壁的可视指示器。
   * 有墙 → 创建/显示红色半透明矩形
   * 无墙 → 移除指示器节点
   */
  private updateWallIndicator(
    a: { x: number; y: number },
    b: { x: number; y: number },
    hasWall: boolean,
  ): void {
    const key = BlockManager.wallKey(a, b);
    if (key === null) return;

    if (!hasWall) {
      // Remove indicator
      const existing = this.wallIndicators.get(key);
      if (existing) {
        existing.destroy();
        this.wallIndicators.delete(key);
      }
      return;
    }

    // Create indicator if needed
    if (this.wallIndicators.has(key)) return;

    const vSize = visualGridSize(this.logicCols, this.logicRows);
    const renderOffsetX = -(vSize.cols * this.visualTileSize) / 2 + this.visualTileSize / 2;
    const renderOffsetY = -(vSize.rows * this.visualTileSize) / 2 + this.visualTileSize / 2;
    const layerVal = this.node.layer || Layers?.Enum?.UI_2D || UI_2D_LAYER;

    const dx = b.x - a.x;
    const dy = b.y - a.y;

    let centerVx: number;
    let centerVy: number;
    let width: number;
    let height: number;

    if (dx !== 0) {
      // Horizontal adjacency — wall between left and right blocks
      const left = dx > 0 ? a : b;
      // Position at the pixel boundary: between left cell's last col and right cell's first col
      centerVx = (left.x + 1) * STRIDE - 0.5;
      centerVy = left.y * STRIDE + 1; // center of the 3×3 block
      width = this.visualTileSize;
      height = this.visualTileSize * STRIDE;
    } else {
      // Vertical adjacency — wall between bottom and top blocks
      const bottom = dy > 0 ? a : b;
      centerVx = bottom.x * STRIDE + 1;
      centerVy = (bottom.y + 1) * STRIDE - 0.5;
      width = this.visualTileSize * STRIDE;
      height = this.visualTileSize;
    }

    const node = new Node(`wall_${key}`);
    node.layer = layerVal;
    node.parent = this.wallIndicatorLayer;

    const px = renderOffsetX + centerVx * this.visualTileSize;
    const py = renderOffsetY + centerVy * this.visualTileSize;
    node.setPosition(new Vec3(px, py, 0));

    const ut = node.addComponent(UITransform);
    ut.setContentSize(width, height);

    const sprite = node.addComponent(Sprite);
    sprite.type = Sprite.Type.SIMPLE;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = null;
    sprite.color = new Color(255, 50, 50, 150); // Red semi-transparent

    this.wallIndicators.set(key, node);
  }

  /** 清除所有墙壁指示器。 */
  private clearWallIndicators(): void {
    for (const node of this.wallIndicators.values()) {
      node.destroy();
    }
    this.wallIndicators.clear();
  }

  // ──────────────────── public actions ────────────────────

  /** Toggle logic overlay visibility. Bind to a UI button. */
  toggleLogicOverlay(): void {
    this.showLogicOverlay = !this.showLogicOverlay;
    this.overlayNode.active = this.showLogicOverlay;
    if (this.showLogicOverlay) {
      this.refreshAllOverlay();
    }
    console.log(`[DualGridController] Logic overlay: ${this.showLogicOverlay}`);
  }

  /** Clear the entire grid. Bind to a UI button. */
  clearGrid(): void {
    this.logicGrid.clear();
    this.blockManager.clearWalls();
    this.clearWallIndicators();
    this.mapper.syncAll(this.logicGrid, this.visualGrid);
    this.renderer.refreshAll(this.resolver, this.visualGrid);
    this.refreshAllOverlay();
    console.log('[DualGridController] Grid cleared');
  }

  /**
   * Load a preset test pattern: 3×3 occupied block in the center.
   * Demonstrates interior, edge, and corner fill behavior.
   * Bind to a UI button.
   */
  loadTestPattern(): void {
    this.logicGrid.clear();
    this.blockManager.clearWalls();
    this.clearWallIndicators();

    // Place a 3×3 block centered in the logic grid
    const cx = Math.floor(this.logicCols / 2);
    const cy = Math.floor(this.logicRows / 2);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const lx = cx + dx;
        const ly = cy + dy;
        if (lx >= 0 && lx < this.logicCols && ly >= 0 && ly < this.logicRows) {
          this.logicGrid.setCell(lx, ly, 1);
        }
      }
    }

    this.logicGrid.getDirtyAndClear(); // discard — full refresh follows
    this.mapper.syncAll(this.logicGrid, this.visualGrid);
    this.renderer.refreshAll(this.resolver, this.visualGrid);
    this.refreshAllOverlay();
    console.log('[DualGridController] Test pattern loaded (3×3 center block)');
  }

  /** Toggle debug mask labels on visual tiles. Bind to a UI button. */
  toggleDebugMask(): void {
    this.showDebugMask = !this.showDebugMask;
    this.renderer.setDebugMask(this.showDebugMask);
    this.renderer.refreshAll(this.resolver, this.visualGrid);
    console.log(`[DualGridController] Debug mask: ${this.showDebugMask}`);
  }
}
