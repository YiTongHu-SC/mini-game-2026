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
 *   5. （可选）将目标盒子用的 16 张 SpriteFrame 拖拽到 targetTileFrames 属性
 *   6. 运行场景，自动加载关卡数据并初始化网格
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
  assetManager,
  resources,
  director,
} from 'cc';
import { EDITOR } from 'cc/env';
import { OccupancyGrid } from '../tile-map/OccupancyGrid';
import { AutoTileResolver } from '../tile-map/AutoTileResolver';
import { createDefaultConfig } from '../tile-map/TileMapConfig';
import { VisualTilemapRenderer } from '../tile-map/VisualTilemapRenderer';
import { DualGridMapper } from '../tile-map/DualGridMapper';
import { BlockManager } from '../tile-map/BlockManager';
import { STRIDE, visualGridSize } from '../tile-map/DualGridTypes';
import { LevelLoader } from '../tile-map/LevelLoader';
import { LevelData, CellCoord, TargetBoxData, KnifeData } from '../tile-map/LevelTypes';
import { BlockRegistry } from '../tile-map/BlockRegistry';
import { checkTargetBoxConstraint } from '../tile-map/TargetBoxConstraint';
import { getKnifeEdges, snapKnifePosition } from '../tile-map/KnifeEdges';
import { LevelConfig } from './LevelConfig';

const { ccclass, property } = _decorator;

/* eslint-disable @typescript-eslint/no-namespace */
/** Editor global — only available inside Cocos Creator editor process. */
declare namespace Editor {
  namespace Message {
    function request(channel: string, method: string, ...args: unknown[]): Promise<unknown>;
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

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

interface TargetBoxRuntime {
  id: string;
  acceptBlockId?: string;
  cells: CellCoord[];
  cellKeySet: Set<string>;
}

/** 刀具运行时状态 */
interface KnifeRuntime {
  data: KnifeData;
  node: Node;
}

/** 刀具拖拽状态（与 DragState 互斥） */
interface KnifeDragState {
  knifeId: string;
  startMouseLocal: { x: number; y: number };
  origEdge: number;
  origStart: number;
}

/** Fallback layer value for UI_2D (1 << 25). */
const UI_2D_LAYER = 1 << 25;

/**
 * Tile index (0–15) → (row, col) in a 4×4 tileset grid.
 * Matches the tile_rX_cY naming convention from split-image tool.
 */
const TILE_RC: readonly [number, number][] = [
  [1, 2], // 0: isolated
  [3, 0], // 1: full interior
  [2, 1], // 2: top edge
  [2, 3], // 3: left edge
  [0, 3], // 4: bottom edge
  [0, 1], // 5: right edge
  [3, 3], // 6: inner corner TL
  [0, 0], // 7: inner corner BL
  [3, 1], // 8: inner corner BR
  [2, 0], // 9: inner corner TR
  [1, 3], // 10: outer corner BR
  [0, 2], // 11: outer corner TR
  [1, 1], // 12: outer corner TL
  [2, 2], // 13: outer corner BL
  [1, 0], // 14: double inner TL+BR
  [3, 2], // 15: double inner TR+BL
];

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

  @property({ type: [SpriteFrame], tooltip: 'Target-box tile frames (16 items, optional)' })
  targetTileFrames: SpriteFrame[] = [];

  @property({ tooltip: 'tile 图片所在目录（相对 assets/，如 textures/grass_1_split）' })
  tileDir: string = '';

  @property({ tooltip: 'target tile 图片所在目录（相对 assets/，如 textures/goal_1_split）' })
  targetTileDir: string = '';

  @property({
    displayName: '🔗 绑定 TileFrames',
    tooltip: '从 tileDir 目录按 tile_rX_cY 命名自动填充 tileFrames（16 张）',
  })
  get bindTileFrames(): boolean {
    return false;
  }
  set bindTileFrames(_v: boolean) {
    this._autoBindTileFrames();
  }

  @property({
    displayName: '🔗 绑定 TargetTileFrames',
    tooltip: '从 targetTileDir 目录按 tile_rX_cY 命名自动填充 targetTileFrames（16 张）',
  })
  get bindTargetTileFrames(): boolean {
    return false;
  }
  set bindTargetTileFrames(_v: boolean) {
    this._autoBindTargetTileFrames();
  }

  // ── Runtime instances ──

  private logicGrid!: OccupancyGrid;
  private visualGrid!: OccupancyGrid;
  private mapper!: DualGridMapper;
  private resolver!: AutoTileResolver;
  private renderer!: VisualTilemapRenderer;
  private targetLogicGrid!: OccupancyGrid;
  private targetVisualGrid!: OccupancyGrid;
  private targetMapper!: DualGridMapper;
  private targetResolver!: AutoTileResolver;
  private targetRenderer!: VisualTilemapRenderer;
  private targetLayer!: Node;
  private blockManager!: BlockManager;

  private logicCols: number = 0;
  private logicRows: number = 0;

  private overlayNode!: Node;
  private overlayCells: (Node | null)[][] = [];
  private wallIndicatorLayer!: Node;
  private wallIndicators: Map<string, Node> = new Map();
  private targetBoxes: TargetBoxRuntime[] = [];
  private allTargetCellKeys: Set<string> = new Set();
  private blockToTarget: Map<string, string> = new Map();

  // ── Drag & Drop ──
  private blockRegistry!: BlockRegistry;
  private dragState: DragState | null = null;
  private dropPreviewLayer!: Node;

  // ── Knife system ──
  private knives: Map<string, KnifeRuntime> = new Map();
  private knifeDragState: KnifeDragState | null = null;
  private knifeLayer!: Node;

  private _pendingRefresh = 2;

  // ──────────────────── lifecycle ────────────────────

  start(): void {
    // 动态加载：若 LevelConfig 指定了关卡路径，从 resources/ 加载
    if (LevelConfig.currentLevelPath) {
      const path = LevelConfig.currentLevelPath;
      console.log(`[LevelController] Dynamic loading: ${path}`);
      resources.load(path, JsonAsset, (err, asset) => {
        if (err || !asset || !asset.json) {
          console.error(`[LevelController] Failed to load level: ${path}`, err);
          return;
        }
        this.initLevel(asset.json as LevelData);
      });
      return;
    }

    // 回退：使用 Inspector 绑定的 levelData
    if (!this.levelData || !this.levelData.json) {
      console.error('[LevelController] levelData is not set or invalid!');
      return;
    }
    this.initLevel(this.levelData.json as LevelData);
  }

  /**
   * 用关卡数据初始化全部运行时系统。
   * 由 start() 调用（同步或异步回调中）。
   */
  private initLevel(rawData: LevelData): void {
    const loadResult = LevelLoader.load(rawData);
    this.blockRegistry = new BlockRegistry(rawData);

    this.logicCols = loadResult.gridCols;
    this.logicRows = loadResult.gridRows;

    console.log(
      `[LevelController] Loading level: ${this.logicCols}×${this.logicRows}, ` +
        `blocks=${rawData.blocks.length}, ` +
        `occupiedCells=${loadResult.occupiedCells.length}, ` +
        `walls=${loadResult.walls.length}, ` +
        `targets=${loadResult.targetBoxes.length}`,
    );

    // 3. Logic grid
    this.logicGrid = new OccupancyGrid(this.logicCols, this.logicRows);

    // 4. Visual grid (derived size)
    const vSize = visualGridSize(this.logicCols, this.logicRows);
    this.visualGrid = new OccupancyGrid(vSize.cols, vSize.rows);
    this.targetLogicGrid = new OccupancyGrid(this.logicCols, this.logicRows);
    this.targetVisualGrid = new OccupancyGrid(vSize.cols, vSize.rows);

    // 5. Mapper (logic → visual coordination)
    this.mapper = new DualGridMapper(this.logicCols, this.logicRows);

    // 6. Block / Wall manager
    this.blockManager = new BlockManager();
    this.mapper.setBlockManager(this.blockManager);

    // 7. Resolver works on the VISUAL grid
    this.resolver = new AutoTileResolver(this.visualGrid, createDefaultConfig());
    this.resolver.setNeighborFilter(this.mapper.createNeighborFilter());
    this.targetMapper = new DualGridMapper(this.logicCols, this.logicRows, 'or');
    this.targetResolver = new AutoTileResolver(this.targetVisualGrid, createDefaultConfig());

    // 8. Renderer for the visual grid
    this.renderer = new VisualTilemapRenderer(
      this.node,
      vSize.cols,
      vSize.rows,
      this.visualTileSize,
      this.tileFrames,
      this.showDebugMask,
    );

    this.targetLayer = new Node('TargetVisualLayer');
    this.targetLayer.layer = this.node.layer || Layers?.Enum?.UI_2D || UI_2D_LAYER;
    this.targetLayer.parent = this.node;
    this.targetLayer.setPosition(Vec3.ZERO);
    this.targetLayer.setSiblingIndex(0);
    this.targetRenderer = new VisualTilemapRenderer(
      this.targetLayer,
      vSize.cols,
      vSize.rows,
      this.visualTileSize,
      this.getTargetTileFrames(),
      false,
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
    this.buildKnifeLayer();

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

  /**
   * 目标盒子渲染优先使用 targetTileFrames；未配置时回退到 tileFrames。
   */
  private getTargetTileFrames(): SpriteFrame[] {
    return this.targetTileFrames.length > 0 ? this.targetTileFrames : this.tileFrames;
  }

  update(): void {
    if (this._pendingRefresh <= 0) return;
    if (!this.mapper) return; // initLevel() 尚未完成（异步加载中）
    this._pendingRefresh--;
    if (this._pendingRefresh === 0) {
      // 延迟刷新：等 Cocos 渲染管线注册完动态节点后再刷新
      this.targetMapper.syncAll(this.targetLogicGrid, this.targetVisualGrid);
      this.targetRenderer.refreshAll(this.targetResolver, this.targetVisualGrid);
      this.refreshTargetHighlight();
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

    // 优先检测刀具命中
    const hitKnifeId = this.hitTestKnife(pixel.px, pixel.py);
    if (hitKnifeId) {
      const kr = this.knives.get(hitKnifeId);
      if (!kr) return;
      this.knifeDragState = {
        knifeId: hitKnifeId,
        startMouseLocal: { x: local.x, y: local.y },
        origEdge: kr.data.edge,
        origStart: kr.data.start,
      };
      console.log(`[LevelController] Knife drag start: '${hitKnifeId}'`);
      return;
    }

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
    // ── Knife drag ──
    if (this.knifeDragState) {
      const pixel = this.mouseToLocalPixel(event);
      if (!pixel) return;
      const kr = this.knives.get(this.knifeDragState.knifeId);
      if (!kr) return;
      const snapped = snapKnifePosition(
        kr.data.orientation,
        kr.data.length,
        this.logicCols,
        this.logicRows,
        pixel.px,
        pixel.py,
        STRIDE,
        this.visualTileSize,
      );
      kr.data.edge = snapped.edge;
      kr.data.start = snapped.start;
      this.updateKnifeNode(kr);
      return;
    }

    // ── Block drag ──
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
    if (this.knifeDragState && event.getButton() === EventMouse.BUTTON_LEFT) {
      console.log(
        `[LevelController] Knife drag end: '${this.knifeDragState.knifeId}' ` +
          `→ edge=${this.knives.get(this.knifeDragState.knifeId)?.data.edge}, ` +
          `start=${this.knives.get(this.knifeDragState.knifeId)?.data.start}`,
      );
      this.knifeDragState = null;
      return;
    }
    if (this.dragState && event.getButton() === EventMouse.BUTTON_LEFT) {
      this.endDrag(event);
      return;
    }
    if (event.getButton() === EventMouse.BUTTON_RIGHT) {
      // Wall toggle removed — walls come from level data only
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

  // handleWallToggle removed — walls come from level data only

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

    this.targetBoxes = this.buildTargetRuntime(loadResult.targetBoxes);
    this.allTargetCellKeys = new Set(loadResult.targetCells.map(c => `${c.x},${c.y}`));
    for (const cell of loadResult.targetCells) {
      this.targetLogicGrid.setCell(cell.x, cell.y, 1);
    }
    this.targetLogicGrid.getDirtyAndClear();
    this.recomputeTargetAssignments();

    // 初始化刀具
    for (const knife of loadResult.knives) {
      this.addKnife(knife);
    }

    // 同步逻辑网格到表现网格（全量）
    this.targetMapper.syncAll(this.targetLogicGrid, this.targetVisualGrid);
    this.targetRenderer.refreshAll(this.targetResolver, this.targetVisualGrid);
    this.refreshTargetHighlight();
    this.mapper.syncAll(this.logicGrid, this.visualGrid);

    // 刷新由 update() 延迟执行（给 Cocos 注册动态节点的时间）
  }

  private buildTargetRuntime(source: TargetBoxData[]): TargetBoxRuntime[] {
    const result: TargetBoxRuntime[] = [];
    for (const tb of source) {
      const cells = tb.cells.map(c => ({ x: c.x, y: c.y }));
      result.push({
        id: tb.id,
        acceptBlockId: tb.acceptBlockId,
        cells,
        cellKeySet: new Set(cells.map(c => `${c.x},${c.y}`)),
      });
    }
    return result;
  }

  private findMatchedTargetId(blockId: string): string | null {
    const blockCells = this.blockRegistry.getBlockCells(blockId);
    if (blockCells.length === 0) return null;
    const blockSet = new Set(blockCells.map(c => `${c.x},${c.y}`));

    for (const tb of this.targetBoxes) {
      if (tb.acceptBlockId && tb.acceptBlockId !== blockId) continue;
      if (tb.cells.length !== blockCells.length) continue;
      let same = true;
      for (const key of blockSet) {
        if (!tb.cellKeySet.has(key)) {
          same = false;
          break;
        }
      }
      if (same) return tb.id;
    }
    return null;
  }

  private recomputeTargetAssignments(): void {
    this.blockToTarget.clear();
    const usedTargetIds = new Set<string>();
    for (const blockId of this.blockRegistry.getAllBlockIds()) {
      const targetId = this.findMatchedTargetId(blockId);
      if (targetId && !usedTargetIds.has(targetId)) {
        usedTargetIds.add(targetId);
        this.blockToTarget.set(blockId, targetId);
      }
    }
  }

  private refreshTargetHighlight(): void {
    const matchedTargets = new Set<string>(this.blockToTarget.values());
    // Keep target sprites pure white to preserve source texture colors.
    const colorIdle = new Color(255, 255, 255, 255);
    const colorDone = new Color(255, 255, 255, 255);

    for (const tb of this.targetBoxes) {
      const tint = matchedTargets.has(tb.id) ? colorDone : colorIdle;
      for (const cell of tb.cells) {
        for (const vc of this.targetMapper.getAffectedVisualCells(cell.x, cell.y)) {
          this.targetRenderer.setCellTint(vc.x, vc.y, tint);
        }
      }
    }
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

        const centerVx = lx * STRIDE + 1;
        const centerVy = ly * STRIDE + 1;
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
    const lx = Math.max(0, Math.min(this.logicCols - 1, Math.floor(px / logicCellSize)));
    const ly = Math.max(0, Math.min(this.logicRows - 1, Math.floor(py / logicCellSize)));
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
      x: renderOffsetX + (lx * STRIDE + 1) * this.visualTileSize,
      y: renderOffsetY + (ly * STRIDE + 1) * this.visualTileSize,
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

      const centerVx = tx * STRIDE + 1;
      const centerVy = ty * STRIDE + 1;
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
    const newKeys: string[] = [];
    for (const cell of cells) {
      const nx = cell.x + dx;
      const ny = cell.y + dy;
      if (nx < 0 || nx >= this.logicCols || ny < 0 || ny >= this.logicRows) return false;
      if (this.logicGrid.getCell(nx, ny) === 1) {
        // 目标格有占用 — 若属于被拖拽的 block 本身则允许（dx=0,dy=0 的情况）
        if (this.blockRegistry.getBlockIdAt(nx, ny) !== blockId) return false;
      }
      newKeys.push(`${nx},${ny}`);
    }
    // 目标盒子边界约束：完全在某个盒子内 或 完全在盒子外
    return checkTargetBoxConstraint(
      newKeys,
      this.targetBoxes.map(tb => tb.cellKeySet),
      this.allTargetCellKeys,
    );
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
    const previousTargetId = this.blockToTarget.get(blockId) ?? null;

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
    this.recomputeTargetAssignments();
    this.refreshTargetHighlight();

    // 重建 wall 指示器
    this.clearAllWallIndicators();
    for (const [a, b] of this.blockRegistry.getAllWalls()) {
      this.addWallIndicator(a, b);
    }

    if (this.showLogicOverlay) this.refreshAllOverlay();

    const currentTargetId = this.blockToTarget.get(blockId) ?? null;
    if (previousTargetId !== currentTargetId) {
      if (currentTargetId) {
        console.log(`[LevelController] Block '${blockId}' placed into target '${currentTargetId}'`);
      } else if (previousTargetId) {
        console.log(
          `[LevelController] Block '${blockId}' moved out of target '${previousTargetId}'`,
        );
      }
    }

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

  // ──────────────────── knife system ────────────────────

  /** 创建刀具层节点（在 start() 中调用一次）。 */
  private buildKnifeLayer(): void {
    this.knifeLayer = new Node('KnifeLayer');
    const layerVal = this.node.layer || Layers?.Enum?.UI_2D || UI_2D_LAYER;
    this.knifeLayer.layer = layerVal;
    this.knifeLayer.parent = this.node;
    this.knifeLayer.setPosition(Vec3.ZERO);
  }

  /** 添加一把刀具到运行时并创建可视节点。 */
  private addKnife(knife: KnifeData): void {
    const data: KnifeData = { ...knife };
    const node = new Node(`knife_${knife.id}`);
    const layerVal = this.node.layer || Layers?.Enum?.UI_2D || UI_2D_LAYER;
    node.layer = layerVal;
    node.parent = this.knifeLayer;

    const ut = node.addComponent(UITransform);
    ut.setContentSize(1, 1); // placeholder, will be set in updateKnifeNode
    node.addComponent(Graphics);

    const kr: KnifeRuntime = { data, node };
    this.knives.set(knife.id, kr);
    this.updateKnifeNode(kr);
  }

  /** 更新刀具节点的位置和外观。 */
  private updateKnifeNode(kr: KnifeRuntime): void {
    const { data, node } = kr;
    const vSize = visualGridSize(this.logicCols, this.logicRows);
    const renderOffsetX = -(vSize.cols * this.visualTileSize) / 2 + this.visualTileSize / 2;
    const renderOffsetY = -(vSize.rows * this.visualTileSize) / 2 + this.visualTileSize / 2;
    const cellPx = STRIDE * this.visualTileSize;

    let cx: number;
    let cy: number;
    let w: number;
    let h: number;
    const thickness = this.visualTileSize * 0.6;

    if (data.orientation === 'v') {
      // 竖线：沿列边界 edge，覆盖行 [start, start+length)
      cx = renderOffsetX + data.edge * STRIDE * this.visualTileSize;
      cy =
        renderOffsetY +
        (data.start * STRIDE + 1) * this.visualTileSize +
        ((data.length - 1) * cellPx) / 2;
      w = thickness;
      h = data.length * cellPx;
    } else {
      // 横线：沿行边界 edge，覆盖列 [start, start+length)
      cx =
        renderOffsetX +
        (data.start * STRIDE + 1) * this.visualTileSize +
        ((data.length - 1) * cellPx) / 2;
      cy = renderOffsetY + data.edge * STRIDE * this.visualTileSize;
      w = data.length * cellPx;
      h = thickness;
    }

    node.setPosition(new Vec3(cx, cy, 0));
    const ut = node.getComponent(UITransform);
    if (!ut) return;
    ut.setContentSize(w, h);

    const g = node.getComponent(Graphics);
    if (!g) return;
    g.clear();
    g.fillColor = new Color(255, 180, 0, 200);
    g.roundRect(-w / 2, -h / 2, w, h, thickness * 0.25);
    g.fill();
    // border
    g.strokeColor = new Color(200, 120, 0, 255);
    g.lineWidth = 2;
    g.roundRect(-w / 2, -h / 2, w, h, thickness * 0.25);
    g.stroke();
  }

  /**
   * 命中检测：判断像素坐标 (px, py) 是否落在某把刀具矩形区域内。
   * @returns 命中的刀具 id，或 null
   */
  private hitTestKnife(px: number, py: number): string | null {
    const vSize = visualGridSize(this.logicCols, this.logicRows);
    const renderOffsetX = -(vSize.cols * this.visualTileSize) / 2 + this.visualTileSize / 2;
    const renderOffsetY = -(vSize.rows * this.visualTileSize) / 2 + this.visualTileSize / 2;
    const cellPx = STRIDE * this.visualTileSize;
    const thickness = this.visualTileSize * 0.6;
    // 增大命中区域使其更易选取
    const hitPad = this.visualTileSize * 0.4;

    // 将 0-origin pixel 转为居中坐标（与 renderOffset 对齐）
    const offsetX = (vSize.cols * this.visualTileSize) / 2;
    const offsetY = (vSize.rows * this.visualTileSize) / 2;
    const localX = px - offsetX;
    const localY = py - offsetY;

    for (const [id, kr] of this.knives) {
      const { data } = kr;
      let cx: number;
      let cy: number;
      let hw: number;
      let hh: number;

      if (data.orientation === 'v') {
        cx = renderOffsetX + data.edge * STRIDE * this.visualTileSize;
        cy =
          renderOffsetY +
          (data.start * STRIDE + 1) * this.visualTileSize +
          ((data.length - 1) * cellPx) / 2;
        hw = thickness / 2 + hitPad;
        hh = (data.length * cellPx) / 2 + hitPad;
      } else {
        cx =
          renderOffsetX +
          (data.start * STRIDE + 1) * this.visualTileSize +
          ((data.length - 1) * cellPx) / 2;
        cy = renderOffsetY + data.edge * STRIDE * this.visualTileSize;
        hw = (data.length * cellPx) / 2 + hitPad;
        hh = thickness / 2 + hitPad;
      }

      if (localX >= cx - hw && localX <= cx + hw && localY >= cy - hh && localY <= cy + hh) {
        return id;
      }
    }
    return null;
  }

  /**
   * 使用刀具：沿刀具覆盖的边添加墙壁，并分裂受影响的 block。
   * 刀具使用后留在原位，可重复使用。
   *
   * 支持两种调用方式：
   *   - 代码调用：`useKnife('knife-1')`
   *   - Cocos Button EventHandler：handler=useKnife, customEventData='knife-1'
   *     （此时第一个参数为 EventTouch，第二个为 customEventData 字符串）
   *
   * @returns true 若有 block 被分裂
   */
  useKnife(eventOrId: unknown, customEventData?: string): boolean {
    const knifeId = typeof eventOrId === 'string' ? eventOrId : customEventData;
    if (!knifeId) {
      console.warn('[LevelController] useKnife: no knifeId provided');
      return false;
    }
    const kr = this.knives.get(knifeId);
    if (!kr) {
      console.warn(`[LevelController] useKnife: knife '${knifeId}' not found`);
      return false;
    }

    const edges = getKnifeEdges(kr.data);
    const affectedBlocks = new Set<string>();

    // 添加墙壁
    for (const [a, b] of edges) {
      const blockIdA = this.blockRegistry.getBlockIdAt(a.x, a.y);
      const blockIdB = this.blockRegistry.getBlockIdAt(b.x, b.y);
      const isSameBlock = blockIdA !== undefined && blockIdA === blockIdB;

      if (isSameBlock) {
        const added = this.blockRegistry.addBlockWall(a, b);
        if (added) {
          this.blockManager.addWall(a, b);
          affectedBlocks.add(blockIdA);
        }
      }
      // 跨 block 边界的已有 wall 或空格无需操作

      // 更新表现网格
      const dirty = this.mapper.syncWallChange(a, b, this.logicGrid, this.visualGrid);
      this.renderer.refreshLocal(dirty, this.resolver, this.visualGrid);
      this.updateWallIndicator(a, b, true);
    }

    // 分裂受影响的 block
    let anySplit = false;
    for (const blockId of affectedBlocks) {
      // blockId 可能已被前一轮分裂替换，检查是否仍然存在
      if (this.blockRegistry.getBlockCells(blockId).length === 0) continue;

      const splitResult = this.blockRegistry.splitDisconnectedBlock(blockId);
      if (splitResult) {
        anySplit = true;
        console.log(
          `[LevelController] useKnife: block '${blockId}' split into ${splitResult.length} parts: ${splitResult.join(', ')}`,
        );
      }
    }

    if (anySplit) {
      // 重建全部 wall
      this.blockManager.clearWalls();
      for (const [wa, wb] of this.blockRegistry.getAllWalls()) {
        this.blockManager.addWall(wa, wb);
      }

      // 全量同步 + 刷新
      this.logicGrid.getDirtyAndClear();
      this.mapper.syncAll(this.logicGrid, this.visualGrid);
      this.renderer.refreshAll(this.resolver, this.visualGrid);
      this.recomputeTargetAssignments();
      this.refreshTargetHighlight();

      // 重建 wall 指示器
      this.clearAllWallIndicators();
      for (const [wa, wb] of this.blockRegistry.getAllWalls()) {
        this.addWallIndicator(wa, wb);
      }

      if (this.showLogicOverlay) this.refreshAllOverlay();
    }

    return anySplit;
  }

  /** 返回选关场景。可绑定到 UI 按钮。 */
  goBack(): void {
    director.loadScene('levelSelect');
  }

  onDestroy(): void {
    input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
    input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
    input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
  }

  // ──────────────────── auto-bind tile frames ────────────────────

  /**
   * 从 tileDir 目录按 tile_rX_cY 命名加载 SpriteFrame 并填充 tileFrames。
   * 仅在编辑器环境下生效，通过 Editor asset-db API 查询资源 UUID，
   * 再用 assetManager.loadAny 加载对应的 SpriteFrame 子资源（@f9941）。
   */
  private _autoBindTileFrames(): void {
    if (!EDITOR) return;
    if (!this.tileDir) {
      console.warn('[LevelController] tileDir 未设置，请在 Inspector 中填入目录路径');
      return;
    }
    const dir = this.tileDir.replace(/^\/+|\/+$/g, '');
    this._loadTileFrames(dir, 'main');
  }

  private _autoBindTargetTileFrames(): void {
    if (!EDITOR) return;
    if (!this.targetTileDir) {
      console.warn('[LevelController] targetTileDir 未设置，请在 Inspector 中填入目录路径');
      return;
    }
    const dir = this.targetTileDir.replace(/^\/+|\/+$/g, '');
    this._loadTileFrames(dir, 'target');
  }

  private async _loadTileFrames(dir: string, kind: 'main' | 'target'): Promise<void> {
    let bound = 0;
    const frames: SpriteFrame[] = [];

    for (let i = 0; i < 16; i++) {
      const [r, c] = TILE_RC[i];
      const name = `tile_r${r}_c${c}`;
      const dbUrl = `db://assets/${dir}/${name}.png`;

      try {
        const info = (await Editor.Message.request('asset-db', 'query-asset-info', dbUrl)) as
          | { uuid: string }
          | null
          | undefined;
        if (!info?.uuid) {
          console.warn(`[LevelController] asset not found: ${dbUrl}`);
          frames.push(undefined as unknown as SpriteFrame);
          continue;
        }
        // PNG 的 SpriteFrame 子资源固定后缀为 @f9941
        const sfUuid = `${info.uuid}@f9941`;
        const frame = await new Promise<SpriteFrame | null>(resolve => {
          assetManager.loadAny<SpriteFrame>(sfUuid, (err, asset) => {
            resolve(err ? null : asset);
          });
        });
        if (frame) {
          frames.push(frame);
          bound++;
        } else {
          console.warn(`[LevelController] SpriteFrame load failed: ${name}`);
          frames.push(undefined as unknown as SpriteFrame);
        }
      } catch (e) {
        console.warn(`[LevelController] error loading ${name}: ${e}`);
        frames.push(undefined as unknown as SpriteFrame);
      }
    }

    if (kind === 'target') {
      this.targetTileFrames = frames;
      console.log(`[LevelController] 已绑定 ${bound}/16 target tile frames`);
      return;
    }

    this.tileFrames = frames;
    console.log(`[LevelController] 已绑定 ${bound}/16 tile frames`);
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
      // Horizontal adjacency — V-Edge wall (vertical bar between two 3×3 blocks)
      const left = dx > 0 ? a : b;
      centerVx = (left.x + 1) * STRIDE - 0.5;
      centerVy = left.y * STRIDE + 1;
      width = this.visualTileSize;
      height = this.visualTileSize * STRIDE;
    } else {
      // Vertical adjacency — H-Edge wall (horizontal bar between two 3×3 blocks)
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
    sprite.color = new Color(255, 50, 50, 150); // 红色半透明

    this.wallIndicators.set(key, node);
  }
}
