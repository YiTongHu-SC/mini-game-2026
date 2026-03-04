# HelloCocos

[![Lint & Format Check](https://github.com/YiTongHu-SC/HelloCocos/actions/workflows/lint.yml/badge.svg)](https://github.com/YiTongHu-SC/HelloCocos/actions/workflows/lint.yml)

基于 **Cocos Creator 3.8.8** 的 TypeScript 项目，集成了 ESLint + Prettier 代码规范工具链，可作为 **GitHub 模板** 快速创建新项目。

---

## 环境要求

| 工具 | 版本 |
|---|---|
| [Cocos Creator](https://www.cocos.com/creator) | 3.8.8 |
| Node.js | ≥ 18 |
| npm | ≥ 9 |

---

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 用 Cocos Creator 打开项目

在 Cocos Creator Dashboard 中选择 **打开项目**，选中本目录即可。

---

## 项目结构

```
HelloCocos/
├── assets/              # 游戏资源与脚本（源码目录）
│   └── scripts/         # TypeScript 脚本
├── docs/                # 项目文档
│   ├── lint-and-format.md  # ESLint + Prettier 配置说明
│   └── ad-test-scene.md    # 抖音广告回调测试场景说明
├── library/             # Cocos 编译缓存（自动生成，勿提交）
├── temp/                # 临时文件（自动生成，勿提交）
├── profiles/            # 编辑器配置
├── settings/            # 项目设置
├── .vscode/
│   ├── settings.json    # 编辑器集成：保存时自动格式化 + ESLint fix
│   └── extensions.json  # 推荐安装的 VS Code 扩展
├── eslint.config.mjs    # ESLint flat config
├── .prettierrc          # Prettier 格式规则
├── .prettierignore      # Prettier 排除目录
├── tsconfig.json        # TypeScript 配置
└── package.json
```

---

## 代码规范

项目使用 **ESLint v10 + Prettier v3** 进行代码质量检查和格式统一。

```bash
# 检查代码质量
npm run lint

# 自动修复（含格式）
npm run lint:fix

# 格式化所有源文件
npm run format

# CI 格式一致性检查
npm run format:check
```

详细规则说明见 [docs/lint-and-format.md](docs/lint-and-format.md)。

---

## 文档

| 文档 | 说明 |
|---|---|
| [docs/lint-and-format.md](docs/lint-and-format.md) | ESLint + Prettier 配置与使用说明 |
| [docs/ad-test-scene.md](docs/ad-test-scene.md) | 抖音激励视频 & 插屏广告回调测试场景搭建指南 |
| [docs/ad-douyin-devtools.md](docs/ad-douyin-devtools.md) | 发布字节跳动小游戏包并在抖音开发者工具中验证广告回调 |

### VS Code 推荐扩展

打开项目后 VS Code 会自动提示安装：

- **Prettier - Code formatter** (`esbenp.prettier-vscode`) — 保存时自动格式化
- **ESLint** (`dbaeumer.vscode-eslint`) — 实时显示 lint 警告，保存时自动修复

---

## 开发规范摘要

- 源码统一放在 `assets/` 目录下
- TypeScript 严格模式暂未开启（`"strict": false`），可按需在 `tsconfig.json` 中启用
- 换行符统一使用 **LF**（`.prettierrc` 中 `"endOfLine": "lf"`）
- 提交前建议执行 `npm run lint:fix` 确保无格式问题

---

## 使用此模板创建新项目

### 方式一：GitHub 网页（推荐）

1. 进入 [YiTongHu-SC/HelloCocos](https://github.com/YiTongHu-SC/HelloCocos)
2. 点击右上角绿色 **Use this template → Create a new repository**
3. 填写新仓库名称，选择可见性，点击 **Create repository**
4. 将新仓库 clone 到本地

### 方式二：GitHub CLI

```bash
gh repo create <新项目名> --template YiTongHu-SC/HelloCocos --clone
```

### 创建后的必要修改

```bash
# 1. 安装依赖
npm install

# 2. 修改 package.json 中的项目名称
# 将 "name": "HelloCocos" 改为你的项目名

# 3. 用 Cocos Creator 打开项目，引擎会自动重新生成 library/ 和 temp/
```

> **注意**：`library/`、`temp/` 目录不随模板分发（已在 `.gitignore` 中排除），用 Cocos Creator 首次打开后会自动生成。
