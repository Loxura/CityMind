# CityMind

CityMind is an agent-based economic policy simulator. This branch contains a
headless Rust simulation library, a command-line runner, and a small Bevy map view.
The browser policy console and D3 dashboard remain in the repository.

The research question is whether UBI expands output and innovation or primarily
redistributes income in a closed economy. Results are computational evidence
conditional on the model's rules, parameters, and starting conditions. They are
not forecasts of a real economy.

## Run the Rust simulator

Install stable Rust. The headless core and CLI do not require Bevy's windowing or
audio libraries.

```sh
cargo test -p citymind-core --locked
cargo run --release -p citymind-cli -- --seed 42 --population 500 --max-population 500 --ticks 5000 --output run.json
```

For the Bevy view, install the Linux system libraries described in [RUST.md](RUST.md),
then run:

```sh
cargo run --release -p citymind-bevy
```

See [RUST.md](RUST.md) for policy files, controls, save/resume, and the accounting
contract. The CLI prints throughput in simulation ticks per second. Bevy advances
at a configured 30 ticks per second and renders agents on a resource map; it does
not yet reproduce the browser dashboard or scenario manager.

## Architecture

| Component | Responsibility |
|---|---|
| `citymind-core` | Agent state, CPU neural inference, seeded evolution, markets, redistribution, banking, statistics |
| `citymind-cli` | Headless experiments, scenario export, save/resume, throughput measurement |
| `citymind-bevy` | Native map view, policy presets, pause/step/reset, save/load |
| `src/` | Historical TypeScript browser implementation |

Rust uses ordinary agent structs and evaluates the 40 → 16 → 8 → 7 neural network
on the CPU. Evolution runs synchronously every 100 ticks with the seeded random
stream. Market matching uses a bounded spatial grid. Population capacity is
configurable and is not restricted by the browser's SharedArrayBuffer or WebGL
budget. The Rust and browser versions do not have identical random sequences or
execution models.

## Economic mechanisms

- Food and wood have independent barter price histories.
- Labour offers follow marginal revenue product. Workers require their reservation
  wage and the policy minimum wage. Employers pay the gross amount, workers
  receive the net amount, and the treasury receives tax. Wages settle in wood
  before currency activation and cash while monetary transactions are active.
- Currency bootstrap establishes fixed cash prices for food and wood. Emergency
  food purchases connect cash transfers to survival.
- Builders construct houses from wood. House rent can provide shelter; auctioned
  land enables land rent. Unsheltered agents lose extra energy.
- The aggregate bank creates equal borrower cash and principal debt. Interest and
  principal service are separate. Only paid interest is taxed; only unrecovered
  principal is a bank loss. A loan must satisfy the projected bank capital ratio.
- Redistribution supports UBI, targeted welfare, public goods, infrastructure, and
  no redistribution. Benefits and labour accounting use survivors only.

Policy fields include taxation, redistribution, minimum wage, land policy,
currency activation, the base interest rate, and the minimum bank capital ratio.
`reserve_requirement` and `bank_solvency` remain legacy JSON names for the capital
requirement and capped capital-ratio statistic. Monetary rates apply per simulation
tick, not per year.

Money-supply growth, the stock exchange, capital-gains tax, and margin lending
remain deferred. This correctness port stays within Phase 9.

## Measurement and result compatibility

Wealth is measured household private net worth, floored at zero:

```text
Before currency bootstrap:
  max(0, food * foodBarterPrice + wood + houses * 20)

After currency bootstrap, including while monetary transactions are paused:
  max(0, cash + food * foodMoneyPrice + wood * woodMoneyPrice + houses * 20 - debt)
```

Unpriced tools, clothing, fish, land, and shares are excluded. Bank equity,
treasury balances, and issuer liabilities are outside the household balance
sheet. Negative net worth is stored as zero, so Gini hides insolvency depth.
Currency bootstrap changes the unit of account; comparisons must hold the
valuation regime fixed.

Earlier banking and gross-wealth results in [FINDINGS.md](FINDINGS.md) are retained
for provenance. They must be rerun before drawing conclusions from corrected
net-worth or policy outcomes. Full saves and scenario exports carry
`measurement_version: 1`. Old full saves are rejected because their banking
balances and historical measurements cannot be repaired reliably.

The corrected browser work is preserved on `fix/typescript-correctness`, commit
`a8952a8`. The browser files on this Rust branch retain the older implementation;
use that separate branch for the corrected browser console and its tests.

## Verification

```sh
cargo fmt --all -- --check
cargo test -p citymind-core --locked
cargo check --workspace --locked
```

The core suite covers payment conservation, buyer threshold ownership, survivor
eligibility, collateral recovery, net-worth synchronization, deterministic
replay, and corrected save/resume. The existing Rust GitHub Actions workflow runs
formatting, core tests, workspace checking, and a CLI save/resume smoke test.

## Browser version

```sh
npm install
npm run dev
npm run build
```

The browser simulation uses workers, TensorFlow.js, and SharedArrayBuffer.
Cross-origin isolation is required; Vite supplies the development headers.
The browser population cap remains 500.

## License

MIT
