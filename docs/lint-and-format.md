# ESLint + Prettier 配置说明

本项目使用 **ESLint v10**（flat config）+ **Prettier v3** 进行代码规范检查与格式化，两者通过 `eslint-config-prettier` 和 `eslint-plugin-prettier` 集成，避免规则冲突。

---

## 依赖说明

| 包 | 版本 | 用途 |
|---|---|---|
| `eslint` | ^10 | Lint 引擎（flat config 格式） |
| `typescript-eslint` | ^8 | 统一入口，提供 TS 解析器 + 推荐规则集 |
| `@typescript-eslint/parser` | ^8 | 将 TypeScript 语法解析为 ESLint 可读的 AST |
| `@typescript-eslint/eslint-plugin` | ^8 | TypeScript 专用 lint 规则 |
| `prettier` | ^3 | 代码格式化工具 |
| `eslint-config-prettier` | ^10 | 关闭与 Prettier 冲突的所有 ESLint 格式规则 |
| `eslint-plugin-prettier` | ^5 | 把 Prettier 格式差异作为 ESLint 警告暴露出来 |

---

## 配置文件速览

### `eslint.config.mjs` — ESLint 规则

```js
// 忽略目录：temp/ library/ local/ build/ profiles/ settings/ node_modules/
// 启用：typescript-eslint 推荐规则集
// 禁用：所有与 Prettier 冲突的格式规则（eslint-config-prettier）
// 规则：
//   prettier/prettier              → warn（格式问题）
//   @typescript-eslint/no-explicit-any    → warn
//   @typescript-eslint/no-unused-vars     → warn（以 _ 开头的参数忽略）
//   @typescript-eslint/no-non-null-assertion → warn
//   @typescript-eslint/explicit-function-return-type → off
```

### `.prettierrc` — 格式规则

| 配置项 | 值 | 说明 |
|---|---|---|
| `printWidth` | 100 | 每行最大字符数 |
| `tabWidth` | 2 | 缩进空格数 |
| `useTabs` | false | 使用空格缩进 |
| `semi` | true | 语句末尾加分号 |
| `singleQuote` | true | 使用单引号 |
| `quoteProps` | `"as-needed"` | 对象 key 仅在必要时加引号 |
| `trailingComma` | `"all"` | 多行结构末尾加逗号 |
| `bracketSpacing` | true | 对象花括号内加空格 `{ a: 1 }` |
| `arrowParens` | `"avoid"` | 单参箭头函数省略括号 `x => x` |
| `endOfLine` | `"lf"` | 统一使用 LF 换行符（跨平台一致） |

### `.prettierignore` — Prettier 排除目录

```
temp/  library/  local/  build/  profiles/  settings/  node_modules/
```

---

## 常用命令

```bash
# 检查代码质量（只读，不修改）
npm run lint

# 自动修复可修复的问题（含 Prettier 格式）
npm run lint:fix

# 用 Prettier 直接重新格式化所有源文件
npm run format

# CI 专用：检查格式是否与 Prettier 一致，不一致则退出码非 0
npm run format:check
```

---

## VS Code 编辑器集成

配置位于 `.vscode/settings.json`，已实现：

- **保存时自动格式化**：使用 Prettier (`esbenp.prettier-vscode`) 作为 TS/JS 的默认格式化器
- **保存时自动修复 ESLint**：`"source.fixAll.eslint": "explicit"`
- **关闭内置 TS 格式化**：防止与 Prettier 冲突交替修改文件

推荐安装的扩展（见 `.vscode/extensions.json`）：

- `esbenp.prettier-vscode`
- `dbaeumer.vscode-eslint`

---

## 规则分工说明

```
代码质量问题  →  ESLint（@typescript-eslint/* 规则）负责报告
代码格式问题  →  Prettier 负责决定，ESLint 通过 prettier/prettier 规则透传
格式规则冲突  →  eslint-config-prettier 将 ESLint 的格式规则全部关闭，Prettier 优先
```

这样保证格式始终由 Prettier 一方决定，不会出现 ESLint 和 Prettier "来回改格式" 的问题。
