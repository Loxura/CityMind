// SAB field offsets — Float32 units (4 bytes each).
// Do not use raw index arithmetic; use getField/setField from src/sim/agent.ts.
export const AGENT_FIELDS = {
  ID:               0,   // uint32 encoded as float
  ROLE:             1,   // 0-5 float encoding of AgentRole
  X:                2,
  Y:                3,
  FOOD:             4,
  WOOD:             5,
  TOOLS:            6,
  HOUSES:           7,
  CLOTHING:         8,
  FISH:             9,
  LABOUR_SOLD:      10,
  LABOUR_HIRED:     11,
  WAGE_RESERVATION: 12,
  LAND:             13,
  CASH:             14,  // Phase 7+; 0 before
  DEBT:             15,  // Phase 8+; 0 before
  SHARES:           16,  // Phase 9+; 0 before
  WEALTH:           17,  // computed each tick
  AGE:              18,
  ENERGY:           19,
  // Neural net weights start at offset 20 (Phase 3+)
  WEIGHTS_START:    20,
} as const;

// Net: 40→16→8→7
// Weights: (40*16) + (16*8) + (8*7) = 640 + 128 + 56 = 824 floats
export const WEIGHT_COUNT = 824;
export const AGENT_STRIDE = 20 + WEIGHT_COUNT; // 844 floats per agent

export const MAX_AGENTS = 100_000;
export const SAB_SIZE = MAX_AGENTS * AGENT_STRIDE * 4; // bytes (~322 MB)

// Map constants
export const MAP_WIDTH  = 50;
export const MAP_HEIGHT = 50;

// Phase 1 initial conditions
export const INITIAL_AGENT_COUNT = 200;
export const INITIAL_FOOD        = 20;
export const INITIAL_WOOD        = 5;
export const INITIAL_ENERGY      = 100;

// Tick loop
export const STATS_INTERVAL = 60; // emit SimStats every N ticks
export const TARGET_TPS      = 60; // ticks per second target
