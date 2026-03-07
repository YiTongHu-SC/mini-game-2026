/**
 * TargetBoxConstraint — 目标盒子边界约束检查
 *
 * 判定一组格子是否满足目标盒子边界约束：
 * - 完全在某一个目标盒子内 → 有效
 * - 完全在所有目标盒子外 → 有效
 * - 部分重叠 → 无效
 *
 * 零 Cocos 依赖 — 可在 Jest 中直接测试。
 */

/**
 * 检查 cellKeys（`"x,y"` 格式）是否满足目标盒子边界约束。
 *
 * @param cellKeys  待检查的逻辑格 key 列表
 * @param targetBoxCellSets  每个目标盒子的 cellKey Set
 * @param allTargetCellKeys  所有目标盒子 cellKey 的并集
 * @returns true = 完全在某个盒子内或完全在盒子外；false = 部分重叠
 */
export function checkTargetBoxConstraint(
  cellKeys: readonly string[],
  targetBoxCellSets: readonly ReadonlySet<string>[],
  allTargetCellKeys: ReadonlySet<string>,
): boolean {
  if (targetBoxCellSets.length === 0 || cellKeys.length === 0) return true;

  // 快速判断：是否与任何目标盒子有重叠
  let hasOverlap = false;
  for (const key of cellKeys) {
    if (allTargetCellKeys.has(key)) {
      hasOverlap = true;
      break;
    }
  }
  if (!hasOverlap) return true; // 完全在盒子外

  // 存在重叠 → 必须完全在某一个盒子内
  for (const boxSet of targetBoxCellSets) {
    if (cellKeys.every(key => boxSet.has(key))) return true;
  }

  return false; // 部分重叠 → 无效
}
