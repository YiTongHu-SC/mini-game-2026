/**
 * ByteDance (抖音/TikTok) Mini Game JS Bridge 类型声明
 * 手动维护，覆盖广告相关 API（激励视频 & 插屏）。
 * 完整文档：https://developer.open-douyin.com/docs/source/develop/game/API/ad/
 */

/** 广告关闭回调参数 */
interface TTAdCloseInfo {
  /** 视频是否播放完毕（激励视频专用，插屏固定 true） */
  isEnded: boolean;
}

/** 广告错误回调参数 */
interface TTAdError {
  errCode: number;
  errMsg: string;
}

/** 激励视频广告实例 */
interface TTRewardedVideoAd {
  /** 加载广告素材 */
  load(): Promise<void>;
  /** 展示广告（需先 load 成功） */
  show(): Promise<void>;
  /** 注册关闭回调（用户看完或中途关闭） */
  onClose(callback: (info: TTAdCloseInfo) => void): void;
  /** 注册错误回调 */
  onError(callback: (err: TTAdError) => void): void;
  /** 注册加载完成回调 */
  onLoad(callback: () => void): void;
}

/** 创建激励视频广告的参数 */
interface TTRewardedVideoAdOptions {
  adUnitId: string;
}

/** 插屏广告实例 */
interface TTInterstitialAd {
  load(): Promise<void>;
  show(): Promise<void>;
  onClose(callback: () => void): void;
  onError(callback: (err: TTAdError) => void): void;
  onLoad(callback: () => void): void;
}

/** 创建插屏广告的参数 */
interface TTInterstitialAdOptions {
  adUnitId: string;
}

/** ByteDance Mini Game 全局 API 对象 */
interface TT {
  /**
   * 创建激励视频广告实例
   * @param options.adUnitId 广告单元 ID（开发者平台申请）
   */
  createRewardedVideoAd(options: TTRewardedVideoAdOptions): TTRewardedVideoAd;

  /**
   * 创建插屏广告实例
   * @param options.adUnitId 广告单元 ID（开发者平台申请）
   */
  createInterstitialAd(options: TTInterstitialAdOptions): TTInterstitialAd;
}

declare const tt: TT;
