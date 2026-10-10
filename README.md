# CityMind

A browser-based, headless agent-based economic policy simulator. No game canvas — just a policy console and a real-time macroeconomic dashboard.

**Research question:** Does UBI unlock economic growth and innovation, or does it primarily redistribute without expanding total output in a closed economy?

CityMind produces computational evidence conditional on its rules, parameters,
and initial conditions. It is an experimental laboratory, not an empirical
forecast of a real economy.

---

## What it does

You are the policymaker of a closed island economy of up to 500 autonomous agents. Set fiscal, monetary, and banking policy via sliders and dropdowns, then watch the aggregate economy respond in real time through a multi-tier dashboard tracking GDP, Gini coefficient, inflation, employment, wages, wealth distribution, housing, credit, and more.

Agents are neural-net-driven — each runs a 40→16→8→7 feedforward network governing economic decisions: what to produce, trade, consume, borrow, and save. Networks evolve across generations via neuroevolution: selection, crossover, and Gaussian mutation. The economy is not scripted. Macro patterns emerge from agent behaviour.

---

## Architecture

```
Main thread      →  React UI + D3 dashboard only
Sim Worker       →  Tick loop, spatial hash, market engine, SimStats
Evolution Worker →  Neuroevolution (async, every 100 ticks)
GPU (TF.js)      →  Batched neural net inference via WebGL
```

All agent state lives in a `SharedArrayBuffer` — a flat `Float32Array` of 844 floats per agent (20 state fields + 824 network weights). The sim worker writes it; the main thread reads it for stats. No simulation logic ever runs on the main thread.

Neural net inference is fully batched: one `tf.matMul` call per layer for all agents simultaneously, not a per-agent loop. Market matching uses a 25×25-tile spatial hash grid — no O(n²) neighbour search. Population is hard-capped at 500 by a WebGL VRAM budget constraint — above 500 agents the weight tensor (~12.8 MB/tick) saturates GPU memory.

---

## Stack

| Layer | Technology |
|---|---|
| UI | React 18 + TypeScript |
| Bundler | Vite |
| Neural nets | TensorFlow.js (WebGL backend) |
| Charts | D3.js |
| Concurrency | Web Workers + SharedArrayBuffer |

---

## Agent roles

Each agent is assigned one of six roles that determines its production function:

| Role | Code | Behaviour |
|---|---|---|
| Farmer | 0 | Harvests food via Cobb-Douglas production |
| Builder | 1 | Consumes wood to construct housing |
| Merchant | 2 | Specialises in bilateral trade |
| Banker | 3 | Reserved — Phase 10 |
| Capitalist | 4 | Reserved — Phase 10 |
| Worker | 5 | Sells labour to employers |

Role is inherited across generations. Earlier Phase 9 runs appeared to connect
credit access with role monoculture, but those runs used invalid debt accounting.
That relationship is a hypothesis to retest, not a validated result.

---

## Markets implemented

**Goods market** — bilateral food and wood trade with independent price discovery via ring-buffer moving averages. Food and wood prices are fully decoupled.

**Labour market** — wage reservation matching. Employers (land > 0) bid MRP-derived wages; workers accept if the offer meets their reservation wage and the minimum wage floor. Wage tax feeds the treasury.

**Emergency food market** — when currency is active, agents with food < 1 and sufficient cash buy food from nearby surplus agents. This is the primary UBI transmission channel: tax → treasury → UBI cash → emergency market → food → survival.

**Housing market** — landlords (houses ≥ 2) rent surplus units to nearby agents for 1 cash/tick. Unsheltered agents lose 0.5 extra energy per tick. This creates the second UBI transmission chain: cash → rent → shelter → survival.

**Land rent market** — under auctioned land policy, landowners collect rent from nearby landless agents. `landRentIndex` tracks rent collected per agent per stats interval.

**Credit market** — one aggregate commercial bank creates equal borrower cash and
principal, subject to a minimum capital-ratio gate. Each simulation tick charges
the policy base rate plus a 2% spread and amortises 2% of opening principal. Only
paid interest is taxable income; principal repayment reduces cash, borrower debt,
and bank loan assets equally. Default applies available cash first, then seizes
only the houses, food, and wood needed to cover residual principal. Only the
unrecovered amount reduces bank capital.

---

## Policy controls

**Fiscal:** tax rate, redistribution model (none / UBI / targeted welfare / public goods / infrastructure), UBI fraction, minimum wage floor.

**Monetary:** currency activation toggle, central bank base rate, money supply growth rate.

**Banking:** minimum capital-ratio slider, capital-compliance and loan status display.
The persisted policy key remains `reserveRequirement` for compatibility.

**Land:** free / auctioned / state ownership.

**Starting conditions:** Morocco urban 2022 seed (Gini ≈ 0.40) or flat equal distribution.

All controls are live-adjustable mid-run. Policy changes fire a `PolicyEvent` that renders as a dashed vertical line across all dashboard charts with a human-readable label (e.g. "Tax 0%→12%", "Currency ON", "Capital req. 10%"). Monetary rates are nominal rates per simulation tick; they are not annualised real-world rates.

---

## Dashboard

Four collapsible tiers:

**Tier 1 — always visible:** Gini, population, prices (food amber / wood cyan), GDP, policy event log.

**Tier 2 — Market detail:** Wealth histogram (agents count / wealth held toggle), wage rate, labour share, employment rate, trade volume per tick, avg food and wood resources, policy impact scatter (Gini × Population trail with opacity fade).

**Tier 3 — Advanced metrics:** Inflation, rent index, credit/GDP, tech adoption, stock index.

**Tier 4 — Scenario comparison:** Save named runs with full SimStats history to IndexedDB. Compare any two saved runs side by side — summary table with starting conditions, policy diff (⚠ differs highlighting), and outcome metrics. Nine chart pairs: Gini, population, GDP, prices, wealth histogram (Piketty view), housing, cash/liquidity, labour, policy impact scatter. Export JSON for offline analysis.

---

## Calibration

Agent wealth at initialisation is drawn from **real 2022 Moroccan urban income data** (HCP Enquête Nationale, Casablanca-Settat region, 500 agents sampled across deciles, implied Gini ≈ 0.40). This calibrates one initial distribution only; it does not validate the behavioural rules, market mechanisms, or policy responses against Morocco's economy.

Historical runs found both seed types approaching a high-inequality state, but those trajectories must be rerun after the correctness repairs described in `FINDINGS.md`. They are model outcomes, not estimates of the intervention required in Morocco.

---

## Getting started

```bash
npm install
npm run dev
```

Requires a browser with SharedArrayBuffer support (Chrome 92+, Firefox 79+, Safari 15.2+). Cross-Origin Isolation headers must be set — Vite's dev server handles this automatically.

```bash
npm run build    # production build
npm run preview  # preview production build locally
```

---

## Phase roadmap

| Phase | Description | Status |
|---|---|---|
| 1 | Agent lifecycle, harvest, spatial grid | ✅ Complete |
| 2 | Bilateral trade engine, independent price discovery | ✅ Complete |
| 3 | Neural net agents, neuroevolution, GPU memory management | ✅ Complete |
| 4 | Labour market, land policy, redistribution, policy console | ✅ Complete |
| 5 | Full macro dashboard, scenario comparison, IndexedDB persistence | ✅ Complete |
| 6 | Morocco urban wealth seed, real-data calibration | ✅ Complete |
| 7 | Currency activation, emergency food market, inflation tracking, UBI transmission live | ✅ Complete |
| 8 | Housing market, shelter mechanics, land rent, builder role inheritance fix | ✅ Complete |
| 9 | Commercial bank, credit cycles, reserve requirement, default cascade | ✅ Complete |
| 10 | Deterministic lending trigger, stock exchange, capital gains tax | Planned |

---

## Key findings

Full experimental results and the complete implementation changelog are in [FINDINGS.md](./FINDINGS.md).

**Laissez-faire baseline (tick ~6720, zero policy, Morocco seed):**
Population ~120, Gini 0.931, avg food ~1134 (extreme elite hoarding), total trades ~125,000. Winner-take-most dynamics with a small surviving elite. This is the control condition for all policy experiments.

**On Phase 4–6 UBI:** UBI distributes cash to all agents each tick but shows negligible effect on population or Gini in Phases 4–6. This is not a bug — the transmission mechanism (cash → food purchase → survival) does not exist until Phase 7 introduces currency as the medium of exchange. Phase 4 UBI is the wiring. Phase 7 UBI is the experiment.

**Currency + housing (Phases 7–8):** Adding currency and housing dramatically improves survival. The best 5k-tick no-policy runs reach 400–500 population with Gini around 0.82–0.85. The Houses + Currency + Auctioned Land 20k run achieved the highest average GDP at 2,725 and sustained near-max population at 497.

**UBI with currency live (Phase 7+, 20k ticks):** 12% tax / 35% UBI redistribution achieves Gini 0.788 — the lowest observed — and sustains population at 499. Average GDP collapses to 108. The full causal chain is now live and testable: tax → treasury → UBI cash → emergency market → food → survival. Whether GDP recovers with parameter tuning is an open experimental question.

**Historical Phase 9 banking runs — invalidated:** The following numbers are retained for provenance, but the old implementation reduced principal before confirming payment, destroyed borrower cash during default, treated the policy rate as amortisation, mixed barter and cash collateral values, and allowed capital-ratio overshoot. They are not evidence of an emergent banking crisis and must not be used for policy conclusions.

| Metric | No banking (Phase 8) | With banking v1 |
|---|---|---|
| Final population | 437 | 366 |
| Final Gini | 0.822 | 0.855 |
| Avg GDP | 1,544 | 1,758 |

**Invest-signal suppression (Phase 9 v5–v6, provisional):** The old runs showed `invest_signal` approaching zero after a delayed lending window. Because both banking accounting and asynchronous evolution reproducibility still require corrected baselines, this remains a mechanism hypothesis rather than an architectural conclusion.

**Role diversity and credit (provisional):** Historical runs showed different role mixes with and without credit. The causal interpretation must be retested with corrected accounting, net-worth measurement, and deterministic evolution.

---

## Architecture notes

**Thread model is non-negotiable.** The main thread runs React and D3 only. No simulation logic ever touches the main thread. If you find yourself writing simulation logic on the main thread, stop and move it to the Sim Worker.

**SAB layout** (844 floats per agent): ID, role, x, y, food, wood, tools, houses, clothing, fish, labour sold, labour hired, wage reservation, land, cash, debt, shares, wealth, age, energy — then 824 network weights (40×16 + 16×8 + 8×7). Always use `getField` / `setField` from `agent.ts`. Never use raw index arithmetic.

**GPU memory** — explicit per-tensor disposal is required after each inference pass. `dataSync()` inside `tf.tidy()` pins the WebGL readback buffer and prevents texture release. The worker flushes the texture pool every 10 ticks and logs `tf.memory()` every 300 ticks. Do not remove these guards — at population 500, W1 alone is ~12.8 MB/tick.

---

## License

MIT
