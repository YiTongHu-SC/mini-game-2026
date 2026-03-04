/**
 * Minimal stub for the Cocos Creator `cc` module.
 * Used by Jest so that pure-logic modules that accidentally import `cc`
 * don't blow up during unit tests.
 *
 * Add more stubs here as needed when Cocos-typed code is tested.
 */

export const _decorator = {
  ccclass: (_name?: string) => (target: unknown) => target,
  property: (_opts?: unknown) => () => {},
};

export class Component {}
export class Node {}
