# AGENTS.md — CityMind

> This file is the single source of truth for Codex working on this project.
> Read it fully before touching any file. Do not infer intent from code alone —
> if something conflicts with this document, the document wins and you flag the conflict.
>
> Experimental results, Gini numbers, population outcomes, and the full changelog
> are in FINDINGS.md.

---

## Scope of the final Rust port

The user approved the native Rust rewrite and the consolidation of Rust and
browser fixes into `rust-bevy-port` in October 2026. Both implementations are
present. This section qualifies the browser-specific architecture rules below;
the shared economic contracts, Phase 9 scope, independent prices, shuffled order,
net-worth synchronization, and changelog requirements still apply.

- `crates/citymind-core` owns native simulation logic in ordinary Rust agent structs.
  It uses CPU inference and synchronous seeded evolution every 100 ticks, with no
  SharedArrayBuffer, TF.js, or browser workers. Simulation logic belongs in that
  crate; CLI and Bevy invoke it rather than duplicating economic mechanics.
- `crates/citymind-cli` runs headless experiments, exports summaries, and saves or
  resumes full state. `crates/citymind-bevy` renders a native resource map and agents
  with policy presets. The browser-only prohibition on rendering agents does not
  apply to this approved native view.
- The React application under `src/` continues to use its worker architecture.
  The prohibition on main-thread simulation and the SAB/TF.js rules still apply
  to the browser implementation.
- Native saves and exports use `measurement_version: 1`; old full saves must be
  rejected because their accounting and history cannot be repaired reliably.
- Native verification is `cargo fmt --all -- --check`,
  `cargo test -p citymind-core --locked`, and `cargo check --workspace --locked`.
  Opt into the 500-agent native throughput check with
  `cargo test --release -p citymind-core --locked -- --ignored --nocapture`.
  Browser verification is `npm run verify`.
- Rust wood regeneration is 1.0 per tile per tick. The browser reference retains
  its earlier 0.3 rate. This difference and the existing native neural-input and
  evolution differences prevent claims of exact behavioral parity.
- The well-fed energy claim below conflicts with the formula at the implemented
  0.5 food consumption: the result is -0.25 before shelter costs. Preserve the
  implemented formula pending a separate calibration decision.

See RUST.md for native usage, accounting, compatibility, and remaining limitations.
Historical experiments in FINDINGS.md require fresh baselines after the repairs.

---

## What this project is

CityMind is a **headless agent-based economic policy simulator** running entirely
in the browser. No game canvas. No rendered agents. The interface is a policy
console (sliders and dropdowns) and a real-time macro dashboard (D3.js charts).

The user is the policymaker of a closed island of up to 100,000 agents. They set
fiscal and monetary policy and observe what the aggregate economy does in response.

**Primary research question:**
Does UBI unlock economic growth and innovation, or does it primarily redistribute
without expanding total output in a closed economy?

The simulation produces an empirical answer — it does not assume one.

---

## Architecture — read this before writing any code

### Thread model (non-negotiable)

```
Main thread      →  React UI + D3 dashboard only. No simulation logic ever.
Sim Worker       →  Tick loop, spatial hash, market engine, SimStats emission.
Evolution Worker →  Neuroevolution (runs every 100 ticks, async, never blocks sim).
GPU (TF.js)      →  Batched neural net forward pass. One matMul call per tick layer.
```

**Rule:** If you are about to write simulation logic on the main thread, stop.
Move it to the Sim Worker. The main thread only calls `postMessage` and renders.

### Communication

- **SharedArrayBuffer** (`agentSAB`): flat Float32Array of all agent state.
  Written by Sim Worker, read by main thread for stats. Never written by main thread.
- **postMessage** (Sim Worker → main thread): `SimStats` object every 60 ticks.
- **postMessage** (main thread → Sim Worker): policy changes, pause/resume, seed.
- **postMessage** (Sim Worker → Evolution Worker): fitness array every 100 ticks.
  Evolution Worker writes new weights back to `agentSAB` and signals completion.

### Performance rules

- Neural net inference: **one** `tf.matMul` call per layer per tick for ALL agents.
  Never loop `tf.predict` per agent — that's 50,000 shader dispatches instead of 3.
- Market matching: spatial hash grid only. Never O(n²) neighbour search.
- Neuroevolution: runs in Evolution Worker, async. Sim does not wait for it.
- Target: 60 ticks/sec at 5,000 agents (Phase 1). Scales to 50,000+ by Phase 3 perf pass.

---

## Repository structure

```
citymind/
├── AGENTS.md
├── FINDINGS.md              ← Changelog, experimental results, Gini numbers
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
│
├── src/
│   ├── main.tsx
│   ├── App.tsx                  ← Layout: PolicyConsole | Dashboard
│   │
│   ├── sim/
│   │   ├── worker.ts            ← Web Worker entry point
│   │   ├── tick.ts              ← Master tick loop
│   │   ├── agent.ts             ← SAB offsets, accessors
│   │   ├── grid.ts              ← Spatial hash grid
│   │   ├── map.ts               ← Tile map, resource distribution
│   │   ├── harvest.ts           ← Production functions (Cobb-Douglas)
│   │   ├── labour.ts            ← Labour market matching (Phase 4+)
│   │   ├── market.ts            ← Bilateral goods trade engine
│   │   ├── tax.ts               ← Tax collection + redistribution models
│   │   ├── lifecycle.ts         ← Agent aging, death, reproduction
│   │   ├── housing.ts           ← Housing market, shelter, construction (Phase 8+)
│   │   ├── stats.ts             ← SimStats computation
│   │   └── policy.ts            ← Policy state (receives from main thread)
│   │
│   ├── net/
│   │   ├── inference.ts         ← TF.js batched forward pass
│   │   ├── weights.ts           ← Weight tensor management in SAB
│   │   └── inputs.ts            ← Build input matrix from agent SAB
│   │
│   ├── evolution/
│   │   ├── worker.ts            ← Evolution Worker entry point
│   │   ├── selection.ts         ← Fitness ranking, parent selection
│   │   ├── crossover.ts         ← Weight crossover
│   │   └── mutation.ts          ← Gaussian mutation
│   │
│   ├── dashboard/
│   │   ├── Dashboard.tsx
│   │   ├── ScenarioComparison.tsx
│   │   ├── DashboardTier.tsx
│   │   ├── charts/
│   │   │   ├── GiniChart.tsx
│   │   │   ├── WealthHistogram.tsx
│   │   │   ├── PriceChart.tsx
│   │   │   ├── WageChart.tsx
│   │   │   ├── LabourShareChart.tsx
│   │   │   ├── EmploymentChart.tsx
│   │   │   ├── PopulationChart.tsx
│   │   │   ├── GdpChart.tsx
│   │   │   ├── RentIncomeChart.tsx
│   │   │   ├── CreditGdpChart.tsx
│   │   │   ├── TechAdoptionChart.tsx
│   │   │   ├── StockIndexChart.tsx
│   │   │   ├── InflationChart.tsx
│   │   │   ├── TradeVolumeChart.tsx
│   │   │   ├── AvgResourceChart.tsx
│   │   │   └── PolicyImpactScatter.tsx
│   │   └── useSimStats.ts
│   │
│   ├── console/
│   │   ├── PolicyConsole.tsx
│   │   ├── controls/
│   │   │   ├── TaxSlider.tsx
│   │   │   ├── RedistributionSelect.tsx
│   │   │   ├── UbiAmountSlider.tsx
│   │   │   ├── MinWageSlider.tsx
│   │   │   ├── LandPolicySelect.tsx
│   │   │   ├── CentralBankControls.tsx   ← Phase 7+
│   │   │   ├── BankingControls.tsx       ← Phase 9+
│   │   │   └── ExchangeControls.tsx      ← Phase 9+
│   │   └── ScenarioManager.tsx
│   │
│   └── types/
│       ├── sim.ts
│       ├── messages.ts
│       ├── constants.ts
│       └── events.ts
│
└── public/
    └── workers/
```

---

## Agent SAB layout

All offsets in Float32 units (4 bytes each). Never use raw index arithmetic —
always use `getField`/`setField` from `src/sim/agent.ts`.

```typescript
export const AGENT_FIELDS = {
  ID:               0,
  ROLE:             1,   // 0=farmer,1=builder,2=merchant,3=banker,4=capitalist,5=worker
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
  DEBT:             15,  // Phase 9+; 0 before
  SHARES:           16,  // Phase 9+; 0 before
  WEALTH:           17,  // computed each tick
  AGE:              18,
  ENERGY:           19,
  WEIGHTS_START:    20,
} as const;

// Net: 40→16→8→7
// Weights: (40*16) + (16*8) + (8*7) = 640 + 128 + 56 = 824 floats
export const WEIGHT_COUNT = 824;
export const AGENT_STRIDE = 20 + WEIGHT_COUNT; // 844 floats per agent
export const MAX_AGENTS = 100_000;
export const SAB_SIZE = MAX_AGENTS * AGENT_STRIDE * 4; // ~322 MB
```

---

## Neural net — exact specification

**Architecture:** 40 → 16 → 8 → 7

**Input vector (40 dims):**

```
 0  own food stock            (normalised 0-1, max=200)
 1  own wood stock            (normalised, max=200)
 2  own tools                 (normalised, max=50)
 3  own clothing              (normalised, max=100)
 4  own fish                  (normalised, max=100)
 5  own houses owned          (normalised, max=20)
 6  own land                  (normalised, max=50)
 7  own cash                  (normalised, max=10000; 0 before Phase 7)
 8  own debt-to-wealth ratio  (clamp 0-1)
 9  own energy                (normalised, max=100)
10  own wealth percentile     (0-1)
11  labour sold last tick     (0 or 1)
12  current wage rate         (normalised, max=50)
13  local unemployment rate   (0-1)
14  labour hired last tick    (normalised, max=20)
15-23  local food tile values (3x3 around agent, normalised 0-1)
24-32  local wood tile values (3x3 around agent, normalised 0-1)
33  nearby agent count        (normalised, max=30)
34  food market price         (normalised, max=100)
35  wood market price         (normalised, max=100)
36  land rent index           (normalised, max=200; 0 before Phase 4)
37  central bank base rate    (0-0.2; 0 before Phase 7)
38  current tax rate          (0-0.5)
39  stock index               (normalised, max=1000; 0 before Phase 9)
```

**Output vector (7 dims):**

```
0  move direction     Softmax(5)    → argmax → [stay, N, S, E, W]
1  primary action     Softmax(4)    → argmax → [harvest, trade-goods, sell-labour, hire-labour]
2  offer price        tanh → *50    → goods sell offer price
3  accept threshold   tanh → *50    → goods buy accept threshold
4  reservation wage   sigmoid → *30 → min wage to accept
5  invest signal      sigmoid       → >0.7 triggers credit-seeking (Phase 9+)
6  risk appetite      sigmoid       → portfolio aggressiveness (Phase 9+)
```

**Batched inference — the only correct pattern:**

```typescript
export function runInference(
  inputMatrix: Float32Array,  // shape [n, 40]
  w1: tf.Tensor2D,            // [40, 16]
  w2: tf.Tensor2D,            // [16, 8]
  w3: tf.Tensor2D,            // [8, 7]
  n: number
): Float32Array {
  return tf.tidy(() => {
    const x = tf.tensor2d(inputMatrix, [n, 40]);
    const h1 = tf.relu(tf.matMul(x, w1));
    const h2 = tf.relu(tf.matMul(h1, w2));
    const out = tf.matMul(h2, w3);
    return out.dataSync() as Float32Array;
  });
}
```

Always wrap inference in `tf.tidy()`. Never call `tf.predict` in a loop per agent.
Weights live in the SAB — copy to tensor for inference, discard after.

---

## Production functions

Cobb-Douglas: `Output = A * L^α * K^β * Land^γ`

```typescript
export const PRODUCTION = {
  FARMING:      { A: 1.0, labourAlpha: 0.6, landGamma: 0.4 },
  FORESTRY:     { A: 1.0, labourAlpha: 0.5, landGamma: 0.3, toolsBeta: 0.2 },
  TOOL_CRAFT:   { A: 1.0, labourAlpha: 0.7, woodBeta: 0.3 },
  CONSTRUCTION: { A: 1.0, labourAlpha: 0.7, woodBeta: 0.3 },  // A*=1.8 with lumber
  SAWMILL:      { A: 3.0, labourAlpha: 0.3, woodBeta: 0.6, fuelGamma: 0.1 },
  FISHERY:      { A: 1.0, labourAlpha: 0.5, boatsBeta: 0.5 }, // * stochastic(0.5-1.5)
  TEXTILE_MILL: { A: 1.0, labourAlpha: 0.4, woodBeta: 0.3, fuelGamma: 0.3 },
} as const;
```

---

## Market mechanics — known decisions and clarifications

**wood_demand definition (Phase 2, resolved):**
`wood_demand = (B.wood - WOOD_SURVIVAL_BUFFER) / offer_price`
Units B can afford at offer_price given B's surplus wood budget.
Dimensionally: [wood] / [wood per food] = [food units]. Do not reimplement.

**Independent price discovery (Phase 3, resolved):**
Food and wood prices are tracked by two separate ring buffers — `foodPriceRing`
and `woodPriceRing`. Wood price is NEVER derived as `1 / foodPrice`. That identity
was a Phase 2 bug and has been permanently removed. Both prices are independently
discovered from their own trade histories. Seed value for both: 5.0.

**Tick order (Phase 9, current):**
0. Recompute opening WEALTH in the current regime before wealth ranks/inference
   (required when currency activation changes the numeraire between ticks)
1. Shuffle agent order
2. Harvest loop (ageAgent → harvestAgent → applyConstruction → applyHouseDecay → applyFoodDecay → isDead)
3. Grid register (post-harvest, dead agents excluded)
3.5. runEmergencyMarket (Phase 7+, gated on isCurrencyActive)
4. Labour market matching
5. runMarket (goods trades with post-harvest inventories)
6. runHousingRent (Phase 8+)
7. applyShelterDrain (after rent market — renters marked sheltered before drain fires)
8. Recompute WEALTH for survivors immediately before redistribution; taxes have
   already been collected at the relevant goods trades and wage payments, then redistribute
8.25. Recompute WEALTH after redistribution and immediately before lending
8.5. runLending (Phase 9+) — debt service + new loans + default cascade
9. Lifecycle (tryReproduce only — death handled in step 2)
10. Compact dead agents + move children
10.5. Recompute final end-of-tick WEALTH for every survivor and newborn
11. regenerateTiles

**Energy restoration (Phase 3, resolved):**
Energy restores from food consumption each tick:
`newEnergy = Math.min(INITIAL_ENERGY, currentEnergy - 1 + foodConsumed * 1.5)`
Net energy: +0.25/tick when well-fed, -1/tick when starving.
isDead condition: `energy <= 0 AND food <= 0` — both must be true simultaneously.

**Food decay (Phase 7+):**
Progressive, always active once Phase 7 is loaded (not gated on isCurrencyActive):
- food > 100: × 0.992/tick
- food > 20:  × 0.998/tick
- food ≤ 20:  no decay — subsistence agents protected

**UBI transmission chain (Phase 8, now live):**
`tax → treasury → UBI (cash) → runEmergencyMarket → food → survival`
`tax → treasury → UBI (cash) → runHousingRent → shelter → survival`

**Authoritative WEALTH definition (Phase 9 measurement correction):**

`WEALTH` is stored net worth in the active regime's numeraire, floored at zero to
preserve the non-negative SAB invariant and the canonical `computeGini` contract.

```text
currency active:
  WEALTH = max(0,
    CASH
    + FOOD * foodMoneyPrice
    + WOOD * woodMoneyPrice
    + HOUSES * HOUSE_ASSET_VALUE
    - DEBT)

currency never activated (wood/resource numeraire):
  WEALTH = max(0,
    FOOD * foodPrice
    + WOOD
    + HOUSES * HOUSE_ASSET_VALUE)
```

Before currency is first activated, `CASH` and `DEBT` are excluded because no
monetary balance sheet exists and cash-denominated amounts are not comparable to
the resource numeraire. After bootstrap, monetary prices and the cash/debt
valuation regime persist if monetary transactions are paused; reactivation is
idempotent and does not grant cash again. Unpriced assets — currently tools,
clothing, fish, land, and shares —
are excluded in both regimes until an authoritative price series exists. Houses use
the fixed `HOUSE_ASSET_VALUE` mark in the current regime's numeraire.

The raw negative-net-worth amount is not currently exposed: agents whose included
liabilities exceed included assets are stored at `WEALTH = 0`. Consequently, Gini
and wealth-bracket statistics do not measure variation in insolvency below zero.
Pre-currency and post-bootstrap WEALTH are also different valuation regimes;
do not compare their levels or Gini series across the activation boundary as if
they used one continuous unit of account. This field is measured household private
net worth, not total economy-wide wealth: bank equity, treasury balances, and
issuer liabilities are outside the agent balance sheet.

Recompute WEALTH at all four authoritative synchronization points in the tick:
at the opening regime boundary before wealth ranks/inference, immediately before
redistribution, after redistribution and before lending, and after
lifecycle/compaction for final stats, fitness, and the next tick's inference.
Loan origination creates equal cash and debt and therefore must not create net
wealth by itself.

---

## SimStats contract

Emitted every 60 ticks via postMessage from Sim Worker:

```typescript
export interface SimStats {
  tick:             number;
  population:       number;
  avgFood:          number;
  avgWood:          number;
  avgHouses:        number;        // Phase 8+; 0 before
  gdp:              number;
  gini:             number;        // Gini of floored measured household net worth
  wealthBrackets:   number[];      // 10 decile agent counts
  wealthByBracket:  number[];      // 10 decile measured-net-worth totals
  wealthBoundaries: number[];      // 9 net-worth values: P10, P20, …, P90
  foodPrice:        number;        // independent ring buffer avg
  woodPrice:        number;        // independent ring buffer avg — NEVER 1/foodPrice
  wageRate:         number;        // Phase 4+; 0 before
  unemploymentRate: number;        // Phase 4+; 0 before
  labourShareOfGdp: number;        // Phase 4+; 0 before
  landRentIndex:    number;        // Phase 8+; 0 before
  avgIncome:        number;
  avgCash:          number;        // Phase 7+; 0 before
  inflationRate:    number;        // Phase 7+; 0 before (tracks barter foodPrice ring)
  creditToGdp:          number;        // Phase 9+; 0 before
  bankSolvency:         number;        // legacy name: capped bank capital ratio; 1.0 before Phase 9
  bankLoansOutstanding: number;        // Phase 9+; 0 before
  bankCapitalBuffer:    number;        // Phase 9+; 2000 at init
  roleCounts:           Record<AgentRole, number>;
  techsUnlocked:        TechId[];
  stockIndex:           number;        // Phase 10+; 0 before
  tradeCount:           number;        // cumulative all-time trades
  tickTradeCount:       number;        // trades this tick only (resets each tick)
}

export type AgentRole = 'farmer'|'builder'|'merchant'|'banker'|'capitalist'|'worker';
export type TechId = 'grain_silo'|'sawmill'|'fishery'|'textile_mill'|'bank_charter'|'stock_listing';
export type RedistributionModel = 'ubi'|'targeted_welfare'|'public_goods'|'infrastructure'|'none';
export type SeedMode = 'morocco' | 'flat';

export interface PolicyState {
  taxRate:            number;   // 0-0.5
  redistribution:     RedistributionModel;
  ubiAmount:          number;   // fraction of treasury per tick per agent
  minWage:            number;   // 0 = off
  landPolicy:         'state'|'auctioned'|'free';
  isCurrencyActive:   boolean;  // Phase 7+
  centralBankRate:    number;   // Phase 7+; nominal rate per simulation tick
  moneySupplyGrowth:  number;   // Phase 7+
  reserveRequirement: number;   // legacy key: minimum bank capital ratio, Phase 8+
  capitalGainsTax:    number;   // Phase 9+
  marginLendingLimit: number;   // Phase 9+
}
```

**Gini function — use this exactly, do not reimplement:**

```typescript
export function computeGini(wealths: Float32Array, n: number): number {
  const sorted = Array.from(wealths.subarray(0, n)).sort((a, b) => a - b);
  const mean = sorted.reduce((s, w) => s + w, 0) / n;
  if (mean === 0) return 0;
  return sorted.reduce((s, w, i) => s + (2 * i - n + 1) * w, 0) / (n * n * mean);
}
```

---

## Map constants and calibration (current live values)

```typescript
export const MAP_WIDTH  = 50;
export const MAP_HEIGHT = 50;
export const INITIAL_AGENT_COUNT  = 500;   // raised Phase 6 to match Morocco seed
export const INITIAL_FOOD         = 20;
export const INITIAL_WOOD         = 5;     // children spawn with 3
export const INITIAL_ENERGY       = 100;
export const FOOD_SURVIVAL_BUFFER = 10;
export const WOOD_SURVIVAL_BUFFER = 2;
export const STATS_INTERVAL       = 60;
export const TARGET_TPS           = 60;
export const MAX_STABLE_POPULATION = 500;  // WebGL inference ceiling; do not raise before Phase 7 WebGPU pass
export const FOOD_DECAY_RATE      = 0.995; // default; crash guard may raise to 0.998
```

**Map tile ceilings (fixed, not initial values):**
```typescript
foodMax: 10   // all tiles
woodMax: 18   // all tiles — NOT set to initial wood value
```

Wood regeneration: 1.0 units/tile/tick. Food regeneration: 0.1 units/tile/tick.
Wood clusters: two Gaussian centres at (20,37) σ=14 and (32,40) σ=10.
Food cluster: Gaussian centre at (25,12) σ=10.

**Phase 8 housing constants:**
```typescript
HOUSE_DECAY_RATE_HIGH = 0.995  // houses > 10
HOUSE_DECAY_RATE_MID  = 0.998  // houses > 5
HOUSE_DECAY_RATE_LOW  = 0.999  // houses ≤ 5
SHELTER_ENERGY_PENALTY = 0.5   // extra energy drain/tick when unsheltered
HOUSE_ASSET_VALUE      = 20    // multiplier in wealth computation
MAX_HOUSES_PER_AGENT   = 20
CONSTRUCTION_RATE      = 0.05
MAX_WOOD_PER_CONSTRUCTION = 5
WOOD_BUILD_BUFFER      = 4     // builder keeps this as floor above WOOD_SURVIVAL_BUFFER
HOUSE_RENT_PER_TICK    = 1.0
LAND_RENT_PER_TICK     = 0.5
MAX_RENT_SLOTS_PER_LANDLORD = 5
```

**Reproduction rules (current):**
- Requires: food > 60 AND age % 20 === 0
- Child spawns with: food = parent.food / 2, wood = 3, energy = INITIAL_ENERGY
- Parent keeps: food / 2
- Hard cap: returns -1 immediately if activeCount >= MAX_STABLE_POPULATION

**Starting seed modes:**
- `'morocco'` (default): 500 agents from HCP Enquête Nationale 2022-2023
  Casablanca-Settat urban expenditure deciles. Implied Gini ≈ 0.40.
- `'flat'`: equal distribution, food=20, wood=5 for all agents.

---

## Open issues carried forward to Phase 10

- Money supply growth mechanic still deferred (aggregate bank foundation exists; fractional reserve not yet wired to money creation)
- `SHARES` field and `stockIndex` still 0 — Phase 10 stock exchange
- `capitalGainsTax` and `marginLendingLimit` still ignored — Phase 10
- Base rate transmission now live (higher rate → higher debt service → fewer loans → lower creditToGdp)

---

## Phase implementation plans

Do not implement features from Phase N+1 while working on Phase N.

---

### Phase 4 — Labour market, land, and policy console ✓ COMPLETE

See FINDINGS.md for changelog.

---

### Phase 5 — Full macro dashboard and scenario comparison ✓ COMPLETE

See FINDINGS.md for changelog.

---

### Phase 6 — Real-data seeding ✓ COMPLETE

See FINDINGS.md for changelog.

---

### Phase 7 — Currency and central bank ✓ COMPLETE

See FINDINGS.md for changelog.

---

### Phase 8 — Shelter and housing market ✓ COMPLETE

See FINDINGS.md for changelog.

---

### Phase 9 — Commercial banks and credit cycles ✓ COMPLETE

See FINDINGS.md for changelog.

---

### Phase 10 — Stock exchange and capital markets

Technology owners list equity. Order book matching. Dividends. Margin lending.
`SHARES` field, `stockIndex`, `capitalGainsTax`, `marginLendingLimit` all live.

---

## Conventions and rules for Codex

### Never do these things

- **Never write simulation logic on the main thread.**
- **Never call `tf.predict` in a loop per agent.** Always batch.
- **Never use raw index arithmetic on the SAB.** Use `getField`/`setField`.
- **Never store agent weights as persistent `tf.Tensor` objects.**
- **Never derive woodPrice from foodPrice.** They are independent.
- **Never add goods or mechanics not in this document without flagging it.**

### Always do these things

- **Always append to the Changelog in FINDINGS.md when completing a phase or significant change.**
- **Always check which phase you are implementing.**
- **Always validate tick rate after adding a new subsystem.**
- **Always use `tf.tidy()` around inference code.**
- **Always shuffle agent processing order each tick.**
- **Always use the provided Gini function from `stats.ts`.**
- **Always show implementation plan and wait for approval before writing files.**

### Error handling

- Worker crash → `SimToMain { type: 'ERROR' }` → UI shows error + reset button.
- TF.js WebGL unavailable → fall back to CPU, log warning, sim still runs.
- SAB allocation failure → reduce MAX_AGENTS to 50,000, log.

### Invariant assertions (development only, remove in production)

```typescript
function assertInvariants(sab: Float32Array, n: number): void {
  for (let i = 0; i < n; i++) {
    console.assert(getField(sab, i, AGENT_FIELDS.FOOD)   >= 0, `Agent ${i} negative food`);
    console.assert(getField(sab, i, AGENT_FIELDS.WEALTH) >= 0, `Agent ${i} negative wealth`);
    console.assert(getField(sab, i, AGENT_FIELDS.ENERGY) >= 0, `Agent ${i} negative energy`);
  }
}
```

Run every 60 ticks in development.

---

## Subagent prompts

### Subagent: Phase 4 — Labour market + policy console

```
You are implementing Phase 4 of CityMind.
Read AGENTS.md fully before writing anything — especially the Phase 4 section,
the labour market matching spec, the redistribution code, and the Changelog.

Phase 3 is complete. The baseline laissez-faire equilibrium is documented in
FINDINGS.md under "Phase baseline". The sim runs at ~120 agents, Gini ~0.93,
food price ~18.5, wood price ~26.7, with active bilateral markets for both goods.

Your task is Phase 4 exactly as specified. Before writing any files, output:
1. Every file you will create or modify
2. The labour matching protocol in pseudocode
3. All 5 redistribution models in one sentence each
4. How PolicyState changes will be communicated from main thread to Sim Worker
5. What dashboard metrics Phase 4 adds to SimStats

Wait for approval before writing any files.

When Phase 4 is complete, append a changelog entry to FINDINGS.md.
```

---

### Subagent: Labour market

```
You are implementing the labour market for CityMind Phase 4.
Read AGENTS.md fully, especially the Phase 4 labour matching section.

Your task: implement src/sim/labour.ts and update src/sim/tick.ts.

Labour is non-storable: 1 unit per agent per tick.
Bilateral matching via spatial grid. Employers bid; workers accept if
wage >= reservation wage (net output 4) AND wage >= policy.minWage.
Tax collected on wage payments at policy.taxRate.
Track wageHistory ring buffer (last 100 wages) and unemploymentRate.

Minimum wage is a hard floor — no trade executes below it.
Unemployment rising when minWage > clearing wage is correct behaviour.

Labour step runs at tick Step 4, before goods trading (Step 5).

Output: src/sim/labour.ts and updated src/sim/tick.ts.
```

---

### Subagent: Redistribution engine

```
You are implementing the tax and redistribution engine for CityMind Phase 4.
Read AGENTS.md fully, especially the redistribution section and PolicyState interface.

Your task: implement src/sim/tax.ts fully (all 5 models) and src/sim/policy.ts.

Tax collected at point of trade (goods) and wage payment (labour).
Treasury accumulated each tick, emptied by redistribution function.
Implement all 5 models exactly as in AGENTS.md.
Policy changes take effect next tick — no atomic transitions.

Output: src/sim/tax.ts and src/sim/policy.ts.
```

---

### Subagent: D3 dashboard

```
You are implementing the macro dashboard for CityMind Phase 5.
Read AGENTS.md fully, especially the SimStats interface and chart list.

Your task: all charts in src/dashboard/charts/*.tsx.

Each chart receives SimStats[] (rolling 500-entry history).
Use D3 enter/update/exit — never full redraw.
All SimStats fields that are 0 before their phase must render as flat
line at 0, not an error.
Use CSS variables for all colours — no hardcoded hex.
Series A = purple, Series B = teal (comparison mode).

Output: all chart components and src/dashboard/useSimStats.ts.
```

---

### Subagent: Scenario comparison

```
You are implementing scenario comparison mode for CityMind Phase 5.
Read AGENTS.md fully, especially the Phase 5 section.

Your task: src/console/ScenarioManager.tsx and updated App.tsx.

Scenario = { name: string, seed: number, policy: PolicyState }.
Persistence via IndexedDB (database: 'citymind', store: 'scenarios').
Comparison mode: sequential run + compare (not dual-worker).
Charts accept optional seriesB prop. A=purple, B=teal.

ScenarioManager UI: save current run, compare saved runs offline,
export JSON.

Output: ScenarioManager.tsx, updated App.tsx, updated chart components.
```

---

## Quick reference

| Thing you need | Where it lives |
|---|---|
| SAB field offsets | `src/types/constants.ts` → `AGENT_FIELDS` |
| Read/write agent field | `src/sim/agent.ts` → `getField` / `setField` |
| SimStats type | `src/types/sim.ts` |
| PolicyState type | `src/types/sim.ts` |
| Worker message types | `src/types/messages.ts` |
| Production function coefficients | `src/sim/harvest.ts` → `PRODUCTION` |
| Gini function | `src/sim/stats.ts` → `computeGini` |
| Market clarifications | AGENTS.md § "Market mechanics — known decisions" |
| Neural net input spec | AGENTS.md § "Neural net — exact specification" |
| What NOT to do | AGENTS.md § "Never do these things" |
| Phase baseline numbers | FINDINGS.md § "Phase baseline" |
| Experimental results | FINDINGS.md |
| Full changelog | FINDINGS.md § "Changelog" |
