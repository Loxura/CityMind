use std::{env, fs, path::PathBuf, time::Instant};

use citymind_core::{Policy, SeedMode, Simulation};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut seed = 42_u32;
    let mut population = 500_usize;
    let mut max_population = 500_usize;
    let mut ticks = 5_000_u64;
    let mut mode = SeedMode::Morocco;
    let mut policy_path: Option<PathBuf> = None;
    let mut output: Option<PathBuf> = None;
    let mut load_state: Option<PathBuf> = None;
    let mut save_state: Option<PathBuf> = None;
    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--seed" => seed = args.next().ok_or("missing seed")?.parse()?,
            "--population" => population = args.next().ok_or("missing population")?.parse()?,
            "--max-population" => {
                max_population = args.next().ok_or("missing maximum population")?.parse()?
            }
            "--ticks" => ticks = args.next().ok_or("missing ticks")?.parse()?,
            "--flat" => mode = SeedMode::Flat,
            "--policy" => policy_path = Some(args.next().ok_or("missing policy path")?.into()),
            "--output" => output = Some(args.next().ok_or("missing output path")?.into()),
            "--load-state" => load_state = Some(args.next().ok_or("missing state path")?.into()),
            "--save-state" => save_state = Some(args.next().ok_or("missing state path")?.into()),
            "--help" | "-h" => {
                println!(
                    "citymind-cli [--seed N] [--population N] [--max-population N] [--ticks N] [--flat] [--policy FILE.json] [--output FILE.json] [--load-state FILE.json] [--save-state FILE.json]"
                );
                return Ok(());
            }
            _ => return Err(format!("unknown argument: {arg}").into()),
        }
    }
    if load_state.is_none()
        && (population == 0 || max_population == 0 || population > max_population)
    {
        return Err("population must be between 1 and max-population".into());
    }
    let mut sim = if let Some(path) = load_state {
        Simulation::load_state(path)?
    } else {
        Simulation::new(seed, mode, population, max_population)
    };
    if let Some(path) = policy_path {
        let policy: Policy = serde_json::from_str(&fs::read_to_string(path)?)?;
        sim.set_policy(policy, "CLI policy file");
    }
    let start = Instant::now();
    sim.run_ticks(ticks);
    let elapsed = start.elapsed();
    let stats = sim.stats();
    println!(
        "tick={} population={} net_worth_gini={:.3} gdp={:.2} food_price={:.2} trades={}",
        stats.tick, stats.population, stats.gini, stats.gdp, stats.food_price, stats.trade_count
    );
    println!(
        "elapsed={:.2}s throughput={:.1} ticks/s",
        elapsed.as_secs_f64(),
        ticks as f64 / elapsed.as_secs_f64()
    );
    if let Some(path) = output {
        let scenario = sim.scenario("CLI run");
        fs::write(path, serde_json::to_vec_pretty(&scenario)?)?;
    }
    if let Some(path) = save_state {
        sim.save_state(path)?;
    }
    Ok(())
}
