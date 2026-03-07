/**
 * LevelTypes — 关卡数据类型定义
 *
 * 定义关卡 JSON 数据的结构。每个关卡由若干 block 组成，
 * 每个 block 包含一组逻辑格坐标。不同 block 相邻的格子之间
 * 将自动生成 wall 边界。
 *
 * 零 Cocos 依赖 — 可在 Jest 中直接测试。
 */

// ──────────────────── 坐标 ────────────────────

/** 逻辑格坐标 */
export interface CellCoord {
  x: number;
  y: number;
}

// ──────────────────── block ────────────────────

/** 一个 block：由若干逻辑格组成的区域 */
export interface BlockData {
  /** block 唯一标识符 */
  id: string;
  /** 属于该 block 的逻辑格坐标列表 */
  cells: CellCoord[];
  /** block 内部的墙壁（可选），用于保存同 block 内的分割线 */
  walls?: [CellCoord, CellCoord][];
}

/** 一个目标盒子区域：可用于判定 block 是否放置到目标位 */
export interface TargetBoxData {
  /** 目标盒子唯一标识符 */
  id: string;
  /** 目标盒子覆盖的逻辑格坐标列表 */
  cells: CellCoord[];
  /** 仅允许指定 block 放入（可选） */
  acceptBlockId?: string;
}

// ──────────────────── 关卡 ────────────────────

/**
 * 关卡数据（对应一个 JSON 文件）。
 *
 * 示例：
 * ```json
 * {
 *   "gridCols": 6,
 *   "gridRows": 6,
 *   "blocks": [
 *     { "id": "block-A", "cells": [{"x":1,"y":1},{"x":2,"y":1}] },
 *     { "id": "block-B", "cells": [{"x":3,"y":1}] }
 *   ]
 * }
 * ```
 */
export interface LevelData {
  /** 逻辑网格列数 */
  gridCols: number;
  /** 逻辑网格行数 */
  gridRows: number;
  /** block 列表 */
  blocks: BlockData[];
  /** 目标盒子列表（可选） */
  targetBoxes?: TargetBoxData[];
}
