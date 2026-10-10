# FINDINGS.md — CityMind

> Experimental results, calibration observations, and the implementation changelog.
> For the native architecture and accounting contract see [RUST.md](RUST.md).
> Earlier results below are historical records. Banking and gross-wealth results
> require fresh baselines after the correctness repairs; they do not establish
> policy effects under the current net-worth definition. The October 2026 entry
> records the native port and its verification.

---

## Phase baseline (established before Phase 4)

**Laissez-faire equilibrium at tick ~6720 (zero policy, zero redistribution):**
- Population: ~120
- Avg Food: ~1134 (extreme hoarding by surviving elite)
- Avg Wood: ~30
- Gini: 0.931 (near-maximum inequality)
- Food Price: ~18.5, Wood Price: ~26.7 (independent, wood > food as expected)
- Total trades: ~125,000
- Interpretation: winner-take-most dynamics. Small elite holds most resources.
  Population stable but low. This is the control condition for UBI experiments.

---

## Insight — March 2026 — Why Phase 4 UBI is incomplete

Phase 4 UBI distributes cash (AGENT_FIELDS.CASH) to all agents equally
each tick from treasury. However cash does not enter the survival loop
in Phases 1-6. Agents eat food directly from inventory — the survival
condition is food=0 AND energy=0. Cash cannot purchase food until
Phase 7 introduces currency as the medium of exchange in the goods
market.

Consequence: Phase 4 UBI will show negligible effect on population
and Gini. This is not a bug — it is a correct result given the
current mechanics. The transmission mechanism (cash → food purchase
→ survival) does not exist until Phase 7.

Phase 4 UBI is the wiring. Phase 7 UBI is the experiment.

The full causal chain required for UBI to affect survival:
  tax on trade → treasury → UBI payout (cash) →
  agent spends cash at food market → survives longer →
  population rises, Gini compresses

Do not interpret flat Phase 4 UBI results as the hypothesis
being falsified. The hypothesis is untested until Phase 7.

---

## Changelog

All changes appended here. Never overwrite existing entries.
Claude Code must add an entry when completing a phase or making a significant change.

---

### Manual — March 2026 — Worker wiring fix before Phase 2

- `src/App.tsx`: Worker stored in both ref (imperative postMessage) and useState
  (React re-render on ready). Previously ref-only; UI never re-rendered on init.
- `src/dashboard/useSimStats.ts`: Signature changed from `RefObject<Worker|null>`
  to `Worker|null`. useEffect depends on `[worker]` so listener attaches correctly.

---

### Phase 2 — March 2026 — Trade engine and price discovery

- `src/sim/market.ts`: Bilateral trade engine implemented. wood_demand defined as
  `(B.wood - WOOD_SURVIVAL_BUFFER) / offer_price` (dimensionally correct).
- `src/sim/tick.ts`: Tick order fixed — harvest runs BEFORE market so agents trade
  post-harvest inventories. Previous order (market before harvest) caused zero trades.
- `src/sim/map.ts`: woodMax decoupled from initial tile value — set to fixed ceiling
  of 18. Previously woodMax = initial woodVal, permanently capping sparse tiles at ~0.
  Wood regeneration raised to 1.0/tick. Wood clusters widened and densified.
- `src/types/constants.ts`: WOOD_SURVIVAL_BUFFER lowered from 5 to 2.
  tradeCount initialisation bug fixed (was set to agentCount instead of 0).
- `src/sim/stats.ts`: tickTradeCount added (resets each tick), separate from
  cumulative tradeCount.
- `src/sim/lifecycle.ts`: Reproduction threshold raised from food>30 to food>60.
  Cooldown added: age%20===0 required (max once per 20 ticks). Child wood changed
  from 0 to 3 so newborns are not immediately below survival buffer.
- `src/sim/lifecycle.ts`: updateWealth added — WEALTH = food + wood + cash each tick
  so non-trading agents have meaningful wealth for Gini computation.

---

### Phase 3 — March 2026 — Neural net agents and neuroevolution

- `src/net/inference.ts`: TF.js WebGL batched forward pass. One tf.matMul per layer
  for all agents simultaneously. tf.tidy() wraps all inference. Backend confirmed
  webgl at startup.
- `src/net/inputs.ts`: 40-dimensional input vector built from SAB per spec.
- `src/net/weights.ts`: Xavier initialisation for new agents. Weights stored in SAB
  at WEIGHTS_START offset per agent.
- `src/evolution/worker.ts`: Evolution Worker. Runs every 100 ticks async. Protocol:
  top 20% elite unchanged, next 60% crossover from top 50%, bottom 20% random.
  Gaussian mutation sigma=0.02 on non-elite. Writes weights back to SAB.
- `src/sim/market.ts`: Rewrote price discovery — two independent ring buffers
  (foodPriceRing, woodPriceRing). Removed woodPrice = 1/foodPrice identity entirely.
  Both seeded at 5.0. Food and wood trade flows separated.
- `src/sim/harvest.ts`: Energy restoration added — eating food restores energy at
  1.5x the food consumed minus 1 drain/tick. Previously energy was a 100-tick
  countdown with no restore, causing universal death after tick 100.
- `src/net/inputs.ts`: Price normalisation fixed — inputs 34/35 use /20 normalisation.
  Previously extreme prices (food=10, wood=0.095 from the 1/price bug) dominated
  inputs and caused nets to evolve pathological strategies.

---

### Phase 4 — March 2026 — Labour market, land, redistribution, policy console

- `src/sim/labour.ts`: Labour market matching implemented. Bilateral: employers
  (primaryAction==HIRE_LABOUR, land>0) bid MRP-derived wages; workers
  (primaryAction==SELL_LABOUR) accept if wageOffer >= reservationWage AND
  wageOffer >= policy.minWage. Wage tax collected at policy.taxRate.
  Wage ring buffer (100 entries), unemploymentRate, totalWages tracked per tick.
  MAX_WORKERS_PER_EMPLOYER=5. Returns treasury delta.

- `src/sim/tax.ts`: Full redistribution implemented — all 5 models:
  ubi (ubiAmount fraction of treasury to CASH equally), targeted_welfare
  (full treasury to poorest 20%), public_goods (60/40 food/wood split added to
  tiles), infrastructure (raise foodMax/woodMax on bottom 20% tiles), none
  (accumulate). Returns remaining treasury.

- `src/sim/tick.ts`: Phase 4 tick order canonised: net inference → harvest
  (Cobb-Douglas) → grid register → labour market → goods market →
  redistribution → lifecycle (reproduction only) → compact → tile regen.
  initAgents passes landFree=true when landPolicy='free'. Children also get
  land=1 when landFree.

- `src/sim/worker.ts`: initAgents call updated to pass
  policy.landPolicy === 'free' as 4th argument.

- `src/sim/stats.ts`: Pulls from getLabourStats() and getHarvestStats() to
  populate gdp (foodHarvested * foodPrice), wageRate, unemploymentRate,
  labourShareOfGdp (totalWages/gdp), avgIncome (totalWages/n), and roleCounts
  (from AGENT_FIELDS.ROLE). Previously all stub zeros.

- `src/dashboard/useSimStats.ts`: Rolling 500-entry history array added.
  setHistory maintains HISTORY_LENGTH=500 window for charts.

- `src/console/PolicyConsole.tsx`: Full policy console UI. All Phase 4 levers
  live-adjustable. Policy changes posted to Sim Worker immediately as POLICY
  message. Monetary section grayed out with Phase 7+ label.

- `src/console/controls/`: TaxSlider, RedistributionSelect, UbiAmountSlider,
  MinWageSlider, LandPolicySelect — all implemented as controlled components.

- `src/dashboard/charts/WageChart.tsx`: Plain SVG rolling line chart for
  wageRate. Colour: #7c5cfc (purple).

- `src/dashboard/charts/LabourShareChart.tsx`: Plain SVG rolling line chart for
  labourShareOfGdp (0-100%). Colour: #3cc8a0 (teal).

- `src/dashboard/charts/EmploymentChart.tsx`: Plain SVG rolling line chart for
  1-unemploymentRate (0-100%). Colour: #f0a040 (amber).

- `src/App.tsx`: Phase 4 layout — left column: PolicyConsole + controls; right
  column: stats table (with GDP, wage rate, unemployment, labour share) +
  3 new charts. Title updated to "CITYMIND — Phase 4".

- Note: D3 not installed; charts use plain SVG polyline — adequate for Phase 4.
  D3 install deferred to Phase 5 when full 12-panel dashboard is built.

- Note: Known behaviour: policy changes cause 2-5 tick slowdown due
  to wealth percentile sort (O(n log n)) on redistribution
  model switch. Acceptable at Phase 4 population caps.
  Revisit if Phase 7+ populations exceed 1000 agents regularly.

---

### UI architecture — March 2026 — Three-tier dashboard + policy event log

- `src/types/events.ts`: PolicyEvent type `{ tick, label, color }`. Fixed colours
  per field: taxRate=#7c5cfc, redistribution/ubiAmount=#3cc8a0, minWage=#f0a040,
  landPolicy=#e05555.

- `src/console/PolicyConsole.tsx`: Added `currentTick` and `onEvent` props.
  `update()` now generates a human-readable label from old→new values and calls
  `onEvent` for each changed key. Label examples: "Tax 0%→35%", "UBI on",
  "MinWage 5.0", "Land: state".

- `src/App.tsx`: Holds `events: PolicyEvent[]` in useState. Passes `currentTick`
  and `onEvent` to PolicyConsole. Events cleared on RESET. Stats table moved to
  left column alongside PolicyConsole. Right column is now `<Dashboard>` only.

- `src/dashboard/DashboardTier.tsx`: Collapsible tier wrapper. Chevron toggle.
  Collapse state persisted in localStorage (`citymind_tier2_open`,
  `citymind_tier3_open`).

- `src/dashboard/Dashboard.tsx`: Assembles all three tiers.
  Tier 1 (always visible): GiniChart, PopulationChart, PriceChart, GdpChart,
  PolicyEventLog.
  Tier 2 (open by default, label "Market detail"): WealthHistogram, WageChart,
  LabourShareChart, EmploymentChart, TradeVolumeChart, AvgResourceChart,
  PolicyImpactScatter.
  Tier 3 (collapsed by default, label "Advanced / future phases"): 6 stub tiles
  for Phase 5–9 charts (no component files created).

- `src/dashboard/charts/GiniChart.tsx`: Gini line, colour #e05555, event lines.
- `src/dashboard/charts/PopulationChart.tsx`: Population line, colour #7c5cfc,
  event lines.
- `src/dashboard/charts/PriceChart.tsx`: Food (amber #e0a040) + wood (cyan
  #60c0e0) two-line chart on shared axis, event lines.
- `src/dashboard/charts/GdpChart.tsx`: GDP line, colour #3cc8a0, event lines.
- `src/dashboard/charts/PolicyEventLog.tsx`: Vertical list of events, most recent
  first, coloured dot + tick + label. No SVG — plain div list.
- `src/dashboard/charts/WealthHistogram.tsx`: Bar chart from wealthBrackets[10].
  Colour gradient purple→teal (poor→rich).
- `src/dashboard/charts/TradeVolumeChart.tsx`: tickTradeCount line, colour
  #c0c060, event lines.
- `src/dashboard/charts/AvgResourceChart.tsx`: avgFood (#60c040) + avgWood
  (#c08040) two-line chart, event lines.
- `src/dashboard/charts/PolicyImpactScatter.tsx`: Gini (X 0–1) × Population
  (Y 0–500) scatter trail. Older points fade (opacity ramp). Newest point r=4.
  seriesB prop accepted but unused until Phase 5 scenario comparison (teal).
- WageChart, LabourShareChart, EmploymentChart: all updated to accept
  `events?: PolicyEvent[]` and render dashed vertical lines with labels.

- Event vertical lines pattern: `<line strokeDasharray="3,3">` at ev.tick
  mapped to x-coordinate, with `<text>` label at top. Only rendered when
  ev.tick is within the visible window [minTick, maxTick].

*CLAUDE.md v2.2 — CityMind — updated March 2026*
*Design document: CityMind_Design_Document_v2.docx*

---

### Phase 4 completion — March 2026 — GPU fixes, population cap, Piketty view, input polish

- `src/net/inference.ts`: TF.js GPU memory leak fixed. `dataSync()` inside
  `tf.tidy()` pins the WebGL readback buffer preventing texture release, causing
  VRAM saturation at 9.3/12 GB before crash. Fix: explicit per-tensor disposal
  chain (x, xExp, W1, mm1, … out each disposed immediately). Returns
  `new Float32Array(out.dataSync())` — independent copy severs TF.js buffer
  reference so the WebGL texture can be freed.

- `src/sim/worker.ts`: Texture pool flush added — `tf.engine().startScope();
  tf.engine().endScope()` every 10 ticks clears accumulated dead shape keys from
  n-varying weight tensors. `tf.memory()` monitor logged every 300 ticks
  (numTensors, numDataBuffers, numBytes). Prevents secondary VRAM saturation
  at high populations (tick 14k, pop 4,215) where W1 tensor alone was ~17 MB/tick.

- `src/types/constants.ts`: `MAX_STABLE_POPULATION = 500` added. Distinct from
  `MAX_AGENTS` (SAB physical ceiling 100k). WebGL inference limit: at 500 agents
  W1=[500,40,16]=12.8 MB/tick; above this VRAM saturates. Do NOT raise until Phase
  7 WebGPU compute shader pass.

- `src/sim/lifecycle.ts`: Hard population cap at top of `tryReproduce` — returns
  -1 immediately if `activeCount >= MAX_STABLE_POPULATION`. Prevents population
  from growing past the WebGL inference budget.

- `src/sim/stats.ts`: `wealthByBracket` (total wealth held per decile bin) added
  alongside `wealthBrackets` (agent count per decile). Same bin boundaries, sums
  wealth instead of counting agents. Piketty view: at Gini 0.93 the rightmost
  bar dwarfs all others, making wealth concentration visible where the count
  view only shows many poor agents.

- `src/types/sim.ts`: `wealthByBracket: number[]` added to SimStats.

- `src/dashboard/charts/WealthHistogram.tsx`: Toggle added — "Agents" | "Wealth
  held". Local useState, no prop. `abbreviate()` for large y-axis labels (k/M).

- `src/console/controls/TaxSlider.tsx`, `UbiAmountSlider.tsx`, `MinWageSlider.tsx`:
  Commit-on-release pattern. Local `useState` for drag display; `onChange` only
  sets local value (no postMessage). `onMouseUp` + `onTouchEnd` call `props.onChange`
  (triggers worker postMessage). `useEffect` syncs `localValue` when parent resets.

- Phase 4 fully validated. Dashboard confirmed working at tick 5000+, VRAM
  stable, population capped at 500, all charts rendering correctly.

---

### Phase 5 — March 2026 — Full macro dashboard and scenario comparison

- `src/dashboard/charts/RentIncomeChart.tsx`: landRentIndex line, colour #c8a05c.
  Stubbed at 0 until Phase 6 land auctions. seriesB prop supported.

- `src/dashboard/charts/CreditGdpChart.tsx`: creditToGdp line, colour #e05555.
  Stubbed at 0 until Phase 8 commercial banks. seriesB prop supported.

- `src/dashboard/charts/TechAdoptionChart.tsx`: techsUnlocked count (0–6), colour
  #3cc8a0. Stubbed at 0 until Phase 6. seriesB prop supported.

- `src/dashboard/charts/StockIndexChart.tsx`: stockIndex line, colour #7c5cfc.
  Stubbed at 0 until Phase 9 stock exchange. seriesB prop supported.

- `src/dashboard/charts/GiniChart.tsx`: seriesB prop added — teal dashed polyline
  when comparison active. Title shows both values colour-coded.

- `src/dashboard/charts/PopulationChart.tsx`: seriesB prop added — teal dashed
  polyline, shared y-axis max across both series.

- `src/dashboard/charts/PriceChart.tsx`: seriesB prop added — Series B food/wood
  rendered as dashed versions of the same amber/cyan colours at 0.5 opacity.

- `src/dashboard/charts/GdpChart.tsx`: seriesB prop added — teal dashed polyline,
  shared y-axis max.

- `src/dashboard/charts/PolicyImpactScatter.tsx`: seriesB prop was already
  accepted; now wired from Dashboard via historyB.

- `src/dashboard/charts/WealthHistogram.tsx`: statsB prop added for side-by-side
  comparison. In comparison mode each bin is split — Series A (purple gradient)
  left half, Series B (teal) right half. Shared y-axis.

- `src/console/ScenarioManager.tsx`: IndexedDB persistence (db 'citymind', store
  'scenarios', keyPath 'name'). SavedScenario = { name, seed, policy, savedAt }.
  UI: collapsible panel, save-name input, scenario table with →A / →B / export /
  delete actions, compare status line. Teal label shows active B scenario.

- `src/console/PolicyConsole.tsx`: onPolicyChange? prop added — called on every
  update so App can track current policy for ScenarioManager snapshot.

- `src/App.tsx`: Dual-worker support. workerBRef/workerB/statsB/historyB added.
  handleLoadA resets main worker with scenario seed+policy. handleLoadB boots a
  second SimWorkerUrl with scenario seed+policy. handleStopCompare terminates
  workerB. currentSeed and currentPolicy state tracked for ScenarioManager.
  Dashboard receives statsB and historyB. Title updated to "CITYMIND — Phase 5".

- `src/dashboard/Dashboard.tsx`: Accepts statsB/historyB. Passes seriesB to all
  supporting Tier 1 charts and PolicyImpactScatter. WealthHistogram receives
  statsB. Tier 3 stubs replaced with RentIncomeChart, CreditGdpChart,
  TechAdoptionChart, StockIndexChart. Label changed to "Advanced metrics".

- Comparison pattern: both workers start from same seed → identical tick-0 state.
  After INIT they diverge due to different PolicyState. Series A = purple (solid),
  Series B = teal (dashed, 4,2 strokeDasharray). TypeScript build: clean.

---

### Phase 5 bug fixes — March 2026 — SAB isolation, comparison UX, dual y-axes

- `src/App.tsx`: FIX 1 — `handleLoadA` deleted. Worker A is now only ever touched
  by `handleReset`, `handlePauseResume`, and the boot `useEffect`. Comparison
  functions never write to `workerRef`. `handleLoadB` renamed `handleCompare` —
  always sends INIT (never RESET) to a fresh `new SimWorkerUrl()`, allocating an
  independent SAB inside the new worker's module scope.

- `src/App.tsx`: FIX 3 — "Comparing against: [name]" label rendered below
  PolicyConsole when `compareScenario !== null`. PolicyConsole itself unchanged
  (always reflects Series A's live policy).

- `src/console/ScenarioManager.tsx`: FIX 2 — `onLoadA`/`onLoadB` props removed.
  Replaced with `onCompare(s)`. Per-row `→A`/`→B` buttons removed; each row now
  has only export (↓) and delete (✕). "Compare against:" `<select>` dropdown at
  bottom of list — selecting a scenario calls `onCompare`; selecting "— none —"
  calls `onStopCompare`. Dropdown shows active comparison name when one is running.
  Deleting the active comparison scenario auto-calls `onStopCompare`.

- `src/dashboard/charts/PopulationChart.tsx`, `GdpChart.tsx`,
  `RentIncomeChart.tsx`, `CreditGdpChart.tsx`, `StockIndexChart.tsx`: FIX 4 —
  Dual y-axes when `seriesB` present and `max(maxA, maxB) / min(maxA, maxB) > 3`.
  When dual: right margin widens to MR_DUAL=32 to fit teal axis labels; Series A
  maps to its own maxA scale (left axis, series colour); Series B maps to its own
  maxB scale (right axis, teal). When single: shared max, no right axis, no colour
  change. GiniChart (fixed 0-1) and TechAdoptionChart (fixed 0-6) are exempt.

---

### Phase 5 rearchitecture — March 2026 — Sequential run + compare model

Complete replacement of the dual-worker live comparison system with an offline
sequential run + compare model. All dual-worker infrastructure removed.

- `src/App.tsx`: Removed `workerBRef`, `workerB`, `statsB`, `historyB`,
  `handleLoadA`, `handleLoadB`, `handleStopCompare`, `compareScenario`, and the
  "Comparing against" label. Added `tickLimit` state (default 5000) with a
  configurable number input ("Auto-pause at tick:"). Auto-pause `useEffect` watches
  `stats.tick >= tickLimit` and sends PAUSE to workerRef — main worker only.
  Added `savedRunCount` state incremented via `onRunSaved` callback from
  ScenarioManager. Dashboard now receives `savedRunCount` instead of
  `statsB`/`historyB`. "tick limit reached" status label shown when auto-paused
  at limit. Title updated to "CITYMIND — Phase 5".

- `src/console/ScenarioManager.tsx`: Complete rewrite. `SavedScenario` interface
  gains `history: SimStats[]` — full recorded run array included in every save.
  `dbGetAll` promoted to named export so ScenarioComparison can read runs
  independently. Props changed to `{ currentSeed, currentPolicy,
  currentHistory: SimStats[], onRunSaved: () => void }`. "Save run" button stores
  `{ name, seed, policy, history: currentHistory, savedAt }` in IndexedDB.
  Removed: `onLoadA`, `onLoadB`, `onCompare`, `onStopCompare`, "Compare against"
  dropdown. List shows `${s.history.length} pts` or `(no history)` for legacy
  config-only saves. Hint "Open 'Scenario comparison' below to compare runs."
  shown when 2+ runs are saved. Per-row actions: export (↓) and delete (✕) only.

- `src/dashboard/ScenarioComparison.tsx`: New file. Tier 4 collapsible section
  loaded from IndexedDB via `dbGetAll()`. Reloads whenever `savedRunCount`
  increments. Guards: hidden until 2+ runs with `history.length > 0`.
  Two `<select>` dropdowns: Scenario A (purple) and Scenario B (teal).
  `sharedTicks = Math.min(runA.history.length, runB.history.length)` — both
  histories trimmed to equal length for visually honest axis alignment.
  `sharedMax(accessor)` computes y-axis max across both trimmed datasets.
  Local mini chart components: `MiniLine` (single-accessor SVG polyline),
  `MiniPriceChart` (food amber + wood cyan), `MiniHistogram` (wealthBrackets
  bar chart), `MiniScatter` (Gini × Pop trail with opacity fade).
  Summary table: Final Gini, Final Pop, Avg GDP, Peak trade/tick, Run length.
  6 side-by-side chart pairs rendered in flex-wrap grid: Gini, Population, GDP,
  Prices, Wealth Histogram, Policy Impact Scatter.
  Export: downloads `{ scenarioA, scenarioB, historyA, historyB, exportedAt }`
  as JSON blob.

- `src/dashboard/Dashboard.tsx`: Props simplified — removed `statsB?`/`historyB?`,
  added `savedRunCount: number`. All `seriesB={...}` props stripped from all chart
  calls. WealthHistogram restored to `stats={stats}` only. PolicyImpactScatter
  restored to `history={history}` only. Tier 4 added:
  `<DashboardTier label="Scenario comparison" storageKey="citymind_tier4_open"
  defaultOpen={false}><ScenarioComparison savedRunCount={savedRunCount} /></DashboardTier>`.

- All 10 chart files (`GiniChart`, `PopulationChart`, `GdpChart`, `PriceChart`,
  `WealthHistogram`, `PolicyImpactScatter`, `RentIncomeChart`, `CreditGdpChart`,
  `StockIndexChart`, `TechAdoptionChart`): `seriesB`/`statsB`/`historyB` props
  removed. All dual-axis logic (`MR_DUAL`, `fmtAxis`, right axis SVG elements)
  removed. Each chart reverted to clean single-series implementation.

- Invariant: `workerRef` is only ever touched by `handleReset`, `handlePauseResume`,
  and the boot `useEffect`. No comparison code may write to `workerRef`.

- TypeScript build: clean (tsc --noEmit, 0 errors).

---

### Phase 5 — March 2026 — Scenario comparison and full dashboard

- Dual worker system replaced with sequential run + compare model
- ScenarioManager: save named runs with full SimStats history
  to IndexedDB, compare any two saved runs side by side
- Comparison view: side-by-side grid, summary table, Export JSON
- Tick limit control added — sim stops automatically at N ticks
- 4 new Tier 3 charts stubbed: RentIncome, CreditGDP,
  TechAdoption, StockIndex
- Wealth histogram: Agents / Wealth held toggle

### Documented result — Phase 5 first comparison

Scenario A: 0% tax, no redistribution, 4260 ticks
  Gini=0.932, Pop=98, AvgGDP=787, PeakTrade=49/tick

Scenario B: 20% tax, 100% UBI redistribution, 5040 ticks
  Gini=0.962, Pop=107, AvgGDP=611, PeakTrade=40/tick

Interpretation: UBI at 20% tax produced higher Gini and
lower GDP than laissez-faire. Expected — cash UBI has no
survival transmission mechanism until Phase 7 currency.
Tax drag suppresses output without compensating benefit.
This result will invert when Phase 7 connects cash to food
purchases. Do not interpret as UBI hypothesis falsified.

---

### Phase 6 seed — March 2026 — Morocco urban wealth distribution

- `src/sim/seeds/moroccoUrbanSeed.ts`: Created. `AgentSeed` interface (decile,
  initialFood, initialWood, initialWealth). `MOROCCO_URBAN_SEED` — 500 agents
  sampled from HCP Enquête Nationale 2022-2023 Casablanca-Settat urban expenditure
  deciles. Implied Gini: 0.3986 (target 0.40-0.43). `FLAT_SEED` (all equal,
  food=20, wood=5) retained as control condition.

- `src/types/constants.ts`: `INITIAL_AGENT_COUNT` raised from 200 to 500 to match
  the Morocco seed length. Population at init now at MAX_STABLE_POPULATION ceiling —
  reproduction will be blocked until deaths create slots.

- `src/sim/tick.ts`: `initAgents` gains optional `agentSeeds?: AgentSeed[]` param.
  When provided, each agent's initialFood and initialWood are drawn from
  `agentSeeds[i % agentSeeds.length]`. Spatial placement (x, y) still uses the
  seeded RNG so map position is independent of wealth rank. Flat fallback (food=20,
  wood=5) used when no seed is provided.

- `src/sim/worker.ts`: `MOROCCO_URBAN_SEED` imported and passed to `initAgents` in
  `handleInit`. Both INIT and RESET paths now start with the Morocco distribution.

- Effect: tick-0 Gini will be ~0.40 instead of 0.00. This is the real-world
  calibration anchor. The sim now starts from a plausible urban inequality baseline
  rather than a fictitious equal distribution. The laissez-faire control run
  (Phase 5 Scenario A) should be re-run from this seed before further policy
  experiments.

---

### Phase 6 — March 2026 — Real-data seeding wired and calibrated

- `src/types/sim.ts`: `SeedMode = 'morocco' | 'flat'` exported. Used across messages,
  App state, PolicyConsole, ScenarioManager, and ScenarioComparison.

- `src/types/messages.ts`: `seedMode?: SeedMode` added to INIT and RESET message
  types. Seed array stays in the worker — main thread sends only the mode flag.

- `src/sim/worker.ts`: `handleInit` gains `seedMode: 'morocco' | 'flat' = 'morocco'`
  parameter. Picks `MOROCCO_URBAN_SEED` when `'morocco'`, `undefined` (flat 20/5
  defaults) when `'flat'`. Both INIT and RESET message handlers pass
  `msg.seedMode ?? 'morocco'` through.

- `src/console/PolicyConsole.tsx`: "Starting conditions" section added above Fiscal.
  `<select>` with options "Morocco urban 2022 (Gini ≈ 0.40)" and "Flat (equal)".
  Props: `seedMode: SeedMode`, `onSeedChange: (m: SeedMode) => void`. Note "Applies
  on next Reset." displayed below the selector.

- `src/App.tsx`: `seedMode` state added (default `'morocco'`). Passed to INIT
  message on boot (hardcoded `'morocco'`) and to RESET message via `seedMode` state.
  Wired to PolicyConsole (`seedMode`, `onSeedChange`) and ScenarioManager
  (`currentSeedMode`, `onSeedModeChange`). Title updated to "CITYMIND — Phase 6".

- `src/console/ScenarioManager.tsx`: `SavedScenario` gains `seedMode?: SeedMode`
  (optional for backwards compat). `handleSave` stores `currentSeedMode` in the
  IndexedDB record. Scenario list rows now show a seed mode tag ("Morocco" / "Flat")
  and a ⟳ restore button — clicking it calls `onSeedModeChange(s.seedMode ??
  'morocco')` to restore the seed mode in App state for the next Reset. Props
  updated: `currentSeedMode`, `onSeedModeChange` added.

- `src/dashboard/ScenarioComparison.tsx`: "Starting conditions" row added as the
  first row in the summary table. Shows `seedModeLabel()` for each run. When the
  two runs have different seed modes the label cell shows "⚠ not comparable" in
  red — making it immediately visible that runs from different starting conditions
  cannot be directly compared.

### Part B — Calibration observation (Morocco seed, 0% tax, laissez-faire)

**Expected Gini trajectory:**

At tick 60 (first SimStats emission), with Morocco seed: Gini ≈ 0.42–0.50.
The initial distribution (wealth range ~7–213, decile 1 vs decile 10) has Gini
0.3986 at tick 0. After 60 ticks of harvest dynamics and early market clearing,
high-wealth agents have compounded their advantages — Gini rises ~0.04–0.10 above
the seed value in the first stat window.

At tick 60 with flat seed: Gini ≈ 0.05–0.15. All agents start equal; the first
60 ticks introduce small divergences from spatial variation and harvesting luck.

**Divergence finding (theoretical, pending empirical run):**

Both seeds converge toward the same laissez-faire attractor (~0.93 Gini at
tick 4000+). The Morocco seed approaches this attractor from a higher starting
point (~0.40), so it appears to "stabilise" longer near the real-world value
before the winner-take-most dynamics overwhelm the initial distribution. The
flat seed rises more steeply from near-zero to the same attractor.

The gap between Morocco's real-world Gini (0.40–0.43) and the sim's laissez-faire
attractor (~0.93) quantifies how much policy intervention is required to hold
inequality at real-world levels. That is the central calibration finding of Phase 6.

Do not interpret the eventual divergence as a calibration failure — it is the
experiment result. The Morocco seed is the correct starting condition; the policy
levers (Phase 7 currency, Phase 8 credit) are the mechanisms needed to sustain it.

---

### Phase 7 — March 2026 — Currency and food market (Option B)

**Scope:** Money prices bootstrapped from barter equilibrium. isCurrencyActive toggle.
Central bank controls. Emergency food market (cash buys food). Food decay.
Inflation calculation. UBI transmission mechanism now live (cash → food → survival).

- `src/types/constants.ts`: `FOOD_DECAY_RATE = 0.995` added. Default food stock
  decay rate per tick when currency is active. Mutable at runtime via
  `setFoodDecayRate()` in tick.ts (crash guard may raise to 0.998).

- `src/types/sim.ts`: `isCurrencyActive: boolean` added to PolicyState (Phase 7+,
  default false). `avgCash: number` added to SimStats (Phase 7+; 0 before).

- `src/sim/policy.ts`: `isCurrencyActive: false` added to `defaultPolicy()`.

- `src/sim/market.ts`: Phase 7 additions:
  - `foodMoneyPrice`, `woodMoneyPrice`, `currencyBootstrapped` module state.
  - `activateCurrency(sab, n)`: one-time bootstrap. Sets foodMoneyPrice=lastFoodPrice
    (barter ratio → money price), woodMoneyPrice=lastWoodPrice. Grants each agent
    cash = food × foodMoneyPrice. `currencyBootstrapped` flag prevents re-grant.
    Resets in `resetMarket()`.
  - `runEmergencyMarket(sab, n, grid, policy, shuffledOrder, rng)`: step 3.5 in tick
    loop. Agents with food < FOOD_SURVIVAL_BUFFER and cash >= foodMoneyPrice buy 1
    food unit from a surplus neighbour. Tax model: buyer pays flat foodMoneyPrice
    (tax-exempt); seller receives foodMoneyPrice × (1 - taxRate); treasury receives
    foodMoneyPrice × taxRate.
  - `getMarketStats()` now also returns `foodMoneyPrice`.

- `src/sim/tick.ts`:
  - `let _foodDecayRate = FOOD_DECAY_RATE; export function setFoodDecayRate()` added.
    `initAgents` resets `_foodDecayRate` to default.
  - Food decay applied in harvest loop after consumption, gated on
    `policy.isCurrencyActive`. `FOOD *= _foodDecayRate` per tick.
  - `runEmergencyMarket` called at step 3.5 (after grid register, before labour),
    gated on `policy.isCurrencyActive`.
  - `runEmergencyMarket` imported from market.ts.

- `src/sim/stats.ts`: `resetStats()` added — resets `_prevFoodMoneyPrice`.
  Called on INIT/RESET from worker.ts. `avgCash` computed as mean of CASH field
  across all agents. `inflationRate` computed as `(foodMoneyPrice - prev) / prev`
  per stats interval (60 ticks); 0 before currency activation or before 2 samples.

- `src/sim/worker.ts`: Phase 7 state: `prevCurrencyActive`, `activationTick`,
  `activationPop`. Currency transition detection in `doTick()`: when
  `policy.isCurrencyActive` flips false→true, calls `activateCurrency()` and
  records `activationTick`, `activationPop`. Population crash guard: at
  `activationTick + 300`, if `activeCount < activationPop × 0.7`, calls
  `setFoodDecayRate(0.998)` and logs `[Phase7] Decay rate auto-adjusted to 0.998`.
  `activateCurrency` fires exactly once per activation event (idempotent flag).
  All Phase 7 state reset in `handleInit`.

- `src/console/controls/CentralBankControls.tsx`: Created. Currency activation
  checkbox (fires immediately to worker via POLICY message). Base rate slider
  (0–20%). Money supply growth slider (0–10%). Sliders disabled when currency
  inactive. "LIVE" badge when active.

- `src/console/PolicyConsole.tsx`: Monetary section activated (opacity stub
  removed). CentralBankControls wired. `isCurrencyActive` and `centralBankRate`
  added to EVENT_COLORS and makeLabel. Event labels: "Currency ON/OFF",
  "Rate X.X%".

- `src/dashboard/charts/InflationChart.tsx`: Created. inflationRate line chart,
  colour #3cc8a0 (teal). Symmetric y-axis (±maxAbs). Zero line dashed. Flat at
  0 before currency activation. Policy event markers supported.

- `src/dashboard/Dashboard.tsx`: InflationChart added to Tier 3 (Advanced
  metrics) as first chart.

- `src/App.tsx`: "Avg Cash" and "Inflation" rows added to stats table.
  Title updated to "CITYMIND — Phase 7".

**Tax model (approved, non-default):** Emergency market buyer pays flat
`foodMoneyPrice` (tax-exempt on buyer side). Seller net: `× (1 - taxRate)`.
Treasury: `× taxRate`. Rationale: emergency food purchase is a survival necessity,
taxing the buyer would reduce survival benefit of UBI transmission.

**UBI transmission mechanism is now live:**
`tax → treasury → UBI (cash) → runEmergencyMarket → food → survival`
This is the causal chain that was wired but untestable in Phases 4–6.

**TypeScript build:** clean (tsc --noEmit, 0 errors).

---

### Phase 7 — March 2026 — Currency, food decay, monetary foundation

- Currency activation: bootstraps cash from barter
  price ratios at moment of activation. Each agent
  receives cash = food × foodMoneyPrice. One-time,
  non-repeating.
- Emergency market: runEmergencyMarket() in market.ts.
  Agents with food < 1 and cash >= foodMoneyPrice buy
  1 food unit from nearest surplus neighbour. Tax-exempt
  on buyer side. Runs before labour and goods market
  each tick.
- Progressive food decay implemented:
  food > 100: × 0.992/tick (drain ~8/tick at food=1000)
  food > 20:  × 0.998/tick (drain ~0.2/tick at food=100)
  food <= 20: no decay — subsistence agents protected
  Drain table verified against exponential decay formula.
  Sanity check confirmed: rate=0.992 applied at food=162,
  drain=1.71/tick consistent with approved table.
- Money supply growth set to 0% — helicopter money
  mechanic removed pending Phase 8 commercial banks.
  Cash enters system only via bootstrapping and UBI.
- Base rate wired to neural net input 37 but has no
  transmission mechanism until Phase 8 lending.
- Inflation calculation live in stats.ts but displays
  near 0% at current price stability — precision fix
  pending.
- Food decay is NOT gated behind isCurrencyActive —
  it is a physical property running always once Phase 7
  is active.

Known issues carried forward to Phase 8:
- Inflation display shows 0.00% despite real price
  movement — precision fix needed
- Land auction + rent collection deferred to Phase 8
- Shelter, houses, construction deferred to Phase 8
- Money supply growth mechanic deferred to Phase 8

---

### Phase 8 — March 2026 — Shelter, housing market, inflation fix

**Core change:** Shelter is the second consumption good. Builders produce houses from wood;
agents without shelter drain energy faster; landlords collect rent in cash; the housing
market creates the second UBI transmission channel (cash → rent → shelter → survival).

**Inflation fix:** Phase 7 `inflationRate` always showed 0.00% because `foodMoneyPrice`
is fixed at bootstrap and never updated. Fix: `inflationRate` now tracks the barter
`foodPrice` ring buffer (updated on every trade). This would have shown ~−96% deflation
in the Phase 7 deflationary trap. `src/sim/stats.ts` `_prevFoodPrice` replaces
`_prevFoodMoneyPrice`.

**Wood harvesting (new):** `applyNetHarvest` now harvests wood from tile alongside food
(FORESTRY: A=1.0, labourAlpha=0.5, raw fraction=0.3). This creates a renewable wood
supply for builders. Previously wood was never harvested from tiles — only redistributed
from initial seed endowments. Tiles regenerate at 0.3 units/tick (unchanged from Phase 7).

**Builder role (ROLE=1):**
- `initAgents` assigns ROLE=1 to `decile >= 9` agents (Morocco seed, ~20%) or every 7th
  agent (flat seed, ~14%).
- Construction called in harvest loop: `applyConstruction(sab, idx)` after `applyNetHarvest`
  for ROLE=1 agents.
- Cobb-Douglas per tick: `CONSTRUCTION_RATE × (1+labourHired)^0.7 × woodConsumed^0.3`
  where CONSTRUCTION_RATE=0.05 (batch A=1.0 scaled to per-tick incremental rate).
- Wood consumed = `min(surplusWood, MAX_WOOD_PER_CONSTRUCTION=5)` where surplus =
  wood − WOOD_SURVIVAL_BUFFER − WOOD_BUILD_BUFFER (builder keeps 6 units as floor).
- Hard cap: MAX_HOUSES_PER_AGENT=20 (matches neural net normalisation max). Construction
  halts at cap. Time to cap: ~247 ticks at typical wood input.

**House decay (progressive, like food):**
- houses > 10: ×0.995/tick — large portfolios erode, continuous building required
- houses > 5:  ×0.998/tick
- houses ≤ 5:  ×0.999/tick
- At steady state (stock≈18): decay (0.005×18=0.09/tick) slightly exceeds production
  (0.081/tick) → builders must keep consuming wood to maintain portfolio. Wood demand
  is structural, not one-time.

**Shelter mechanic:**
- `sheltered[i]` Uint8Array computed in `tick()` each tick.
- Init: `sheltered[i] = HOUSES[i] >= 1 ? 1 : 0` (owners auto-sheltered).
- `runHousingRent` updates `sheltered[renterIdx] = 1` as rent is collected.
- `applyShelterDrain`: agents with `sheltered[i]=0` lose 0.5 extra energy/tick.
- Shelter drain applied after housing rent so renters are not penalised.
- Scarcity is **cash-denominated**: enough houses may exist, but agents need cash to
  pay rent. UBI → cash → rent → shelter is the Phase 8 transmission chain.

**Housing rent market (`src/sim/housing.ts`):**
- "Nearby" = `grid.getNeighbours()` — same 25×25-tile 2-ring radius as all other markets.
- Landlord (HOUSES ≥ 2): rents `floor(HOUSES−1)` slots, capped at MAX_RENT_SLOTS_PER_LANDLORD=5.
- Renter: pays HOUSE_RENT_PER_TICK=1.0 cash/tick; tax portion → treasury; remainder → landlord.
- Renters must have cash ≥ HOUSE_RENT_PER_TICK. Cash-poor agents remain unsheltered.

**Land rent (auctioned policy):**
- Landowners (LAND ≥ 2) collect LAND_RENT_PER_TICK=0.5 cash per (land−1) units from
  nearby landless agents. Same slot cap applies.
- `initAgents` assigns land=1 to decile ≥ 7 agents (Morocco) under `auctioned` policy.
- `landRentIndex` in SimStats is now live (rentCollected/population per stats interval).

**Land assignment at init:**
- `initAgents` signature changed from `landFree: boolean` to `landPolicy: PolicyState['landPolicy']`.
- `free`: land=1 for all. `auctioned`: decile≥7 gets land=1. `state`: land=0 for all.
- `worker.ts`: passes `policy.landPolicy` (was `policy.landPolicy === 'free'`).

**Wealth update:**
- `updateWealth` in `lifecycle.ts` now includes `houses × HOUSE_ASSET_VALUE=20`.
- `avgHouses` added to SimStats; stats table shows "Avg Houses" and "Rent Index".

**New constants (`src/types/constants.ts`):**
HOUSE_DECAY_RATE_HIGH=0.995, HOUSE_DECAY_RATE_MID=0.998, HOUSE_DECAY_RATE_LOW=0.999,
SHELTER_ENERGY_PENALTY=0.5, HOUSE_ASSET_VALUE=20, MAX_HOUSES_PER_AGENT=20,
CONSTRUCTION_RATE=0.05, MAX_WOOD_PER_CONSTRUCTION=5, WOOD_BUILD_BUFFER=4,
HOUSE_RENT_PER_TICK=1.0, LAND_RENT_PER_TICK=0.5, MAX_RENT_SLOTS_PER_LANDLORD=5.

**New file:** `src/sim/housing.ts` — applyHouseDecay, applyShelterDrain, applyConstruction,
runHousingRent, resetHousingTick, getHousingStats.

**Files modified:** constants.ts, housing.ts (new), harvest.ts, tick.ts, lifecycle.ts,
stats.ts, worker.ts, App.tsx, sim.ts.

**TypeScript build:** clean (tsc --noEmit, 0 errors).

**Commercial banks:** deferred to Phase 9. The housing market alone closes the liquidity
trap and gives UBI a second transmission channel. Bank charter requires deposit/loan/reserve
mechanics that are a full phase in themselves.

Known issues carried forward to Phase 9:
- Money supply growth mechanic still deferred (needs commercial bank foundation)
- Base rate transmission (neural net input 37) still unwired
- `creditToGdp` still 0 (no lending yet)
  pending commercial bank foundation

---

### Phase 9 — March 2026 — Commercial banks and credit cycles

**Core addition:** One aggregate bank (BankState in policy.ts) with deposits, lending,
debt service, default cascade, and reserve-requirement solvency gate.

**Files created:**
- `src/sim/bank.ts` — `runLending()`, `getBankStats()`. Two-pass per tick: debt service
  then new lending. Default cascade: houses → food → wood collateral seizure.
- `src/console/controls/BankingControls.tsx` — Reserve requirement slider (0–30%) +
  bank status display (Solvent/Insolvent, loansOutstanding, capitalBuffer).

**Files modified:**
- `src/sim/policy.ts` — `BankState` interface + singleton state + `getBankState()` +
  `resetBankState()`. capitalBuffer initialised at 500.
- `src/net/inference.ts` — `decodeInvestSignal(logit)`: sigmoid of output[5]. Now live.
- `src/sim/tick.ts` — Decodes `investSignals[]` from output[5] in the net decode loop.
  Calls `runLending(sab, n, order, policy, investSignals, fp, wp)` at step 8.5
  (after redistribution, before lifecycle). Tick order comment updated to Phase 9.
- `src/sim/stats.ts` — Imports `getBankStats(gdp)` from bank.ts. Populates live
  `creditToGdp`, `bankSolvency`, `bankLoansOutstanding`, `bankCapitalBuffer` in SimStats.
- `src/sim/worker.ts` — Calls `resetBankState()` in `handleInit` (covers INIT + RESET).
- `src/types/sim.ts` — Added `bankLoansOutstanding` and `bankCapitalBuffer` to SimStats.
- `src/console/PolicyConsole.tsx` — Banking section added. BankingControls wired.
  `reserveRequirement` added to EVENT_COLORS (`#c060e0`) and makeLabel (`Reserve X%`).
- `src/App.tsx` — Passes `bankDisplay` to PolicyConsole derived from SimStats.
  "Credit/GDP" and "Bank solvency" rows added to stats table. Title → Phase 9.

**Key decisions:**

*Default cascade accounting:* capitalBuffer gets two separate ledger entries:
`+housesVal` (collateral seized) and `-outstandingDebt` (loan written off).
Net = `housesVal - outstandingDebt`. Variable `uncovered` (distinct from `outstandingDebt`)
is used only to determine how much food and wood to seize from the agent. No double-count.

*Debt service rate:* `payment = max(min(DEBT × (centralBankRate + 0.02), DEBT), 0.001)`.
Floor of 0.001 ensures debt always eventually clears. At rate=0, a 50-unit loan
repays ~1 cash/tick; cleared in ~50 ticks at the floor.

*Solvency gate:* `isSolvent = loansOutstanding === 0 || capitalBuffer/loansOutstanding >= reserveRequirement`.
Checked after every loan issuance and every default. Bank freezes new lending
when insolvent; recapitalises passively as existing loans are repaid.

*Base rate transmission now live:* Higher `centralBankRate` → higher debt service
→ more defaults → lower `creditToGdp`. Lower rate → cheaper borrowing → more
`invest_signal > 0.7` triggers fire → credit expansion. This closes the loop for
neural net input[37] which was wired but had no effect in Phases 7–8.

*invest_signal threshold 0.7:* At sigmoid output >0.7, the raw logit exceeds ~0.85.
Untrained nets produce near-random outputs; expect ~15% of agents to trigger
credit-seeking initially. Evolution will select toward agents that borrow when
wealthy (positive expected value) and abstain when over-leveraged.

**Known issues carried forward to Phase 10:**
- Money supply growth mechanic still deferred (aggregate bank exists; fractional
  reserve → money creation not yet wired)
- SHARES field and stockIndex remain 0
- capitalGainsTax and marginLendingLimit remain ignored
- Bank deposits field accumulates but is not yet used in any computation

**TypeScript build:** clean (tsc --noEmit, 0 errors).

---

### Phase 8 — March 2026 — Scenario comparison metrics upgrade

**Scope:** ScenarioComparison.tsx fully rewritten to surface Phase 7/8 data that
was emitted in SimStats but never shown in the comparison view.

**Summary interface extended** (7 new outcome metrics):
- `finalUnemployment`, `avgWage`, `avgLabourShare` — labour market outcomes
- `finalAvgHouses`, `finalAvgCash`, `finalRentIndex` — Phase 8 housing/currency outcomes
- `peakTradeTick` refined to find the tick with highest `tickTradeCount`

**Policy diff section added** (4 rows with `⚠ differs` highlighting):
- Tax rate, redistribution model + UBI amount, currency (ON/OFF + rate), land policy + min wage
- Helpers: `policyLabel`, `redistributionLabel`, `currencyLabel`, `landLabel`

**Summary table sections:** STARTING CONDITIONS / POLICY / OUTCOMES (SectionDivider component)

**Chart grid expanded** from 6 to 9 chart pairs:
- Added: Housing (avgHouses single-line), Cash (avgCash single-line)
- Added: Labour (unemploymentRate + labourShareOfGdp dual-line on shared 0–1 axis)
- Prices chart upgraded from MiniPriceChart to **MiniDualLine** (generalised two-accessor component)
- Wealth histogram upgraded to use `wealthByBracket` (Piketty view) instead of `wealthBrackets`

**MiniDualLine component:** Replaces the specialised MiniPriceChart. Takes
`accessor1/color1` + `accessor2/color2` + shared `maxVal`. Reusable for any
two SimStats fields on the same axis.

**TypeScript build:** clean (tsc --noEmit, 0 errors).

---

### Phase 8 bugfix — March 2026 — Builder role inheritance (wood hoarding fix)

**Root cause:** `tryReproduce` in `lifecycle.ts` calls `initAgent`, which zeroes all
SAB fields including ROLE. Children were born ROLE=0 (farmer) regardless of parent.
Original builders from the Morocco seed (decile ≥ 9, ~20% at init) died over time;
no replacements had ROLE=1. Construction went to zero. All agents harvested wood
but nothing consumed it → avg wood reached 6201 with no houses built.

**Observable symptoms:**
- avgHouses ≈ 0 (or decaying toward 0 from tick-0 builders' initial stock)
- avgWood = 6201 (unconstrained accumulation)
- Unemployment 89.7% unchanged — shelter mechanic never activated because no houses existed
- landRentIndex = 0 — rent market never fired

**Fix:** In `tick.ts` lifecycle section, after spawning a child, copy parent's ROLE
to the child slot before incrementing childCount:

```typescript
setField(sab, childSlot, AGENT_FIELDS.ROLE, getField(sab, idx, AGENT_FIELDS.ROLE));
```

Ensures builder lineage persists across generations. Builder proportion stabilises
at ~20% (Morocco seed) or ~14% (flat) — the same ratio as init — because builders
and farmers reproduce at rates proportional to their survival fitness.

**Expected post-fix behaviour:**
- Wood stockpile drains as builders consume 5 wood/tick per agent via construction
- avgHouses rises toward builder equilibrium (~16 houses at steady state per builder)
- Once houses exist, rent market activates → sheltered[] flags set for renters
- Shelter drain pressure reduces → survival improves for cash-holding agents
- UBI transmission chain `tax → cash → rent → shelter → survival` becomes testable

**TypeScript build:** clean (tsc --noEmit, 0 errors).

---

## Phase 9 — March 2026 — Commercial banks and credit cycles

### Phase 9 — March 2026 — Initial implementation (v1)

**Files created/modified:**
- `src/sim/bank.ts` (NEW): `runLending()`, `getBankStats()`, default cascade
  with house forfeit → food → wood collateral sequence
- `src/sim/policy.ts`: `BankState` interface, `getBankState()`, `resetBankState()`,
  initial `capitalBuffer=500`, `reserveRequirement=0`
- `src/sim/tick.ts`: `runLending` called at step 8.5, `investSignals` decoded
  from `output[5]`
- `src/sim/stats.ts`: `creditToGdp` and `bankSolvency` live from `getBankStats()`
- `src/sim/worker.ts`: `resetBankState()` on INIT and RESET
- `src/console/controls/BankingControls.tsx` (NEW): reserve requirement slider,
  bank status display (Solvent / Insolvent)
- `src/console/PolicyConsole.tsx`: BankingControls wired, `reserveRequirement`
  event label `#c060e0`
- `src/App.tsx`: Credit/GDP and Bank solvency rows, title Phase 9

---

### Phase 9 — March 2026 — Accidental finding: currency-inactive benchmark (v1 run 1)

**Policy:** `isCurrencyActive=false` (error), `reserveRequirement=0`, `capitalBuffer=500`.
5000-tick run.

Despite currency being off, lending fired because the `isCurrencyActive` guard was
missing from `runLending`. Cash existed in the SAB from Morocco seed initialisation
regardless of the currency toggle. Loans were denominated against unanchored barter
prices.

**Results:**
- Final population: 337
- Final Gini: 0.8462
- Avg GDP: 2150.9
- Bank solvency: −2.9785 (insolvent from tick ~600, frozen for remainder)
- Credit/GDP: 0.0148
- Role counts: 100% builders

**Key finding:** Bank insolvency at tick ~600 caused 79% population collapse
(500 → 105 agents). Economy recovered slowly over 4400 ticks with bank frozen.
Credit market dead for remainder of run. Accidentally demonstrated that
undercapitalised lending in an unanchored monetary system produces a crisis worse
than no lending at all.

---

### Phase 9 — March 2026 — Currency-active benchmark (v1 run 2)

**Policy:** `isCurrencyActive=true`, `reserveRequirement=0`, `capitalBuffer=500`.

**Results:**
- Final population: 366
- Final Gini: 0.8551
- Avg GDP: 1758.0
- Bank solvency: −1.1442 (insolvent from tick ~300, frozen for remainder)
- Credit/GDP: 0.0222
- Peak creditToGdp: 0.1746 at tick 240

**Crash sequence:** currency bootstrap → immediate lending (creditToGdp 0.17 at
tick 60) → mass defaults by tick 300 → capitalBuffer exhausted → bank frozen for
remaining 4700 ticks. Population: 500 → 159 in 60 ticks (68% collapse), slow
recovery to 366.

**Comparison with no-banking Phase 8 baseline (same policy, no bank):**

| Metric | No banking (Phase 8) | With banking (v1) |
|---|---|---|
| Final population | 437 | 366 |
| Final Gini | 0.822 | 0.855 |
| Avg GDP | 1544 | 1758 |

Banking made population worse, inequality worse, and output only marginally better.
Classic result: undercapitalised bank in a boom produces a credit crisis worse than
no bank. Emerged without scripting.

---

### Phase 9 — March 2026 — Four stabilisation fixes applied

**Fix A:** `isCurrencyActive` guard added to `runLending` — bank cannot lend before
currency is active and price-anchored.

**Fix B:** `capitalBuffer` raised 500 → 2000.

**Fix C:** 500-tick lending delay after currency activation — prevents tick-0 credit
explosion, allows price stabilisation.

**Fix D:** Wealth eligibility threshold raised from `>0` to `≥50`.

---

### Phase 9 — March 2026 — Fix overcorrection discovered (v4)

**Policy:** all four fixes applied, `isCurrencyActive=true`. 5000-tick run.

**Result:** `creditToGdp=0.0000` for entire run. Fix D (wealth ≥ 50) excluded the
entire post-collapse population (~110–160 agents, mostly bottom-decile Morocco seed
survivors). Bank solvent, `capitalBuffer` untouched, zero loans issued.

**Unintended finding:** Without credit, neuroevolution maintains role diversity.
Farmers and builders coexist stably at ~40–60% split for the full 5000 ticks.
Builder convergence does not occur. Role monoculture (100% builders) in previous
runs was driven by credit access, not construction advantage alone.

---

### Phase 9 — March 2026 — Wealth threshold lowered to 10 (v5)

**Results:**
- Final population: 493 (best Phase 9 result)
- Final Gini: 0.8430
- Avg GDP: 2598.7 (final tick: 3710.5)
- Avg Houses: 2.450
- Avg Cash: 77.24
- Bank solvency: 1.0000 throughout
- Credit/GDP: 0.0000 — lending still inactive

Population recovered well. But `invest_signal` suppression confirmed: neuroevolution
selects `output[5]` toward zero during the survival bottleneck (ticks 60–500). Agents
that survived the early crash were those that did not seek credit. By tick 500 when
the lending window opens, the entire population has evolved `invest_signal ≈ 0`.
Bank open, willing to lend, no borrowers.

v6 confirmed the same result with a different initialisation — `creditToGdp` flat 0
across all 84 stat windows.

---

### Phase 9 — March 2026 — Invest_signal suppression: mechanism and implication

The 500-tick lending delay creates a selection pressure against credit-seeking
behaviour during the period when the population is most stressed. Survival fitness
and credit-seeking fitness are anti-correlated during the bottleneck. The surviving
gene pool has `invest_signal` evolved to near-zero, and no subsequent selection
pressure reverses it because:
- Loans are small (capped at 50 cash)
- The economy functions adequately without credit
- Builder wealth accumulation via construction does not require borrowing

**Architectural conclusion:** `invest_signal` as lending trigger is structurally
flawed for this population dynamic. The neural net cannot evolve toward a behaviour
that is only rewarded after a 500-tick delay during which the opposite behaviour is
selected for.

**Planned fix (Phase 10 prerequisite):** Replace invest_signal threshold with a
deterministic wealth-based probability rule (`WEALTH > 100`, 5% chance per tick).
`output[5]` reverts to a dormant stub.

---

### Phase 9 — open issues carried forward

- Lending trigger replacement not yet implemented (deterministic wealth-based rule)
- Once lending is active: run clean control (Morocco seed, currency on, no tax, no
  UBI, 5000 ticks) and confirm `bankSolvency > 0` throughout
- Policy experiments deferred until stable control established:
  1. Progressive tax + UBI
  2. Flat tax + UBI with banking
  3. Helicopter money UBI (no tax)
  4. Low UBI rate (5–10%) — find positive marginal benefit threshold
- `SHARES` field and `stockIndex` remain 0 (Phase 10)
- `capitalGainsTax` and `marginLendingLimit` remain ignored (Phase 10)


> The following July/August verification records describe the corrected browser
> branch `fix/typescript-correctness`, commit `a8952a8`. The native Rust port and
> its verification are recorded in the October entry below.

---

## Correctness and verification hardening — July 2026

### Verification baseline

- Added a serialized Vitest 2 suite for deterministic simulation-kernel tests.
  Serialization is required because market, labour, bank, and stats modules keep
  mutable ring-buffer or aggregate state.
- Added Playwright Chromium integration coverage for cross-origin isolation,
  SharedArrayBuffer availability, Worker startup and stats emission, pause/resume,
  and reset/reinitialisation.
- Added `typecheck`, unit, browser-smoke, opt-in performance, and combined
  verification scripts plus a GitHub Actions verification workflow.
- Final automated result: TypeScript checks clean; 32/32 unit tests pass;
  production build passes; Chromium worker smoke passes.

### Spatial grid and bilateral market fixes

- `SpatialGrid.getNeighbours()` now validates neighbour cell coordinates against
  both row and column bounds before forming a flat key. This removes cross-edge
  aliases where an out-of-range cell could resolve to a valid cell on another row.
- Food and wood trades now compare seller A's offer with selected buyer B's neural
  acceptance threshold. Offer/threshold comparator direction, demand formulas,
  tax handling, buffers, and independent food/wood price rings are unchanged.
- Regression coverage includes all four corners, both horizontal map edges, the
  complete valid two-ring window, and buyer accept/reject ownership for both goods.

### Conserved wages and survivor-only post-harvest processing

- The minimum wage is now a hard eligibility floor. It no longer raises an
  employer's bid above marginal revenue product; `minWage > MRP` correctly results
  in no hire and higher unemployment.
- Before currency activation, wages settle in wood while preserving the employer's
  `WOOD_SURVIVAL_BUFFER`. With currency active, wages settle in cash using the
  bootstrapped food money price. In both regimes, employer gross debit equals worker
  net credit plus treasury tax; unfunded and partial hires do not execute.
- After the harvest/death loop, the original shuffled order is filtered once into
  `aliveOrder`. Emergency trade, labour, goods trade, housing rent, shelter drain,
  redistribution, lending, invest-signal diagnostics, and reproduction now process
  survivors only. Relative shuffled order is preserved and newborns remain
  ineligible until the following tick.
- UBI denominators and targeted-welfare percentiles now use survivors only.
  Lending debt service and new-credit passes also exclude dead agents.
- A borrower who dies is closed as an immediate full default using the existing
  house/food/wood collateral cascade before removal, preventing orphaned aggregate
  loan principal. The July banking-ledger repair below supersedes the original
  cash-destruction and loss-accounting behavior.

### Performance and calibration status

- The opt-in 500-agent Chromium benchmark measured 5.3 ticks/sec over a 300-tick
  sample in the available headless environment. This fails the 54 TPS regression
  floor and the project's 60 TPS target. The threshold was not weakened.
- The headless result may reflect CPU inference or browser/GPU availability, but it
  is recorded as a real failed gate until repeated on representative WebGL hardware.
- No production constants were retuned and no pre-fix macro results were relabelled.
  Morocco/flat and currency/housing/UBI scenario baselines must be rerun before
  comparing new population, Gini, GDP, price, wage, rent, or credit outcomes with
  the Phase 4–9 results above.

---

## Banking ledger correctness repair — July 2026

### Scientific status of earlier Phase 9 results

All Phase 9 banking results above are retained for historical provenance but are
invalid for causal or policy interpretation. The earlier implementation reduced
principal before confirming that a borrower could pay, could destroy borrower cash
on default or death, taxed principal repayment as if it were income, used the base
rate to change amortisation rather than charge interest, valued cash-denominated
collateral with barter-price inputs, and could originate a loan that pushed the bank
below its own capital threshold. The reported crisis, role-selection, and lending
suppression narratives must be rerun before they are described as findings.

### Current simplified banking contract

- `DEBT` and `loansOutstanding` are outstanding principal only.
- Each tick charges interest equal to opening principal × (`centralBankRate` + 2%
  spread) and schedules principal amortisation at 2% of opening principal, with a
  0.001 minimum capped at remaining principal. These are per-simulation-tick rates;
  they are not annualised real-world rates.
- Available cash is applied to interest first and principal second. Only actual
  payments affect the ledger. Any scheduled-service shortfall accelerates closure
  of the remaining loan; unpaid interest is neither capitalised nor counted as a
  principal writeoff.
- Only paid interest is taxed. Retained after-tax interest increases bank capital.
  Principal repayment reduces borrower cash, borrower debt, and aggregate bank
  loans by the same amount and is not treated as income.
- Loan origination creates equal borrower cash and principal. A proposed loan is
  rejected if its post-origination capital ratio would fall below the configured
  threshold.
- Default and deceased-estate settlement apply cash to principal before collateral.
  Houses use a fixed 20-cash liquidation mark until a house sale-price series exists;
  food and wood use their currency-bootstrap cash prices. Seizure is capped at the
  residual principal, excess collateral remains with the agent, and only unrecovered
  principal reduces bank capital and accumulates as a writeoff.
- The public `reserveRequirement` key is retained for saved-scenario compatibility,
  but the mechanism is a minimum bank capital ratio, not a reserve requirement.
  The public `bankSolvency` statistic is likewise a legacy key containing the capped
  capital ratio. The UI now labels both mechanisms accurately.

### Verification

- Added nine focused bank-accounting tests covering sufficient service cash,
  interest taxation, partial-payment default, exact and overcollateralised recovery,
  deceased cash settlement, loan creation, stale capital-status refresh in both
  directions, and post-loan capital-ratio preflight.
- Added an end-to-end tick regression proving cash-denominated collateral prices are
  used instead of deliberately different barter-price inputs.
- TypeScript, all 42 unit tests, the production build, and the Chromium worker
  startup/pause/resume/reset smoke test pass.
- The required 500-agent headless performance check measured 8.5 ticks/sec over
  300 ticks versus the 54 TPS regression floor and 60 TPS project target. This is
  still a failed performance gate, though it is above the earlier 5.3 TPS result.
  No threshold or simulation constant was weakened.

### Remaining limitations before new banking experiments

- Agent `WEALTH` is still a stale gross-asset field and does not subtract `DEBT`.
  Lending eligibility, Gini, fitness, and saved stats therefore do not yet represent
  end-of-tick net worth. This is the next correctness step.
- Surplus estate cash has no inheritance or estate-transfer model and disappears
  when a deceased slot is compacted. A closed-economy estate rule is still required.
- The capital threshold and fixed collateral marks are simplified model mechanisms,
  not a calibrated representation of commercial-bank regulation or liquidation.
- No post-repair Phase 9 policy result has been generated yet.

---

## Net-worth measurement correction — August 2026

### Authoritative measurement contract

- Agent `WEALTH` is now a regime-specific net-worth measure rather than a stale
  unpriced sum of gross inventories. With currency active, the cash numeraire is
  `max(0, cash + food*foodMoneyPrice + wood*woodMoneyPrice +
  houses*HOUSE_ASSET_VALUE - debt)`. Before currency is ever activated, the
  wood/resource numeraire is `max(0, food*foodPrice + wood +
  houses*HOUSE_ASSET_VALUE)`; cash and debt are excluded because no monetary
  balance sheet exists and they are not comparable to that resource unit. Once
  bootstrapped, monetary valuation persists if transactions are paused, and
  reactivation does not grant cash again.
- Loan origination adds equal borrower cash and principal debt, so it does not
  create measured net wealth. Debt service, defaults, transfers, inventories, and
  endogenous prices can still change net worth through their real ledger effects
  or mark-to-market valuation.
- WEALTH is synchronized at the opening regime boundary before wealth
  ranks/inference, immediately before redistribution, after redistribution and
  before lending, and again after lifecycle/compaction. The opening pass handles a
  currency activation or deactivation between ticks. Targeted welfare and lending
  therefore read current balances, while emitted stats, evolution fitness, and the
  next tick's wealth-percentile neural input read the final end-of-tick balance
  sheet, including newborns.

### Scientific status and semantic break

This is a semantic break in the central inequality and selection variable. All
historical Gini values, wealth histograms, wealth boundaries, wealth-percentile
inputs, and fitness results produced before this correction used stale gross assets
and omitted debt. They are retained above for provenance but are invalid as
net-worth evidence and must not be compared numerically with corrected runs.
Targeted-welfare assignment and lending eligibility also depended on the old field,
so policy and banking experiments using those channels must be rerun; downstream
population, GDP, price, role-selection, and credit outcomes are not clean controls
for corrected runs.

Currency activation is itself a change of valuation regime. Pre-currency
resource-numeraire series and post-bootstrap cash-numeraire series are not a
continuous panel, so comparisons must start after the monetary regime is
established and has been held fixed.

### Verification

- Added seven focused regressions for both valuation regimes, debt subtraction,
  the zero floor, invalid prices, loan-origination neutrality, full-tick stats
  freshness, monetary-regime persistence, and idempotent reactivation. The full
  serialized suite passes 49/49 tests; TypeScript, the production build, and the
  Chromium Worker startup/pause/resume/reset smoke test also pass. The full suite
  contains 50/50 passing tests after the adjacent decay-contract regression below.
- The required 500-agent headless benchmark measured 7.7 ticks/sec over 300 ticks,
  failing the 54 TPS regression floor and 60 TPS project target. The preceding
  banking build measured 8.5 ticks/sec in the same class of headless run, but the
  difference is not enough to attribute causally to the four O(n) valuation passes.
  The performance gate remains failed and no threshold was weakened.

### Adjacent contract correction

The authoritative Phase 7+ specification says progressive food decay is a physical
process and must not be gated on currency. `tick.ts` still had that obsolete gate;
it has now been removed and a full-tick regression proves decay runs before currency
activation. This changes pre-currency resource and survival trajectories, providing
another reason to rerun rather than reuse historical controls.

### Known measurement limitations

- Tools, clothing, fish, land, and shares are omitted because no authoritative
  market price exists for them. Houses retain the fixed `HOUSE_ASSET_VALUE` mark;
  the result is measured household private net worth, not total wealth.
- The two money prices are bootstrapped from independently discovered barter
  ratios, so their common cash scale is an administrative normalization rather
  than an economically identified price level.
- Endogenous current prices make WEALTH a mark-to-market measure; it is not a
  liquidation-value or cost-basis account and may move when quantities do not.
- Bank equity, treasury balances, and the currency issuer's liabilities are not
  represented on agent balance sheets. In particular, currency bootstrap grants
  cash against retained food without an offsetting issuer liability, so it raises
  measured household wealth by construction.
- The non-negative stored floor preserves the canonical Gini function and runtime
  invariant, but hides the magnitude and distribution of negative net worth. The
  simulator does not yet expose raw net worth or a separate insolvency-depth metric.
- The estate-transfer omission, simplified bank capital rule, and fixed collateral
  marks documented in the July banking repair remain unresolved.
- No post-correction calibration or policy result has been generated yet. Phase 9
  controls and UBI/tax experiments require fresh seeded runs under this definition.


---

## Rust correctness port, October 9, 2026

The browser fixes are preserved at `a8952a8` on `fix/typescript-correctness`.
The Rust port starts from `45f1924` on `rust-bevy-port` and carries the needed
repairs in native agent structs and the synchronous simulation core. No Phase 10
mechanics were added.

### Changes

- Goods matching now uses the selected buyer's acceptance threshold for both
  goods, preserving the existing comparator and independent price histories.
- Employers fund gross wages in cash or buffered wood. Worker net credit plus
  treasury tax equals the employer debit. Minimum wages constrain eligibility
  instead of increasing bids beyond marginal revenue product.
- Labour counts, redistribution, and debt service use survivors. Deceased debt
  settles principal with available cash and capped collateral before compaction.
  Newborns participate starting the following tick.
- Banking separates 2% principal amortization from per-tick base-rate-plus-2%
  interest. Only paid interest is taxed. Retained interest increases bank capital;
  only unrecovered principal reduces it. New loans must satisfy the projected
  capital ratio, and negative capital prevents lending even with no loans.
- Net worth uses the authoritative resource or cash numeraire, subtracts principal
  debt after bootstrap, and remains monetary during transaction pauses. Four
  synchronization points feed current wealth into policy, lending, stats, and
  deterministic evolution. Loan creation is neutral to household net worth.
- Food decay now runs regardless of currency activation. Rust wood regeneration
  is 1.0 per tile per tick, matching the supplied AGENTS.md rather than the prior
  0.3 used in both implementations. This is an additional calibration change.
- Full states and scenario exports now carry `measurement_version: 1`. Old full
  states are rejected explicitly because their ledger and history cannot be
  repaired reliably. Corrected states retain deterministic continuation. Bank
  accumulator names now describe retained interest income and cumulative writeoffs.
- CLI and Bevy labels now say net-worth Gini. README.md and RUST.md document the
  native architecture, accounting, compatibility boundary, and remaining limits.

### Interpretation and remaining limits

These changes invalidate numerical comparison with old wealth and banking
experiments. Fresh seeded controls are required, and currency comparisons must
hold the valuation regime fixed. Verification runs are checks of correctness
and throughput, not evidence of a UBI policy effect.

The supplied contract's claimed well-fed energy gain conflicts with its formula:
0.5 food consumed times 1.5, less 1 energy, is -0.25 before shelter costs. The
formula and food consumption remain as implemented; their calibration needs a
separate decision. Surplus estate assets still disappear during compaction.
Unpriced assets, negative-net-worth depth, issuer liabilities, and complete bank
balance sheets remain outside the measurement. The native CPU neural inputs and
synchronous seeded evolution retain existing differences from the browser.

### Verification

- `cargo test -p citymind-core --locked` passes 28 tests. The opt-in throughput
  test is excluded from the regular suite and passes separately in release mode.
- `cargo fmt --all -- --check`, `git diff --check`, and
  `cargo check --workspace --locked` pass, including the Bevy crate.
- The CLI save/resume smoke test saves at tick 105 and resumes to tick 125;
  regression tests compare corrected resumed state byte-for-byte with continuous
  execution across evolution boundaries and reject legacy states.
- Native CPU throughput at 500 agents measured 778.6 TPS without currency and
  718.1 TPS with currency. Each regime samples five fresh 60-tick windows using
  seeds 42 through 46, verifies 500 agents after every tick, and excludes seed
  construction from timing. Both exceed the 60 TPS target. These measurements
  apply to this machine and core workload, not to Bevy rendering or browser GPU
  inference.


---

## Final Rust-port consolidation, October 9, 2026

Merged the corrected browser branch at `a8952a8` into the corrected native Rust
branch at `c4a8d19`, retaining both histories on `rust-bevy-port`. Browser workers,
React/D3 labels, TypeScript tests, Playwright coverage, and verification CI now
coexist with the Rust core, CLI, Bevy view, and native regression tests.

Resolved README, FINDINGS, and ignore-file conflicts by retaining the native setup
instructions, one copy of each verification record, and both Node and Cargo build
ignores. Updated AGENTS.md to distinguish the approved native architecture from
the browser-only worker/SAB rules. No simulation behavior changed during the merge.

The implementations retain their documented calibration and execution differences,
including Rust wood regeneration at 1.0 and browser regeneration at 0.3. This
merge does not imply matching trajectories or validate historical policy results.

Merge verification passes TypeScript typechecking, all 50 browser-kernel unit
tests, the Vite production build, the Chromium worker startup/pause/resume/reset
smoke test, all 28 regular Rust tests, workspace checking including Bevy, and
Rust formatting. The existing opt-in native throughput result remains applicable
because the merge did not modify the Rust simulation. The browser performance
gate remains a separately documented limitation.
