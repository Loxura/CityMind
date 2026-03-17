import { MAP_WIDTH, MAP_HEIGHT } from '../types/constants';

export class SpatialGrid {
  private cells: Map<number, number[]> = new Map();
  private readonly cellSize: number;
  private readonly cols: number;

  constructor(
    mapWidth: number  = MAP_WIDTH,
    mapHeight: number = MAP_HEIGHT,
    cellSize: number  = 5,
  ) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(mapWidth / cellSize);
    void mapHeight; // stored implicitly via key arithmetic
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

  // Returns agent indices in the same cell and all 8 adjacent cells
  getNeighbours(x: number, y: number): number[] {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const result: number[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = (cx + dx) + (cy + dy) * this.cols;
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
