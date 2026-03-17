import { MAP_WIDTH, MAP_HEIGHT } from '../types/constants';

export interface Tile {
  food:    number;
  wood:    number;
  foodMax: number;
  woodMax: number;
}

// Flat array: tile at (x, y) = tiles[y * MAP_WIDTH + x]
export type TileMap = Tile[];

function gaussian(x: number, y: number, cx: number, cy: number, sigma: number): number {
  const dx = x - cx;
  const dy = y - cy;
  return Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
}

export function createMap(seed: number): TileMap {
  // Simple seeded PRNG (mulberry32)
  let s = seed >>> 0;
  function rand(): number {
    s |= 0; s = s + 0x6d2b79f5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  _regenCallCount = 0;
  const tiles: TileMap = [];

  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      // Food: Gaussian cluster centred on (25, 12), σ=10, max tile value 10
      const foodVal = gaussian(x, y, 25, 12, 10) * 10 * (0.5 + rand() * 0.5);
      // Wood: two overlapping Gaussian clusters in southern half for higher density;
      // σ widened to 14 and max tile value raised to 18 so Avg Wood reaches ~8-10.
      const woodVal = (
        gaussian(x, y, 20, 37, 14) * 18 +
        gaussian(x, y, 32, 40, 10) *  8
      ) * (0.5 + rand() * 0.5);

      tiles.push({
        food:    foodVal,
        wood:    woodVal,
        foodMax: 10,
        woodMax: 18,
      });
    }
  }

  return tiles;
}

export function tileAt(tiles: TileMap, x: number, y: number): Tile {
  const xi = Math.max(0, Math.min(MAP_WIDTH  - 1, Math.floor(x)));
  const yi = Math.max(0, Math.min(MAP_HEIGHT - 1, Math.floor(y)));
  return tiles[yi * MAP_WIDTH + xi];
}

// Regenerate resources after each tick.
// Food: 0.1 units/tick (unchanged).
// Wood: 0.3 units/tick (3× food rate) to support higher Avg Wood equilibrium.
let _regenCallCount = 0;
export function regenerateTiles(tiles: TileMap): void {
  _regenCallCount++;
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    t.food = Math.min(t.foodMax, t.food + 0.1);
    t.wood = Math.min(t.woodMax, t.wood + 0.3);
  }
  if (_regenCallCount === 60) {
    const peak = tileAt(tiles, 20, 37);
    console.log(`[map] tick 60 — tile (20,37) wood=${peak.wood.toFixed(3)} foodMax=${peak.foodMax} woodMax=${peak.woodMax}`);
  }
}
