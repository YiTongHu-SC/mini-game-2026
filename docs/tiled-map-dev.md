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
│ dirty 跟踪   │ 8-bit 邻域查表     │ 全量/局部刷新      │
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

### 3.1 Bit 顺序（固定约定，顺时针从上方开始）

| Bit | 方向 | 值 |
|---|---|---|
| bit0 | T（上） | 1 |
| bit1 | TR（右上） | 2 |
| bit2 | R（右） | 4 |
| bit3 | BR（右下） | 8 |
| bit4 | B（下） | 16 |
| bit5 | BL（左下） | 32 |
| bit6 | L（左） | 64 |
| bit7 | TL（左上） | 128 |

### 3.2 Tile 索引对照表（16 种 canonical pattern）

8-bit raw mask（256 种组合）通过**对角线遮罩 + 查表映射**归约到 16 种 tile pattern。
对角线遮罩规则：对角位仅在两个相邻基数方向均 occupied 时才生效。

| Tile | Canonical Mask | 含义 | 3×3 pattern |
|------|---------------|------|------------|
| 0 | 0 | 孤立格 | 全空 |
| 1 | 255 | 内部（全填充） | 全满 |
| 2 | 124 | 上边 | 缺 T |
| 3 | 31 | 左边 | 缺 L |
| 4 | 199 | 下边 | 缺 B |
| 5 | 241 | 右边 | 缺 R |
| 6 | 127 | 内凹角 TL | 缺 TL 对角 |
| 7 | 223 | 内凹角 BL | 缺 BL 对角 |
| 8 | 247 | 内凹角 BR | 缺 BR 对角 |
| 9 | 253 | 内凹角 TR | 缺 TR 对角 |
| 10 | 28 | 外凸角 BR | 仅 R+BR+B |
| 11 | 7 | 外凸角 TR | 仅 T+TR+R |
| 12 | 193 | 外凸角 TL | 仅 L+TL+T |
| 13 | 112 | 外凸角 BL | 仅 B+BL+L |
| 14 | 119 | 双内凹 TL+BR | 缺 TL 和 BR |
| 15 | 221 | 双内凹 TR+BL | 缺 TR 和 BL |

使用 **256 → 16 查表映射**：`TileMapConfig.maskTable` 由 `createDefaultMaskTable()` 自动生成。
详细 pattern 定义见 `docs/bit_mask.md`。

### 3.3 占位图集说明

- 尺寸：640 × 40 px（16 个 40×40 tile 横排）
- 用色约定：
  - 灰色 `#888` 填充 = 占用区域
  - 3×3 点阵显示邻域 pattern：
    - **绿色点** = 该方向有相邻格子（occupied）
    - **红色点** = 该方向无相邻格子（empty）
    - **白色点** = 中心格（self）
  - 白色数字 = tile 索引
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
| `OccupancyGrid.test.ts` | 11 | 读写、越界、dirty 跟踪（8 邻域）、批量操作 |
| `AutoTileResolver.test.ts` | 25+ | 16 种 canonical pattern、对角线遮罩、fallback、自定义映射、批量解析、边界处理 |
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
   - `tileFrames`: 将 16 张独立 SpriteFrame 按顺序拖入（共 16 项，见下方步骤）

#### 准备 16 张 SpriteFrame

> **说明**：Cocos Creator 3.x 的 Sprite Editor 只能编辑九宫格边距，**没有**多帧 Auto Slice 功能。
> 正确做法是使用生成脚本输出的 **16 张独立 PNG**，每张对应一个 mask。

```bash
node tools/generate-tileset.mjs
```

脚本同时输出：

- `assets/textures/tileset-placeholder.png` — 完整 640×40 图条（备用）
- `assets/textures/tileset-tiles/tile-00.png` … `tile-15.png` — **16 张独立 40×40 PNG**

在 Cocos Creator Assets 面板中打开 `assets/textures/tileset-tiles/` 目录，将 `tile-00` ~ `tile-15` **按顺序**拖入 `TiledMapController` 组件的 `tileFrames` 数组（共 16 项，Index 0 = tile-00，Index 15 = tile-15）。

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
