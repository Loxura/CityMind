import { describe, expect, it } from 'vitest';
import { SpatialGrid } from '../../../src/sim/grid';

describe('SpatialGrid', () => {
  it.each([
    {
      name: 'top-left corner',
      query: [0, 0],
      nearby: [5, 5],
      alias: [49, 0],
    },
    {
      name: 'top-right corner',
      query: [49, 0],
      nearby: [40, 5],
      alias: [0, 5],
    },
    {
      name: 'bottom-left corner',
      query: [0, 49],
      nearby: [5, 40],
      alias: [49, 40],
    },
    {
      name: 'bottom-right corner',
      query: [49, 49],
      nearby: [40, 40],
      alias: [0, 45],
    },
    {
      name: 'left edge',
      query: [0, 25],
      nearby: [5, 25],
      alias: [49, 20],
    },
    {
      name: 'right edge',
      query: [49, 25],
      nearby: [40, 25],
      alias: [0, 30],
    },
  ])('does not alias out-of-bounds cells at the $name', ({ query, nearby, alias }) => {
    const grid = new SpatialGrid(50, 50, 5);
    const nearbyIdx = 1;
    const aliasIdx = 2;

    grid.register(nearbyIdx, nearby[0], nearby[1]);
    grid.register(aliasIdx, alias[0], alias[1]);

    const neighbours = grid.getNeighbours(query[0], query[1]);
    expect(neighbours).toContain(nearbyIdx);
    expect(neighbours).not.toContain(aliasIdx);
  });

  it('keeps the complete two-ring window for an interior cell', () => {
    const grid = new SpatialGrid(50, 50, 5);
    grid.register(1, 0, 0);    // two cells north-west
    grid.register(2, 20, 20);  // two cells south-east
    grid.register(3, 25, 10);  // three cells east

    expect(grid.getNeighbours(10, 10)).toEqual([1, 2]);
  });
});
