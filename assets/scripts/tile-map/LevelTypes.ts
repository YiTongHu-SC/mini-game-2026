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
}
