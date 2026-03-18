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

// MAX_AGENTS: SAB allocation ceiling — hard physical limit of the SharedArrayBuffer.
// Raising this increases RAM usage linearly (~844 floats × 4 bytes = ~3.4 KB per slot).
// Never exceeded; reproduction and compaction both check against it.
export const MAX_AGENTS = 100_000;
export const SAB_SIZE = MAX_AGENTS * AGENT_STRIDE * 4; // bytes (~322 MB)

// MAX_STABLE_POPULATION: inference-safe operating limit for Phases 3–6.
// At 500 agents the per-tick weight tensors (W1=[500,40,16]=12.8MB, W2=[500,16,8]=2.56MB,
// W3=[500,8,7]=1.12MB) total ~16.5 MB GPU per tick — well within WebGL budget.
// At 4,000+ agents these tensors exceed 130 MB/tick and saturate VRAM at 60 fps.
// Do NOT raise above 500 until Phase 7 performance pass (WebGPU compute shaders).
// This is separate from MAX_AGENTS: the SAB can hold 100k agents; the GPU can only
// batch-infer 500 safely on WebGL.
export const MAX_STABLE_POPULATION = 500;

// Map constants
export const MAP_WIDTH  = 50;
export const MAP_HEIGHT = 50;

// Phase 1 initial conditions
export const INITIAL_AGENT_COUNT = 200;
export const INITIAL_FOOD        = 20;
export const INITIAL_WOOD        = 5;
export const INITIAL_ENERGY      = 100;

// Trade survival buffers — agents only trade surplus above these floors
export const FOOD_SURVIVAL_BUFFER = 10;
export const WOOD_SURVIVAL_BUFFER = 2;  // temporarily lowered from 5 to confirm trades execute

// Tick loop
export const STATS_INTERVAL = 60; // emit SimStats every N ticks
export const TARGET_TPS      = 60; // ticks per second target
