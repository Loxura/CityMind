# CityMind in Rust

This branch ports the CityMind simulation to a headless Rust library and uses it from a small Bevy city view. The TypeScript app remains in the repository for side-by-side behavior checks during the rewrite.

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

The map colors show food and wood availability. White dots are residents; orange dots are builders. The HUD shows population, Gini, GDP, policy, and tick.

Set `CITYMIND_SEED`, `CITYMIND_POPULATION`, and `CITYMIND_MAX_POPULATION` before launching Bevy to try larger runs. The CPU neural inference cost rises with population; use the CLI throughput number to find a practical size before increasing the visual run.

## Port notes

The order of the existing market, housing, redistribution, banking, and lifecycle steps is retained. The evolution worker is now synchronous at each 100th tick and uses the seeded random stream. This makes repeated runs deterministic, but it will not reproduce the browser build's exact random sequence. The Bevy view is deliberately small; it does not yet reproduce the React dashboard's charts or scenario manager.
