import { checkTargetBoxConstraint } from '../../assets/scripts/tile-map/TargetBoxConstraint';

// ─── helpers ───────────────────────────────────────────────────────────────

function makeBox(cells: [number, number][]): Set<string> {
  return new Set(cells.map(([x, y]) => `${x},${y}`));
}

function keys(cells: [number, number][]): string[] {
  return cells.map(([x, y]) => `${x},${y}`);
}

// ════════════════════════════════════════════════════════════════
// checkTargetBoxConstraint
// ════════════════════════════════════════════════════════════════

describe('checkTargetBoxConstraint', () => {
  test('无目标盒子 → 始终有效', () => {
    expect(
      checkTargetBoxConstraint(
        keys([
          [0, 0],
          [1, 0],
        ]),
        [],
        new Set(),
      ),
    ).toBe(true);
  });

  test('空 cellKeys → 始终有效', () => {
    const box = makeBox([
      [2, 2],
      [3, 2],
    ]);
    expect(checkTargetBoxConstraint([], [box], box)).toBe(true);
  });

  test('完全在盒子外 → 有效', () => {
    const box = makeBox([
      [5, 5],
      [5, 6],
      [6, 5],
      [6, 6],
    ]);
    expect(
      checkTargetBoxConstraint(
        keys([
          [0, 0],
          [1, 0],
        ]),
        [box],
        box,
      ),
    ).toBe(true);
  });

  test('完全在单个盒子内 → 有效', () => {
    const box = makeBox([
      [2, 2],
      [3, 2],
      [2, 3],
      [3, 3],
    ]);
    // block 占 box 的子集
    expect(
      checkTargetBoxConstraint(
        keys([
          [2, 2],
          [3, 2],
        ]),
        [box],
        box,
      ),
    ).toBe(true);
  });

  test('完全精确覆盖单个盒子 → 有效', () => {
    const box = makeBox([
      [2, 2],
      [3, 2],
    ]);
    expect(
      checkTargetBoxConstraint(
        keys([
          [2, 2],
          [3, 2],
        ]),
        [box],
        box,
      ),
    ).toBe(true);
  });

  test('部分重叠（一些在盒子内、一些在外）→ 无效', () => {
    const box = makeBox([
      [2, 2],
      [3, 2],
      [2, 3],
      [3, 3],
    ]);
    // block 有一格在盒子内 (2,2)，一格在盒子外 (1,2)
    expect(
      checkTargetBoxConstraint(
        keys([
          [1, 2],
          [2, 2],
        ]),
        [box],
        box,
      ),
    ).toBe(false);
  });

  test('跨两个盒子 → 无效', () => {
    const boxA = makeBox([
      [0, 0],
      [1, 0],
    ]);
    const boxB = makeBox([
      [3, 0],
      [4, 0],
    ]);
    const all = new Set([...boxA, ...boxB]);
    // block 有一格在 boxA (1,0)，一格在 boxB (3,0)
    expect(
      checkTargetBoxConstraint(
        keys([
          [1, 0],
          [3, 0],
        ]),
        [boxA, boxB],
        all,
      ),
    ).toBe(false);
  });

  test('完全在第二个盒子内（多盒子场景）→ 有效', () => {
    const boxA = makeBox([
      [0, 0],
      [1, 0],
    ]);
    const boxB = makeBox([
      [5, 5],
      [5, 6],
      [6, 5],
    ]);
    const all = new Set([...boxA, ...boxB]);
    expect(
      checkTargetBoxConstraint(
        keys([
          [5, 5],
          [5, 6],
        ]),
        [boxA, boxB],
        all,
      ),
    ).toBe(true);
  });

  test('block 超出盒子（盒子是子集）→ 无效', () => {
    const box = makeBox([
      [2, 2],
      [3, 2],
    ]);
    // block 包含盒子所有格 + 额外一格
    expect(
      checkTargetBoxConstraint(
        keys([
          [2, 2],
          [3, 2],
          [4, 2],
        ]),
        [box],
        box,
      ),
    ).toBe(false);
  });

  test('单格 block 在盒子内 → 有效', () => {
    const box = makeBox([
      [1, 1],
      [2, 1],
    ]);
    expect(checkTargetBoxConstraint(keys([[1, 1]]), [box], box)).toBe(true);
  });

  test('单格 block 不在任何盒子 → 有效', () => {
    const box = makeBox([
      [1, 1],
      [2, 1],
    ]);
    expect(checkTargetBoxConstraint(keys([[9, 9]]), [box], box)).toBe(true);
  });
});
