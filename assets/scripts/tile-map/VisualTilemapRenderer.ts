/**
 * VisualTilemapRenderer — 视觉层渲染器
 *
 * 把 AutoTileResolver 的输出写入一组动态创建的 Sprite 节点。
 * 每个格子对应一个 Node + Sprite 子节点。
 * 支持全量刷新 (refreshAll) 和局部刷新 (refreshLocal)。
 *
 * 依赖 Cocos Creator (`cc`)。
 */

import { Node, Sprite, SpriteFrame, UITransform, Color, Label, Vec3, Layers } from 'cc';
import { OccupancyGrid, GridCoord } from './OccupancyGrid';
import { AutoTileResolver } from './AutoTileResolver';

/** Fallback layer value for UI_2D (1 << 25). */
const UI_2D_LAYER = 1 << 25;

export class VisualTilemapRenderer {
  private parentNode: Node;
  private cols: number;
  private rows: number;
  private tileSize: number;
  private spriteFrames: SpriteFrame[];
  private showDebugMask: boolean;

  /** Grid of cell nodes: cellNodes[y][x] */
  private cellNodes: (Node | null)[][] = [];

  constructor(
    parentNode: Node,
    cols: number,
    rows: number,
    tileSize: number,
    spriteFrames: SpriteFrame[],
    showDebugMask: boolean = false,
  ) {
    this.parentNode = parentNode;
    this.cols = cols;
    this.rows = rows;
    this.tileSize = tileSize;
    this.spriteFrames = spriteFrames;
    this.showDebugMask = showDebugMask;

    this.buildNodeGrid();
  }

  // ──────────────────── build ────────────────────

  private buildNodeGrid(): void {
    // Only clear if there are existing children (avoid unnecessary call in editor)
    if (this.parentNode.children.length > 0) {
      this.parentNode.removeAllChildren();
    }
    this.cellNodes = [];

    // Derive layer from parent node (scene-serialized value) — more reliable than
    // Layers.Enum.UI_2D which may not resolve correctly in editor preview.
    const layer = this.parentNode.layer || Layers?.Enum?.UI_2D || UI_2D_LAYER;

    console.log(
      `[VisualTilemapRenderer] buildNodeGrid ${this.cols}×${this.rows}, ` +
        `parentLayer=${this.parentNode.layer}, Layers.Enum.UI_2D=${Layers?.Enum?.UI_2D}, using layer=${layer}`,
    );

    // Offset so grid is centered on parentNode
    const offsetX = -(this.cols * this.tileSize) / 2 + this.tileSize / 2;
    const offsetY = -(this.rows * this.tileSize) / 2 + this.tileSize / 2;

    for (let y = 0; y < this.rows; y++) {
      const row: (Node | null)[] = [];
      for (let x = 0; x < this.cols; x++) {
        const cellNode = new Node(`cell_${x}_${y}`);
        cellNode.layer = layer;
        cellNode.parent = this.parentNode;
        cellNode.setPosition(new Vec3(offsetX + x * this.tileSize, offsetY + y * this.tileSize, 0));

        // UITransform for sizing
        const ut = cellNode.addComponent(UITransform);
        ut.setContentSize(this.tileSize, this.tileSize);

        // Sprite — 必须设 sizeMode=CUSTOM 且 type=SIMPLE
        const sprite = cellNode.addComponent(Sprite);
        sprite.type = Sprite.Type.SIMPLE;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = null;
        sprite.color = new Color(255, 255, 255, 255);

        // Debug label (optional)
        if (this.showDebugMask) {
          const labelNode = new Node('debugLabel');
          labelNode.layer = layer;
          labelNode.parent = cellNode;
          labelNode.setPosition(Vec3.ZERO);
          const labelUT = labelNode.addComponent(UITransform);
          labelUT.setContentSize(this.tileSize, this.tileSize);
          const label = labelNode.addComponent(Label);
          label.fontSize = 12;
          label.color = new Color(255, 255, 0, 255);
          label.string = '';
          label.horizontalAlign = Label.HorizontalAlign.CENTER;
          label.verticalAlign = Label.VerticalAlign.CENTER;
        }

        row.push(cellNode);
      }
      this.cellNodes.push(row);
    }
  }

  // ──────────────────── refresh ────────────────────

  /** Full refresh — resolves every cell and updates the visual. */
  refreshAll(resolver: AutoTileResolver, grid: OccupancyGrid): void {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        this.updateCell(x, y, resolver, grid);
      }
    }
  }

  /** Partial refresh — only the listed dirty cells. */
  refreshLocal(dirtyList: GridCoord[], resolver: AutoTileResolver, grid: OccupancyGrid): void {
    for (const { x, y } of dirtyList) {
      this.updateCell(x, y, resolver, grid);
    }
  }

  /** Toggle debug‐mask labels on/off at runtime. */
  setDebugMask(show: boolean): void {
    this.showDebugMask = show;
    // If turning off, clear all labels
    if (!show) {
      for (let y = 0; y < this.rows; y++) {
        for (let x = 0; x < this.cols; x++) {
          const node = this.cellNodes[y]?.[x];
          if (!node) continue;
          const labelNode = node.getChildByName('debugLabel');
          if (labelNode) {
            const label = labelNode.getComponent(Label);
            if (label) label.string = '';
          }
        }
      }
    }
  }

  // ──────────────────── tint ────────────────────

  /**
   * 直接设置指定表现格 Sprite 的颜色（不影响 spriteFrame）。
   * 用于高亮拖拽中的 block，在 refreshAll / refreshLocal 后会自动重置。
   */
  setCellTint(vx: number, vy: number, color: Color): void {
    if (vx < 0 || vx >= this.cols || vy < 0 || vy >= this.rows) return;
    const node = this.cellNodes[vy]?.[vx];
    if (!node) return;
    const sprite = node.getComponent(Sprite);
    if (sprite) sprite.color = color;
  }

  // ──────────────────── private ────────────────────

  private updateCell(x: number, y: number, resolver: AutoTileResolver, grid: OccupancyGrid): void {
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return;
    const node = this.cellNodes[y]?.[x];
    if (!node) return;

    const sprite = node.getComponent(Sprite);
    if (!sprite) return;

    const result = resolver.resolve(x, y);

    if (result.tileIndex < 0 || grid.getCell(x, y) === 0) {
      // Empty cell — hide sprite
      sprite.spriteFrame = null;
      sprite.color = new Color(40, 40, 40, 255); // dark bg
    } else {
      // Occupied cell — show corresponding tile
      const frame = this.spriteFrames[result.tileIndex] ?? null;
      sprite.spriteFrame = frame;
      sprite.color = new Color(255, 255, 255, 255);
    }

    // Update debug label
    if (this.showDebugMask) {
      const labelNode = node.getChildByName('debugLabel');
      if (labelNode) {
        const label = labelNode.getComponent(Label);
        if (label) {
          label.string = result.mask >= 0 ? String(result.mask) : '';
        }
      }
    }
  }
}
