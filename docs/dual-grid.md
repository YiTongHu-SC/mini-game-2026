# 双网格（Dual-Grid）系统设计文档

本文档描述在现有单层 Auto-tiling 系统基础上新增的双网格架构。

---

## 1. 概述

### 1.1 动机

现有系统中，逻辑层与视觉层使用相同尺寸的网格。当需要更精细的视觉表现（如平滑边界过渡）时，逻辑层的颗粒度成为瓶颈。双网格系统通过将逻辑与表现拆分到不同尺寸的网格上，解决这一问题：

- **逻辑网格**（大格）—— 负责数据、交互、连通计算，尺寸较大便于玩法操控
- **表现网格**（小格）—— 仅负责视觉渲染，尺寸更小提供精细的 autotile 边界

### 1.2 与现有系统的关系

- **完全独立并存**：不修改任何现有模块
- 现有 `TiledMapController` + `tiledMapTest.scene` 继续正常工作
- 新增模块仅通过 `index.ts` 新增导出，不影响旧导入路径

### 1.3 核心收益

1. 逻辑网格保持简洁（每格一个状态值），玩法代码只操作大格
2. 表现网格自动处理边界过渡，autotile 在 3×3 块上自然呈现
3. 点击一个逻辑格影响 9 个表现格，仅需局部刷新，性能可控

---

## 2. 网格关系

### 2.1 尺寸公式

```
V_cols = L_cols × 3
V_rows = L_rows × 3
```

| 逻辑网格 | 表现网格 |
|---|---|
| 1×1 | 3×3 |
| 2×2 | 6×6 |
| 3×3 | 9×9 |
| 5×5 | 15×15 |
| 8×8 | 24×24 |

### 2.2 结构分解

每个逻辑格在表现网格中对应一个独立的 3×3 区域（不与相邻逻辑格共享）：

```
┌─────────┬─────────┐
│  3×3    │  3×3    │
│  Block  │  Block  │
│ (0,1)   │ (1,1)   │
├─────────┼─────────┤
│  3×3    │  3×3    │
│  Block  │  Block  │
│ (0,0)   │ (1,0)   │
└─────────┴─────────┘

每个逻辑格独占 3×3 表现格，无共享边/角
```

上图展示了一个 2×2 逻辑网格对应的 6×6 表现网格布局。

### 2.3 步幅（Stride）

- 相邻逻辑格在表现坐标中的间距 = **3**
- 常量 `STRIDE = 3`

---

## 3. 坐标映射

### 3.1 逻辑格 → 表现格

逻辑格 `(lx, ly)` 对应 3×3 表现格：

| 表现格区域 | 坐标范围 | 数量 |
|---|---|---|
| 全部 | `(lx×3+0..lx×3+2, ly×3+0..ly×3+2)` | 9 |

其中 `(lx×3+1, ly×3+1)` 为中心格。

### 3.2 表现格 → 逻辑格

所有表现格都是 interior 类型，直接映射到唯一逻辑格：

```
lx = ⌊vx / 3⌋
ly = ⌊vy / 3⌋
```

余数 `rx = vx % 3, ry = vy % 3` 决定该格在 3×3 块内的位置：

- `rx=0`: 左侧边界列
- `rx=1`: 中心列
- `rx=2`: 右侧边界列
- `ry=0`: 底部边界行
- `ry=1`: 中心行
- `ry=2`: 顶部边界行

---

## 4. 占用规则

表现格的占用状态由其所属逻辑格的占用状态推导。

### 4.1 基本规则

所有表现格都是 interior 类型，直接跟随所属逻辑格：

- 逻辑格 occupied → 9 个表现格全部为 1
- 逻辑格 empty → 9 个表现格全部为 0

### 4.2 墙壁感知

当设置了 `BlockManager` 时，边界列/行的表现格会检查墙壁：

| 位置 (rx, ry) | 检查的墙壁 | 有墙时 |
|---|---|---|
| rx=0 | 左侧墙 `(lx-1,ly)↔(lx,ly)` | → 0 |
| rx=2 | 右侧墙 `(lx,ly)↔(lx+1,ly)` | → 0 |
| ry=0 | 下方墙 `(lx,ly-1)↔(lx,ly)` | → 0 |
| ry=2 | 上方墙 `(lx,ly)↔(lx,ly+1)` | → 0 |
| rx=1, ry=1 | （中心格）无需检查 | 不受影响 |

角落格（如 rx=0, ry=0）满足两个条件，任一方向有墙即为 0。

### 4.3 视觉效果示例

#### 单个逻辑格 occupied

```
# # #     ← 3×3 全部填充
# # #
# # #
```

#### 两个水平相邻逻辑格 occupied（无墙）

```
# # # # # #     ← 6×3 连续填充
# # # # # #
# # # # # #
```

#### 两个水平相邻逻辑格 occupied（有墙）

```
# # . . # #     ← 边界列被墙壁切断（rx=2 和 rx=0 为 0）
# # . . # #
# # . . # #
```

#### 2×2 逻辑格全部 occupied（无墙）

```
# # # # # #     ← 6×6 连续填充
# # # # # #
# # # # # #
# # # # # #
# # # # # #
# # # # # #
```

---

## 5. 局部更新流程

当用户点击逻辑格 `(lx, ly)` 进行 toggle：

```
1. logicGrid.setCell(lx, ly, newValue)
2. logicGrid.getDirtyAndClear()                    ← 丢弃逻辑脏格（不需要）
3. mapper.syncLogicCell(lx, ly, logicGrid, visualGrid)
   ├─ getAffectedVisualCells(lx, ly)               ← 9 个表现格
   ├─ 对每个: computeVisualOccupancy → visualGrid.setCell
   └─ return visualGrid.getDirtyAndClear()          ← 包含变化格 + 4 邻居
4. renderer.refreshLocal(dirty, resolver, visualGrid)
   └─ 对每个脏格: resolver.resolve → 更新 Sprite
```

**性能分析**：

- 受影响的表现格：9 个
- `setCell` 触发的 dirty：每个变化格 + 4 邻居 ≈ 20~30 个（有去重）
- 实际 resolve + 渲染：仅脏格数量，远小于全量刷新

---

## 6. 模块架构图

```
┌──────────────────────────────────────────────────────────────────┐
│                   DualGridController (cc)                        │
│       场景组件 — 胶水层，整合逻辑/表现/叠加层                      │
├──────────────┬───────────────┬─────────────────┬─────────────────┤
│ OccupancyGrid│ DualGridMapper│ OccupancyGrid   │ VisualTilemap-  │
│ (逻辑网格)    │ (坐标映射)     │ (表现网格)       │ Renderer (渲染) │
│ L_cols×L_rows│ 分类/同步/规则  │ V_cols×V_rows   │ Sprite 节点网格  │
├──────────────┤               ├─────────────────┤                 │
│ Connected-   │               │ AutoTileResolver │                 │
│ Region (BFS) │               │ mask→tileIndex   │                 │
└──────────────┴───────────────┴─────────────────┴─────────────────┘

新增模块（粗体标记）:
  ■ DualGridTypes.ts    — 类型/常量（零 Cocos 依赖）
  ■ DualGridMapper.ts   — 坐标映射/同步（零 Cocos 依赖）
  ■ DualGridController.ts — 场景组件（Cocos 依赖）

复用现有模块:
  □ OccupancyGrid       — 逻辑/表现网格各一个实例
  □ AutoTileResolver    — 工作在表现网格上
  □ VisualTilemapRenderer — 渲染表现网格
  □ TileMapConfig       — 16-tile maskTable
  □ ConnectedRegion     — 逻辑网格连通查询
```

---

## 7. 文件清单

### 7.1 新增文件

| 文件 | 路径 | Cocos 依赖 | Jest 可测 | 职责 |
|---|---|---|---|---|
| `DualGridTypes.ts` | `assets/scripts/tile-map/` | ❌ | ✅ | 类型、常量、尺寸计算 |
| `DualGridMapper.ts` | `assets/scripts/tile-map/` | ❌ | ✅ | 坐标映射、占用计算、同步 |
| `DualGridController.ts` | `assets/scripts/tile-map/` | ✅ | ❌ | 场景组件、交互、叠加层 |
| `DualGridMapper.test.ts` | `tests/tile-map/` | ❌ | ✅ | 31 个测试用例 |
| `dual-grid.md` | `docs/` | — | — | 本文档 |

### 7.2 修改文件

| 文件 | 修改内容 |
|---|---|
| `assets/scripts/tile-map/index.ts` | 新增 DualGrid* 相关导出 |

### 7.3 不修改的文件

所有现有模块（`OccupancyGrid`、`AutoTileResolver`、`TileMapConfig`、`ConnectedRegion`、`VisualTilemapRenderer`、`TiledMapController`）及其测试文件均不修改。

---

## 8. 测试场景使用说明

### 8.1 创建 dualGridTest 场景（Cocos Creator 编辑器操作）

1. **File → New Scene** → 保存为 `assets/scenes/dualGridTest.scene`
2. 在 **Canvas** 下创建空节点 `DualGridRoot`
3. 给 `DualGridRoot` 添加组件：
   - `UITransform`（宽高自动设置）
   - `DualGridController` 脚本组件
4. 配置 `DualGridController` 属性：

   | 属性 | 值 | 说明 |
   |---|---|---|
   | `logicCols` | 5 | 逻辑网格列数 |
   | `logicRows` | 5 | 逻辑网格行数 |
   | `visualTileSize` | 24 | 表现格像素大小 |
   | `showDebugMask` | ✅ | 显示 mask 标签 |
   | `showLogicOverlay` | ❌ | 初始隐藏逻辑叠加层 |
   | `tileFrames` | 16 项 | 拖入 tile-00 ~ tile-15 |

5. 将 `assets/textures/tileset-tiles/` 下的 `tile-00` ~ `tile-15` 按顺序拖入 `tileFrames` 数组

### 8.2 添加 UI 按钮

在 Canvas 下创建 4 个 Button 节点，绑定 `DualGridRoot` 的 `DualGridController` 方法：

| 按钮文字 | 绑定方法 | 功能 |
|---|---|---|
| "Toggle Logic" | `toggleLogicOverlay()` | 切换逻辑网格叠加层 |
| "Test Pattern" | `loadTestPattern()` | 加载 3×3 测试图案 |
| "Clear" | `clearGrid()` | 清空所有格子 |
| "Toggle Mask" | `toggleDebugMask()` | 切换 mask debug 标签 |

### 8.3 交互说明

| 操作 | 效果 |
|---|---|
| 点击空白区域 | 对应逻辑格设为 occupied，3×3 表现格显示 tile |
| 点击已占据区域 | 对应逻辑格设为 empty，3×3 表现格清空 |
| 点击相邻逻辑格 | 两个 3×3 块直接相邻显示，autotile 边界自然过渡 |
| 形成 2×2 逻辑块 | 产生 6×6 连续视觉区域 |
| "Toggle Logic" | 显示/隐藏逻辑网格叠加层（绿色=占据，灰色=空） |

### 8.4 验收检查清单

| # | 检查项 | 验证方式 | 状态 |
|---|---|---|---|
| 1 | 单元测试全部通过 | `npm test` | ✅ |
| 2 | 单逻辑格 → 3×3 表现块 | 场景点击 + 观察 | ⬜ |
| 3 | 相邻逻辑格 → 6×3 连续区域 | 场景点击相邻格 | ⬜ |
| 4 | 2×2 逻辑块 → 6×6 连续区域 | 4 格全点亮 | ⬜ |
| 5 | 移除一格 → 3×3 正确消失 | 取消一个逻辑格 | ⬜ |
| 6 | 逻辑叠加层切换 | Toggle Logic 按钮 | ⬜ |
| 7 | 清空功能 | Clear 按钮 | ⬜ |
| 8 | 现有 tiledMapTest 场景不受影响 | 运行旧场景 | ⬜ |

---

## 9. 测试用例一览

| 测试组 | 用例数 | 覆盖内容 |
|---|---|---|
| `visualGridSize` | 4 | 1×1、3×3、5×5、非对称 2×4 |
| `classifyVisualCell` | 8 | 全部为 interior，验证不同位置正确映射到逻辑格 |
| `computeVisualOccupancy (no walls)` | 4 | 空/占据跟随、相邻独立、邻居隔离 |
| `computeVisualOccupancy (with walls)` | 4 | 水平墙/垂直墙边界归零、角落归零、无墙保持 |
| `getAffectedVisualCells` | 4 | 中心格 9 个、角落格 9 个、最大格 9 个、无重复 |
| `getAffectedVisualCellsForWall` | 2 | 水平墙 6 个、垂直墙 6 个 |
| `syncAll` | 3 | 单格/2×2 块/水平相邻 |
| `syncLogicCell` | 3 | 局部同步返回 dirty、启用+禁用独立、2×2 形成+破坏 |

---

## 10. Block / Wall 系统

### 10.1 概念

**Block** 是一组连通逻辑格的集合。相邻逻辑格之间可以放置**墙壁（Wall）**，  
墙壁会将相邻 3×3 块的边界列/行置为 0，使两个逻辑格在视觉上"断开"。

### 10.2 规则

| 表现格位置 | 无墙（默认） | 有墙 |
|---|---|---|
| 中心 (rx=1, ry=1) | 跟随所属逻辑格 | 不受影响 |
| 右边界 (rx=2) | 跟随所属逻辑格 | 右侧有墙 → 0 |
| 左边界 (rx=0) | 跟随所属逻辑格 | 左侧有墙 → 0 |
| 上边界 (ry=2) | 跟随所属逻辑格 | 上方有墙 → 0 |
| 下边界 (ry=0) | 跟随所属逻辑格 | 下方有墙 → 0 |
| 角落 (如 rx=0,ry=0) | 跟随所属逻辑格 | 任一方向有墙 → 0 |

### 10.3 视觉示例

#### 2×2 全占据，无墙

```
# # # # # #     ← 6×6 连续填充
# # # # # #
# # # # # #
# # # # # #
# # # # # #
# # # # # #
```

#### 2×2 全占据，(0,0)↔(1,0) 之间有墙

```
# # . . # #     ← 右侧边界(rx=2)和左侧边界(rx=0)被墙切断
# # . . # #
# # . . # #
# # # # # #     ← 上面两个逻辑格之间无墙，正常连接
# # # # # #
# # # # # #
```

```

---

## 11. 右键交互 — 墙壁切换

### 11.1 操作方式

> **注意：右键墙壁切换已暂时移除**。当前版本中墙壁仅从关卡数据加载，  
> 不支持运行时右键切换。以下内容保留供将来恢复参考。

| 操作 | 效果 |
|---|---|
| 右键点击边界区域 | （已禁用）切换相邻逻辑格之间的墙壁 |

### 11.2 墙壁指示器

从关卡数据加载墙壁后，在相邻 3×3 块的交界处显示红色半透明矩形指示器。  
指示器位于两个逻辑格之间的半格位置，宽度/高度覆盖整条边界（`STRIDE × visualTileSize`）。

---

## 12. 更新后的文件清单

### 12.1 新增文件（Block/Wall）

| 文件 | 路径 | Cocos 依赖 | Jest 可测 | 职责 |
|---|---|---|---|---|
| `BlockManager.ts` | `assets/scripts/tile-map/` | ❌ | ✅ | 墙壁存储、CRUD、邻接验证 |
| `BlockManager.test.ts` | `tests/tile-map/` | ❌ | ✅ | 墙壁 CRUD + 边界格置零 + 同步测试 |

### 12.2 修改文件（Block/Wall）

| 文件 | 修改内容 |
|---|---|
| `DualGridMapper.ts` | `blockManager` 字段、边界格墙壁置零、`getAffectedVisualCellsForWall`、`syncWallChange` |
| `DualGridController.ts` | 集成 `BlockManager`、墙壁指示器（右键切换已移除） |
| `LevelController.ts` | 集成 `BlockManager`、墙壁指示器、中心坐标 `+1`、`handleWallToggle` 已禁用 |
| `index.ts` | 新增 `BlockManager`、`WallEdge` 导出 |
| `dual-grid.md` | 新增第 10-12 节 |

### 12.3 验收检查清单（Block/Wall）

| # | 检查项 | 验证方式 | 状态 |
|---|---|---|---|
| 1 | 单元测试全部通过 | `npm test` — 206 用例（9 套件） | ✅ |
| 2 | 墙壁数据从关卡加载 | 关卡 JSON 含 walls 数组时正确加载 | ⬜ |
| 3 | 墙壁视觉阻断 | 边界列/行被置为 0 | ⬜ |
| 4 | 清空功能同时清除墙壁 | Clear 按钮 | ⬜ |
| 5 | 墙壁指示器可见 | 红色半透明矩形 | ⬜ |
| 6 | 现有功能不受影响 | 拖放、刀切等正常 | ⬜ |
