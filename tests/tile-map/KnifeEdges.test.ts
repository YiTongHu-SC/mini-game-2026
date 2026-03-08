import {
  getKnifeEdges,
  isKnifePositionValid,
  snapKnifePosition,
} from '../../assets/scripts/tile-map/KnifeEdges';
import { KnifeData } from '../../assets/scripts/tile-map/LevelTypes';

// ════════════════════════════════════════════════════════════════
// 1. getKnifeEdges
// ════════════════════════════════════════════════════════════════

describe('getKnifeEdges', () => {
  test('竖直刀具 length=1', () => {
    const knife: KnifeData = { id: 'k1', orientation: 'v', length: 1, edge: 3, start: 2 };
    const edges = getKnifeEdges(knife);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual([
      { x: 2, y: 2 },
      { x: 3, y: 2 },
    ]);
  });

  test('竖直刀具 length=3', () => {
    const knife: KnifeData = { id: 'k2', orientation: 'v', length: 3, edge: 2, start: 0 };
    const edges = getKnifeEdges(knife);
    expect(edges).toHaveLength(3);
    expect(edges[0]).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    expect(edges[1]).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
    expect(edges[2]).toEqual([
      { x: 1, y: 2 },
      { x: 2, y: 2 },
    ]);
  });

  test('水平刀具 length=1', () => {
    const knife: KnifeData = { id: 'k3', orientation: 'h', length: 1, edge: 4, start: 1 };
    const edges = getKnifeEdges(knife);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual([
      { x: 1, y: 3 },
      { x: 1, y: 4 },
    ]);
  });

  test('水平刀具 length=2', () => {
    const knife: KnifeData = { id: 'k4', orientation: 'h', length: 2, edge: 1, start: 0 };
    const edges = getKnifeEdges(knife);
    expect(edges).toHaveLength(2);
    expect(edges[0]).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 1 },
    ]);
    expect(edges[1]).toEqual([
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ]);
  });
});

// ════════════════════════════════════════════════════════════════
// 2. isKnifePositionValid
// ════════════════════════════════════════════════════════════════

describe('isKnifePositionValid', () => {
  const cols = 8;
  const rows = 10;

  test('竖直刀具合法位置', () => {
    expect(isKnifePositionValid('v', 2, 3, 0, cols, rows)).toBe(true);
    expect(isKnifePositionValid('v', 1, 7, 9, cols, rows)).toBe(true);
  });

  test('竖直刀具：edge 越界', () => {
    expect(isKnifePositionValid('v', 1, 0, 0, cols, rows)).toBe(false);
    expect(isKnifePositionValid('v', 1, 8, 0, cols, rows)).toBe(false);
  });

  test('竖直刀具：start+length 越界', () => {
    expect(isKnifePositionValid('v', 3, 1, 8, cols, rows)).toBe(false);
    expect(isKnifePositionValid('v', 2, 1, -1, cols, rows)).toBe(false);
  });

  test('水平刀具合法位置', () => {
    expect(isKnifePositionValid('h', 3, 5, 0, cols, rows)).toBe(true);
    expect(isKnifePositionValid('h', 1, 1, 7, cols, rows)).toBe(true);
  });

  test('水平刀具：edge 越界', () => {
    expect(isKnifePositionValid('h', 1, 0, 0, cols, rows)).toBe(false);
    expect(isKnifePositionValid('h', 1, 10, 0, cols, rows)).toBe(false);
  });

  test('水平刀具：start+length 越界', () => {
    expect(isKnifePositionValid('h', 3, 1, 6, cols, rows)).toBe(false);
  });

  test('length < 1 无效', () => {
    expect(isKnifePositionValid('v', 0, 1, 0, cols, rows)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════
// 3. snapKnifePosition
// ════════════════════════════════════════════════════════════════

describe('snapKnifePosition', () => {
  const stride = 4;
  const tileSize = 16;
  const cols = 8;
  const rows = 10;
  const cellPx = stride * tileSize; // 64

  test('竖直刀具吸附到列边界', () => {
    // 像素 x 接近第 3 列边界 → edge=3
    const px = 3 * cellPx + tileSize * 0.5; // 3*64+8=200 (column boundary 3)
    const py = 2 * cellPx + tileSize * 0.5; // 2*64+8=136 center row 2
    const result = snapKnifePosition('v', 2, cols, rows, px, py, stride, tileSize);
    expect(result.edge).toBe(3);
    // start should center the knife on row 2: start = round((py-8)/64 - 1) = round(2 - 1) = 1
    expect(result.start).toBe(1);
  });

  test('竖直刀具吸附 clamp 到最小 edge', () => {
    const result = snapKnifePosition('v', 1, cols, rows, 0, 0, stride, tileSize);
    expect(result.edge).toBe(1);
    expect(result.start).toBe(0);
  });

  test('竖直刀具吸附 clamp 到最大 edge', () => {
    const px = 9999;
    const py = 9999;
    const result = snapKnifePosition('v', 2, cols, rows, px, py, stride, tileSize);
    expect(result.edge).toBe(cols - 1); // 7
    expect(result.start).toBe(rows - 2); // 8
  });

  test('水平刀具吸附到行边界', () => {
    const px = 1 * cellPx + tileSize * 0.5;
    const py = 5 * cellPx + tileSize * 0.5;
    const result = snapKnifePosition('h', 2, cols, rows, px, py, stride, tileSize);
    expect(result.edge).toBe(5);
    expect(result.start).toBe(0);
  });

  test('水平刀具 clamp', () => {
    const result = snapKnifePosition('h', 3, cols, rows, 9999, 9999, stride, tileSize);
    expect(result.edge).toBe(rows - 1); // 9
    expect(result.start).toBe(cols - 3); // 5
  });

  // STRIDE=3 场景：验证边界正好在 edge*stride*tileSize 像素处
  describe('STRIDE=3 场景', () => {
    const s3 = 3;
    const ts3 = 24;
    const cellPx3 = s3 * ts3; // 72

    test('竖直刀具：像素在边界处正确吸附', () => {
      // 边界在 edge * 3 * 24 = edge * 72 处
      // 鼠标在 edge=2 的边界 (px=144)
      const result = snapKnifePosition('v', 2, 5, 5, 144, 108, s3, ts3);
      expect(result.edge).toBe(2);
    });

    test('竖直刀具：边界两侧的像素吸附到正确的 edge', () => {
      // 边界 1 在 px=72, 边界 2 在 px=144, 中点在 px=108
      // 刚好右侧的 px=109 应吸附到 edge=2
      const r1 = snapKnifePosition('v', 1, 5, 5, 107, 36, s3, ts3);
      expect(r1.edge).toBe(1);
      const r2 = snapKnifePosition('v', 1, 5, 5, 109, 36, s3, ts3);
      expect(r2.edge).toBe(2);
    });

    test('水平刀具：像素在边界处正确吸附', () => {
      const result = snapKnifePosition('h', 2, 5, 5, 108, 216, s3, ts3);
      expect(result.edge).toBe(3);
    });
  });
});
