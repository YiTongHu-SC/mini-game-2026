# 抖音广告回调测试：发布与验证流程

本文档说明如何将项目构建为字节跳动小游戏包，导入抖音开发者工具（Douyin DevTools），并验证激励视频广告和插屏广告的回调功能。

> 场景搭建方法见 [ad-test-scene.md](ad-test-scene.md)

---

## 前置条件

| 工具 / 资源 | 要求 |
|---|---|
| Cocos Creator | 3.8.8 |
| [抖音开发者工具](https://developer.open-douyin.com/docs/source/develop/game/tools/devtools) | 最新版，已安装并登录 |
| 抖音开放平台账号 | [https://developer.open-douyin.com/](https://developer.open-douyin.com/) |
| AppID | 在开放平台创建小游戏后获得 |

---

## 第一步：替换广告单元 ID

打开 [assets/scripts/test/AdTestManager.ts](../assets/scripts/test/AdTestManager.ts)，将占位 ID 替换为真实值或官方测试 ID。

### 使用抖音官方测试广告单元 ID（无需申请，推荐调试用）

```ts
// AdTestManager.ts
const AD_UNIT_REWARDED = 'o4dsicj0jn0n3gba6r';      // 官方测试激励视频广告位
const AD_UNIT_INTERSTITIAL = 'o4dsicj0jn0n3gba6r';   // 官方测试插屏广告位
```

> 官方文档：[抖音广告 API 文档](https://developer.open-douyin.com/docs/source/develop/game/API/ad/rewarded-video-ad) → 搜索"测试广告位 ID"

### 使用真实广告单元 ID

登录开放平台 → 进入对应小游戏 → **流量变现 → 广告管理 → 新建广告单元**，获取 ID 后填入上述常量。

修改后保存文件，Cocos Creator 会自动热更新。

---

## 第二步：构建字节跳动小游戏包

1. Cocos Creator 菜单 → **项目 → 构建发布**
2. 按以下配置填写：

| 选项 | 推荐值 | 说明 |
|---|---|---|
| **Platform** | `ByteDance Mini Game` | 必须选此平台，否则 `tt.*` API 不存在 |
| **Start Scene** | `AdTest` | 确保起始场景是测试场景 |
| **Build Path** | `build/bytedance` | 默认即可 |
| **App ID** | 你的 AppID | 测试阶段可先填任意字符串 |
| **Orientation** | `Portrait` | 竖屏 |
| **vConsole** | ☑ 勾选 | 真机上查看日志必须开启 |
| **Remote Server Address** | 留空 | 本地调试不需要 |

3. 点击 **Build（构建）**，等待完成
4. 构建成功后输出目录为：
   ```
   F:/projects/mini-game-2026/build/bytedance/
   ```

---

## 第三步：导入到抖音开发者工具

1. 打开**抖音开发者工具**，首页点击 **+（导入项目）**
2. 配置如下：
   - **项目目录**：选择 `build/bytedance/`
   - **AppID**：填写与构建时相同的 AppID
3. 点击**导入**，项目加载完成后会进入模拟器界面

---

## 第四步：验证广告回调

### 查看日志

开发者工具右侧面板切换到 **Console** 标签，在过滤框输入：

```
[AdTest]
```

只显示广告测试相关日志。

### 激励视频广告验证步骤

| 步骤 | 操作 | 预期日志 |
|---|---|---|
| 1 | 点击"测试激励视频广告"按钮 | `[AdTestPanel] 按钮点击：测试激励视频广告` |
| 2 | 广告开始加载 | `[AdTest][RewardedVideo] 开始加载 — 环境: 抖音真机` |
| 3 | 广告素材加载完成 | `[AdTest][RewardedVideo] onLoad — 广告素材加载完成` |
| 4 | 广告视频弹出播放 | `[AdTest][RewardedVideo] load() 完成，准备展示` |
| 5a | **看完视频** | `[AdTest][RewardedVideo] onClose — isEnded=true ✅ 触发奖励` |
| 5b | **中途关闭** | `[AdTest][RewardedVideo] onClose — isEnded=false ⚠️ 用户跳过` |

> **关键验证点**：`isEnded=true` 说明奖励回调正常触发；`isEnded=false` 说明跳过逻辑正常，两者都不发奖励是 bug。

### 插屏广告验证步骤

| 步骤 | 操作 | 预期日志 |
|---|---|---|
| 1 | 点击"测试插屏广告"按钮 | `[AdTestPanel] 按钮点击：测试插屏广告` |
| 2 | 广告加载并展示 | `[AdTest][Interstitial] load() 完成，准备展示` |
| 3 | 关闭广告 | `[AdTest][Interstitial] onClose ✅ 插屏广告已关闭` |

### 完整日志示例（抖音真机环境）

```
[AdTestPanel] 组件初始化 — BYTEDANCE=true MINIGAME=true 环境=抖音真机
[AdTestPanel] 按钮点击：测试激励视频广告
[AdTest][RewardedVideo] 开始加载 — 环境: 抖音真机
[AdTest][RewardedVideo] onLoad — 广告素材加载完成
[AdTest][RewardedVideo] load() 完成，准备展示
[AdTest][RewardedVideo] onClose — isEnded=true ✅ 触发奖励
[AdTestPanel] ✅ 激励视频：看完广告，奖励已发放！
[AdTest][RewardedVideo] show() 返回
```

> 第一行 `BYTEDANCE=true` 是关键，确认代码走的是真实 `tt.*` API 而非 Mock。

---

## 第五步：真机预览（可选）

在抖音开发者工具中点击 **真机调试** → 用手机扫描二维码。

真机上日志通过 **vConsole** 查看（构建时需勾选）：
- 屏幕右下角会出现绿色圆形 `vConsole` 按钮
- 点击后切换到 **Log** 标签
- 同样输入 `[AdTest]` 过滤

---

## 常见错误排查

| 现象 | 原因 | 解决方式 |
|---|---|---|
| 日志显示 `环境: Mock` | 打包平台选错（选了 web-mobile）| 重新构建，平台改为 `ByteDance Mini Game` |
| 广告不弹出，无报错 | 小游戏未开通广告权限 | 开放平台 → 流量变现 → 广告管理 → 开通 |
| `[RewardedVideo] onError errCode=10001` | 广告单元 ID 不存在或有误 | 换为官方测试 ID |
| `errCode=40003` | 广告库存不足 | 多试几次，或更换时间段 |
| Console 无任何 `[AdTest]` 输出 | Start Scene 配置错误 | 构建面板确认 Start Scene 为 `AdTest` |
| `tt is not defined` | 运行在非字节跳动环境 | 确保在开发者工具或抖音 App 内运行 |
| 按钮点击无响应 | Click Events 未绑定 | 参考 [ad-test-scene.md](ad-test-scene.md) 第四步 |
