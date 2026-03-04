/**
 * LevelController — 关卡场景组件
 *
 * 从 Inspector 绑定的 JSON Asset 读取关卡数据，初始化完整的双网格系统。
 *
 * 工作流程：
 *   1. 在 Cocos Creator 编辑器中新建场景（level.scene）
 *   2. 在 Canvas 下新建空 Node，添加本组件
 *   3. 将关卡 JSON 文件（如 level-001.json）拖拽到 levelData 属性
 *   4. 将 16 张 tile SpriteFrame 拖拽到 tileFrames 属性
 *   5. 运行场景，自动加载关卡数据并初始化网格
 *
 * 挂载到一个空 Node 上，该 Node 需要有 UITransform 组件（用于触摸区域）。
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
  JsonAsset,
  Graphics,
  input,
  Input,
} from 'cc';
import { OccupancyGrid } from '../tile-map/OccupancyGrid';
import { AutoTileResolver } from '../tile-map/AutoTileResolver';
import { createDefaultConfig } from '../tile-map/TileMapConfig';
import { VisualTilemapRenderer } from '../tile-map/VisualTilemapRenderer';
import { DualGridMapper } from '../tile-map/DualGridMapper';
import { BlockManager } from '../tile-map/BlockManager';
import { STRIDE, visualGridSize } from '../tile-map/DualGridTypes';
import { LevelLoader } from '../tile-map/LevelLoader';
import { LevelData, CellCoord } from '../tile-map/LevelTypes';
import { BlockRegistry } from '../tile-map/BlockRegistry';

const { ccclass, property } = _decorator;

// ──────────────────── drag state ────────────────────

/** 拖拽状态上下文。仅在左键按下期间存在。 */
interface DragState {
  /** 被拖拽的 block id */
  blockId: string;
  /** 拖拽开始前的格子坐标快照（不随 registry 变化） */
  originalCells: CellCoord[];
  /** 被点击的逻辑格 */
  anchorCell: { x: number; y: number };
  /** 拖拽开始时的鼠标本地居中坐标 */
  startMouseLocal: { x: number; y: number };
  /** 被拖拽的表现格节点及其原始位置 */
  draggedNodes: { node: Node; origX: number; origY: number }[];
}

/** Fallback layer value for UI_2D (1 << 25). */
const UI_2D_LAYER = 1 << 25;

@ccclass('LevelController')
export class LevelController extends Component {
  // ── Editor properties ──

  @property({ type: JsonAsset, tooltip: '关卡数据 JSON 文件（LevelData 格式）' })
  levelData: JsonAsset = null!;

  @property({ type: CCInteger, tooltip: '表现格像素大小（逻辑格视觉大小 = 4 × 此值）' })
  visualTileSize: number = 24;

  @property({ tooltip: '显示表现格 mask debug 标签' })
  showDebugMask: boolean = false;

  @property({ tooltip: '显示逻辑网格叠加层' })
  showLogicOverlay: boolean = false;

  @property({ type: [SpriteFrame], tooltip: 'Tileset sprite frames (16 items, index = mask)' })
  tileFrames: SpriteFrame[] = [];

  // ── Runtime instances ──

  private logicGrid!: OccupancyGrid;
  private visualGrid!: OccupancyGrid;
  private mapper!: DualGridMapper;
  private resolver!: AutoTileResolver;
  private renderer!: VisualTilemapRenderer;
  private blockManager!: BlockManager;

  private logicCols: number = 0;
  private logicRows: number = 0;

  private overlayNode!: Node;
  private overlayCells: (Node | null)[][] = [];
  private wallIndicatorLayer!: Node;
  private wallIndicators: Map<string, Node> = new Map();

  // ── Drag & Drop ──
  private blockRegistry!: BlockRegistry;
  private dragState: DragState | null = null;
  private dropPreviewLayer!: Node;

  private _pendingRefresh = 2;

  // ──────────────────── lifecycle ────────────────────

  start(): void {
    // 1. 验证关卡数据
    if (!this.levelData || !this.levelData.json) {
      console.error('[LevelController] levelData is not set or invalid!');
      return;
    }

    // 2. 解析关卡 JSON
    const rawData = this.levelData.json as LevelData;
    const loadResult = LevelLoader.load(rawData);
    this.blockRegistry = new BlockRegistry(rawData);

    this.logicCols = loadResult.gridCols;
    this.logicRows = loadResult.gridRows;

    console.log(
      `[LevelController] Loading level: ${this.logicCols}×${this.logicRows}, ` +
        `blocks=${rawData.blocks.length}, ` +
        `occupiedCells=${loadResult.occupiedCells.length}, ` +
        `walls=${loadResult.walls.length}`,
    );

    // 3. Logic grid
    this.logicGrid = new OccupancyGrid(this.logicCols, this.logicRows);

    // 4. Visual grid (derived size)
    const vSize = visualGridSize(this.logicCols, this.logicRows);
    this.visualGrid = new OccupancyGrid(vSize.cols, vSize.rows);

    // 5. Mapper (logic → visual coordination)
    this.mapper = new DualGridMapper(this.logicCols, this.logicRows);

    // 6. Block / Wall manager
    this.blockManager = new BlockManager();
    this.mapper.setBlockManager(this.blockManager);

    // 7. Resolver works on the VISUAL grid
    this.resolver = new AutoTileResolver(this.visualGrid, createDefaultConfig());

    // 8. Renderer for the visual grid
    this.renderer = new VisualTilemapRenderer(
      this.node,
      vSize.cols,
      vSize.rows,
      this.visualTileSize,
      this.tileFrames,
      this.showDebugMask,
    );

    // 9. Resize parent UITransform to cover the full visual grid
    const ut = this.node.getComponent(UITransform);
    if (ut) {
      ut.setContentSize(vSize.cols * this.visualTileSize, vSize.rows * this.visualTileSize);
    }

    // 10. Build overlay and wall indicator layer
    this.buildLogicOverlay();
    this.buildWallIndicatorLayer();
    this.buildDragLayers();

    // 11. 将关卡数据写入网格
    this.applyLevelData(loadResult);

    // 12. 鼠标输入
    // 全部注册在全局 input 上。若混用 node.on(MOUSE_DOWN) + input.on(MOUSE_MOVE)，
    // Cocos 3.8 UIInputManager 会在鼠标处于节点区域内时吞噬 MOUSE_MOVE，导致拖拽失效。
    input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
    input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
    input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);

    console.log(`[LevelController] Initialized: visual=${vSize.cols}×${vSize.rows}`);
  }

  update(): void {
    if (this._pendingRefresh <= 0) return;
    this._pendingRefresh--;
    if (this._pendingRefresh === 0) {
      // 延迟刷新：等 Cocos 渲染管线注册完动态节点后再刷新
      this.mapper.syncAll(this.logicGrid, this.visualGrid);
      this.renderer.refreshAll(this.resolver, this.visualGrid);
      if (this.showLogicOverlay) this.refreshAllOverlay();
      console.log('[LevelController] Deferred full refresh done');
    }
  }

  // ──────────────────── mouse input ────────────────────

  private onMouseDown(event: EventMouse): void {
    if (event.getButton() !== EventMouse.BUTTON_LEFT) return;
    const local = this.mouseToLocalCentered(event);
    if (!local) return;

    // 全局 input 事件需手动做边界检测（替代 node-level 的自动命中测试）
    const ut = this.node.getComponent(UITransform);
    if (!ut) return;
    const halfW = ut.contentSize.width / 2;
    const halfH = ut.contentSize.height / 2;
    if (local.x < -halfW || local.x > halfW || local.y < -halfH || local.y > halfH) return;

    const pixel = this.mouseToLocalPixel(event);
    if (!pixel) return;

    const { lx, ly } = this.pixelToLogicCell(pixel.px, pixel.py);
    const blockId = this.blockRegistry.getBlockIdAt(lx, ly);
    if (!blockId) return;

    const originalCells = this.blockRegistry.getBlockCells(blockId);

    // 收集 block 所有表现格节点及其原始位置，用于像素级偏移
    const draggedNodes: { node: Node; origX: number; origY: number }[] = [];
    const visited = new Set<string>();
    for (const cell of originalCells) {
      for (const vc of this.mapper.getAffectedVisualCells(cell.x, cell.y)) {
        const key = `${vc.x},${vc.y}`;
        if (visited.has(key)) continue;
        visited.add(key);
        const node = this.renderer.getNodeAt(vc.x, vc.y);
        if (node) {
          const pos = node.getPosition();
          draggedNodes.push({ node, origX: pos.x, origY: pos.y });
        }
      }
    }

    this.dropPreviewLayer.active = true;

    this.dragState = {
      blockId,
      originalCells,
      anchorCell: { x: lx, y: ly },
      startMouseLocal: { x: local.x, y: local.y },
      draggedNodes,
    };

    console.log(
      `[LevelController] Drag start: block='${blockId}', anchor=(${lx},${ly}), ` +
        `visualNodes=${draggedNodes.length}`,
    );
  }

  private onMouseMove(event: EventMouse): void {
    if (!this.dragState) return;

    const local = this.mouseToLocalCentered(event);
    if (!local) return;

    // 像素级偏移所有表现格节点
    const dx = local.x - this.dragState.startMouseLocal.x;
    const dy = local.y - this.dragState.startMouseLocal.y;
    for (const { node, origX, origY } of this.dragState.draggedNodes) {
      node.setPosition(origX + dx, origY + dy, 0);
    }

    // 计算当前吸附目标
    const pixel = this.mouseToLocalPixel(event);
    if (!pixel) return;
    const { lx, ly } = this.pixelToLogicCell(pixel.px, pixel.py);
    const snapDx = lx - this.dragState.anchorCell.x;
    const snapDy = ly - this.dragState.anchorCell.y;

    const validDelta = this.findValidPlacement(this.dragState.originalCells, snapDx, snapDy);
    this.updateDropPreview(
      this.dragState.originalCells,
      validDelta?.dx ?? snapDx,
      validDelta?.dy ?? snapDy,
      validDelta !== null,
    );
  }

  private onMouseUp(event: EventMouse): void {
    if (this.dragState && event.getButton() === EventMouse.BUTTON_LEFT) {
      this.endDrag(event);
      return;
    }
    if (event.getButton() === EventMouse.BUTTON_RIGHT) {
      this.handleWallToggle(event);
    }
  }

  /**
   * 将鼠标事件的 UI 坐标转换为节点本地空间的居中坐标（原点在节点中心）。
   */
  private mouseToLocalCentered(event: EventMouse): { x: number; y: number } | null {
    const touchPos = event.getUILocation();
    const worldPos = new Vec3(touchPos.x, touchPos.y, 0);
    const ut = this.node.getComponent(UITransform);
    if (!ut) return null;
    const localPos = ut.convertToNodeSpaceAR(worldPos);
    return { x: localPos.x, y: localPos.y };
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

  /**
   * 检测右键点击位置是否在两个逻辑格的共享边上，
   * 如果是，则切换该边上的墙壁状态。
   *
   * 如果 vx%4==0 且 vy%4!=0 → V-Edge（左右两个逻辑格之间）
   * 如果 vx%4!=0 且 vy%4==0 → H-Edge（上下两个逻辑格之间）
   */
  private handleWallToggle(event: EventMouse): void {
    const pixel = this.mouseToLocalPixel(event);
    if (!pixel) return;

    const vSize = visualGridSize(this.logicCols, this.logicRows);
    const vx = Math.floor(pixel.px / this.visualTileSize);
    const vy = Math.floor(pixel.py / this.visualTileSize);

    if (vx < 0 || vx >= vSize.cols || vy < 0 || vy >= vSize.rows) return;

    const rx = vx % STRIDE;
    const ry = vy % STRIDE;

    let a: { x: number; y: number } | null = null;
    let b: { x: number; y: number } | null = null;

    if (rx === 0 && ry !== 0) {
      // V-Edge → wall between left and right logic cells
      const lxLeft = vx / STRIDE - 1;
      const lxRight = vx / STRIDE;
      const ly = Math.floor(vy / STRIDE);
      if (lxLeft >= 0 && lxRight < this.logicCols && ly >= 0 && ly < this.logicRows) {
        a = { x: lxLeft, y: ly };
        b = { x: lxRight, y: ly };
      }
    } else if (rx !== 0 && ry === 0) {
      // H-Edge → wall between bottom and top logic cells
      const lx = Math.floor(vx / STRIDE);
      const lyBottom = vy / STRIDE - 1;
      const lyTop = vy / STRIDE;
      if (lx >= 0 && lx < this.logicCols && lyBottom >= 0 && lyTop < this.logicRows) {
        a = { x: lx, y: lyBottom };
        b = { x: lx, y: lyTop };
      }
    }

    if (!a || !b) return;

    // Toggle wall
    const hasWall = this.blockManager.toggleWall(a, b);
    if (hasWall === null) return;

    // Sync visual grid
    const dirty = this.mapper.syncWallChange(a, b, this.logicGrid, this.visualGrid);
    this.renderer.refreshLocal(dirty, this.resolver, this.visualGrid);

    // Update wall indicator
    this.updateWallIndicator(a, b, hasWall);

    // ── Block internal wall management ──
    const blockIdA = this.blockRegistry.getBlockIdAt(a.x, a.y);
    const blockIdB = this.blockRegistry.getBlockIdAt(b.x, b.y);
    const isSameBlock = blockIdA !== undefined && blockIdA === blockIdB;

    if (hasWall && isSameBlock) {
      // 同 block 内添加墙壁 → 存储到 block 内部 wall + 检查连通性
      this.blockRegistry.addBlockWall(a, b);
      const splitResult = this.blockRegistry.trySplitBlock(a, b);
      if (splitResult) {
        const [newIdA, newIdB] = splitResult;

        // 重建全部 wall（split 改变了 block 成员关系）
        this.blockManager.clearWalls();
        for (const [wa, wb] of this.blockRegistry.getAllWalls()) {
          this.blockManager.addWall(wa, wb);
        }

        // 全量同步 + 刷新渲染
        this.logicGrid.getDirtyAndClear();
        this.mapper.syncAll(this.logicGrid, this.visualGrid);
        this.renderer.refreshAll(this.resolver, this.visualGrid);

        // 重建 wall 指示器
        this.clearAllWallIndicators();
        for (const [wa, wb] of this.blockRegistry.getAllWalls()) {
          this.addWallIndicator(wa, wb);
        }

        if (this.showLogicOverlay) this.refreshAllOverlay();

        console.log(
          `[LevelController] Block split: (${a.x},${a.y})↔(${b.x},${b.y}) → ` +
            `'${newIdA}' (${this.blockRegistry.getBlockCells(newIdA).length} cells) + ` +
            `'${newIdB}' (${this.blockRegistry.getBlockCells(newIdB).length} cells)`,
        );
        return;
      }
      console.log(
        `[LevelController] Internal wall (${a.x},${a.y})↔(${b.x},${b.y}) added to block '${blockIdA}', still connected`,
      );
    } else if (!hasWall && isSameBlock) {
      // 同 block 内移除墙壁 → 从 block 内部 wall 移除
      this.blockRegistry.removeBlockWall(a, b);
      console.log(
        `[LevelController] Internal wall (${a.x},${a.y})↔(${b.x},${b.y}) removed from block '${blockIdA}'`,
      );
    } else {
      console.log(
        `[LevelController] Wall (${a.x},${a.y})↔(${b.x},${b.y}) → ${hasWall ? 'ON' : 'OFF'}, ` +
          `refreshed ${dirty.length} visual cells`,
      );
    }
  }

  // ──────────────────── level data application ────────────────────

  /**
   * 将解析结果写入逻辑网格和 BlockManager。
   */
  private applyLevelData(loadResult: ReturnType<typeof LevelLoader.load>): void {
    // 写入已占用格
    for (const cell of loadResult.occupiedCells) {
      this.logicGrid.setCell(cell.x, cell.y, 1);
    }
    this.logicGrid.getDirtyAndClear(); // 清除 dirty 标记，后续全量 sync

    // 写入 wall（跨 block 墙壁 + block 内部墙壁）
    for (const [a, b] of this.blockRegistry.getAllWalls()) {
      this.blockManager.addWall(a, b);
      this.addWallIndicator(a, b);
    }

    // 同步逻辑网格到表现网格（全量）
    this.mapper.syncAll(this.logicGrid, this.visualGrid);

    // 刷新由 update() 延迟执行（给 Cocos 注册动态节点的时间）
  }

  // ──────────────────── logic overlay ────────────────────

  private buildLogicOverlay(): void {
    this.overlayNode = new Node('LogicOverlay');
    const layer = this.node.layer || Layers?.Enum?.UI_2D || UI_2D_LAYER;
    this.overlayNode.layer = layer;
    this.overlayNode.parent = this.node;
    this.overlayNode.setPosition(Vec3.ZERO);
    this.overlayNode.active = this.showLogicOverlay;

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

        const centerVx = lx * STRIDE + 2;
        const centerVy = ly * STRIDE + 2;
        const px = renderOffsetX + centerVx * this.visualTileSize;
        const py = renderOffsetY + centerVy * this.visualTileSize;
        cellNode.setPosition(new Vec3(px, py, 0));

        const cellUT = cellNode.addComponent(UITransform);
        cellUT.setContentSize(logicCellPixelSize, logicCellPixelSize);

        const sprite = cellNode.addComponent(Sprite);
        sprite.type = Sprite.Type.SIMPLE;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = null;
        sprite.color = new Color(100, 100, 100, 80);

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

  private updateOverlayCell(lx: number, ly: number, value: 0 | 1): void {
    const node = this.overlayCells[ly]?.[lx];
    if (!node) return;
    const sprite = node.getComponent(Sprite);
    if (!sprite) return;
    sprite.color = value === 1 ? new Color(0, 180, 0, 100) : new Color(100, 100, 100, 80);
  }

  private refreshAllOverlay(): void {
    for (let ly = 0; ly < this.logicRows; ly++) {
      for (let lx = 0; lx < this.logicCols; lx++) {
        this.updateOverlayCell(lx, ly, this.logicGrid.getCell(lx, ly));
      }
    }
  }

  // ──────────────────── drag & drop ────────────────────

  /** 创建 drop 预览层（在 start() 中调用一次）。 */
  private buildDragLayers(): void {
    const layer = this.node.layer || Layers?.Enum?.UI_2D || UI_2D_LAYER;

    this.dropPreviewLayer = new Node('DropPreviewLayer');
    this.dropPreviewLayer.layer = layer;
    this.dropPreviewLayer.parent = this.node;
    this.dropPreviewLayer.active = false;
  }

  /**
   * 将 (px, py)（0 原点坐标）转换为逻辑格坐标。
   */
  private pixelToLogicCell(px: number, py: number): { lx: number; ly: number } {
    const logicCellSize = STRIDE * this.visualTileSize;
    const halfVts = this.visualTileSize * 0.5;
    const lx = Math.max(
      0,
      Math.min(this.logicCols - 1, Math.floor((px - halfVts) / logicCellSize)),
    );
    const ly = Math.max(
      0,
      Math.min(this.logicRows - 1, Math.floor((py - halfVts) / logicCellSize)),
    );
    return { lx, ly };
  }

  /**
   * 返回逻辑格 (lx, ly) 中心在节点本地坐标系（居中原点）中的位置。
   */
  private logicCellCenterLocal(lx: number, ly: number): { x: number; y: number } {
    const vSize = visualGridSize(this.logicCols, this.logicRows);
    const renderOffsetX = -(vSize.cols * this.visualTileSize) / 2 + this.visualTileSize / 2;
    const renderOffsetY = -(vSize.rows * this.visualTileSize) / 2 + this.visualTileSize / 2;
    return {
      x: renderOffsetX + (lx * STRIDE + 2) * this.visualTileSize,
      y: renderOffsetY + (ly * STRIDE + 2) * this.visualTileSize,
    };
  }

  /**
   * 更新 drop 预览层。
   * @param cells 拖拽中的格子（原始坐标）
   * @param dx 目标偏移 x
   * @param dy 目标偏移 y
   * @param isValid 目标位置是否可放置
   */
  private updateDropPreview(cells: CellCoord[], dx: number, dy: number, isValid: boolean): void {
    this.dropPreviewLayer.removeAllChildren();
    const size = STRIDE * this.visualTileSize;
    const layer = this.node.layer || Layers?.Enum?.UI_2D || UI_2D_LAYER;
    const vSize = visualGridSize(this.logicCols, this.logicRows);
    const renderOffsetX = -(vSize.cols * this.visualTileSize) / 2 + this.visualTileSize / 2;
    const renderOffsetY = -(vSize.rows * this.visualTileSize) / 2 + this.visualTileSize / 2;
    const previewColor = isValid ? new Color(80, 220, 80, 100) : new Color(220, 80, 80, 100);

    for (const cell of cells) {
      const tx = cell.x + dx;
      const ty = cell.y + dy;
      if (tx < 0 || tx >= this.logicCols || ty < 0 || ty >= this.logicRows) continue;

      const node = new Node(`preview_${tx}_${ty}`);
      node.layer = layer;
      node.parent = this.dropPreviewLayer;

      const centerVx = tx * STRIDE + 2;
      const centerVy = ty * STRIDE + 2;
      node.setPosition(
        new Vec3(
          renderOffsetX + centerVx * this.visualTileSize,
          renderOffsetY + centerVy * this.visualTileSize,
          0,
        ),
      );

      const ut = node.addComponent(UITransform);
      ut.setContentSize(size, size);

      const g = node.addComponent(Graphics);
      g.fillColor = previewColor;
      g.rect(-size / 2, -size / 2, size, size);
      g.fill();
    }
  }

  /**
   * 在 (snapDx, snapDy) 为中心的 ±2 格范围内搜索最近可放置位置。
   * @returns 有效的 (dx, dy) 偏移；若全部无效则返回 null
   */
  private findValidPlacement(
    cells: CellCoord[],
    snapDx: number,
    snapDy: number,
  ): { dx: number; dy: number } | null {
    const MAX_SEARCH = 2;
    const candidates: { ddx: number; ddy: number; dist: number }[] = [];

    for (let ddx = -MAX_SEARCH; ddx <= MAX_SEARCH; ddx++) {
      for (let ddy = -MAX_SEARCH; ddy <= MAX_SEARCH; ddy++) {
        candidates.push({ ddx, ddy, dist: Math.abs(ddx) + Math.abs(ddy) });
      }
    }
    // 按曼哈顿距离升序排列，优先吸附到最近位置
    candidates.sort((a, b) => a.dist - b.dist);

    for (const { ddx, ddy } of candidates) {
      const dx = snapDx + ddx;
      const dy = snapDy + ddy;
      if (this.isPlacementValid(cells, dx, dy)) {
        return { dx, dy };
      }
    }
    return null;
  }

  /**
   * 检查将 cells 平移 (dx, dy) 后是否可放置：
   * 所有目标格在网格范围内，且为空或属于当前被拖拽的 block。
   */
  private isPlacementValid(cells: CellCoord[], dx: number, dy: number): boolean {
    const blockId = this.dragState?.blockId;
    for (const cell of cells) {
      const nx = cell.x + dx;
      const ny = cell.y + dy;
      if (nx < 0 || nx >= this.logicCols || ny < 0 || ny >= this.logicRows) return false;
      if (this.logicGrid.getCell(nx, ny) === 1) {
        // 目标格有占用 — 若属于被拖拽的 block 本身则允许（dx=0,dy=0 的情况）
        if (this.blockRegistry.getBlockIdAt(nx, ny) !== blockId) return false;
      }
    }
    return true;
  }

  /**
   * 松开鼠标时结束拖拽：还原节点位置，计算落点，成功则提交，失败则还原。
   */
  private endDrag(event: EventMouse): void {
    const state = this.dragState!;

    // 还原所有表现格节点到原始位置
    for (const { node, origX, origY } of state.draggedNodes) {
      node.setPosition(origX, origY, 0);
    }

    const pixel = this.mouseToLocalPixel(event);
    const { lx, ly } = pixel
      ? this.pixelToLogicCell(pixel.px, pixel.py)
      : { lx: state.anchorCell.x, ly: state.anchorCell.y };

    const snapDx = lx - state.anchorCell.x;
    const snapDy = ly - state.anchorCell.y;
    const validDelta = this.findValidPlacement(state.originalCells, snapDx, snapDy);

    // 清除拖拽视觉元素
    this.dropPreviewLayer.active = false;
    this.dropPreviewLayer.removeAllChildren();
    this.dragState = null;

    if (validDelta && (validDelta.dx !== 0 || validDelta.dy !== 0)) {
      this.commitDrop(state, validDelta.dx, validDelta.dy);
    } else {
      // 放置失败或原地，还原视觉（刷新去除 tint）
      this.renderer.refreshAll(this.resolver, this.visualGrid);
      console.log(`[LevelController] Drag cancelled or no-op for block '${state.blockId}'`);
    }
  }

  /**
   * 将拖拽的 block 提交到新位置：更新注册表、网格、wall、渲染。
   */
  private commitDrop(state: DragState, dx: number, dy: number): void {
    const { blockId, originalCells } = state;

    // 从逻辑网格移除原格子
    for (const cell of originalCells) {
      this.logicGrid.setCell(cell.x, cell.y, 0);
    }

    // 更新注册表
    this.blockRegistry.moveBlock(blockId, dx, dy);

    // 写入新格子
    const newCells = this.blockRegistry.getBlockCells(blockId);
    for (const cell of newCells) {
      this.logicGrid.setCell(cell.x, cell.y, 1);
    }

    // 重建全部 wall
    this.blockManager.clearWalls();
    for (const [a, b] of this.blockRegistry.getAllWalls()) {
      this.blockManager.addWall(a, b);
    }

    // 全量同步 + 刷新
    this.logicGrid.getDirtyAndClear();
    this.mapper.syncAll(this.logicGrid, this.visualGrid);
    this.renderer.refreshAll(this.resolver, this.visualGrid);

    // 重建 wall 指示器
    this.clearAllWallIndicators();
    for (const [a, b] of this.blockRegistry.getAllWalls()) {
      this.addWallIndicator(a, b);
    }

    if (this.showLogicOverlay) this.refreshAllOverlay();

    console.log(`[LevelController] Block '${blockId}' committed at delta (${dx},${dy})`);
  }

  /**
   * 为 block 中所有表现格应用 tint 颜色（用于拖拽开始时的高亮）。
   */
  private setBlockTint(cells: CellCoord[], color: Color): void {
    for (const cell of cells) {
      for (const vc of this.mapper.getAffectedVisualCells(cell.x, cell.y)) {
        this.renderer.setCellTint(vc.x, vc.y, color);
      }
    }
  }

  onDestroy(): void {
    input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
    input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
    input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
  }

  /** 切换逻辑叠加层显示。可绑定到 UI 按钮。 */
  toggleLogicOverlay(): void {
    this.showLogicOverlay = !this.showLogicOverlay;
    this.overlayNode.active = this.showLogicOverlay;
    if (this.showLogicOverlay) this.refreshAllOverlay();
    console.log(`[LevelController] Logic overlay: ${this.showLogicOverlay}`);
  }

  // ──────────────────── wall indicator layer ────────────────────

  private buildWallIndicatorLayer(): void {
    this.wallIndicatorLayer = new Node('WallIndicators');
    const layer = this.node.layer || Layers?.Enum?.UI_2D || UI_2D_LAYER;
    this.wallIndicatorLayer.layer = layer;
    this.wallIndicatorLayer.parent = this.node;
    this.wallIndicatorLayer.setPosition(Vec3.ZERO);
  }

  /**
   * 更新单个墙壁的可视指示器。
   * 有墙 → 创建红色半透明矩形；无墙 → 移除指示器节点。
   */
  private updateWallIndicator(
    a: { x: number; y: number },
    b: { x: number; y: number },
    hasWall: boolean,
  ): void {
    const key = BlockManager.wallKey(a, b);
    if (key === null) return;

    if (!hasWall) {
      const existing = this.wallIndicators.get(key);
      if (existing) {
        existing.destroy();
        this.wallIndicators.delete(key);
      }
      return;
    }

    this.addWallIndicator(a, b);
  }

  /**
   * 清除全部 wall 指示器节点。
   */
  private clearAllWallIndicators(): void {
    for (const node of this.wallIndicators.values()) {
      node.destroy();
    }
    this.wallIndicators.clear();
  }

  /**
   * 为一条 wall 创建红色半透明可视指示器（仅添加，不处理移除）。
   */
  private addWallIndicator(a: { x: number; y: number }, b: { x: number; y: number }): void {
    const key = BlockManager.wallKey(a, b);
    if (key === null || this.wallIndicators.has(key)) return;

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
      // Horizontal adjacency — V-Edge wall (vertical bar)
      const left = dx > 0 ? a : b;
      centerVx = (left.x + 1) * STRIDE;
      centerVy = left.y * STRIDE + 2;
      width = this.visualTileSize;
      height = this.visualTileSize * 3;
    } else {
      // Vertical adjacency — H-Edge wall (horizontal bar)
      const bottom = dy > 0 ? a : b;
      centerVx = bottom.x * STRIDE + 2;
      centerVy = (bottom.y + 1) * STRIDE;
      width = this.visualTileSize * 3;
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
    sprite.color = new Color(255, 50, 50, 150); // 红色半透明

    this.wallIndicators.set(key, node);
  }
}
