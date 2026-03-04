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
2. 表现网格自动处理边界过渡，autotile 在共享 edge/corner 上自然呈现
3. 点击一个逻辑格可影响最多 25 个表现格，但只需局部刷新，性能可控

---

## 2. 网格关系

### 2.1 尺寸公式

```
V_cols = L_cols × 4 + 1
V_rows = L_rows × 4 + 1
```

| 逻辑网格 | 表现网格 |
|---|---|
| 1×1 | 5×5 |
| 2×2 | 9×9 |
| 3×3 | 13×13 |
| 5×5 | 21×21 |
| 8×8 | 33×33 |

### 2.2 结构分解

每个逻辑格在表现网格中对应一个 5×5 区域（与相邻逻辑格共享 edge/corner）：

```
┌─────┬───────────┬─────┬───────────┬─────┐
│ C   │  H-Edge   │ C   │  H-Edge   │ C   │
├─────┼───────────┼─────┼───────────┼─────┤
│     │           │     │           │     │
│ V   │  Interior │ V   │  Interior │ V   │
│ E   │   3×3     │ E   │   3×3     │ E   │
│     │           │     │           │     │
├─────┼───────────┼─────┼───────────┼─────┤
│ C   │  H-Edge   │ C   │  H-Edge   │ C   │
├─────┼───────────┼─────┼───────────┼─────┤
│     │           │     │           │     │
│ V   │  Interior │ V   │  Interior │ V   │
│ E   │   3×3     │ E   │   3×3     │ E   │
│     │           │     │           │     │
├─────┼───────────┼─────┼───────────┼─────┤
│ C   │  H-Edge   │ C   │  H-Edge   │ C   │
└─────┴───────────┴─────┴───────────┴─────┘

C = Corner (1×1), 共享 4 个逻辑格
H-Edge = 水平边 (3×1), 共享上下 2 个逻辑格
V-Edge = 垂直边 (1×3), 共享左右 2 个逻辑格
Interior = 内部 (3×3), 属于 1 个逻辑格
```

上图展示了一个 2×2 逻辑网格对应的 9×9 表现网格布局。

### 2.3 步幅（Stride）

- 相邻逻辑格在表现坐标中的间距 = **4**（3 interior + 1 shared edge）
- 常量 `STRIDE = 4`

---

## 3. 坐标映射

### 3.1 逻辑格 → 表现格

逻辑格 `(lx, ly)` 对应：

| 表现格区域 | 坐标范围 | 数量 |
|---|---|---|
| Interior | `(lx×4+1..lx×4+3, ly×4+1..ly×4+3)` | 9 |
| Left V-Edge | `(lx×4, ly×4+1..ly×4+3)` | 3 |
| Right V-Edge | `((lx+1)×4, ly×4+1..ly×4+3)` | 3 |
| Bottom H-Edge | `(lx×4+1..lx×4+3, ly×4)` | 3 |
| Top H-Edge | `(lx×4+1..lx×4+3, (ly+1)×4)` | 3 |
| Bottom-Left Corner | `(lx×4, ly×4)` | 1 |
| Bottom-Right Corner | `((lx+1)×4, ly×4)` | 1 |
| Top-Left Corner | `(lx×4, (ly+1)×4)` | 1 |
| Top-Right Corner | `((lx+1)×4, (ly+1)×4)` | 1 |
| **合计** | | **25** |

### 3.2 表现格 → 类型判定

根据 `(vx % 4, vy % 4)` 的余数判断类型：

| `rx = vx%4` | `ry = vy%4` | 类型 | 关联逻辑格 |
|---|---|---|---|
| 1,2,3 | 1,2,3 | `interior` | 1 个: `(⌊vx/4⌋, ⌊vy/4⌋)` |
| 0 | 1,2,3 | `v-edge` | 2 个: `(vx/4−1, ⌊vy/4⌋)`, `(vx/4, ⌊vy/4⌋)` |
| 1,2,3 | 0 | `h-edge` | 2 个: `(⌊vx/4⌋, vy/4−1)`, `(⌊vx/4⌋, vy/4)` |
| 0 | 0 | `corner` | 4 个: 见代码 |

---

## 4. 占用规则

表现格的占用状态由其关联逻辑格的占用状态推导。

### 4.1 AND 规则（默认）

- **Interior**：等于逻辑格状态
- **Edge**：两侧逻辑格都 `occupied` → 1，否则 → 0
- **Corner**：四周逻辑格都 `occupied` → 1，否则 → 0

越界逻辑格（坐标 < 0 或 >= cols/rows）由 `OccupancyGrid.getCell` 返回 0，因此网格边界上的 edge/corner 永远为 0。

### 4.2 视觉效果示例

#### 单个逻辑格 occupied

```
. . . . .     ← 边界 edge/corner 全为 0（AND：一侧越界）
. # # # .     ← Interior 3×3 占用
. # # # .
. # # # .
. . . . .
```

#### 两个水平相邻逻辑格 occupied

```
. . . . . . . . .
. # # # # # # # .     ← 共享 V-Edge (col 4) 被填充
. # # # # # # # .     ← 两个 3×3 Interior + 中间 1×3 V-Edge = 7×3
. # # # # # # # .
. . . . . . . . .
```

#### 2×2 逻辑格全部 occupied

```
. . . . . . . . .
. # # # # # # # .     ← 7×7 连续填充
. # # # # # # # .     ← V-Edge, H-Edge, 中心 Corner 全部 occupied
. # # # # # # # .
. # # # # # # # .
. # # # # # # # .
. # # # # # # # .
. # # # # # # # .
. . . . . . . . .
```

### 4.3 OR 规则（预留）

- Edge：任一侧 occupied → 1
- Corner：任一个 occupied → 1
- 产生更宽的视觉填充，适用于特殊场景

---

## 5. 局部更新流程

当用户点击逻辑格 `(lx, ly)` 进行 toggle：

```
1. logicGrid.setCell(lx, ly, newValue)
2. logicGrid.getDirtyAndClear()                    ← 丢弃逻辑脏格（不需要）
3. mapper.syncLogicCell(lx, ly, logicGrid, visualGrid)
   ├─ getAffectedVisualCells(lx, ly)               ← 最多 25 个表现格
   ├─ 对每个: computeVisualOccupancy → visualGrid.setCell
   └─ return visualGrid.getDirtyAndClear()          ← 包含变化格 + 4 邻居
4. renderer.refreshLocal(dirty, resolver, visualGrid)
   └─ 对每个脏格: resolver.resolve → 更新 Sprite
```

**性能分析**：

- 受影响的表现格：25 个
- `setCell` 触发的 dirty：每个变化格 + 4 邻居 ≈ 50~80 个（有去重）
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
| 点击空白区域 | 对应逻辑格设为 occupied，3×3 内部表现格显示 tile |
| 点击已占据区域 | 对应逻辑格设为 empty，内部表现格清空 |
| 点击相邻逻辑格 | 共享 edge 的 3 个表现格被填充，autotile 边界自然过渡 |
| 形成 2×2 逻辑块 | 中心 corner 表现格被填充，产生 7×7 连续视觉区域 |
| "Toggle Logic" | 显示/隐藏逻辑网格叠加层（绿色=占据，灰色=空） |

### 8.4 验收检查清单

| # | 检查项 | 验证方式 | 状态 |
|---|---|---|---|
| 1 | 单元测试全部通过 | `npm test` — 65 用例（34 旧 + 31 新） | ✅ |
| 2 | 单逻辑格 → 3×3 表现块 | 场景点击 + 观察 | ⬜ |
| 3 | 相邻逻辑格 → 共享 edge 填充 | 场景点击相邻格 | ⬜ |
| 4 | 2×2 逻辑块 → 7×7 连续区域 | 4 格全点亮 | ⬜ |
| 5 | 移除一格 → edge/corner 正确消失 | 取消一个逻辑格 | ⬜ |
| 6 | 逻辑叠加层切换 | Toggle Logic 按钮 | ⬜ |
| 7 | 清空功能 | Clear 按钮 | ⬜ |
| 8 | 现有 tiledMapTest 场景不受影响 | 运行旧场景 | ⬜ |

---

## 9. 测试用例一览（31 cases）

| 测试组 | 用例数 | 覆盖内容 |
|---|---|---|
| `visualGridSize` | 4 | 1×1、3×3、5×5、非对称 2×4 |
| `classifyVisualCell` | 9 | interior×3、v-edge×2、h-edge×2、corner×2 |
| `computeVisualOccupancy (AND)` | 6 | interior 跟随、edge AND、corner AND、边界 edge/corner |
| `computeVisualOccupancy (OR)` | 3 | edge OR、corner OR、边界 OR |
| `getAffectedVisualCells` | 3 | 中心格 25 个、角落格过滤、无重复 |
| `syncAll` | 3 | 单格/2×2 块/水平相邻 |
| `syncLogicCell` | 3 | 局部同步返回 dirty、启用+禁用 edge、2×2 形成+破坏 |

---

## 10. Block / Wall 系统

### 10.1 概念

**Block** 是一组连通逻辑格的集合。相邻逻辑格之间可以放置**墙壁（Wall）**，  
墙壁会切断共享 edge 和 corner 的视觉表现，使两个逻辑格在视觉上"断开"。

### 10.2 规则

| 表现格类型 | 无墙（默认） | 有墙 |
|---|---|---|
| Interior | 跟随所属逻辑格 | 不受影响 |
| Edge | AND：两侧都 occupied → 1 | 两侧之间有墙 → 0 |
| Corner | AND：四周都 occupied → 1 | 四周任意一对相邻逻辑格之间有墙 → 0 |

#### Corner 的 4 对相邻关系

Corner 关联 4 个逻辑格 `[BL, BR, TL, TR]`（Bottom-Left, Bottom-Right, Top-Left, Top-Right），  
需要检查的 4 对相邻关系为：

```
BL ↔ BR   (horizontal bottom)
TL ↔ TR   (horizontal top)
BL ↔ TL   (vertical left)
BR ↔ TR   (vertical right)
```

任意一对之间有墙，该 corner 就为 0。

### 10.3 视觉示例

#### 2×2 全占据，无墙

```
. . . . . . . . .
. # # # # # # # .     ← 7×7 连续填充
. # # # # # # # .
. # # # # # # # .
. # # # # # # # .
. # # # # # # # .
. # # # # # # # .
. # # # # # # # .
. . . . . . . . .
```

#### 2×2 全占据，(0,0)↔(1,0) 之间有墙

```
. . . . . . . . .
. # # # . # # # .     ← V-Edge (col 4) 被墙切断
. # # # . # # # .     ← 视觉上分成左右两列
. # # # . # # # .
. # # # # # # # .     ← H-Edge (row 4) 不受影响（无墙）
. # # # # # # # .     ← center corner (4,4) 被墙切断
. # # # # # # # .
. # # # # # # # .
. . . . . . . . .
```

---

## 11. 右键交互 — 墙壁切换

### 11.1 操作方式

| 操作 | 效果 |
|---|---|
| 右键点击 V-Edge 区域 | 切换左右两个逻辑格之间的墙壁 |
| 右键点击 H-Edge 区域 | 切换上下两个逻辑格之间的墙壁 |
| 右键点击 Interior/Corner | 无效果 |

### 11.2 检测逻辑

将鼠标坐标转换为表现格坐标 `(vx, vy)`，根据余数判断：

| `vx % 4` | `vy % 4` | 类型 | 操作 |
|---|---|---|---|
| 0 | 1,2,3 | V-Edge | 墙壁在 `(vx/4−1, ⌊vy/4⌋)` 和 `(vx/4, ⌊vy/4⌋)` 之间 |
| 1,2,3 | 0 | H-Edge | 墙壁在 `(⌊vx/4⌋, vy/4−1)` 和 `(⌊vx/4⌋, vy/4)` 之间 |

### 11.3 墙壁指示器

添加墙壁时，在对应的 edge 位置显示红色半透明矩形指示器。移除墙壁时删除指示器。

---

## 12. 更新后的文件清单

### 12.1 新增文件（Block/Wall）

| 文件 | 路径 | Cocos 依赖 | Jest 可测 | 职责 |
|---|---|---|---|---|
| `BlockManager.ts` | `assets/scripts/tile-map/` | ❌ | ✅ | 墙壁存储、CRUD、邻接验证 |
| `BlockManager.test.ts` | `tests/tile-map/` | ❌ | ✅ | 34 个测试用例 |

### 12.2 修改文件（Block/Wall）

| 文件 | 修改内容 |
|---|---|
| `DualGridMapper.ts` | 新增 `blockManager` 字段、墙壁感知占用计算、`getAffectedVisualCellsForWall`、`syncWallChange` |
| `DualGridController.ts` | 集成 `BlockManager`、右键墙壁切换、墙壁指示器 |
| `index.ts` | 新增 `BlockManager`、`WallEdge` 导出 |
| `dual-grid.md` | 新增第 10-12 节 |

### 12.3 验收检查清单（Block/Wall）

| # | 检查项 | 验证方式 | 状态 |
|---|---|---|---|
| 1 | 单元测试全部通过 | `npm test` — 99 用例（34 旧 + 31 双网格 + 34 新） | ✅ |
| 2 | 墙壁阻断 V-Edge | 场景右键点击 V-Edge 区域 | ⬜ |
| 3 | 墙壁阻断 H-Edge | 场景右键点击 H-Edge 区域 | ⬜ |
| 4 | 墙壁阻断 Corner | 中心角被墙壁切断 | ⬜ |
| 5 | 墙壁切换（再次右键） | 右键同一位置移除墙壁 | ⬜ |
| 6 | 清空功能同时清除墙壁 | Clear 按钮 | ⬜ |
| 7 | 墙壁指示器可见 | 红色半透明矩形 | ⬜ |
| 8 | 现有功能不受影响 | 左键 toggle + 旧场景正常 | ⬜ |
