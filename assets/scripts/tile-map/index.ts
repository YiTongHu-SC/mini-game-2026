/**
 * tile-map module — barrel export
 *
 * Import this module to access all tile-map functionality:
 *   import { OccupancyGrid, AutoTileResolver, ... } from './tile-map';
 */

export { OccupancyGrid } from './OccupancyGrid';
export type { GridCoord } from './OccupancyGrid';

export { AutoTileResolver } from './AutoTileResolver';
export type { ResolveResult } from './AutoTileResolver';

export {
  BIT,
  createDefaultConfig,
  createDefaultMaskTable,
  MASK_DESCRIPTIONS,
} from './TileMapConfig';
export type { TileMapConfig, MaskValue } from './TileMapConfig';

export { getConnectedRegion, getAllRegions } from './ConnectedRegion';

export { VisualTilemapRenderer } from './VisualTilemapRenderer';

export { TiledMapController } from './TiledMapController';

// ── Dual-grid system ──

export { STRIDE, visualGridSize } from './DualGridTypes';
export type { VisualCellType, VisualCellInfo, OccupancyRule } from './DualGridTypes';

export { DualGridMapper } from './DualGridMapper';

export { DualGridController } from './DualGridController';

// ── Block / Wall system ──

export { BlockManager } from './BlockManager';
export type { WallEdge } from './BlockManager';

// ── Level system ──

export type { CellCoord, BlockData, LevelData } from './LevelTypes';

export { LevelLoader } from './LevelLoader';
export type { LevelLoadResult } from './LevelLoader';
