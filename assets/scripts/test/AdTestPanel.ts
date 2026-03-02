/**
 * 广告测试面板组件
 * 挂载到 Cocos Creator 场景节点上，提供两个按钮分别测试：
 *   1. 激励视频广告回调
 *   2. 插屏广告回调
 *
 * 场景搭建方法见 docs/ad-test-scene.md
 */

import { _decorator, Component, Node, Label } from 'cc';
import { BYTEDANCE, MINIGAME } from 'cc/env';
import { showRewardedVideoAd, showInterstitialAd } from './AdTestManager';

const { ccclass, property } = _decorator;

const TAG = '[AdTestPanel]';

@ccclass('AdTestPanel')
export class AdTestPanel extends Component {
  /** 绑定"测试激励视频广告"按钮节点 */
  @property(Node)
  btnRewardedAd: Node = null!;

  /** 绑定"测试插屏广告"按钮节点 */
  @property(Node)
  btnInterstitialAd: Node = null!;

  /** 可选：日志显示标签（用于在屏幕上展示最新状态） */
  @property(Label)
  logLabel: Label = null!;

  start() {
    console.log(
      `${TAG} 组件初始化 — BYTEDANCE=${BYTEDANCE} MINIGAME=${MINIGAME} 环境=${BYTEDANCE ? '抖音真机' : 'Mock模式'}`,
    );
    this._updateLabel('就绪 — 点击按钮开始测试');
  }

  /** 点击"测试激励视频广告"按钮 */
  onClickRewardedAd() {
    console.log(`${TAG} 按钮点击：测试激励视频广告`);
    this._updateLabel('激励视频广告加载中...');

    showRewardedVideoAd(
      () => {
        // 用户看完广告 → 奖励触发
        const msg = '✅ 激励视频：看完广告，奖励已发放！';
        console.log(`${TAG} ${msg}`);
        this._updateLabel(msg);
      },
      () => {
        // 用户跳过
        const msg = '⚠️ 激励视频：用户跳过，未发奖励';
        console.warn(`${TAG} ${msg}`);
        this._updateLabel(msg);
      },
    );
  }

  /** 点击"测试插屏广告"按钮 */
  onClickInterstitialAd() {
    console.log(`${TAG} 按钮点击：测试插屏广告`);
    this._updateLabel('插屏广告加载中...');

    showInterstitialAd(() => {
      const msg = '✅ 插屏广告：已关闭';
      console.log(`${TAG} ${msg}`);
      this._updateLabel(msg);
    });
  }

  private _updateLabel(text: string) {
    if (this.logLabel) {
      this.logLabel.string = text;
    }
  }
}
