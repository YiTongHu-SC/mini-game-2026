/**
 * 广告 Mock 工具
 * 在非抖音环境（浏览器预览、编辑器预览）下模拟 tt.* 广告 API 的行为，
 * 使广告回调流程可在本地完整走通。
 */

const TAG = '[AdMock]';

/** Mock 激励视频广告实例（模拟看完 1s 后触发 onClose，isEnded=true） */
function createMockRewardedVideoAd(adUnitId: string): TTRewardedVideoAd {
  let _onClose: ((info: { isEnded: boolean }) => void) | null = null;
  let _onError: ((err: { errCode: number; errMsg: string }) => void) | null = null;
  let _onLoad: (() => void) | null = null;

  return {
    load(): Promise<void> {
      console.log(`${TAG}[RewardedVideo] load() — adUnitId="${adUnitId}"`);
      return new Promise(resolve => {
        setTimeout(() => {
          console.log(`${TAG}[RewardedVideo] onLoad triggered (mock)`);
          _onLoad?.();
          resolve();
        }, 300);
      });
    },

    show(): Promise<void> {
      console.log(`${TAG}[RewardedVideo] show() — 模拟播放广告中...`);
      return new Promise(resolve => {
        setTimeout(() => {
          console.log(`${TAG}[RewardedVideo] onClose triggered — isEnded=true (mock)`);
          _onClose?.({ isEnded: true });
          resolve();
        }, 1000);
      });
    },

    onClose(callback) {
      _onClose = callback;
    },

    onError(callback) {
      _onError = callback;
    },

    onLoad(callback) {
      _onLoad = callback;
    },
  };
}

/** Mock 插屏广告实例（模拟展示 0.5s 后自动关闭） */
function createMockInterstitialAd(adUnitId: string): TTInterstitialAd {
  let _onClose: (() => void) | null = null;
  let _onError: ((err: { errCode: number; errMsg: string }) => void) | null = null;
  let _onLoad: (() => void) | null = null;

  return {
    load(): Promise<void> {
      console.log(`${TAG}[Interstitial] load() — adUnitId="${adUnitId}"`);
      return new Promise(resolve => {
        setTimeout(() => {
          console.log(`${TAG}[Interstitial] onLoad triggered (mock)`);
          _onLoad?.();
          resolve();
        }, 300);
      });
    },

    show(): Promise<void> {
      console.log(`${TAG}[Interstitial] show() — 模拟展示插屏广告中...`);
      return new Promise(resolve => {
        setTimeout(() => {
          console.log(`${TAG}[Interstitial] onClose triggered (mock)`);
          _onClose?.();
          resolve();
        }, 500);
      });
    },

    onClose(callback) {
      _onClose = callback;
    },

    onError(callback) {
      _onError = callback;
    },

    onLoad(callback) {
      _onLoad = callback;
    },
  };
}

export { createMockRewardedVideoAd, createMockInterstitialAd };
