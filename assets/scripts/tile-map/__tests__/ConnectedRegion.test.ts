import { OccupancyGrid } from '../OccupancyGrid';
import { getConnectedRegion, getAllRegions } from '../ConnectedRegion';

/** Helper: convert coords to sorted "x,y" strings for stable comparison */
function sortedKeys(coords: { x: number; y: number }[]): string[] {
  return coords.map(c => `${c.x},${c.y}`).sort();
}

describe('ConnectedRegion', () => {
  // ── getConnectedRegion ──────────────────────────

  test('seed on empty cell returns empty array', () => {
    const g = new OccupancyGrid(5, 5);
    expect(getConnectedRegion(g, 2, 2)).toEqual([]);
  });

  test('single isolated cell returns that cell only', () => {
    const g = new OccupancyGrid(5, 5);
    g.setCell(2, 2, 1);
    g.getDirtyAndClear();

    const region = getConnectedRegion(g, 2, 2);
    expect(region).toHaveLength(1);
    expect(region[0]).toEqual({ x: 2, y: 2 });
  });

  test('straight line of 5', () => {
    const g = new OccupancyGrid(7, 3);
    // Horizontal line at y=1: x=1..5
    for (let x = 1; x <= 5; x++) g.setCell(x, 1, 1);
    g.getDirtyAndClear();

    const region = getConnectedRegion(g, 3, 1);
    expect(region).toHaveLength(5);
    expect(sortedKeys(region)).toEqual(['1,1', '2,1', '3,1', '4,1', '5,1']);
  });

  test('L-shape', () => {
    const g = new OccupancyGrid(5, 5);
    // Vertical part: (1,0), (1,1), (1,2)
    g.setCell(1, 0, 1);
    g.setCell(1, 1, 1);
    g.setCell(1, 2, 1);
    // Horizontal part: (2,0), (3,0)
    g.setCell(2, 0, 1);
    g.setCell(3, 0, 1);
    g.getDirtyAndClear();

    const region = getConnectedRegion(g, 1, 0);
    expect(region).toHaveLength(5);
    expect(sortedKeys(region)).toEqual(['1,0', '1,1', '1,2', '2,0', '3,0']);
  });

  test('two disconnected blobs — query one, other not included', () => {
    const g = new OccupancyGrid(7, 7);
    // Blob A: (0,0), (1,0)
    g.setCell(0, 0, 1);
    g.setCell(1, 0, 1);
    // Blob B: (5,5), (6,5), (5,6)
    g.setCell(5, 5, 1);
    g.setCell(6, 5, 1);
    g.setCell(5, 6, 1);
    g.getDirtyAndClear();

    const regionA = getConnectedRegion(g, 0, 0);
    expect(regionA).toHaveLength(2);
    expect(sortedKeys(regionA)).toEqual(['0,0', '1,0']);

    const regionB = getConnectedRegion(g, 5, 5);
    expect(regionB).toHaveLength(3);
    expect(sortedKeys(regionB)).toEqual(['5,5', '5,6', '6,5']);
  });

  test('diagonal cells are NOT 4-connected', () => {
    const g = new OccupancyGrid(5, 5);
    g.setCell(1, 1, 1);
    g.setCell(2, 2, 1); // diagonal only
    g.getDirtyAndClear();

    const region = getConnectedRegion(g, 1, 1);
    expect(region).toHaveLength(1); // only the seed, diagonal not reachable
  });

  test('T-shape', () => {
    const g = new OccupancyGrid(5, 5);
    //   x
    // x x x
    g.setCell(1, 1, 1);
    g.setCell(2, 1, 1);
    g.setCell(3, 1, 1);
    g.setCell(2, 2, 1);
    g.getDirtyAndClear();

    const region = getConnectedRegion(g, 2, 1);
    expect(region).toHaveLength(4);
  });

  test('cross shape', () => {
    const g = new OccupancyGrid(5, 5);
    //   x
    // x x x
    //   x
    g.setCell(2, 1, 1);
    g.setCell(1, 2, 1);
    g.setCell(2, 2, 1);
    g.setCell(3, 2, 1);
    g.setCell(2, 3, 1);
    g.getDirtyAndClear();

    const region = getConnectedRegion(g, 2, 2);
    expect(region).toHaveLength(5);
  });

  // ── getAllRegions ───────────────────────────────

  test('getAllRegions on empty grid returns no regions', () => {
    const g = new OccupancyGrid(3, 3);
    expect(getAllRegions(g)).toHaveLength(0);
  });

  test('getAllRegions finds two separate blobs', () => {
    const g = new OccupancyGrid(7, 7);
    g.setCell(0, 0, 1);
    g.setCell(1, 0, 1);

    g.setCell(5, 5, 1);
    g.setCell(5, 6, 1);
    g.getDirtyAndClear();

    const regions = getAllRegions(g);
    expect(regions).toHaveLength(2);
    // Sizes
    const sizes = regions.map(r => r.length).sort();
    expect(sizes).toEqual([2, 2]);
  });

  test('getAllRegions on fully connected grid returns one region', () => {
    const g = new OccupancyGrid(3, 3);
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        g.setCell(x, y, 1);
      }
    }
    g.getDirtyAndClear();

    const regions = getAllRegions(g);
    expect(regions).toHaveLength(1);
    expect(regions[0]).toHaveLength(9);
  });
});
