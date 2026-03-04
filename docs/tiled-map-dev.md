# TileMap 开发与测试指南

本文档描述 Dual-layer Auto-tiling TileMap 系统的实现细节、文件结构、测试方法和操作步骤。

---

## 1. 架构概览

```
┌──────────────────────────────────────────────────────┐
│               TiledMapController (cc)                │
│       场景组件 — 胶水层，连接逻辑与视觉              │
├──────────────┬───────────────────┬────────────────────┤
│ OccupancyGrid│ AutoTileResolver  │ VisualTilemap-     │
│ (逻辑层)     │ (规则解析器)       │ Renderer (渲染器)  │
│ 0/1 二值网格  │ mask→tileIndex    │ Sprite 节点网格    │
│ dirty 跟踪   │ 4-bit 邻域查表     │ 全量/局部刷新      │
├──────────────┼───────────────────┤                    │
│ Connected-   │ TileMapConfig     │                    │
│ Region (BFS) │ bit 序/映射表      │                    │
└──────────────┴───────────────────┴────────────────────┘
```

### 模块依赖关系

| 模块 | Cocos 依赖? | 可 Jest 测试? |
|---|---|---|
| `OccupancyGrid` | ❌ | ✅ |
| `TileMapConfig` | ❌ | ✅ |
| `AutoTileResolver` | ❌ | ✅ |
| `ConnectedRegion` | ❌ | ✅ |
| `VisualTilemapRenderer` | ✅ (cc.Node, Sprite) | ❌ (需编辑器) |
| `TiledMapController` | ✅ (Component) | ❌ (需编辑器) |

---

## 2. 文件结构

```
assets/scripts/tile-map/
├── index.ts                    # barrel export
├── OccupancyGrid.ts            # Layer A — 逻辑网格
├── TileMapConfig.ts            # bit 定义 + mask→tile 映射表
├── AutoTileResolver.ts         # 4-bit mask 计算 + 查表
├── ConnectedRegion.ts          # BFS 4-连通区域查询
├── VisualTilemapRenderer.ts    # Sprite 节点网格渲染
├── TiledMapController.ts       # 场景挂载 @ccclass 组件
└── __tests__/
    ├── OccupancyGrid.test.ts
    ├── AutoTileResolver.test.ts
    └── ConnectedRegion.test.ts

assets/textures/
└── tileset-placeholder.png     # 640×40 占位图集 (16×40px tiles)

tools/
└── generate-tileset.mjs        # 占位图集生成脚本
```

---

## 3. Tileset 规范

### 3.1 Bit 顺序（固定约定）

| Bit | 方向 | 值 |
|---|---|---|
| bit0 | Up（上） | 1 |
| bit1 | Right（右） | 2 |
| bit2 | Down（下） | 4 |
| bit3 | Left（左） | 8 |

### 3.2 Mask → Tile 索引对照表

| Mask | 二进制 | 含义 | 默认 tileIndex |
|---|---|---|---|
| 0 | 0000 | 孤立格 | 0 |
| 1 | 0001 | 仅上方有邻 | 1 |
| 2 | 0010 | 仅右方有邻 | 2 |
| 3 | 0011 | 上+右 | 3 |
| 4 | 0100 | 仅下方有邻 | 4 |
| 5 | 0101 | 上+下（竖直通道） | 5 |
| 6 | 0110 | 右+下 | 6 |
| 7 | 0111 | 上+右+下 | 7 |
| 8 | 1000 | 仅左方有邻 | 8 |
| 9 | 1001 | 上+左 | 9 |
| 10 | 1010 | 右+左（水平通道） | 10 |
| 11 | 1011 | 上+右+左 | 11 |
| 12 | 1100 | 下+左 | 12 |
| 13 | 1101 | 上+下+左 | 13 |
| 14 | 1110 | 右+下+左 | 14 |
| 15 | 1111 | 四面全有（内部） | 15 |

默认使用 **恒等映射** (`tileIndex = mask`)。可通过 `TileMapConfig.maskTable` 自定义映射以适配不同美术排列。

### 3.3 占位图集说明

- 尺寸：640 × 40 px（16 个 40×40 tile 横排）
- 用色约定：
  - 灰色 `#888` 填充 = 占用区域
  - **绿色边** = 该方向有相邻格子（connected）
  - **红色边** = 该方向无相邻格子（open/border）
  - 白色数字 = mask 值
- 重新生成：`node tools/generate-tileset.mjs`

---

## 4. 运行测试

### 4.1 Jest 单元测试（逻辑层）

```bash
# 运行全部测试
npm test

# 运行单个测试文件
npx jest --config jest.config.mjs assets/scripts/tile-map/__tests__/OccupancyGrid.test.ts

# 带覆盖率
npx jest --config jest.config.mjs --coverage
```

**当前测试清单（34 cases）：**

| 测试文件 | 用例数 | 覆盖内容 |
|---|---|---|
| `OccupancyGrid.test.ts` | 11 | 读写、越界、dirty 跟踪、批量操作 |
| `AutoTileResolver.test.ts` | 12 | 16 种 mask 全覆盖、自定义映射、批量解析、边界处理 |
| `ConnectedRegion.test.ts` | 11 | 孤立、线、L 形、T 形、十字、断连、对角不连通、全局查找 |

### 4.2 编辑器内可视化测试（渲染层）

#### 创建测试场景（首次需在 Cocos Creator 中操作）

1. 打开 Cocos Creator → File → New Scene → 保存为 `assets/scenes/tiledMapTest.scene`
2. 在 Canvas 下创建空节点 `TileMapRoot`
3. 给 `TileMapRoot` 添加 `UITransform` 组件（宽高自动）
4. 给 `TileMapRoot` 添加 `TiledMapController` 脚本组件
5. 配置属性：
   - `cols`: 14（推荐 ≥ 14 以容纳 16-mask 预览的 4×4 布局）
   - `rows`: 14
   - `tileSize`: 40
   - `showDebugMask`: ✅
   - `tileFrames`: 将占位图集切片后拖入（共 16 个 SpriteFrame）

#### 切片占位图集

1. 在 Cocos Creator 资源管理器中选中 `assets/textures/tileset-placeholder.png`
2. 在 Inspector 面板将 `Type` 改为 `Sprite Frame`
3. 点击 **Edit** 打开 Sprite Editor
4. 如果你想自动切片：设为 `Sliced` → `Grid` → cell size 40×40
5. 或者在代码中直接用 `SpriteAtlas`

> **提示**：如果不方便手动切片，也可以用 16 张独立的 40×40 PNG。运行 `node tools/generate-tileset.mjs` 后手动切分，或修改脚本生成 16 个独立文件。

#### 运行验证

| 验证项 | 操作 | 预期结果 |
|---|---|---|
| 初始形状渲染 | 运行场景 | 看到一个 8×8 空心矩形，中央有十字形缺口 |
| 边界 tile 正确 | 观察边缘格子的 debug mask | 边角 = 3/6/9/12，直边 = 5/10 等 |
| 点击切换格子 | 点击已占据格子 | 该格变空，周围 4 格 tile 更新 |
| 点击添加格子 | 点击空白格子 | 该格变已占据，周围 4 格 tile 更新 |
| 16-mask 预览 | 调用 `runMaskPreview()` | 4×4 排列显示所有 16 种 mask |
| 清空 | 调用 `clearGrid()` | 全部格子变空 |

#### 添加 UI 按钮（可选）

在场景中创建 3 个按钮节点，绑定 `TiledMapController` 方法：

| 按钮文字 | 绑定方法 |
|---|---|
| "Preview 16" | `runMaskPreview()` |
| "Clear" | `clearGrid()` |
| "Toggle Mask" | `toggleDebugMask()` |

---

## 5. MVP 验收检查清单

参照 `docs/tiled-map.md` 第 7 节：

| # | 检查项 | 验证方式 | 状态 |
|---|---|---|---|
| 1 | 从关卡数据生成任意形状区域并正确渲染 | 场景运行 → 观察 hollow rect | ⬜ |
| 2 | 单格 add/remove → 视觉只局部更新且边界正确 | 点击操作 + debug mask | ⬜ |
| 3 | 大块填充（内部+外边界） | hollow rect 测试图案 | ⬜ |
| 4 | 细长通路（直线、拐角、T 字、十字） | 手动画/mask preview | ⬜ |
| 5 | 连通块查询正确（4-连通） | Jest ConnectedRegion tests all pass | ✅ |
| 6 | 16 种 mask 全覆盖 | Jest AutoTileResolver 16-case test | ✅ |
| 7 | dirty 局部更新机制 | Jest OccupancyGrid dirty tests | ✅ |

---

## 6. 后续扩展路径

按 `docs/tiled-map.md` 第 8 节：

- **Overlay 层**：第三层处理内凹角/装饰角
- **多地形**：每种地形一套 `maskTable`（草地/道路/水域）
- **批量编辑**：笔刷、矩形填充、洪泛填充 + 合并 dirty 刷新
- **换 tileset**：运行时调用 `resolver.setConfig(newConfig)` + `renderer.refreshAll()`
