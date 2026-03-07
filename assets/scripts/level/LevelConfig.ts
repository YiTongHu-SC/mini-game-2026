/**
 * LevelConfig — 跨场景静态状态
 *
 * 用于在 levelSelect 场景和 level 场景之间传递当前选中的关卡信息。
 * 纯数据类，零 Cocos 依赖。
 */

/** 关卡元数据（对应 manifest.json 中的条目）。 */
export interface LevelMeta {
  /** 关卡短 id，如 "001" */
  id: string;
  /** 显示名称，如 "关卡 1" */
  name: string;
  /** resources 路径（不含扩展名），如 "levels/level-001" */
  path: string;
}

/** manifest.json 的根结构 */
export interface LevelManifest {
  levels: LevelMeta[];
}

/**
 * 跨场景共享的静态状态。
 * levelSelect 设置 currentLevelPath，level 场景读取并加载。
 */
export class LevelConfig {
  /** 当前选中关卡的 resources 路径。null 表示未选择（回退到 Inspector 绑定）。 */
  static currentLevelPath: string | null = null;

  /** manifest 缓存（由 LevelSelectController 加载后写入）。 */
  static manifest: LevelMeta[] = [];
}
