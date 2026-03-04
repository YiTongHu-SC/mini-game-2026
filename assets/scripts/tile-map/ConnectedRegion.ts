/**
 * ConnectedRegion — 连通区域查询
 *
 * 使用 BFS（广度优先搜索）查找与种子格同一连通块的所有 occupied 格子。
 * 连通定义：4 邻域（Up / Right / Down / Left）。
 *
 * 零 Cocos 依赖 — 可在 Jest 中直接测试。
 */

import { OccupancyGrid, GridCoord } from './OccupancyGrid';

/** 4-directional neighbour offsets */
const DIRS: readonly GridCoord[] = [
  { x: 0, y: 1 }, // Up
  { x: 1, y: 0 }, // Right
  { x: 0, y: -1 }, // Down
  { x: -1, y: 0 }, // Left
];

/**
 * Get all occupied cells connected to the seed via 4-directional adjacency.
 * Returns an empty array if the seed cell itself is not occupied.
 */
export function getConnectedRegion(grid: OccupancyGrid, seedX: number, seedY: number): GridCoord[] {
  if (grid.getCell(seedX, seedY) === 0) return [];

  const visited = new Set<string>();
  const queue: GridCoord[] = [{ x: seedX, y: seedY }];
  const result: GridCoord[] = [];

  const key = (x: number, y: number) => `${x},${y}`;
  visited.add(key(seedX, seedY));

  while (queue.length > 0) {
    const curr = queue.shift()!;
    result.push(curr);

    for (const d of DIRS) {
      const nx = curr.x + d.x;
      const ny = curr.y + d.y;
      const k = key(nx, ny);
      if (!visited.has(k) && grid.getCell(nx, ny) === 1) {
        visited.add(k);
        queue.push({ x: nx, y: ny });
      }
    }
  }

  return result;
}

/**
 * Find all distinct connected regions in the grid.
 * Returns an array of regions, each region is an array of GridCoord.
 */
export function getAllRegions(grid: OccupancyGrid): GridCoord[][] {
  const visited = new Set<string>();
  const regions: GridCoord[][] = [];
  const key = (x: number, y: number) => `${x},${y}`;

  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      if (grid.getCell(x, y) === 1 && !visited.has(key(x, y))) {
        const region = getConnectedRegion(grid, x, y);
        for (const c of region) visited.add(key(c.x, c.y));
        regions.push(region);
      }
    }
  }

  return regions;
}
