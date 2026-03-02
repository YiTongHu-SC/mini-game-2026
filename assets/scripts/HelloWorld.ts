import { _decorator, Component, Node } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('HelloWorld')
export class HelloWorld extends Component {
  @property(Node)
  label: Node = null!;

  private _count: number = 0;

  start() {
    console.log('Hello, Cocos Creator!');
  }

  onClickButton(_event: any, _customData: string) {
    this._count++;
    console.log(`Clicked ${this._count} times`);
  }
}
