# 关卡系统设计文档

本文档描述在双网格系统基础上新增的关卡数据层：关卡的数据格式、解析流程、场景组件以及编辑器操作步骤。

---

## 1. 概述

### 1.1 动机

双网格系统（`DualGridController`）目前通过代码硬编码初始状态（如 `loadTestPattern()` 的 3×3 方块），无法支持配置化的关卡数据。关卡系统在此基础上新增：

- **关卡数据层**：以 JSON 文件描述关卡布局，可由策划人员独立配置
- **Block 概念**：将逻辑格按语义分组，不同 block 之间自动产生视觉边界（wall）
- **LevelController**：从 JSON Asset 读取关卡数据并驱动完整双网格系统的场景组件

### 1.2 与现有系统的关系

- **不修改** 任何已有模块（`DualGridController`、`BlockManager`、`DualGridMapper` 等）
- 在 `tile-map/` 模块内新增两个纯逻辑文件（`LevelTypes.ts`、`LevelLoader.ts`）
- 新增独立目录 `scripts/level/` 存放 Cocos 场景组件
- 关卡 JSON 文件统一放在 `assets/data/` 目录

### 1.3 核心概念

| 概念 | 说明 |
|---|---|
| **LevelData** | 完整关卡配置：网格尺寸 + block 列表 |
| **BlockData** | 一个 block：唯一 id + 若干逻辑格坐标 |
| **Cell（逻辑格）** | 单个 `(x, y)` 格子 |
| **Wall（墙壁）** | 不同 block 相邻格之间的自动视觉边界 |

---

## 2. 关卡数据格式

### 2.1 JSON 结构

```ts
interface CellCoord {
  x: number;   // 逻辑格列坐标（0-based）
  y: number;   // 逻辑格行坐标（0-based）
}

interface BlockData {
  id: string;       // block 唯一标识符（仅用于推断 wall，不参与渲染）
  cells: CellCoord[]; // 属于该 block 的逻辑格列表
}

interface LevelData {
  gridCols: number;   // 逻辑网格总列数
  gridRows: number;   // 逻辑网格总行数
  blocks: BlockData[]; // block 列表（数组顺序无关）
}
```

### 2.2 示例：level-001.json

```json
{
  "gridCols": 6,
  "gridRows": 6,
  "blocks": [
    {
      "id": "block-A",
      "cells": [
        { "x": 1, "y": 1 },
        { "x": 2, "y": 1 },
        { "x": 1, "y": 2 }
      ]
    },
    {
      "id": "block-B",
      "cells": [
        { "x": 3, "y": 1 },
        { "x": 3, "y": 2 },
        { "x": 4, "y": 2 }
      ]
    }
  ]
}
```

逻辑网格示意（6×6，`.` = 空，`A`/`B` = block id）：

```
row 5  . . . . . .
row 4  . . . . . .
row 3  . . . . . .
row 2  . A . B B .
row 1  . A A B . .
row 0  . . . . . .
       0 1 2 3 4 5  (col)
```

block-A `(2,1)` 与 block-B `(3,1)` 水平相邻 → 自动在两者之间插入一条墙壁。

### 2.3 约束

| 约束 | 说明 |
|---|---|
| 格子坐标必须在网格范围内 | `0 ≤ x < gridCols`，`0 ≤ y < gridRows` |
| 同一格子不可属于多个 block | 重复配置以后写的 block 覆盖（map 键覆盖） |
| block 内的格子不必连通 | 连通性由游戏逻辑自行判断，LevelLoader 不强制 |
| block id 仅用于推断 wall | 不持久化，不参与渲染，不需要全局唯一 |

---

## 3. Wall 自动推断规则

### 3.1 规则定义

`LevelLoader.load()` 在完成格子收集后，对所有已占用格执行四方向邻居扫描：

```
for 每个已占用格 (x, y)，属于 blockId:
  for 方向 in [右, 左, 上, 下]:
    neighborKey = (x+dx, y+dy)
    if neighborKey 存在 且 属于不同 blockId:
      添加 wall ((x,y), (x+dx, y+dy))
      （自动去重，使用与 BlockManager.wallKey 相同的标准化 key）
```

### 3.2 规则特性

| 特性 | 说明 |
|---|---|
| 同 block 内相邻 → 无 wall | 只有跨 block 才产生 wall |
| 不相邻（中间有空格）→ 无 wall | 只检查四方向相邻（曼哈顿距离 = 1） |
| 对角相邻 → 无 wall | 系统只处理四方向 |
| 自动去重 | `(A,B)` 和 `(B,A)` 只产生一条 wall |

### 3.3 示例推断结果

对 level-001 的两个 block：

```
block-A 格子：(1,1), (2,1), (1,2)
block-B 格子：(3,1), (3,2), (4,2)

扫描 (2,1) 右邻 (3,1) → 属于 block-B → wall: (2,1)↔(3,1)

其他相邻格对均属于同一 block 或不相邻 → 无额外 wall

结果：walls = [ [(2,1), (3,1)] ]   // 仅 1 条
```

---

## 4. 模块架构

```
┌──────────────────────────────────────────────────────────────────┐
│                    LevelController (cc)                          │
│       场景组件 — 解析关卡 JSON → 初始化双网格系统                   │
├──────────────┬───────────────┬─────────────────┬─────────────────┤
│ OccupancyGrid│ DualGridMapper│ OccupancyGrid   │ VisualTilemap-  │
│ (逻辑网格)    │ (坐标映射)     │ (表现网格)       │ Renderer (渲染) │
│ L_cols×L_rows│ 分类/同步/规则  │ V_cols×V_rows   │ Sprite 节点网格  │
├──────────────┤               ├─────────────────┤                 │
│ BlockManager │               │ AutoTileResolver │                 │
│ (wall 存储)   │               │ mask→tileIndex   │                 │
└──────────────┴───────────────┴─────────────────┴─────────────────┘
         ↑
┌────────┴────────┐
│   LevelLoader   │  解析 LevelData → occupiedCells + walls
│   LevelTypes    │  CellCoord / BlockData / LevelData 接口
└─────────────────┘
         ↑
┌─────────────────┐
│  level-001.json │  关卡 JSON 数据文件
└─────────────────┘
```

**关系说明**：

- `LevelLoader` / `LevelTypes`：零 Cocos 依赖，可在 Jest 中直接测试
- `LevelController`：Cocos `@ccclass` 组件，复用全部现有双网格系统类，不继承 `DualGridController`
- 关卡 JSON 通过 Cocos `JsonAsset` 属性引用，在 Inspector 中绑定

---

## 5. LevelLoader 解析流程

```
LevelLoader.load(data: LevelData): LevelLoadResult

输入：LevelData（JSON 反序列化结果）

步骤 1：建立 cellKey → blockId 映射
  for block of data.blocks:
    for cell of block.cells:
      cellToBlock.set(`${cell.x},${cell.y}`, block.id)

步骤 2：收集 occupiedCells
  from cellToBlock.keys() → parse (x, y) → occupiedCells[]

步骤 3：推断 walls（四方向邻居扫描，见第 3 节）
  → walls: [CellCoord, CellCoord][]（已去重）

输出：LevelLoadResult {
  gridCols, gridRows,  ← 直接来自 data
  occupiedCells,       ← 所有已占用格
  walls,               ← 跨 block 边界的墙壁
}
```

---

## 6. LevelController 初始化流程

`LevelController.start()` 执行以下步骤：

```
1. 读取 Inspector 绑定的 levelData (JsonAsset)，验证非空
2. LevelLoader.load(data)                      ← 解析关卡数据
3. new OccupancyGrid(gridCols, gridRows)        ← 逻辑网格
4. new OccupancyGrid(vCols, vRows)             ← 表现网格（visualGridSize 计算）
5. new DualGridMapper(gridCols, gridRows)       ← 坐标映射器
6. new BlockManager()  +  mapper.setBlockManager ← 墙壁管理器注入
7. new AutoTileResolver(visualGrid, config)    ← 使用默认 maskTable
8. new VisualTilemapRenderer(node, ...)        ← 创建 Sprite 节点网格
9. 调整 node 的 UITransform 尺寸               ← 覆盖完整表现网格
10. buildLogicOverlay()                        ← 逻辑叠加层（默认隐藏）
11. buildWallIndicatorLayer()                  ← 墙壁指示器容器
12. applyLevelData(loadResult):
    a. logicGrid.setCell(x, y, 1)              ← 所有 occupiedCells
    b. blockManager.addWall(a, b)              ← 所有 walls
    c. addWallIndicator(a, b)                  ← 红色半透明矩形
    d. mapper.syncAll(logicGrid, visualGrid)   ← 全量同步
    （渲染延迟到 update 第 2 帧，等 Cocos 注册动态节点）
```

### 6.1 Inspector 属性

| 属性 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `levelData` | `JsonAsset` | — | 关卡 JSON 文件，必须绑定 |
| `visualTileSize` | `CCInteger` | 24 | 表现格像素大小（px） |
| `showDebugMask` | `boolean` | false | 是否显示 mask 数值标签 |
| `showLogicOverlay` | `boolean` | false | 是否显示逻辑格叠加层 |
| `tileFrames` | `SpriteFrame[]` | — | 16 张 tile 图，按 mask 索引 0–15 排列 |

### 6.2 公开方法

| 方法 | 功能 | 适用场景 |
|---|---|---|
| `toggleLogicOverlay()` | 切换逻辑叠加层显示 | 绑定调试按钮 |

### 6.3 鼠标交互

场景运行后，挂载了 `LevelController` 的节点支持以下鼠标操作：

| 操作 | 效果 |
|---|---|
| 右键点击 V-Edge 区域 | 切换左右两个逻辑格之间的墙壁 |
| 右键点击 H-Edge 区域 | 切换上下两个逻辑格之间的墙壁 |
| 右键点击 Interior/Corner | 无效果 |

检测逻辑与 `DualGridController` 一致：将鼠标坐标转换为表现格坐标 `(vx, vy)`，通过余数判断区域类型（见双网格文档第 11 节）。

**墙壁指示器**：添加墙壁时在对应 edge 位置显示红色半透明矩形；移除墙壁时同步删除指示器节点。

---

## 7. 场景创建说明（Cocos Creator 编辑器操作）

### 7.1 创建 level.scene

1. **File → New Scene** → 保存为 `assets/scenes/level.scene`
2. 在 **Canvas** 下创建空节点，命名为 `LevelRoot`
3. 给 `LevelRoot` 添加以下组件：
   - `UITransform`（尺寸会在运行时被 `LevelController` 自动设置）
   - `LevelController` 脚本组件

### 7.2 配置 LevelController 属性

| 属性 | 操作 |
|---|---|
| `levelData` | 将 `assets/data/level-001.json` 拖入 |
| `visualTileSize` | 填入 `24`（或根据屏幕尺寸调整） |
| `showDebugMask` | 调试时勾选，发布时取消 |
| `tileFrames` | 将 `tile-00` ~ `tile-15` 按顺序依次拖入 16 个槽位 |

> **tile 路径**：`assets/textures/tileset-tiles/tile-00.png` … `tile-15.png`

### 7.3 可选：添加调试按钮

在 Canvas 下创建 Button 节点，Target 指向 `LevelRoot`，绑定：

| 按钮文字 | 绑定方法 |
|---|---|
| "Toggle Logic" | `toggleLogicOverlay()` |

> **右键交互**：场景运行后可直接在 `LevelRoot` 节点上右键点击 edge 区域来切换墙壁，无需任何额外配置。

---

## 8. 新增关卡方法

### 8.1 创建新 JSON 文件

在 `assets/data/` 下新建 JSON 文件（如 `level-002.json`），按第 2 节格式填写。

```json
{
  "gridCols": 8,
  "gridRows": 8,
  "blocks": [
    {
      "id": "block-A",
      "cells": [
        { "x": 1, "y": 1 }, { "x": 2, "y": 1 }, { "x": 3, "y": 1 },
        { "x": 1, "y": 2 }, { "x": 2, "y": 2 },
        { "x": 1, "y": 3 }
      ]
    },
    {
      "id": "block-B",
      "cells": [
        { "x": 4, "y": 1 }, { "x": 5, "y": 1 },
        { "x": 4, "y": 2 }, { "x": 5, "y": 2 }, { "x": 6, "y": 2 }
      ]
    }
  ]
}
```

### 8.2 切换关卡

在编辑器中将 `LevelRoot` 的 `LevelController.levelData` 改为新 JSON 文件即可。
运行时切换可从外部调用（目前 `LevelController` 不提供运行时 reload API，如需要可扩展）。

---

## 9. 文件清单

### 9.1 新增文件

| 文件 | 路径 | Cocos 依赖 | Jest 可测 | 职责 |
|---|---|---|---|---|
| `LevelTypes.ts` | `assets/scripts/tile-map/` | ❌ | ✅ | `CellCoord`、`BlockData`、`LevelData` 接口 |
| `LevelLoader.ts` | `assets/scripts/tile-map/` | ❌ | ✅ | 解析 `LevelData` → `occupiedCells` + `walls` |
| `LevelController.ts` | `assets/scripts/level/` | ✅ | ❌ | 场景组件，驱动双网格系统 |
| `LevelLoader.test.ts` | `tests/tile-map/` | ❌ | ✅ | 14 个测试用例 |
| `level-001.json` | `assets/data/` | — | — | 示例关卡数据 |
| `level.md` | `docs/` | — | — | 本文档 |

### 9.2 修改文件

| 文件 | 修改内容 |
|---|---|
| `assets/scripts/tile-map/index.ts` | 新增 `LevelTypes`（`CellCoord`、`BlockData`、`LevelData`）和 `LevelLoader`（`LevelLoadResult`）导出 |

### 9.3 不修改的文件

所有现有模块（`OccupancyGrid`、`DualGridMapper`、`BlockManager`、`DualGridController`、`VisualTilemapRenderer`、`AutoTileResolver`、`TileMapConfig`、`ConnectedRegion`）均不修改。

---

## 10. 测试用例一览（14 cases）

| 测试组 | 用例数 | 覆盖内容 |
|---|---|---|
| **基础解析** | 4 | 空关卡无格、单格无 wall、单 block 内部无 wall、gridCols/gridRows 保留 |
| **Wall 推断** | 7 | 水平/垂直相邻跨 block → 1 条 wall、不相邻 → 无 wall、对角 → 无 wall、同 block 相邻 → 无 wall、重复 wall 去重、多 block 多条 wall |
| **level-001 完整场景** | 3 | 共 6 个占用格、所有格子收录、仅 1 条交界 wall `(2,1)↔(3,1)` |

运行命令：`npm test`（全部 113 用例通过，含本次新增 14 条）

---

## 11. 验收检查清单

| # | 检查项 | 验证方式 | 状态 |
|---|---|---|---|
| 1 | 单元测试全部通过 | `npm test` — 113 用例（99 旧 + 14 新） | ✅ |
| 2 | level.scene 正常加载 level-001.json | 在 Cocos Creator 运行场景 | ⬜ |
| 3 | block-A 格子正确渲染：(1,1)(2,1)(1,2) | 场景运行 + 观察 | ⬜ |
| 4 | block-B 格子正确渲染：(3,1)(3,2)(4,2) | 场景运行 + 观察 | ⬜ |
| 5 | block-A 与 block-B 之间有红色 wall 指示器 | 检查 (2,1)↔(3,1) 边界 | ⬜ |
| 6 | block 内部无 wall 指示器 | block-A 内部边界无红色条 | ⬜ |
| 7 | 逻辑叠加层切换正常 | `toggleLogicOverlay()` 按钮 | ⬜ |
| 8 | 现有场景（dualGridTest、tiledMapTest）不受影响 | 分别运行旧场景 | ⬜ |
