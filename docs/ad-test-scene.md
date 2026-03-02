# 抖音广告回调测试场景

本文档说明如何在 Cocos Creator 编辑器中搭建广告回调测试场景，以及如何通过 Log 验证激励视频广告和插屏广告的回调是否正常触发。

---

## 功能概述

| 功能 | 说明 |
|---|---|
| 激励视频广告测试 | 点击按钮加载并展示激励视频广告，验证 `onClose(isEnded)` 回调 |
| 插屏广告测试 | 点击按钮加载并展示插屏广告，验证 `onClose` 回调 |
| Mock 模式 | 在非抖音环境（编辑器预览、浏览器）自动启用，无需真实广告单元 ID |
| 结构化 Log | 所有关键步骤输出带前缀的 log，便于在控制台快速筛查 |

---

## 文件结构

```
assets/scripts/
├── typings/
│   └── tt.d.ts              # ByteDance tt API 类型声明
└── test/
    ├── AdMock.ts            # 非抖音环境的广告 Mock 实现
    ├── AdTestManager.ts     # 广告加载/展示/回调封装（平台判断）
    └── AdTestPanel.ts       # Cocos 组件，挂载到场景节点
```

---

## 在 Cocos Creator 编辑器中搭建场景

> 以下步骤约需 5–10 分钟，在 Cocos Creator 3.8.8 中完成。

### 第一步：创建新场景

1. 在 **资源管理器** 面板中右键 `assets/` → **新建 → 场景**
2. 将场景命名为 `AdTest`，保存路径：`assets/AdTest.scene`
3. 双击打开该场景

### 第二步：创建 UI 节点树

在 **层级管理器** 中按以下结构创建节点：

```
Canvas
└── AdTestPanel              ← 空节点，用于挂载组件
    ├── LogLabel             ← Label 节点，显示当前状态
    ├── BtnRewardedAd        ← Button 节点
    │   └── Label            ← 按钮文字："测试激励视频广告"
    └── BtnInterstitialAd    ← Button 节点
        └── Label            ← 按钮文字："测试插屏广告"
```

**创建方式**：

- 右键层级管理器空白处 → **创建 → 2D 对象 → Canvas**（如果已有 Canvas 则跳过）
- 右键 Canvas → **创建 → 空节点**，命名 `AdTestPanel`
- 右键 AdTestPanel → **创建 → 2D 对象 → Label**，命名 `LogLabel`
- 右键 AdTestPanel → **创建 → UI 组件 → Button**，命名 `BtnRewardedAd`，修改子节点 Label 文字为 `测试激励视频广告`
- 同上再创建 `BtnInterstitialAd`，Label 文字为 `测试插屏广告`

### 第三步：挂载 AdTestPanel 组件

1. 在层级管理器中选中 `AdTestPanel` 节点
2. 在 **属性检查器** 底部点击 **添加组件 → 自定义组件 → AdTestPanel**
3. 将以下节点拖拽到对应属性槽：
   - `BtnRewardedAd` → `Btn Rewarded Ad`
   - `BtnInterstitialAd` → `Btn Interstitial Ad`
   - `LogLabel` → `Log Label`（可选，用于屏幕展示状态）

### 第四步：绑定按钮点击事件

1. 选中 `BtnRewardedAd` 节点，在属性检查器中找到 **Button → Click Events**
2. 点击 `+` 添加一条事件：
   - 拖入 `AdTestPanel` 节点
   - 组件选择 `AdTestPanel`
   - 函数选择 `onClickRewardedAd`
3. 对 `BtnInterstitialAd` 做同样操作，函数选择 `onClickInterstitialAd`

### 第五步：保存并预览

按 `Ctrl+S` 保存场景，点击编辑器顶部 **预览** 按钮（浏览器预览或模拟器预览均可）。

---

## Log 格式说明

所有 log 均带前缀，可在控制台通过关键词过滤：

| 前缀 | 含义 |
|---|---|
| `[AdTest][RewardedVideo]` | 激励视频广告事件 |
| `[AdTest][Interstitial]` | 插屏广告事件 |
| `[AdMock][RewardedVideo]` | Mock 模式下的激励视频内部日志 |
| `[AdMock][Interstitial]` | Mock 模式下的插屏内部日志 |
| `[AdTestPanel]` | UI 组件事件（按钮点击、状态更新） |

### 激励视频广告完整日志示例（Mock 环境）

```
[AdTestPanel] 按钮点击：测试激励视频广告
[AdTest][RewardedVideo] 开始加载 — 环境: Mock
[AdMock][RewardedVideo] load() — adUnitId="YOUR_REWARDED_AD_UNIT_ID"
[AdMock][RewardedVideo] onLoad triggered (mock)
[AdTest][RewardedVideo] onLoad — 广告素材加载完成
[AdTest][RewardedVideo] load() 完成，准备展示
[AdMock][RewardedVideo] show() — 模拟播放广告中...
[AdMock][RewardedVideo] onClose triggered — isEnded=true (mock)
[AdTest][RewardedVideo] onClose — isEnded=true ✅ 触发奖励
[AdTestPanel] ✅ 激励视频：看完广告，奖励已发放！
[AdTest][RewardedVideo] show() 返回
```

### 插屏广告完整日志示例（Mock 环境）

```
[AdTestPanel] 按钮点击：测试插屏广告
[AdTest][Interstitial] 开始加载 — 环境: Mock
[AdMock][Interstitial] load() — adUnitId="YOUR_INTERSTITIAL_AD_UNIT_ID"
[AdMock][Interstitial] onLoad triggered (mock)
[AdTest][Interstitial] onLoad — 广告素材加载完成
[AdTest][Interstitial] load() 完成，准备展示
[AdMock][Interstitial] show() — 模拟展示插屏广告中...
[AdMock][Interstitial] onClose triggered (mock)
[AdTest][Interstitial] onClose ✅ 插屏广告已关闭
[AdTestPanel] ✅ 插屏广告：已关闭
[AdTest][Interstitial] show() 返回
```

---

## 真机测试（抖音开发者工具）

### 前置条件

1. 在[抖音开放平台](https://developer.open-douyin.com/)申请广告单元 ID
2. 替换 `AdTestManager.ts` 中的广告单元 ID：
   ```ts
   const AD_UNIT_REWARDED = 'your-real-rewarded-ad-unit-id';
   const AD_UNIT_INTERSTITIAL = 'your-real-interstitial-ad-unit-id';
   ```

### 构建步骤

1. Cocos Creator 菜单 → **项目 → 构建发布**
2. 发布平台选择 **字节跳动小游戏**
3. 点击 **构建**，完成后点击 **运行**（会自动打开抖音开发者工具）
4. 在抖音开发者工具中选择 **真机调试** 或 **模拟器**

### 验证方法

- 打开控制台，过滤关键词 `[AdTest]`
- 点击 **测试激励视频广告** 按钮，观察真实广告是否弹出
- 看完广告后确认 `onClose — isEnded=true ✅ 触发奖励` 日志出现
- 中途关闭广告确认 `onClose — isEnded=false ⚠️ 用户跳过` 日志出现

---

## 常见问题

| 问题 | 原因 | 解决 |
|---|---|---|
| 组件挂载后属性槽为空 | 未拖拽节点到属性槽 | 按第三步重新绑定 |
| 点击按钮无反应 | 按钮事件未绑定 | 检查第四步的 Click Events |
| 真机无广告弹出 | 广告单元 ID 未替换 | 修改 `AdTestManager.ts` 中的常量 |
| 真机报 `errCode` 错误 | 广告库存不足或 ID 无效 | 参考[抖音广告错误码文档](https://developer.open-douyin.com/docs/source/develop/game/API/ad/) |
