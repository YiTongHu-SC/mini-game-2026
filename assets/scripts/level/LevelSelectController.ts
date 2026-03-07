import { _decorator, Component, Label, JsonAsset, resources, director } from 'cc';
import { LevelConfig, LevelManifest, LevelMeta } from './LevelConfig';

const { ccclass, property } = _decorator;

/**
 * 关卡选择场景的主控制器。
 *
 * 功能：
 *  - start() 时从 resources/levels/manifest.json 加载关卡列表
 *  - 左右翻页浏览关卡
 *  - 点击"开始"按钮加载选中关卡
 */
@ccclass('LevelSelectController')
export class LevelSelectController extends Component {
  /** 显示当前关卡名称 */
  @property(Label) levelNameLabel: Label | null = null;

  /** 显示当前页码，如 "1 / 5" */
  @property(Label) levelIndexLabel: Label | null = null;

  private levels: LevelMeta[] = [];
  private currentIndex = 0;

  start(): void {
    // 优先使用已缓存的 manifest
    if (LevelConfig.manifest.length > 0) {
      this.levels = LevelConfig.manifest;
      this.updateUI();
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
      this.updateUI();
    });
  }

  // ---------- UI 按钮回调（绑定到 Button 组件） ----------

  onClickPrev(): void {
    if (this.levels.length === 0) return;
    this.currentIndex = (this.currentIndex - 1 + this.levels.length) % this.levels.length;
    this.updateUI();
  }

  onClickNext(): void {
    if (this.levels.length === 0) return;
    this.currentIndex = (this.currentIndex + 1) % this.levels.length;
    this.updateUI();
  }

  onClickStart(): void {
    if (this.levels.length === 0) return;
    const meta = this.levels[this.currentIndex];
    LevelConfig.currentLevelPath = meta.path;
    console.log(`[LevelSelect] Starting level: ${meta.name} (${meta.path})`);
    director.loadScene('level');
  }

  // ---------- 内部 ----------

  private updateUI(): void {
    if (this.levels.length === 0) return;
    const meta = this.levels[this.currentIndex];
    if (this.levelNameLabel) {
      this.levelNameLabel.string = meta.name;
    }
    if (this.levelIndexLabel) {
      this.levelIndexLabel.string = `${this.currentIndex + 1} / ${this.levels.length}`;
    }
  }
}
