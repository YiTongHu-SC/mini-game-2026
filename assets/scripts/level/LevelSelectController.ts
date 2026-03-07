import {
  _decorator,
  Component,
  Node,
  Label,
  JsonAsset,
  resources,
  director,
  UITransform,
  Vec3,
  Graphics,
  Color,
  Layers,
} from 'cc';
import { LevelConfig, LevelManifest, LevelMeta } from './LevelConfig';

const { ccclass, property } = _decorator;

const UI_2D_LAYER = 1 << 25;

/** 每页列数 */
const PAGE_COLS = 2;
/** 每页行数 */
const PAGE_ROWS = 3;
/** 每页最多关卡数 */
const PER_PAGE = PAGE_COLS * PAGE_ROWS;

/** 关卡项之间的间距（像素） */
const GAP = 12;

/** 默认背景色 */
const COLOR_NORMAL = new Color(80, 80, 80, 200);
/** 选中高亮色 */
const COLOR_SELECTED = new Color(50, 180, 80, 220);

interface ItemEntry {
  node: Node;
  graphics: Graphics;
  globalIndex: number;
}

/**
 * 关卡选择场景的主控制器。
 *
 * 功能：
 *  - start() 时从 resources/levels/manifest.json 加载关卡列表
 *  - 每页以 2×3 网格展示最多 6 个关卡
 *  - 前后翻页浏览；点击关卡项选中，再点"开始"进入
 */
@ccclass('LevelSelectController')
export class LevelSelectController extends Component {
  /** 关卡项容器节点（需在编辑器中设置好 UITransform 宽高） */
  @property(Node) levelGrid: Node | null = null;

  /** 页码指示标签，如 "1 / 3" */
  @property(Label) pageLabel: Label | null = null;

  /** 已选中关卡的名称标签 */
  @property(Label) selectedLabel: Label | null = null;

  private levels: LevelMeta[] = [];
  private currentPage = 0;
  private selectedIndex = -1; // 全局 levels[] 索引，-1 = 未选
  private itemEntries: ItemEntry[] = [];

  // ---------- 生命周期 ----------

  start(): void {
    if (LevelConfig.manifest.length > 0) {
      this.levels = LevelConfig.manifest;
      this.rebuildPage();
      return;
    }

    resources.load('levels/manifest', JsonAsset, (err, asset) => {
      if (err || !asset || !asset.json) {
        console.error('[LevelSelect] Failed to load manifest', err);
        return;
      }
      const data = asset.json as LevelManifest;
      this.levels = data.levels;
      LevelConfig.manifest = data.levels;
      this.rebuildPage();
    });
  }

  // ---------- UI 按钮回调（绑定到 Button 组件） ----------

  /** 上一页 */
  onClickPrev(): void {
    const total = this.totalPages();
    if (total <= 1) return;
    this.currentPage = (this.currentPage - 1 + total) % total;
    this.rebuildPage();
  }

  /** 下一页 */
  onClickNext(): void {
    const total = this.totalPages();
    if (total <= 1) return;
    this.currentPage = (this.currentPage + 1) % total;
    this.rebuildPage();
  }

  /** 开始游戏 */
  onClickStart(): void {
    if (this.selectedIndex < 0 || this.selectedIndex >= this.levels.length) return;
    const meta = this.levels[this.selectedIndex];
    LevelConfig.currentLevelPath = meta.path;
    console.log(`[LevelSelect] Starting level: ${meta.name} (${meta.path})`);
    director.loadScene('level');
  }

  // ---------- 内部 ----------

  private totalPages(): number {
    return Math.max(1, Math.ceil(this.levels.length / PER_PAGE));
  }

  /** 销毁旧关卡项节点，为当前页创建新的 */
  private rebuildPage(): void {
    // 清除旧项
    for (const entry of this.itemEntries) {
      entry.node.off(Node.EventType.TOUCH_END);
      entry.node.destroy();
    }
    this.itemEntries = [];

    if (this.levels.length === 0) return;

    // 计算容器尺寸 → 关卡项尺寸
    const gridNode = this.levelGrid ?? this.node;
    const gridUT = gridNode.getComponent(UITransform);
    const gridW = gridUT ? gridUT.contentSize.width : 400;
    const gridH = gridUT ? gridUT.contentSize.height : 480;

    const itemW = (gridW - GAP * (PAGE_COLS - 1)) / PAGE_COLS;
    const itemH = (gridH - GAP * (PAGE_ROWS - 1)) / PAGE_ROWS;

    const startIdx = this.currentPage * PER_PAGE;
    const endIdx = Math.min(startIdx + PER_PAGE, this.levels.length);
    const layer = this.node.layer || Layers?.Enum?.UI_2D || UI_2D_LAYER;

    for (let i = startIdx; i < endIdx; i++) {
      const meta = this.levels[i];
      const slot = i - startIdx; // 0..5
      const col = slot % PAGE_COLS;
      const row = Math.floor(slot / PAGE_COLS);

      const entry = this.createItemNode(meta, i, col, row, itemW, itemH, layer);
      this.itemEntries.push(entry);
    }

    // 更新页码
    if (this.pageLabel) {
      this.pageLabel.string = `${this.currentPage + 1} / ${this.totalPages()}`;
    }
    // 若当前页有项且未选中，自动选中第一项
    if (this.selectedIndex < 0 && this.itemEntries.length > 0) {
      this.selectItem(this.itemEntries[0].globalIndex);
      return; // selectItem 已更新 label
    }
    // 更新选中标签
    this.updateSelectedLabel();
  }

  /** 创建单个关卡项节点 */
  private createItemNode(
    meta: LevelMeta,
    globalIndex: number,
    col: number,
    row: number,
    itemW: number,
    itemH: number,
    layer: number,
  ): ItemEntry {
    const gridNode = this.levelGrid ?? this.node;

    const gridUT = gridNode.getComponent(UITransform);
    const gridW = gridUT ? gridUT.contentSize.width : 400;
    const gridH = gridUT ? gridUT.contentSize.height : 480;

    // 从左上角排列（锚点 0.5,0.5 → 偏移到左上）
    const originX = -gridW / 2;
    const originY = gridH / 2;
    const px = originX + col * (itemW + GAP) + itemW / 2;
    const py = originY - row * (itemH + GAP) - itemH / 2;

    const node = new Node(`item_${meta.id}`);
    node.layer = layer;
    node.parent = gridNode;
    node.setPosition(new Vec3(px, py, 0));

    const ut = node.addComponent(UITransform);
    ut.setContentSize(itemW, itemH);

    // 背景
    const g = node.addComponent(Graphics);
    const isSelected = globalIndex === this.selectedIndex;
    this.drawItemBg(g, itemW, itemH, isSelected);

    // 标签：编号 + 名称
    const labelNode = new Node('label');
    labelNode.layer = layer;
    labelNode.parent = node;
    labelNode.setPosition(Vec3.ZERO);
    const labelUT = labelNode.addComponent(UITransform);
    labelUT.setContentSize(itemW - 16, itemH);
    const label = labelNode.addComponent(Label);
    label.fontSize = 22;
    label.color = Color.WHITE;
    label.string = `${meta.id}  ${meta.name}`;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.CLAMP;

    // 点击
    node.on(Node.EventType.TOUCH_END, () => this.selectItem(globalIndex));

    return { node, graphics: g, globalIndex };
  }

  /** 绘制关卡项背景圆角矩形 */
  private drawItemBg(g: Graphics, w: number, h: number, selected: boolean): void {
    g.clear();
    g.fillColor = selected ? COLOR_SELECTED : COLOR_NORMAL;
    g.roundRect(-w / 2, -h / 2, w, h, 8);
    g.fill();
  }

  /** 选中某个关卡项 */
  private selectItem(globalIndex: number): void {
    this.selectedIndex = globalIndex;
    // 重绘所有项的背景色
    for (const entry of this.itemEntries) {
      const ut = entry.node.getComponent(UITransform);
      if (!ut) continue;
      this.drawItemBg(
        entry.graphics,
        ut.contentSize.width,
        ut.contentSize.height,
        entry.globalIndex === globalIndex,
      );
    }
    this.updateSelectedLabel();
  }

  private updateSelectedLabel(): void {
    if (!this.selectedLabel) return;
    if (this.selectedIndex >= 0 && this.selectedIndex < this.levels.length) {
      const meta = this.levels[this.selectedIndex];
      this.selectedLabel.string = meta.name;
    } else {
      this.selectedLabel.string = '';
    }
  }
}
