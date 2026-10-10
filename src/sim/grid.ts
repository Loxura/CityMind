import { MAP_WIDTH, MAP_HEIGHT } from '../types/constants';

export class SpatialGrid {
  private cells: Map<number, number[]> = new Map();
  private readonly cellSize: number;
  private readonly cols: number;
  private readonly rows: number;

  constructor(
    mapWidth: number  = MAP_WIDTH,
    mapHeight: number = MAP_HEIGHT,
    cellSize: number  = 5,
  ) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(mapWidth / cellSize);
    this.rows = Math.ceil(mapHeight / cellSize);
  }

  cellKey(x: number, y: number): number {
    return Math.floor(x / this.cellSize) + Math.floor(y / this.cellSize) * this.cols;
  }

  register(agentIdx: number, x: number, y: number): void {
    const key = this.cellKey(x, y);
    let cell = this.cells.get(key);
    if (!cell) { cell = []; this.cells.set(key, cell); }
    cell.push(agentIdx);
  }

  // Returns agent indices within a 2-ring radius (5×5 cell window = up to 25 cells).
  // With cellSize=5 this covers a 25×25 tile area — enough to find wood-zone partners.
  getNeighbours(x: number, y: number): number[] {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const result: number[] = [];
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || nx >= this.cols || ny < 0 || ny >= this.rows) continue;

        const key = nx + ny * this.cols;
        const cell = this.cells.get(key);
        if (cell) {
          for (let i = 0; i < cell.length; i++) result.push(cell[i]);
        }
      }
    }
    return result;
  }

  clear(): void {
    this.cells.clear();
  }
}
