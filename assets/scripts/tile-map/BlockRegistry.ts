/**
 * BlockRegistry — 运行时 Block 成员关系注册表
 *
 * 解决 LevelLoader 丢弃 block 成员信息的问题，在运行时维护：
 *   - 格子坐标 → blockId 的快速查找
 *   - blockId → 当前格子列表
 *
 * 支持 moveBlock（平移整个 block）以及基于当前位置重新推断所有
 * 跨 block 墙壁（与 LevelLoader 算法一致）。
 *
 * 零 Cocos 依赖 — 可在 Jest 中直接测试。
 */

import { LevelData, CellCoord } from './LevelTypes';

// ──────────────────── helpers ────────────────────

/** 四方向偏移 */
const DIRS: CellCoord[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/**
 * 生成标准化 wall key（与 BlockManager.wallKey / LevelLoader 保持一致）。
 * 较小坐标在前（先比 x，再比 y）。
 */
function wallKey(a: CellCoord, b: CellCoord): string {
  if (a.x < b.x || (a.x === b.x && a.y < b.y)) {
    return `${a.x},${a.y}|${b.x},${b.y}`;
  }
  return `${b.x},${b.y}|${a.x},${a.y}`;
}

/** 从标准化 wall key 解析出坐标对 */
function parseWallKey(key: string): [CellCoord, CellCoord] {
  const [partA, partB] = key.split('|');
  const [ax, ay] = partA.split(',').map(Number);
  const [bx, by] = partB.split(',').map(Number);
  return [
    { x: ax, y: ay },
    { x: bx, y: by },
  ];
}

// ──────────────────── class ────────────────────

export class BlockRegistry {
  /** "x,y" → blockId */
  private cellToBlock: Map<string, string> = new Map();
  /** blockId → 可变格子列表（直接修改以支持 moveBlock） */
  private blockToCells: Map<string, CellCoord[]> = new Map();
  /** blockId → 内部墙壁 key 集合 */
  private blockToWalls: Map<string, Set<string>> = new Map();

  constructor(data: LevelData) {
    for (const block of data.blocks) {
      const cells: CellCoord[] = [];
      for (const cell of block.cells) {
        const key = `${cell.x},${cell.y}`;
        this.cellToBlock.set(key, block.id);
        cells.push({ x: cell.x, y: cell.y });
      }
      this.blockToCells.set(block.id, cells);

      // Initialize internal walls
      const walls = new Set<string>();
      if (block.walls) {
        for (const [wa, wb] of block.walls) {
          walls.add(wallKey(wa, wb));
        }
      }
      this.blockToWalls.set(block.id, walls);
    }
  }

  // ──────────────────── queries ────────────────────

  /**
   * 返回占用 (x, y) 的 blockId，如果该格子不属于任何 block 则返回 undefined。
   */
  getBlockIdAt(x: number, y: number): string | undefined {
    return this.cellToBlock.get(`${x},${y}`);
  }

  /**
   * 返回 blockId 当前所有格子的副本列表。
   * 若 blockId 不存在则返回空数组。
   */
  getBlockCells(blockId: string): CellCoord[] {
    return (this.blockToCells.get(blockId) ?? []).map(c => ({ x: c.x, y: c.y }));
  }

  /**
   * 返回所有 blockId。
   */
  getAllBlockIds(): string[] {
    return [...this.blockToCells.keys()];
  }

  /**
   * 返回 blockId 的所有内部墙壁。
   * 若 blockId 不存在则返回空数组。
   */
  getBlockWalls(blockId: string): [CellCoord, CellCoord][] {
    const walls = this.blockToWalls.get(blockId);
    if (!walls || walls.size === 0) return [];
    return [...walls].map(parseWallKey);
  }

  // ──────────────────── mutation ────────────────────

  /** 内部计数器，用于生成分裂后的新 block id */
  private _splitCounter = 0;

  /**
   * 将 blockId 的所有格子平移 (dx, dy)。
   * 更新内部的双向映射，不操作任何外部网格。
   *
   * @param blockId 要移动的 block
   * @param dx 水平偏移（列数）
   * @param dy 垂直偏移（行数）
   */
  moveBlock(blockId: string, dx: number, dy: number): void {
    const cells = this.blockToCells.get(blockId);
    if (!cells) return;

    // 删除旧坐标的映射
    for (const cell of cells) {
      this.cellToBlock.delete(`${cell.x},${cell.y}`);
    }

    // 更新坐标
    for (const cell of cells) {
      cell.x += dx;
      cell.y += dy;
    }

    // 建立新坐标的映射
    for (const cell of cells) {
      this.cellToBlock.set(`${cell.x},${cell.y}`, blockId);
    }

    // 移动内部墙壁
    const movedWalls = this.blockToWalls.get(blockId);
    if (movedWalls && movedWalls.size > 0) {
      const newWallSet = new Set<string>();
      for (const wk of movedWalls) {
        const [wa, wb] = parseWallKey(wk);
        newWallSet.add(wallKey({ x: wa.x + dx, y: wa.y + dy }, { x: wb.x + dx, y: wb.y + dy }));
      }
      this.blockToWalls.set(blockId, newWallSet);
    }
  }

  /**
   * 在同一 block 的两个相邻格子之间添加内部墙壁。
   * @returns true 若成功添加；false 若不在同一 block 或已存在
   */
  addBlockWall(a: CellCoord, b: CellCoord): boolean {
    const blockId = this.cellToBlock.get(`${a.x},${a.y}`);
    if (!blockId) return false;
    if (this.cellToBlock.get(`${b.x},${b.y}`) !== blockId) return false;

    const walls = this.blockToWalls.get(blockId);
    if (!walls) return false;

    const key = wallKey(a, b);
    if (walls.has(key)) return false;
    walls.add(key);
    return true;
  }

  /**
   * 移除同一 block 内的内部墙壁。
   * @returns true 若成功移除；false 若不存在
   */
  removeBlockWall(a: CellCoord, b: CellCoord): boolean {
    const blockId = this.cellToBlock.get(`${a.x},${a.y}`);
    if (!blockId) return false;
    if (this.cellToBlock.get(`${b.x},${b.y}`) !== blockId) return false;

    const walls = this.blockToWalls.get(blockId);
    if (!walls) return false;

    return walls.delete(wallKey(a, b));
  }

  // ──────────────────── split / wall inference ────────────────────

  /**
   * 检查 block 的连通性（考虑所有内部墙壁）。
   * 若 block 被分割为不连通的两部分，移除原 block，创建两个新 block，
   * 并将内部墙壁分配到对应的新 block。
   *
   * 前提：调用前需先通过 addBlockWall(a, b) 存储墙壁。
   *
   * 连通性判断：在 block 格子集合内做 BFS，将 blockToWalls 中记录的
   * 所有内部墙壁边视为不可通行。
   *
   * @param a BFS 起点（决定分裂后 group A 的归属）
   * @param b 用于验证同一 block
   * @returns `[newIdA, newIdB]` 若发生分裂；`null` 若仍连通
   */
  trySplitBlock(a: CellCoord, b: CellCoord): [string, string] | null {
    const blockId = this.cellToBlock.get(`${a.x},${a.y}`);
    if (!blockId) return null;
    if (this.cellToBlock.get(`${b.x},${b.y}`) !== blockId) return null;

    const cells = this.blockToCells.get(blockId);
    if (!cells || cells.length < 2) return null;

    const cellSet = new Set<string>(cells.map(c => `${c.x},${c.y}`));
    const blockWalls = this.blockToWalls.get(blockId) ?? new Set<string>();

    // BFS from cell a, blocking ALL internal walls of this block
    const visited = new Set<string>();
    const queue: CellCoord[] = [{ x: a.x, y: a.y }];
    visited.add(`${a.x},${a.y}`);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const dir of DIRS) {
        const nx = curr.x + dir.x;
        const ny = curr.y + dir.y;
        const nk = `${nx},${ny}`;
        if (visited.has(nk)) continue;
        if (!cellSet.has(nk)) continue;

        // Block any edge that has an internal wall
        const edgeKey = wallKey({ x: curr.x, y: curr.y }, { x: nx, y: ny });
        if (blockWalls.has(edgeKey)) continue;

        visited.add(nk);
        queue.push({ x: nx, y: ny });
      }
    }

    // If BFS from a reached all cells, block is still connected
    if (visited.size === cells.length) return null;

    // Split: partition cells into two groups
    const groupA: CellCoord[] = [];
    const groupB: CellCoord[] = [];
    for (const cell of cells) {
      if (visited.has(`${cell.x},${cell.y}`)) {
        groupA.push(cell);
      } else {
        groupB.push(cell);
      }
    }

    // Distribute internal walls to new blocks
    const groupASet = new Set(groupA.map(c => `${c.x},${c.y}`));
    const groupBSet = new Set(groupB.map(c => `${c.x},${c.y}`));
    const wallsA = new Set<string>();
    const wallsB = new Set<string>();
    for (const wk of blockWalls) {
      const [wa, wb] = parseWallKey(wk);
      const waKey = `${wa.x},${wa.y}`;
      const wbKey = `${wb.x},${wb.y}`;
      if (groupASet.has(waKey) && groupASet.has(wbKey)) {
        wallsA.add(wk);
      } else if (groupBSet.has(waKey) && groupBSet.has(wbKey)) {
        wallsB.add(wk);
      }
      // else: wall spans split boundary → now cross-block, don't store
    }

    // Remove old block
    this.blockToCells.delete(blockId);
    this.blockToWalls.delete(blockId);
    for (const cell of cells) {
      this.cellToBlock.delete(`${cell.x},${cell.y}`);
    }

    // Create two new blocks
    this._splitCounter++;
    const idA = `${blockId}_s${this._splitCounter}a`;
    const idB = `${blockId}_s${this._splitCounter}b`;

    this.blockToCells.set(idA, groupA);
    this.blockToWalls.set(idA, wallsA);
    for (const cell of groupA) {
      this.cellToBlock.set(`${cell.x},${cell.y}`, idA);
    }

    this.blockToCells.set(idB, groupB);
    this.blockToWalls.set(idB, wallsB);
    for (const cell of groupB) {
      this.cellToBlock.set(`${cell.x},${cell.y}`, idB);
    }

    return [idA, idB];
  }

  /**
   * 通用分裂：检测 blockId 内所有连通分量（考虑内部墙壁），
   * 若存在 2 个以上连通分量则拆分为多个新 block。
   *
   * 适用于刀具一次切出多条边后需要 N-way 分裂的场景。
   *
   * @returns 新 block id 数组（长度 ≥ 2）；若仍连通返回 null
   */
  splitDisconnectedBlock(blockId: string): string[] | null {
    const cells = this.blockToCells.get(blockId);
    if (!cells || cells.length < 2) return null;

    const cellSet = new Set<string>(cells.map(c => `${c.x},${c.y}`));
    const blockWalls = this.blockToWalls.get(blockId) ?? new Set<string>();
    const visited = new Set<string>();
    const components: CellCoord[][] = [];

    for (const cell of cells) {
      const ck = `${cell.x},${cell.y}`;
      if (visited.has(ck)) continue;

      // BFS for one connected component
      const comp: CellCoord[] = [];
      const queue: CellCoord[] = [{ x: cell.x, y: cell.y }];
      visited.add(ck);
      while (queue.length > 0) {
        const curr = queue.shift()!;
        comp.push(curr);
        for (const dir of DIRS) {
          const nx = curr.x + dir.x;
          const ny = curr.y + dir.y;
          const nk = `${nx},${ny}`;
          if (visited.has(nk) || !cellSet.has(nk)) continue;
          const edgeKey = wallKey({ x: curr.x, y: curr.y }, { x: nx, y: ny });
          if (blockWalls.has(edgeKey)) continue;
          visited.add(nk);
          queue.push({ x: nx, y: ny });
        }
      }
      components.push(comp);
    }

    if (components.length < 2) return null;

    // Distribute internal walls to new components
    const cellToComp = new Map<string, number>();
    for (let ci = 0; ci < components.length; ci++) {
      for (const c of components[ci]) {
        cellToComp.set(`${c.x},${c.y}`, ci);
      }
    }
    const compWalls: Set<string>[] = components.map(() => new Set<string>());
    for (const wk of blockWalls) {
      const [wa, wb] = parseWallKey(wk);
      const ca = cellToComp.get(`${wa.x},${wa.y}`);
      const cb = cellToComp.get(`${wb.x},${wb.y}`);
      if (ca !== undefined && cb !== undefined && ca === cb) {
        compWalls[ca].add(wk);
      }
    }

    // Remove old block
    for (const c of cells) this.cellToBlock.delete(`${c.x},${c.y}`);
    this.blockToCells.delete(blockId);
    this.blockToWalls.delete(blockId);

    // Create new blocks
    this._splitCounter++;
    const newIds: string[] = [];
    for (let ci = 0; ci < components.length; ci++) {
      const suffix = String.fromCharCode(97 + (ci % 26)); // a, b, c, ...
      const id = `${blockId}_s${this._splitCounter}${suffix}`;
      newIds.push(id);
      this.blockToCells.set(id, components[ci]);
      this.blockToWalls.set(id, compWalls[ci]);
      for (const c of components[ci]) {
        this.cellToBlock.set(`${c.x},${c.y}`, id);
      }
    }

    return newIds;
  }

  /**
   * 返回所有墙壁：跨 block 边界墙壁 + block 内部墙壁。
   *
   * 跨 block 边界规则与 LevelLoader.load 一致：
   *   - 对每个占用格检查四方向邻居
   *   - 若邻居属于不同 block → wall
   *   - 自动去重
   *
   * @returns 墙壁列表，每条以两个格子坐标表示
   */
  getAllWalls(): [CellCoord, CellCoord][] {
    const wallKeySet = new Set<string>();
    const walls: [CellCoord, CellCoord][] = [];

    // 1. Cross-block walls (inferred from block boundaries)
    for (const [coordKey, blockId] of this.cellToBlock) {
      const [x, y] = coordKey.split(',').map(Number);
      const cell: CellCoord = { x, y };

      for (const dir of DIRS) {
        const nx = x + dir.x;
        const ny = y + dir.y;
        const neighborBlockId = this.cellToBlock.get(`${nx},${ny}`);

        if (neighborBlockId !== undefined && neighborBlockId !== blockId) {
          const neighbor: CellCoord = { x: nx, y: ny };
          const key = wallKey(cell, neighbor);
          if (!wallKeySet.has(key)) {
            wallKeySet.add(key);
            walls.push([cell, neighbor]);
          }
        }
      }
    }

    // 2. Internal block walls
    for (const [, blockWallSet] of this.blockToWalls) {
      for (const wk of blockWallSet) {
        if (!wallKeySet.has(wk)) {
          wallKeySet.add(wk);
          walls.push(parseWallKey(wk));
        }
      }
    }

    return walls;
  }
}
