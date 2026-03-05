# 工具脚本说明

本项目在 `tools/` 目录下提供了若干辅助脚本，均使用 **Node.js 内置模块**，无需安装额外依赖即可运行。

---

## 目录

| 脚本 | 用途 |
|---|---|
| `generate-tileset.mjs` | 生成占位 tileset PNG（16 格方向遮罩图） |
| `split-image.mjs` | PNG 切图工具，将大图按网格分割为多张子图 |

---

## generate-tileset.mjs

生成一张 640×40 的占位 tileset PNG（16 个 40×40 的 tile），同时导出 16 张独立的 tile 小图。每个 tile 代表一个 4-bit 邻域遮罩（上、右、下、左），用颜色标识连通方向。

### 用法

```bash
node tools/generate-tileset.mjs
```

### 输出

| 文件 | 说明 |
|---|---|
| `assets/textures/tileset-placeholder.png` | 完整的 16-tile 长条图(640×40) |
| `assets/textures/tileset-tiles/tile-00.png` ~ `tile-15.png` | 独立的单 tile 图片(40×40) |

### 视觉规则

- 灰色 (`#888`) 填充表示被占用区域
- 绿色 (`#4a4`) 边框表示该方向有邻居（connected）
- 红色 (`#a44`) 边框表示该方向无邻居（open）
- 白色数字标注遮罩编号

### Mask 编码

| bit | 方向 | 数值 |
|---|---|---|
| bit0 | 上 (Up) | 1 |
| bit1 | 右 (Right) | 2 |
| bit2 | 下 (Down) | 4 |
| bit3 | 左 (Left) | 8 |

---

## split-image.mjs

PNG 图片切图工具。可以将任意 PNG 大图按网格自动分割为多张子图。支持以下配置方式：

- **按行列数** 切割（`--rows` / `--cols`）
- **按子图像素尺寸** 切割（`--width` / `--height`）
- **混合配置**（如 `--cols 4 --height 64`，另一维度自动计算）

### 用法

```bash
# 按行列数切割（4×4 = 16 张子图）
node tools/split-image.mjs -i input.png --rows 4 --cols 4

# 按子图像素尺寸切割
node tools/split-image.mjs -i input.png --width 64 --height 64

# 混合模式：指定列数 + 子图高度
node tools/split-image.mjs -i input.png --cols 4 --height 64

# 自定义输出目录
node tools/split-image.mjs -i input.png --rows 2 --cols 3 -o ./out

# 自定义文件名前缀
node tools/split-image.mjs -i input.png --rows 2 --cols 4 --prefix sprite
```

### 参数

| 参数 | 缩写 | 必填 | 说明 |
|---|---|---|---|
| `--input` | `-i` | ✅ | 输入 PNG 文件路径 |
| `--output` | `-o` | | 输出目录（默认：`<输入文件名>_split`） |
| `--rows` | | ⚡ | 行数（与 `--height` 至少指定一个） |
| `--cols` | | ⚡ | 列数（与 `--width` 至少指定一个） |
| `--width` | | ⚡ | 子图宽度（像素） |
| `--height` | | ⚡ | 子图高度（像素） |
| `--prefix` | | | 输出文件名前缀（默认：`tile`） |
| `--help` | `-h` | | 显示帮助信息 |

> ⚡ 行方向需指定 `--rows` 或 `--height` 中至少一个；列方向需指定 `--cols` 或 `--width` 中至少一个。两者同时指定时以显式值为准。

### 输出文件命名

文件按 `{prefix}_r{行号}_c{列号}.png` 格式命名，行列号从 0 开始并自动补零：

```
tile_r0_c0.png
tile_r0_c1.png
tile_r0_c2.png
tile_r1_c0.png
...
```

### 边缘处理

当图片尺寸不能被 tile 尺寸整除时，最后一行/列的子图会按实际剩余像素裁切输出（不会拉伸或填充）。

### 支持的 PNG 格式

| 颜色类型 | 说明 |
|---|---|
| RGB (type 2) | 24-bit 彩色 |
| RGBA (type 6) | 32-bit 带透明通道 |
| Greyscale (type 0) | 8-bit 灰度 |
| Grey + Alpha (type 4) | 16-bit 灰度+透明 |
| Indexed (type 3) | 调色板索引色 |

> 注：仅支持 bit depth 为 8 的 PNG。

### 示例

将一张 256×256 的 spritesheet 切成 4×4 网格：

```bash
node tools/split-image.mjs -i assets/textures/spritesheet.png --rows 4 --cols 4
```

输出到 `assets/textures/spritesheet_split/` 目录下，生成 16 张 64×64 的子图。
