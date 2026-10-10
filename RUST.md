# CityMind in Rust

This branch ports the CityMind simulation to a headless Rust library and uses it from a small Bevy city view. The TypeScript app remains in the repository as a historical reference. Its corrected version is preserved separately on `fix/typescript-correctness`.

## Crates

- `citymind-core`: agents, 40→16→8→7 neural decisions, deterministic neuroevolution, resource map, goods and labour markets, housing, credit, tax, redistribution, statistics, and scenario export.
- `citymind-cli`: headless runs for benchmarks and policy experiments.
- `citymind-bevy`: an interactive 2D map of the same simulation.

The Rust core evaluates neural networks on the CPU. Bevy uses the GPU for rendering. GPU inference on the RTX 3060 is a later optimization, after profiling the native CPU version. Unlike the browser implementation, the Rust simulator allocates agent memory for its active population and has a configurable population cap.

## Run on Linux

Install current stable Rust with rustup and Bevy's [Linux system dependencies](https://bevy.org/learn/quick-start/getting-started/setup/#linux). On a fresh clone:

```sh
cargo test -p citymind-core
cargo run --release -p citymind-cli -- --seed 42 --population 500 --max-population 500 --ticks 5000 --output run.json
cargo run --release -p citymind-bevy
```

The CLI accepts `--policy policy.json`, `--flat`, and other options shown by `--help`. Policy JSON keys use snake case:

```json
{
  "tax_rate": 0.12,
  "redistribution": "ubi",
  "ubi_amount": 0.35,
  "is_currency_active": true
}
```

Missing policy fields use their defaults. The output contains sampled statistics and policy events and can be compared with another run using the same seed.

Use `--save-state state.json` to preserve all agents and the random stream. Resume with `--load-state state.json --ticks 5000`. The `--output` file is a smaller scenario summary for comparing policies; it cannot resume a run.

## Bevy controls

- Space: pause or resume
- N: advance one tick while paused
- R: reset to the configured seed
- S: save the full simulation to `citymind-save.json`
- L: load `citymind-save.json`
- 0: baseline policy
- 1: 12% tax and 35% UBI
- 2: 12% tax and public goods
- 3: 12% tax and targeted welfare
- 4: 12% tax and infrastructure

The map colors show food and wood availability. White dots are residents; orange dots are builders. The HUD shows population, net-worth Gini, GDP, policy, and tick.

Set `CITYMIND_SEED`, `CITYMIND_POPULATION`, and `CITYMIND_MAX_POPULATION` before launching Bevy to try larger runs. The CPU neural inference cost rises with population; use the CLI throughput number to find a practical size before increasing the visual run.

## Port notes

Market, housing, redistribution, banking, and lifecycle steps retain their relative order. Net worth is now refreshed at four boundaries, and deceased debt is settled before removal. The evolution worker is now synchronous at each 100th tick and uses the seeded random stream. This makes repeated runs deterministic, but it will not reproduce the browser build's exact random sequence. The Bevy view is deliberately small; it does not yet reproduce the React dashboard's charts or scenario manager.

## Correctness port

The Rust core now includes the accounting and measurement repairs preserved in
`fix/typescript-correctness` at `a8952a8`. Grid boundary checks and survivor orders
were already present in Rust. Buyer threshold ownership, funded wages, survivor
redistribution and debt service, deceased debt closure, independent interest and
principal accounting, projected capital checks, net worth, and unconditional food
decay required porting.

### Wealth and banking

Before currency bootstrap, wealth is food marked in wood plus wood and houses at
20 units each. Cash and debt are excluded in that regime. After bootstrap, wealth
is cash plus food and wood marked at their fixed cash prices plus houses at 20
cash each, minus outstanding principal. The stored value is floored at zero.
Unpriced assets are omitted. Monetary valuation persists while transactions are
paused, and reactivation never grants cash again.

Wealth is refreshed before neural inference, before redistribution, after
redistribution and before lending, and after reproduction and compaction. Initial
and restored runs also refresh wealth. Stats and evolution therefore see the final
balance sheet, including newborns. A new loan adds equal cash and debt, so it does
not create measured net worth.

Each tick schedules interest at the base rate plus a 2% spread and principal
amortization at 2%, with a 0.001 minimum capped at the remaining principal. Available
cash pays interest first and principal second. A service shortfall closes the
residual principal through collateral recovery. Houses, food, and wood are seized
only up to the amount needed; remaining collateral stays with the borrower. Only
unrecovered principal reduces bank capital. Retained after-tax paid interest
increases capital. Deceased borrowers settle principal with cash first, without
scheduled interest or tax, then use the same collateral cascade.

`Bank` now exports `retained_interest_income` and `cumulative_write_offs` instead
of the misleading `deposits` and `non_performing_loans` accumulators. Policy
`reserve_requirement` remains the minimum capital-ratio threshold for JSON
compatibility. Stats `bank_solvency` is the capped capital ratio, not a general
solvency measure. New loans must meet the threshold after issuance; negative
capital prevents lending even when no loans remain.

### Saved states and historical results

Full saves and scenario exports include `measurement_version: 1`. `load_state`
rejects unversioned or incompatible full saves with an explicit error. Re-running
from a seed is required; relabelling old balances would silently preserve invalid
principal, interest, and wealth histories. Corrected saves retain deterministic
continuation, including across evolution boundaries. Scenario exports remain
summaries and cannot resume simulations.

Past Gini values measured gross inventories without debt. Past banking runs also
used invalid service and default accounting. Those results are historical records,
not corrected baselines. Pre-bootstrap and post-bootstrap wealth series use
different units, so policy comparisons must hold the monetary regime fixed.

### Calibration conflicts and remaining limits

Rust now regenerates wood at 1.0 per tile per tick, following the supplied
AGENTS.md contract. Both earlier implementations used 0.3. Food regeneration
remains 0.1. This additional calibration change requires fresh seeded experiments.

The supplied contract describes well-fed energy as increasing by 0.25 per tick,
but its formula with the implemented 0.5 food consumption yields a decrease of
0.25 before shelter costs. This port preserves the formula and consumption; the
contradictory explanatory claim needs a separate calibration decision.

Surplus estate assets still disappear during compaction; no inheritance mechanism
has been added. Collateral marks and capital requirements remain simplified.
Tools, clothing, fish, land, and shares have no authoritative prices, and the
stored wealth floor hides negative net worth. CPU neural inputs and synchronous
seeded evolution retain the existing Rust design, which differs from the browser
implementation. This port does not claim complete behavioral parity.

### Verification commands

```sh
cargo fmt --all -- --check
cargo test -p citymind-core --locked
cargo check --workspace --locked
cargo test --release -p citymind-core --locked -- --ignored --nocapture
```

The last command opts into the fixed-500-agent throughput check for both currency
regimes. It times five fresh 60-tick windows, verifies that population stays 500
after every tick, and excludes seed construction from timing. The total sample is
300 ticks per regime and must reach the 60 TPS target. This measures the native
core only; it does not measure Bevy frame rate or browser GPU inference.
