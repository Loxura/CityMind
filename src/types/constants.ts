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

// Phase 6 initial conditions — Morocco urban seed (500 agents, Gini ~0.40)
export const INITIAL_AGENT_COUNT = 500;
export const INITIAL_FOOD        = 20;
export const INITIAL_WOOD        = 5;
export const INITIAL_ENERGY      = 100;

// Trade survival buffers — agents only trade surplus above these floors
export const FOOD_SURVIVAL_BUFFER = 10;
export const WOOD_SURVIVAL_BUFFER = 2;  // temporarily lowered from 5 to confirm trades execute

// Phase 7+ — progressive food decay rates (physical process; always applied per tick)
// food > 100 : HIGH tier — ~0.8% loss/tick, stockpile erosion for wealthy agents
// food 20–100: MID  tier — ~0.2% loss/tick, gentle pressure on comfortable agents
// food ≤ 20  : no decay  — subsistence agents fully protected
export const FOOD_DECAY_RATE_HIGH = 0.992;
export const FOOD_DECAY_RATE_MID  = 0.998;

// Phase 8 — Housing and construction constants
// HOUSE_DECAY_RATE_*: progressive decay mirroring food decay pattern.
// Large portfolios (>10) erode at 0.5%/tick so builders must keep building.
export const HOUSE_DECAY_RATE_HIGH = 0.995;  // houses > 10
export const HOUSE_DECAY_RATE_MID  = 0.998;  // houses > 5
export const HOUSE_DECAY_RATE_LOW  = 0.999;  // houses ≤ 5

// SHELTER_ENERGY_PENALTY: extra energy drain per tick when agent is unsheltered.
// Adds to the base -1/tick drain. Agents need either HOUSES≥1 or to pay rent.
export const SHELTER_ENERGY_PENALTY = 0.5;

// HOUSE_ASSET_VALUE: fixed mark per house unit in the active wealth numeraire.
// Chosen so 5 houses ≈ 100 wealth. This remains a calibration proxy until the
// housing market produces an observed sale-price series.
export const HOUSE_ASSET_VALUE = 20;

// MAX_HOUSES_PER_AGENT: hard cap matching neural net normalisation max (input 5 max=20).
// Construction halts when this is reached.
export const MAX_HOUSES_PER_AGENT = 20;

// CONSTRUCTION_RATE: per-tick scaling of the Cobb-Douglas batch coefficient (A=1.0).
// PRODUCTION.CONSTRUCTION.A=1.0 is a full-project coefficient; applying it per-tick
// at 60 tps would produce ~97 houses/min per builder. CONSTRUCTION_RATE=0.05 gives
// ~0.08 houses/tick → cap reached in ~247 ticks — meaningful build timescale.
export const CONSTRUCTION_RATE = 0.05;

// MAX_WOOD_PER_CONSTRUCTION: wood consumed by a builder per tick (upper bound).
export const MAX_WOOD_PER_CONSTRUCTION = 5;

// WOOD_BUILD_BUFFER: builder keeps this much wood above WOOD_SURVIVAL_BUFFER before building.
// Prevents builders from consuming all wood and starving the barter market.
export const WOOD_BUILD_BUFFER = 4;

// HOUSE_RENT_PER_TICK: cash a renter pays per tick for shelter access.
// Landlord receives (1-taxRate) × HOUSE_RENT_PER_TICK; treasury receives taxRate portion.
export const HOUSE_RENT_PER_TICK = 1.0;

// LAND_RENT_PER_TICK: cash per land unit per tick collected by landowners (auctioned policy).
export const LAND_RENT_PER_TICK = 0.5;

// MAX_RENT_SLOTS_PER_LANDLORD: maximum renters a single landlord can service per tick.
// Prevents a single mega-landlord from sheltering the entire nearby population.
export const MAX_RENT_SLOTS_PER_LANDLORD = 5;

// Tick loop
export const STATS_INTERVAL = 60; // emit SimStats every N ticks
export const TARGET_TPS      = 60; // ticks per second target
