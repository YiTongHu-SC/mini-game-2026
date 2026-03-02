/**
 * 广告测试管理器
 * 统一封装激励视频广告和插屏广告的加载 / 展示 / 回调流程。
 * - 在抖音运行时（BYTEDANCE=true）使用真实 tt.* API
 * - 在其他环境（浏览器预览、编辑器预览）使用 Mock 实现
 *
 * 所有关键步骤均有结构化 log，格式：
 *   [AdTest][RewardedVideo] <事件>
 *   [AdTest][Interstitial]  <事件>
 */

import { BYTEDANCE } from 'cc/env';
import { createMockRewardedVideoAd, createMockInterstitialAd } from './AdMock';

const TAG = '[AdTest]';

/** 开发用途的广告单元 ID，替换为真实 ID 后可在真机调试 */
const AD_UNIT_REWARDED = 'YOUR_REWARDED_AD_UNIT_ID';
const AD_UNIT_INTERSTITIAL = 'YOUR_INTERSTITIAL_AD_UNIT_ID';

/**
 * 加载并展示激励视频广告
 * @param onRewarded 用户看完广告后的奖励发放回调
 * @param onSkipped  用户中途跳过广告的回调（可选）
 */
export async function showRewardedVideoAd(
  onRewarded: () => void,
  onSkipped?: () => void,
): Promise<void> {
  console.log(`${TAG}[RewardedVideo] 开始加载 — 环境: ${BYTEDANCE ? '抖音真机' : 'Mock'}`);

  const ad = BYTEDANCE
    ? tt.createRewardedVideoAd({ adUnitId: AD_UNIT_REWARDED })
    : createMockRewardedVideoAd(AD_UNIT_REWARDED);

  ad.onLoad(() => {
    console.log(`${TAG}[RewardedVideo] onLoad — 广告素材加载完成`);
  });

  ad.onClose(info => {
    if (info.isEnded) {
      console.log(`${TAG}[RewardedVideo] onClose — isEnded=true ✅ 触发奖励`);
      onRewarded();
    } else {
      console.warn(`${TAG}[RewardedVideo] onClose — isEnded=false ⚠️ 用户跳过，不发奖励`);
      onSkipped?.();
    }
  });

  ad.onError(err => {
    console.error(`${TAG}[RewardedVideo] onError — errCode=${err.errCode} errMsg="${err.errMsg}"`);
  });

  try {
    await ad.load();
    console.log(`${TAG}[RewardedVideo] load() 完成，准备展示`);
    await ad.show();
    console.log(`${TAG}[RewardedVideo] show() 返回`);
  } catch (e) {
    console.error(`${TAG}[RewardedVideo] 异常:`, e);
  }
}

/**
 * 加载并展示插屏广告
 * @param onClose 广告关闭后的回调
 */
export async function showInterstitialAd(onClose?: () => void): Promise<void> {
  console.log(`${TAG}[Interstitial] 开始加载 — 环境: ${BYTEDANCE ? '抖音真机' : 'Mock'}`);

  const ad = BYTEDANCE
    ? tt.createInterstitialAd({ adUnitId: AD_UNIT_INTERSTITIAL })
    : createMockInterstitialAd(AD_UNIT_INTERSTITIAL);

  ad.onLoad(() => {
    console.log(`${TAG}[Interstitial] onLoad — 广告素材加载完成`);
  });

  ad.onClose(() => {
    console.log(`${TAG}[Interstitial] onClose ✅ 插屏广告已关闭`);
    onClose?.();
  });

  ad.onError(err => {
    console.error(`${TAG}[Interstitial] onError — errCode=${err.errCode} errMsg="${err.errMsg}"`);
  });

  try {
    await ad.load();
    console.log(`${TAG}[Interstitial] load() 完成，准备展示`);
    await ad.show();
    console.log(`${TAG}[Interstitial] show() 返回`);
  } catch (e) {
    console.error(`${TAG}[Interstitial] 异常:`, e);
  }
}
