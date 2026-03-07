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
  id: string;                        // block 唯一标识符（仅用于推断 wall，不参与渲染）
  cells: CellCoord[];                // 属于该 block 的逻辑格列表
  walls?: [CellCoord, CellCoord][];  // block 内部墙壁（可选），用于保存同 block 内的分割线
}

interface TargetBoxData {
  id: string;             // 目标盒子唯一标识符
  cells: CellCoord[];     // 目标盒子覆盖的逻辑格列表
  acceptBlockId?: string; // 限制仅允许某个 block 放入（可选）
}

interface KnifeData {
  id: string;               // 刀具唯一标识符
  orientation: 'h' | 'v';   // 方向：'h' 水平（沿行边界），'v' 竖直（沿列边界）
  length: number;            // 长度（覆盖多少条逻辑格边）
  edge: number;              // 边界索引：'v' 时为列边界 [1, gridCols-1]，'h' 时为行边界 [1, gridRows-1]
  start: number;             // 起始行或列：'v' 时为起始行，'h' 时为起始列
}

interface LevelData {
  gridCols: number;   // 逻辑网格总列数
  gridRows: number;   // 逻辑网格总行数
  blocks: BlockData[]; // block 列表（数组顺序无关）
  targetBoxes?: TargetBoxData[]; // 目标盒子列表（可选）
  knives?: KnifeData[];          // 刀具列表（可选）
}
```

### 2.2 示例：level-001.json

```json
{
  "gridCols": 8,
  "gridRows": 10,
  "blocks": [
    {
      "id": "block-A",
      "cells": [
        { "x": 1, "y": 1 },
        { "x": 2, "y": 1 },
        { "x": 1, "y": 2 },
        { "x": 2, "y": 2 }
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
  ],
  "targetBoxes": [
    {
      "id": "goal-A",
      "acceptBlockId": "block-A",
      "cells": [
        { "x": 5, "y": 6 },
        { "x": 6, "y": 6 },
        { "x": 5, "y": 7 },
        { "x": 6, "y": 7 }
      ]
    }
  ]
}
```

逻辑网格示意（8×10，`.` = 空，`A`/`B` = block id）：

```
row 9  . . . . . . . .
row 8  . . . . . . . .
...
row 2  . A A B B . . .
row 1  . A A B . . . .
row 0  . . . . . . . .
       0 1 2 3 4 5 6 7  (col)
```

block-A `(2,1)↔(3,1)` 以及 `(2,2)↔(3,2)` 各有一个水平相邻 → 自动插入 **2 条**墙壁。

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
block-A 格子：(1,1), (2,1), (1,2), (2,2)
block-B 格子：(3,1), (3,2), (4,2)

扫描 (2,1) 右邻 (3,1) → 属于 block-B → wall: (2,1)↔(3,1)
扫描 (2,2) 右邻 (3,2) → 属于 block-B → wall: (2,2)↔(3,2)

其他相邻格对均属于同一 block 或不相邻 → 无额外 wall

结果：walls = [ [(2,1),(3,1)], [(2,2),(3,2)] ]   // 共 2 条
```

---

## 4. 模块架构

```
┌────────────────────────────────────────────────────────────────────────┐
│                       LevelController (cc)                             │
│      场景组件 — 解析关卡 JSON → 初始化双网格 + 拖拽交互                   │
├──────────────┬──────────────┬─────────────────┬────────────────────────┤
│ OccupancyGrid│ DualGridMapper│ OccupancyGrid   │ VisualTilemapRenderer  │
│ (逻辑网格)    │ (坐标映射)     │ (表现网格)       │ Sprite 节点网格         │
│ L_cols×L_rows│ 分类/同步/规则  │ V_cols×V_rows   │ setCellTint() ★新增    │
├──────────────┤               ├─────────────────┤                        │
│ BlockManager │               │ AutoTileResolver │                        │
│ (wall 存储)   │               │ mask→tileIndex   │                        │
└──────────────┴───────────────┴─────────────────┴────────────────────────┘
         ↑
┌────────┴────────┐    ┌──────────────────────────────┐
│   LevelLoader   │    │       BlockRegistry ★新增      │
│   LevelTypes    │    │  运行时 block 成员注册表          │
└─────────────────┘    │  moveBlock() / getAllWalls()   │
         ↑             └──────────────────────────────┘
┌─────────────────┐
│  level-001.json │  关卡 JSON 数据文件
└─────────────────┘
```

**关系说明**：

- `LevelLoader` / `LevelTypes`：零 Cocos 依赖，可在 Jest 中直接测试
- `TargetBoxConstraint`：零 Cocos 依赖；负责判定 block 落点与目标盒子的边界关系（完全在内 / 完全在外 / 部分重叠）
- `BlockRegistry`：零 Cocos 依赖；在 `start()` 中与 `LevelLoader` 一同初始化，维护拖拽期间的 block→cell 映射
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
1.  读取 Inspector 绑定的 levelData (JsonAsset)，验证非空
2.  LevelLoader.load(data)                      ← 解析关卡数据
    new BlockRegistry(data)                     ← 初始化运行时 block 注册表
3.  new OccupancyGrid(gridCols, gridRows)        ← 逻辑网格
4.  new OccupancyGrid(vCols, vRows)             ← 表现网格（visualGridSize 计算）
5.  new DualGridMapper(gridCols, gridRows)       ← 坐标映射器
6.  new BlockManager()  +  mapper.setBlockManager ← 墙壁管理器注入
7.  new AutoTileResolver(visualGrid, config)    ← 使用默认 maskTable
8.  new VisualTilemapRenderer(node, ...)        ← 创建 Sprite 节点网格
  new VisualTilemapRenderer(targetLayer, ...) ← 目标盒子渲染（优先使用 targetTileFrames）
9.  调整 node 的 UITransform 尺寸               ← 覆盖完整表现网格
10. buildLogicOverlay()                        ← 逻辑叠加层（默认隐藏）
11. buildWallIndicatorLayer()                  ← 墙壁指示器容器
    buildDragLayers()                          ← dropPreviewLayer（初始隐藏）
12. applyLevelData(loadResult):
    a. logicGrid.setCell(x, y, 1)              ← 所有 occupiedCells
    b. blockManager.addWall(a, b)              ← 所有 walls
    c. addWallIndicator(a, b)                  ← 红色半透明矩形
    d. mapper.syncAll(logicGrid, visualGrid)   ← 全量同步
    （渲染延迟到 update 第 2 帧，等 Cocos 注册动态节点）
13. 注册全局鼠标事件：input.on(MOUSE_DOWN / MOUSE_MOVE / MOUSE_UP)
    （全部走全局 input，避免 node-level 事件吞噬问题）
```

### 6.1 Tile 素材绑定

`LevelController` 支持两套可独立绑定的 16 张 tile 资源：

- `tileFrames`：主地图/Block 的 TileFrames（必填）
- `targetTileFrames`：目标盒子 TileFrames（可选）

若 `targetTileFrames` 未绑定，则目标盒子自动回退使用 `tileFrames`。

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
| **左键按下** block 所在格 | block 进入拖拽状态，实际表现格节点像素级跟随鼠标 |
| **左键移动** | block 的 tile 节点实时跟随光标；在最近有效位置显示绿色预览，无效位置显示红色预览 |
| **左键抬起** | 还原节点原始位置，若找到有效落点则提交移动；否则 block 回原位 |
| **右键点击** V-Edge 区域 | 切换左右两个逻辑格之间的墙壁；同 block 内的墙壁持久存储在 block 数据中，仅在导致不连通时才拆分 block |
| **右键点击** H-Edge 区域 | 切换上下两个逻辑格之间的墙壁；同上 |
| **右键点击** Interior/Corner | 无效果 |

右键 wall 检测逻辑与 `DualGridController` 一致：将鼠标坐标转换为表现格坐标 `(vx, vy)`，通过余数判断区域类型。

**墙壁指示器**：添加墙壁时在对应 edge 位置显示红色半透明矩形；移除墙壁时同步删除指示器节点。拖拽提交后自动重建全部指示器。

**Block 内部墙壁**：右键在同一 block 内部添加墙壁时，墙壁始终存储到 block 的内部墙壁集合（`blockToWalls`），即使不导致分裂也保留。移除墙壁时从集合中删除。`getAllWalls()` 同时返回跨 block 墙壁和 block 内部墙壁。

**Block 分裂**：存储墙壁后自动检测连通性（BFS 考虑该 block 的所有内部墙壁）。若不连通，移除原 block，创建两个新 block（id 格式 `{原id}_s{N}a` / `{原id}_s{N}b`），内部墙壁按归属分配到新 block，跨越分裂边界的墙壁变为跨 block 墙壁（自动推断，不再存储）。

---

## 7. 拖拽功能（Drag & Drop）

### 7.1 数据结构

```ts
interface DragState {
  blockId: string;                          // 被拖拽的 block id
  originalCells: CellCoord[];               // 拖拽开始前的格子快照
  anchorCell: { x: number; y: number };     // 被点击的逻辑格
  startMouseLocal: { x: number; y: number }; // 拖拽开始时的鼠标本地居中坐标
  draggedNodes: { node: Node; origX: number; origY: number }[]; // 表现格节点及原始位置
}
```

`DragState` 仅在左键按下期间存在（`null` 表示无拖拽）。

### 7.2 直接节点移动与预览层

拖拽采用 **直接移动真实表现格节点** 的方案，而非创建额外的 ghost 层。
原因：Cocos 3.8 中动态创建的节点（无论 Sprite 还是 Graphics）在渲染管线中注册时机不确定，可能不可见；而已经存在的 tile 节点在 `VisualTilemapRenderer.cellNodes` 中已完成渲染注册，可保证始终可见。

`buildDragLayers()` 在 `start()` 阶段仅创建一个隐藏子节点：

| 节点 | 描述 |
|---|---|
| `DropPreviewLayer` | 在当前吸附目标位置显示绿色（有效）或红色（无效）矩形 |

**节点收集**（`onMouseDown`）：

```
for cell of block.originalCells:
  for vc of mapper.getAffectedVisualCells(cell.x, cell.y):  // 去重
    node = renderer.getNodeAt(vc.x, vc.y)
    记录 { node, origX: node.position.x, origY: node.position.y }
```

**像素级跟随**（`onMouseMove`）：

```
dx = currentMouse.x − startMouseLocal.x
dy = currentMouse.y − startMouseLocal.y
for each { node, origX, origY }:
  node.setPosition(origX + dx, origY + dy, 0)
```

**释放时还原**（`endDrag`）：所有节点先恢复到 `(origX, origY)` 原始位置，再根据落点判断是否提交移动。

### 7.2.1 事件注册策略

三个鼠标事件全部注册在全局 `input` 上：

```ts
input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
input.on(Input.EventType.MOUSE_UP,   this.onMouseUp,   this);
```

**原因**：若 `MOUSE_DOWN` 注册在 `node.on()` 上，Cocos 3.8 的 `UIInputManager` 会将该节点标记为鼠标事件目标，当鼠标位于节点区域内时会吞噬 `MOUSE_MOVE` 事件，导致全局 `input.on(MOUSE_MOVE)` 回调不触发——拖拽在节点中央区域"卡住"。统一使用全局 `input` 并在 `onMouseDown` 中手动做边界检测可避免此问题。

`onDestroy()` 中清理全部三个全局监听。

### 7.3 落点搜索

`findValidPlacement(cells, snapDx, snapDy)` 以当前吸附格偏移为中心，在 **±2 曼哈顿半径**内搜索最近有效位置：

```
for ddx in [−2..+2], ddy in [−2..+2]，按曼哈顿距离升序排列:
  dx = snapDx + ddx,  dy = snapDy + ddy
  if isPlacementValid(cells, dx, dy):
    return { dx, dy }
return null   ← 无有效位置
```

**有效性判断** (`isPlacementValid`)：

- 所有目标格在网格范围内
- 目标格为空 **或** 属于被拖拽的 block 本身（dx=0/dy=0 原位情形）
- 目标盒子边界约束（`checkTargetBoxConstraint`）：
  - block **完全在某一个目标盒子内** → 有效
  - block **完全在所有目标盒子外** → 有效
  - block 与目标盒子 **部分重叠**（含跨两个盒子）→ 无效

当吸附点本身违反目标盒子边界约束时，`findValidPlacement()` 会继续按曼哈顿距离从近到远搜索，返回最近的其他有效落点；若搜索窗口（±2）内不存在有效位置，则本次拖拽取消并回原位。

### 7.4 提交流程

`commitDrop(state, dx, dy)` 执行以下步骤：

```
1. 从逻辑网格移除原格子（setCell → 0）
2. blockRegistry.moveBlock(blockId, dx, dy)   ← 更新注册表
3. 写入新格子到逻辑网格（setCell → 1）
4. blockManager.clearWalls()
   + blockRegistry.getAllWalls() → blockManager.addWall()  ← 重建 wall
5. mapper.syncAll + renderer.refreshAll       ← 全量重新渲染
6. clearAllWallIndicators() + addWallIndicator ← 重建指示器
```

若找不到有效落点，仅调用 `renderer.refreshAll()` 还原 tint，不修改任何状态。

### 7.5 BlockRegistry

`BlockRegistry` 是零 Cocos 依赖的纯 TS 类，维护运行时的 block 成员关系：

```ts
class BlockRegistry {
  constructor(data: LevelData)                         // 从初始关卡数据构建（读取 block.walls）
  getBlockIdAt(x, y): string | undefined               // 查询格子所属 block
  getBlockCells(blockId): CellCoord[]                  // 查询 block 的全部格子（拷贝）
  getAllBlockIds(): string[]                            // 所有 block id
  getBlockWalls(blockId): [CellCoord, CellCoord][]     // 查询 block 的内部墙壁 ★新增
  moveBlock(blockId, dx, dy): void                     // 更新所有格子坐标 + 内部墙壁坐标
  addBlockWall(a, b): boolean                          // 添加 block 内部墙壁 ★新增
  removeBlockWall(a, b): boolean                       // 移除 block 内部墙壁 ★新增
  trySplitBlock(a, b): [string, string] | null         // 检测并执行 block 分裂（需先 addBlockWall）
  getAllWalls(): [CellCoord, CellCoord][]               // 跨 block 墙壁 + 内部墙壁
}
```

`getAllWalls()` 合并两类墙壁：① 跨 block 边界（四方向邻居扫描推断）②  block 内部墙壁（`blockToWalls` 存储）。两类互不重叠，无需去重。

### 7.6 Block 分裂（trySplitBlock）

调用方需先通过 `addBlockWall(a, b)` 存储墙壁，再调用 `trySplitBlock(a, b)` 检测连通性：

```
1. 验证 a、b 属于同一 block，且 block 至少 2 个格子
2. 获取该 block 的全部内部墙壁（blockToWalls）
3. 在 block 格子集合内做 BFS，从 a 出发，将所有内部墙壁边视为不可通行
4. 若 BFS 覆盖全部格子 → 仍连通，返回 null（墙壁保留在 block 中）
5. 否则拆分：
   a. 将格子分为 groupA（BFS 到达）和 groupB（其余）
   b. 分配内部墙壁：两端点同属 A → wallsA，同属 B → wallsB，跨组 → 丢弃（变为跨 block 墙壁）
   c. 删除原 block（含 blockToWalls 条目）
   d. 创建新 block A（id = "{原id}_s{N}a"）和 B（id = "{原id}_s{N}b"）
   e. 返回 [newIdA, newIdB]
```

**注意**：连通性检测仅在 block 自身的格子集合内进行，不依赖 `OccupancyGrid`。BFS 同时考虑所有已存储的内部墙壁，而非仅新添加的一条。

---

## 8. 场景创建说明（Cocos Creator 编辑器操作）

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

## 9. 新增关卡方法

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
    },
    {
      "id": "block-U",
      "cells": [
        { "x": 2, "y": 2 },
        { "x": 3, "y": 2 },
        { "x": 4, "y": 2 },
        { "x": 2, "y": 3 },
        { "x": 3, "y": 3 },
        { "x": 4, "y": 3 },
        { "x": 2, "y": 4 },
        { "x": 3, "y": 4 },
        { "x": 4, "y": 4 }
      ],
      "walls": [
        [{ "x": 3, "y": 2 }, { "x": 3, "y": 3 }],
        [{ "x": 3, "y": 3 }, { "x": 3, "y": 4 }],
        [{ "x": 2, "y": 3 }, { "x": 3, "y": 3 }],
        [{ "x": 3, "y": 3 }, { "x": 4, "y": 3 }]
      ]
    }
  ]
}
```

### 8.2 切换关卡

在编辑器中将 `LevelRoot` 的 `LevelController.levelData` 改为新 JSON 文件即可。
运行时切换可从外部调用（目前 `LevelController` 不提供运行时 reload API，如需要可扩展）。

---

## 10. 文件清单

### 10.1 新增文件

| 文件 | 路径 | Cocos 依赖 | Jest 可测 | 职责 |
|---|---|---|---|---|
| `LevelTypes.ts` | `assets/scripts/tile-map/` | ❌ | ✅ | `CellCoord`、`BlockData`、`LevelData` 接口 |
| `LevelLoader.ts` | `assets/scripts/tile-map/` | ❌ | ✅ | 解析 `LevelData` → `occupiedCells` + `walls` |
| `BlockRegistry.ts` | `assets/scripts/tile-map/` | ❌ | ✅ | 运行时 block 成员 + 内部墙壁注册表 |
| `LevelController.ts` | `assets/scripts/level/` | ✅ | ❌ | 场景组件，驱动双网格 + 拖拽交互 |
| `LevelLoader.test.ts` | `tests/tile-map/` | ❌ | ✅ | 14 个测试用例 |
| `BlockRegistry.test.ts` | `tests/tile-map/` | ❌ | ✅ | 42 个测试用例 |
| `level-001.json` | `assets/data/` | — | — | 示例关卡数据 |
| `level.md` | `docs/` | — | — | 本文档 |

### 10.2 修改文件

| 文件 | 修改内容 |
|---|---|
| `assets/scripts/tile-map/index.ts` | 新增 `LevelTypes`、`LevelLoader`、`BlockRegistry` 导出 |
| `assets/scripts/tile-map/VisualTilemapRenderer.ts` | 新增 `setCellTint(vx, vy, color)` 着色方法 + `getNodeAt(vx, vy)` 节点访问器，供拖拽直接移动表现格节点 |

### 10.3 不修改的文件

所有其他现有模块（`OccupancyGrid`、`DualGridMapper`、`BlockManager`、`DualGridController`、`AutoTileResolver`、`TileMapConfig`、`ConnectedRegion`）均不修改。

---

## 11. 测试用例一览

### 11.1 LevelLoader（14 cases）

| 测试组 | 用例数 | 覆盖内容 |
|---|---|---|
| **基础解析** | 4 | 空关卡无格、单格无 wall、单 block 内部无 wall、gridCols/gridRows 保留 |
| **Wall 推断** | 7 | 水平/垂直相邻跨 block → wall、不相邻/对角/同 block → 无 wall、去重、多 block 多 wall |
| **level-001 完整场景** | 3 | 占用格收录、跨 block 边界 wall |

### 11.2 BlockRegistry（42 cases）

| 测试组 | 用例数 | 覆盖内容 |
|---|---|---|
| **查询** | 5 | `getBlockIdAt`、`getBlockCells`（拷贝隔离）、`getAllBlockIds`、空格返回 undefined |
| **moveBlock** | 7 | 正向平移、原地 dx=dy=0、负向平移、多 block 互不影响、平移后 `getBlockIdAt` 正确 |
| **getAllWalls** | 7 | 无 wall、单 wall、多 wall、平移后 wall 变化、平移后原 wall 消失 |
| **trySplitBlock** | 10 | 仍连通不分裂（需 addBlockWall）、切断分裂、分裂后 getBlockIdAt 更新、分裂后 getAllWalls 产生新墙壁、不同 block/空格返回 null、单格不可分裂、2×2 仍连通、I 形切中间、连续分裂 |
| **Block internal walls** | 13 | addBlockWall 同/异 block、重复、removeBlockWall、getBlockWalls、getAllWalls 含内部墙壁、不分裂时保留、moveBlock 同步移动、JSON walls 初始化、分裂后墙壁分配、多墙壁不分裂 |
| **splitDisconnectedBlock** | 5 | 仍连通返回 null、单格返回 null、不存在 blockId 返回 null、2-way 分裂、3-way 分裂、分裂后墙壁分配 |

运行命令：`npm test`（全部 **155** 用例通过）

---

## 12. 刀具系统（Knife）

### 12.1 概述

刀具是一种可在关卡中拖拽放置、用于分割 block 的工具。

- 定义在关卡 JSON 的 `knives` 数组中
- 方向（`orientation`）在关卡数据中固定，不可旋转
- 拖拽移动后松开自动吸附到最近的逻辑格边界
- 调用 `useKnife(id)` 沿覆盖的边添加墙壁并分裂 block
- 使用后刀具留在原位，可重复使用
- 一个关卡可包含多把刀具

### 12.2 数据格式

```ts
interface KnifeData {
  id: string;               // 唯一标识符
  orientation: 'h' | 'v';   // 方向
  length: number;            // 长度（逻辑格边数）
  edge: number;              // 边界索引
  start: number;             // 起始行/列
}
```

`edge` 和 `start` 的含义：

| orientation | edge | start | 覆盖的边对 |
|---|---|---|---|
| `'v'` | 列边界 [1, gridCols-1] | 起始行 | (edge-1, start+i) ↔ (edge, start+i)，i ∈ [0, length) |
| `'h'` | 行边界 [1, gridRows-1] | 起始列 | (start+i, edge-1) ↔ (start+i, edge)，i ∈ [0, length) |

### 12.3 示例

```json
{
  "knives": [
    {
      "id": "knife-1",
      "orientation": "v",
      "length": 2,
      "edge": 5,
      "start": 5
    }
  ]
}
```

表示一把竖直刀具，长度为 2，位于第 5 列边界（列 4 和列 5 之间），覆盖行 5 和行 6。

### 12.4 相关文件

| 文件 | 说明 |
|---|---|
| `tile-map/KnifeEdges.ts` | 纯函数：边计算、位置吸附、位置验证 |
| `tile-map/LevelTypes.ts` | `KnifeData` 类型定义 |
| `tile-map/LevelLoader.ts` | 刀具数据解析 |
| `tile-map/BlockRegistry.ts` | `splitDisconnectedBlock()` N-way 通用分裂 |
| `level/LevelController.ts` | 刀具渲染、拖拽、`useKnife()` |

### 12.5 API

```ts
// LevelController 公开方法
useKnife(knifeId: string): boolean
```

返回 `true` 表示有 block 被分裂。

---

## 13. 验收检查清单

| # | 检查项 | 验证方式 | 状态 |
|---|---|---|---|
| 1 | 单元测试全部通过 | `npm test` — 155 用例 | ✅ |
| 2 | level.scene 正常加载 level-001.json | 在 Cocos Creator 运行场景 | ⬜ |
| 3 | block-A 格子正确渲染：(1,1)(2,1)(1,2)(2,2) | 场景运行 + 观察 | ⬜ |
| 4 | block-B 格子正确渲染：(3,1)(3,2)(4,2) | 场景运行 + 观察 | ⬜ |
| 5 | block-A 与 block-B 之间有 2 条红色 wall 指示器 | 检查 (2,1)↔(3,1) 和 (2,2)↔(3,2) | ⬜ |
| 6 | block 内部无 wall 指示器 | block-A 内部边界无红色条 | ⬜ |
| 7 | 逻辑叠加层切换正常 | `toggleLogicOverlay()` 按钮 | ⬜ |
| 8 | 左键拖拽 block，表现格像素级跟随鼠标 | 场景运行 + 操作 | ✅ |
| 9 | 拖拽时预览层显示绿色（有效）/ 红色（无效）矩形 | 移入空格 vs 移出边界观察 | ⬜ |
| 10 | 松开鼠标 → block 吸附到最近有效格 | 在有效位置松开观察 | ⬜ |
| 11 | 无有效落点 → block 回到原位 | 拖入角落无空间处松开 | ⬜ |
| 12 | 移动后 wall 指示器自动重建 | 拖拽后观察新旧边界 | ⬜ |
| 13 | 右键 edge 仍可切换墙壁（拖拽时不触发） | 分别测试两种操作 | ⬜ |
| 14 | 右键同 block 内部 edge 添加墙壁 → 墙壁存储在 block 中；不连通时分裂 | 场景运行 + 观察 wall 指示器变化 | ⬜ |
| 15 | 现有场景（dualGridTest、tiledMapTest）不受影响 | 分别运行旧场景 | ⬜ |

---

## 9. 多关卡加载

### 9.1 概述

支持多关卡动态加载：关卡选择场景（`levelSelect.scene`）以 **2×3 网格**分页展示关卡列表，前后翻页浏览。点击关卡项选中后点"开始"进入游戏场景并加载对应关卡数据。每个关卡项显示**编号 + 名称**。

### 9.2 目录结构

```
assets/
  resources/
    levels/
      manifest.json        # 关卡列表元数据
      level-001.json       # 关卡 1 数据
      level-002.json       # 关卡 2 数据
      ...
  scripts/
    level/
      LevelConfig.ts       # 跨场景静态状态（选中关卡路径 + manifest 缓存）
      LevelSelectController.ts  # levelSelect 场景主控
      LevelController.ts   # level 场景主控（已支持动态加载）
```

### 9.3 manifest.json 格式

```json
{
  "levels": [
    { "id": "001", "name": "关卡 1", "path": "levels/level-001" },
    { "id": "002", "name": "关卡 2", "path": "levels/level-002" }
  ]
}
```

- `path` 为 `resources/` 下的相对路径（不含扩展名），供 `resources.load()` 使用。
- 新增关卡时只需添加 JSON 文件并在 manifest 中追加条目。

### 9.4 跨场景状态传递

`LevelConfig` 采用静态属性在场景之间传递数据：

| 属性 | 类型 | 说明 |
|------|------|------|
| `currentLevelPath` | `string \| null` | 选中关卡的 resources 路径；null 时回退到 Inspector 绑定 |
| `manifest` | `LevelMeta[]` | 缓存的关卡列表，避免重复加载 |

### 9.5 场景流程

```
levelSelect.scene                     level.scene
┌─────────────────────┐              ┌──────────────────────────────┐
│ LevelSelectController│  ──Start──▶ │ LevelController              │
│                     │              │                              │
│ 加载 manifest.json   │              │ if LevelConfig.currentLevel  │
│ 2×3 网格分页展示关卡   │              │   → resources.load()         │
│ 前后翻页浏览           │              │ else                         │
│                     │              │   → Inspector fallback       │
│ 点击关卡项 → 选中高亮  │              │                              │
│ 点击"开始" → 设置      │              │                              │
│   LevelConfig.path   │              │                              │
│ director.loadScene   │  ◀──Back──  │ goBack()                      │
│   ('level')          │              │   director.loadScene          │
└─────────────────────┘              │     ('levelSelect')           │
                                     └──────────────────────────────┘
```

### 9.6 分页参数

| 参数 | 值 | 说明 |
|------|---|------|
| `PAGE_COLS` | 2 | 每页列数 |
| `PAGE_ROWS` | 3 | 每页行数 |
| `PER_PAGE` | 6 | 每页最多关卡数 |
| `GAP` | 12 px | 关卡项之间的间距 |
| 关卡项尺寸 | 动态计算 | 根据 `levelGrid` 节点的 UITransform 宽高和列/行数推算 |
| 最后一页 | 可能不满 6 项 | 正常显示，空位留白 |

关卡项显示内容：`{id}  {name}`（如 "001  关卡 1"），`fontSize=22`。
选中态背景色 `(50, 180, 80, 220)`，默认态 `(80, 80, 80, 200)`。

### 9.7 新增关卡步骤

1. 在 `assets/resources/levels/` 下新建 `level-XXX.json`，格式同 §2
2. 在 `manifest.json` 的 `levels` 数组中追加条目
3. 在 Cocos Creator 中刷新资源面板

### 9.8 levelSelect 场景搭建（Cocos Creator 编辑器）

1. 新建场景 `levelSelect.scene`
2. 创建空节点，挂载 `LevelSelectController` 脚本组件
3. 创建关卡容器节点 `LevelGrid`，设置 `UITransform` 宽高（如 400×480），绑定到 `levelGrid` 属性
4. 添加 Label 节点绑定 `pageLabel`（页码，如 "1 / 3"）
5. 添加 Label 节点绑定 `selectedLabel`（当前选中关卡名称）
6. 添加 3 个 Button 节点：上一页、下一页、开始
7. 各 Button 的 Click Events 绑定到 `onClickPrev`、`onClickNext`、`onClickStart`
8. （可选）在 level.scene 中添加"返回"按钮绑定 `LevelController.goBack()`
