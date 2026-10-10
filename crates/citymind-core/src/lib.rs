mod model;
mod neural;
mod rng;
mod sim;

pub use model::{
    Agent, Bank, LandPolicy, MAP_HEIGHT, MAP_WIDTH, Policy, PolicyEvent, Redistribution, Scenario,
    SeedMode, Stats, Tile,
};
pub use sim::Simulation;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_seed_replays_through_evolution() {
        let mut a = Simulation::new(42, SeedMode::Morocco, 30, 60);
        let mut b = Simulation::new(42, SeedMode::Morocco, 30, 60);
        a.run_ticks(120);
        b.run_ticks(120);
        assert_eq!(
            serde_json::to_vec(&a).unwrap(),
            serde_json::to_vec(&b).unwrap()
        );
    }

    #[test]
    fn population_respects_capacity_and_scenario_is_exportable() {
        let mut sim = Simulation::new(7, SeedMode::Flat, 25, 30);
        let mut policy = Policy::default();
        policy.is_currency_active = true;
        policy.tax_rate = 0.12;
        policy.redistribution = Redistribution::Ubi;
        policy.ubi_amount = 0.35;
        sim.set_policy(policy, "UBI experiment");
        sim.run_ticks(120);
        assert!(sim.agents.len() <= 30);
        assert_eq!(sim.history.len(), 2);
        let scenario = sim.scenario("test");
        let json = serde_json::to_string(&scenario).unwrap();
        let loaded: Scenario = serde_json::from_str(&json).unwrap();
        assert_eq!(loaded.policy_events[0].label, "UBI experiment");
        assert_eq!(loaded.history.len(), 2);
    }

    #[test]
    fn morocco_seed_has_expected_initial_distribution() {
        let sim = Simulation::new(42, SeedMode::Morocco, 500, 500);
        let stats = sim.stats();
        assert_eq!(stats.population, 500);
        assert!(
            stats.gini > 0.35 && stats.gini < 0.45,
            "initial Gini {}",
            stats.gini
        );
    }
}
