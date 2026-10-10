use super::*;

fn close(actual: f32, expected: f32) {
    assert!((actual - expected).abs() < 0.0002, "{actual} != {expected}");
}

fn fixture(n: usize, currency: bool) -> Simulation {
    let mut sim = Simulation::new(42, SeedMode::Flat, n, n + 2);
    for agent in &mut sim.agents {
        *agent = Agent::new(agent.id, 10, 10, 0.0, 0.0, 1.0);
    }
    for tile in &mut sim.tiles {
        tile.food = 0.0;
        tile.wood = 0.0;
    }
    sim.policy.is_currency_active = currency;
    if currency {
        sim.activate_currency();
        sim.economy.food_money_price = 7.0;
        sim.economy.wood_money_price = 3.0;
    }
    sim.refresh_wealth(None);
    sim
}

fn borrowing_fixture(cash: f32, houses: f32) -> Simulation {
    let mut sim = fixture(1, true);
    sim.agents[0].debt = 100.0;
    sim.agents[0].cash = cash;
    sim.agents[0].houses = houses;
    sim.bank.loans_outstanding = 100.0;
    sim.policy.tax_rate = 0.25;
    sim
}

#[test]
fn principal_service_and_interest_tax_are_separate() {
    let mut sim = borrowing_fixture(10.0, 0.0);
    sim.lending(&[0], &[Decision::default()]);
    close(sim.agents[0].cash, 6.0);
    close(sim.agents[0].debt, 98.0);
    close(sim.bank.loans_outstanding, 98.0);
    close(sim.economy.treasury, 0.5);
    close(sim.bank.retained_interest_income, 1.5);
    close(sim.bank.capital_buffer, 2001.5);
}

#[test]
fn higher_base_rate_changes_interest_not_amortization() {
    let mut sim = borrowing_fixture(20.0, 0.0);
    sim.policy.central_bank_rate = 0.1;
    sim.lending(&[0], &[Decision::default()]);
    close(sim.agents[0].debt, 98.0);
    close(sim.agents[0].cash, 6.0);
    close(sim.economy.treasury, 3.0);
}

#[test]
fn partial_interest_payment_does_not_reduce_principal() {
    let mut sim = borrowing_fixture(1.0, 0.0);
    sim.lending(&[0], &[Decision::default()]);
    close(sim.agents[0].cash, 0.0);
    close(sim.agents[0].debt, 0.0);
    close(sim.bank.loans_outstanding, 0.0);
    close(sim.bank.cumulative_write_offs, 100.0);
    close(sim.bank.capital_buffer, 1900.75);
    close(sim.economy.treasury, 0.25);
}

#[test]
fn partial_principal_payment_only_writes_off_remaining_principal() {
    let mut sim = borrowing_fixture(3.0, 0.0);
    sim.lending(&[0], &[Decision::default()]);
    close(sim.bank.cumulative_write_offs, 99.0);
    close(sim.bank.capital_buffer, 1902.5);
    close(sim.economy.treasury, 0.5);
}

#[test]
fn overcollateralized_default_keeps_excess_houses_and_capital() {
    let mut sim = borrowing_fixture(0.0, 10.0);
    sim.lending(&[0], &[Decision::default()]);
    close(sim.agents[0].houses, 5.0);
    close(sim.bank.capital_buffer, 2000.0);
    close(sim.bank.cumulative_write_offs, 0.0);
    close(sim.bank.loans_outstanding, 0.0);
}

#[test]
fn collateral_uses_independent_cash_marks_including_when_paused() {
    let mut sim = borrowing_fixture(0.0, 2.0);
    sim.agents[0].food = 5.0; // 35 cash
    sim.agents[0].wood = 10.0; // 30 cash, only 25 needed
    sim.economy.food_prices.price = 100.0;
    sim.economy.wood_prices.price = 200.0;
    sim.policy.is_currency_active = false;
    sim.close_deceased_debt(0);
    close(sim.agents[0].houses, 0.0);
    close(sim.agents[0].food, 0.0);
    close(sim.agents[0].wood, 10.0 - 25.0 / 3.0);
    close(sim.bank.cumulative_write_offs, 0.0);
    close(sim.bank.capital_buffer, 2000.0);
}

#[test]
fn deceased_cash_settlement_preserves_surplus_without_interest_or_tax() {
    let mut sim = borrowing_fixture(120.0, 10.0);
    sim.close_deceased_debt(0);
    close(sim.agents[0].cash, 20.0);
    close(sim.agents[0].houses, 10.0);
    close(sim.bank.loans_outstanding, 0.0);
    close(sim.bank.capital_buffer, 2000.0);
    close(sim.economy.treasury, 0.0);
}

#[test]
fn tiny_principal_is_paid_without_silent_forgiveness() {
    let mut sim = borrowing_fixture(1.0, 0.0);
    sim.agents[0].debt = 0.0005;
    sim.bank.loans_outstanding = 0.0005;
    sim.lending(&[0], &[Decision::default()]);
    assert_eq!(sim.agents[0].debt, 0.0);
    assert_eq!(sim.bank.loans_outstanding, 0.0);
    close(sim.agents[0].cash, 0.99949);
}

#[test]
fn loan_creation_is_net_worth_neutral_and_checks_projected_capital() {
    let mut sim = fixture(2, true);
    sim.agents[0].cash = 200.0;
    sim.agents[1].cash = 200.0;
    sim.refresh_wealth(None);
    sim.bank.capital_buffer = 1.5;
    let decisions = vec![
        Decision {
            invest_signal: 1.0,
            ..Decision::default()
        };
        2
    ];
    sim.lending(&[0, 1], &decisions);
    close(sim.agents[0].cash, 210.0);
    close(sim.agents[0].debt, 10.0);
    close(sim.agents[1].debt, 0.0);
    close(sim.bank.loans_outstanding, 10.0);
    sim.refresh_wealth(None);
    close(sim.agents[0].wealth, 200.0);
    close(sim.agents[1].wealth, 200.0);
}

#[test]
fn policy_changes_refresh_stale_capital_status_in_both_directions() {
    let mut sim = fixture(1, true);
    sim.bank.capital_buffer = 5.0;
    sim.bank.loans_outstanding = 50.0;
    let mut policy = sim.policy.clone();
    policy.reserve_requirement = 0.2;
    sim.set_policy(policy.clone(), "tighten");
    assert!(!sim.bank.is_solvent);
    policy.reserve_requirement = 0.05;
    sim.set_policy(policy, "loosen");
    assert!(sim.bank.is_solvent);
    sim.bank.capital_buffer = -1.0;
    sim.bank.loans_outstanding = 0.0;
    sim.check_solvency();
    assert!(!sim.bank.is_solvent);
}

fn labour_fixture(currency: bool) -> (Simulation, Vec<Decision>) {
    let mut sim = fixture(3, currency);
    sim.policy.tax_rate = 0.2;
    sim.agents[0].cash = 20.0;
    sim.agents[0].wood = 20.0;
    let decisions = vec![
        Decision {
            action: 3,
            ..Decision::default()
        },
        Decision {
            action: 2,
            ..Decision::default()
        },
        Decision {
            action: 2,
            ..Decision::default()
        },
    ];
    (sim, decisions)
}

#[test]
fn wages_conserve_gross_debit_net_credit_and_tax_in_both_regimes() {
    for currency in [false, true] {
        let (mut sim, decisions) = labour_fixture(currency);
        let grid = sim.build_grid(Some(&[true, true, false]));
        sim.labour_market(&grid, &[0, 1], &decisions);
        let wage = if currency { 4.2 } else { 3.0 };
        if currency {
            close(sim.agents[0].cash, 20.0 - wage);
            close(sim.agents[1].cash, wage * 0.8);
            close(sim.agents[0].wood, 20.0);
        } else {
            close(sim.agents[0].wood, 20.0 - wage);
            close(sim.agents[1].wood, wage * 0.8);
            close(sim.agents[1].cash, 0.0);
        }
        close(sim.economy.treasury, wage * 0.2);
        assert_eq!(sim.economy.labour_seekers, 1);
        assert_eq!(sim.economy.unemployed, 0);
        close(sim.agents[2].cash, 0.0);
    }
}

#[test]
fn minimum_wage_above_mrp_does_not_force_a_hire() {
    let (mut sim, decisions) = labour_fixture(false);
    sim.policy.min_wage = 4.0;
    sim.labour_market(&sim.build_grid(None), &[0, 1], &decisions);
    close(sim.agents[1].labour_sold, 0.0);
    close(sim.agents[0].wood, 20.0);
    assert_eq!(sim.economy.unemployed, 1);
}

#[test]
fn employers_cannot_pay_unfunded_wages_or_spend_wood_buffer() {
    for currency in [false, true] {
        let (mut sim, decisions) = labour_fixture(currency);
        sim.agents[0].cash = 4.0;
        sim.agents[0].wood = 4.0;
        sim.labour_market(&sim.build_grid(None), &[0, 1], &decisions);
        close(sim.agents[1].labour_sold, 0.0);
        close(sim.economy.treasury, 0.0);
    }
}

#[test]
fn reservation_wage_is_enforced() {
    let (mut sim, mut decisions) = labour_fixture(false);
    decisions[1].reservation_wage = 4.0;
    sim.labour_market(&sim.build_grid(None), &[0, 1], &decisions);
    assert_eq!(sim.economy.unemployed, 1);
}

#[test]
fn food_and_wood_trades_use_selected_buyers_threshold() {
    for food in [false, true] {
        for accepts in [false, true] {
            let mut sim = fixture(2, false);
            if food {
                sim.agents[0].food = 20.0;
                sim.agents[1].wood = 22.0;
            } else {
                sim.agents[0].wood = 12.0;
                sim.agents[1].food = 30.0;
            }
            let decisions = [
                Decision {
                    offer_price: 2.0,
                    accept_threshold: if accepts { 99.0 } else { 0.01 },
                    ..Decision::default()
                },
                Decision {
                    accept_threshold: if accepts { 1.0 } else { 3.0 },
                    ..Decision::default()
                },
            ];
            sim.goods_market(&sim.build_grid(None), &[0], &decisions);
            assert_eq!(sim.economy.trade_count, u64::from(accepts));
            close(
                if food {
                    sim.economy.wood_prices.price
                } else {
                    sim.economy.food_prices.price
                },
                5.0,
            );
            if accepts {
                close(
                    if food {
                        sim.economy.food_prices.price
                    } else {
                        sim.economy.wood_prices.price
                    },
                    2.0,
                );
            }
        }
    }
}

#[test]
fn redistribution_only_counts_and_pays_survivors() {
    for model in [Redistribution::Ubi, Redistribution::TargetedWelfare] {
        let mut sim = fixture(3, false);
        sim.policy.redistribution = model;
        sim.policy.ubi_amount = 1.0;
        sim.economy.treasury = 10.0;
        sim.agents[0].wealth = 0.0; // dead poorest agent
        sim.agents[1].wealth = 1.0;
        sim.agents[2].wealth = 2.0;
        sim.redistribute(&[1, 2]);
        close(sim.agents[0].cash, 0.0);
        close(
            sim.agents[1].cash,
            if model == Redistribution::Ubi {
                5.0
            } else {
                10.0
            },
        );
        close(
            sim.agents[2].cash,
            if model == Redistribution::Ubi {
                5.0
            } else {
                0.0
            },
        );
        close(sim.economy.treasury, 0.0);
    }
}

#[test]
fn wealth_marks_resources_and_subtracts_debt_only_after_bootstrap() {
    let mut sim = fixture(1, false);
    let a = &mut sim.agents[0];
    a.food = 10.0;
    a.wood = 5.0;
    a.houses = 2.0;
    a.cash = 100.0;
    a.debt = 60.0;
    sim.refresh_wealth(None);
    close(sim.agents[0].wealth, 95.0);
    sim.economy.currency_bootstrapped = true;
    sim.economy.food_money_price = 7.0;
    sim.economy.wood_money_price = 3.0;
    sim.refresh_wealth(None);
    close(sim.agents[0].wealth, 165.0);
    sim.agents[0].debt = 1000.0;
    sim.refresh_wealth(None);
    close(sim.agents[0].wealth, 0.0);
}

#[test]
#[should_panic(expected = "invalid net-worth valuation price")]
fn invalid_valuation_prices_fail_explicitly() {
    let mut sim = fixture(1, true);
    sim.economy.food_money_price = f32::NAN;
    sim.refresh_wealth(None);
}

#[test]
fn full_tick_excludes_dead_borrowers_and_marks_newborns_before_stats() {
    let mut sim = fixture(2, true);
    sim.agents[0].energy = 0.0;
    sim.agents[0].debt = 10.0;
    sim.agents[0].cash = 3.0;
    sim.agents[0].wood = 1.0;
    sim.bank.loans_outstanding = 10.0;
    sim.agents[1].food = 100.0;
    sim.agents[1].houses = 1.0;
    sim.agents[1].age = 19;
    sim.policy.redistribution = Redistribution::Ubi;
    sim.policy.ubi_amount = 1.0;
    sim.economy.treasury = 10.0;
    sim.tick = 59;
    sim.step();
    assert_eq!(sim.agents.len(), 2);
    assert_eq!(sim.agents[0].id, 1);
    close(sim.agents[0].cash, 10.0);
    close(sim.agents[1].cash, 0.0); // newborn excluded from this tick's UBI
    close(sim.bank.loans_outstanding, 0.0);
    close(sim.bank.cumulative_write_offs, 4.0);
    for a in &sim.agents {
        close(a.wealth, a.net_worth(sim.valuation()));
    }
    close(
        sim.history[0].wealth_by_bracket.iter().sum(),
        sim.agents.iter().map(|a| a.wealth).sum(),
    );
}

#[test]
fn targeted_welfare_and_lending_read_current_wealth_at_their_boundaries() {
    let mut sim = fixture(2, true);
    sim.agents[0].food = 20.0;
    sim.agents[0].debt = 200.0; // debt makes agent 0 poorest
    sim.bank.loans_outstanding = 200.0;
    sim.agents[1].food = 10.0;
    sim.agents[0].wealth = 10000.0;
    sim.agents[1].wealth = 0.0;
    sim.economy.treasury = 20.0;
    sim.policy.redistribution = Redistribution::TargetedWelfare;
    sim.step();
    assert!(
        sim.agents[0].cash > 0.0,
        "current net worth must choose agent 0 for welfare"
    );
    close(sim.agents[1].cash, 0.0);

    let mut sim = fixture(1, true);
    sim.policy.redistribution = Redistribution::Ubi;
    sim.policy.ubi_amount = 1.0;
    sim.economy.treasury = 20.0;
    // Force invest signal high through food input; make sell/buy thresholds
    // harmless. The lending eligibility must see this tick's UBI, not old wealth.
    sim.agents[0].food = 0.5;
    sim.agents[0].weights[0] = 1000.0;
    sim.agents[0].weights[640] = 10.0;
    sim.agents[0].weights[768 + 5] = 10.0;
    sim.step();
    assert!(
        sim.agents[0].debt > 0.0,
        "lending must see post-redistribution wealth"
    );
    close(sim.agents[0].wealth, 20.0);
}

#[test]
fn paused_currency_keeps_monetary_wealth_and_reactivation_does_not_grant_cash() {
    let mut sim = fixture(1, true);
    sim.agents[0].cash = 50.0;
    sim.agents[0].debt = 100.0;
    sim.bank.loans_outstanding = 100.0;
    sim.agents[0].food = 1.0;
    sim.policy.is_currency_active = false;
    sim.step();
    close(sim.agents[0].cash, 50.0);
    close(sim.agents[0].wealth, 0.0);
    sim.policy.is_currency_active = true;
    sim.step();
    close(sim.agents[0].cash, 46.0);
    close(sim.agents[0].debt, 98.0);
}

#[test]
fn physical_food_decay_runs_before_currency_and_wood_regenerates_per_spec() {
    let mut sim = fixture(1, false);
    sim.agents[0].food = 100.0;
    sim.step();
    close(sim.agents[0].food, 99.5 * 0.998);
    close(sim.tiles[0].wood, 1.0);
    close(sim.tiles[0].food, 0.1);
}

#[test]
fn grid_corners_do_not_alias_other_rows_or_columns() {
    let mut sim = fixture(4, false);
    for (agent, (x, y)) in sim
        .agents
        .iter_mut()
        .zip([(0, 0), (49, 0), (0, 49), (49, 49)])
    {
        agent.x = x;
        agent.y = y;
    }
    let grid = sim.build_grid(None);
    for (i, agent) in sim.agents.iter().enumerate() {
        assert_eq!(sim.neighbours(&grid, agent.x, agent.y), vec![i]);
    }
}

#[test]
fn corrected_save_replays_and_legacy_save_is_rejected() {
    let mut sim = Simulation::new(42, SeedMode::Morocco, 30, 60);
    sim.policy.is_currency_active = true;
    sim.run_ticks(105);
    let path =
        std::env::temp_dir().join(format!("citymind-correctness-{}.json", std::process::id()));
    sim.save_state(&path).unwrap();
    let mut restored = Simulation::load_state(&path).unwrap();
    sim.run_ticks(20);
    restored.run_ticks(20);
    assert_eq!(
        serde_json::to_vec(&sim).unwrap(),
        serde_json::to_vec(&restored).unwrap()
    );
    let mut value = serde_json::to_value(&sim).unwrap();
    value.as_object_mut().unwrap().remove("measurement_version");
    fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();
    assert!(
        Simulation::load_state(&path)
            .unwrap_err()
            .to_string()
            .contains("measurement version")
    );
    fs::remove_file(path).unwrap();
}

// Opt in with cargo test --release -p citymind-core -- --ignored --nocapture.
// Five fresh 60-tick windows avoid reporting a shrinking population as 500-agent
// throughput. Fixture construction is excluded from the timed interval.
#[test]
#[ignore = "opt-in native throughput check"]
fn native_throughput_at_500_agents() {
    for currency in [false, true] {
        let mut elapsed = std::time::Duration::ZERO;
        for seed in 42..47 {
            let mut sim = Simulation::new(seed, SeedMode::Morocco, 500, 500);
            sim.policy.is_currency_active = currency;
            let start = std::time::Instant::now();
            for _ in 0..60 {
                sim.step();
                assert_eq!(sim.agents.len(), 500);
            }
            elapsed += start.elapsed();
        }
        let throughput = 300.0 / elapsed.as_secs_f64();
        println!("500-agent currency={currency}: {throughput:.1} ticks/s over 300 timed ticks");
        assert!(
            throughput >= 60.0,
            "native throughput below the 60 TPS target"
        );
    }
}
