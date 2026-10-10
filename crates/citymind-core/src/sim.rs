use std::{error::Error, fs, path::Path};

use serde::{Deserialize, Serialize};

use crate::model::{
    Agent, Bank, HOUSE_ASSET_VALUE, LandPolicy, MAP_HEIGHT, MAP_WIDTH, Policy, PolicyEvent,
    Redistribution, Scenario, SeedMode, Stats, Tile, WealthValuation,
};
use crate::neural::{self, Decision};
use crate::rng::Rng;

const FOOD_BUFFER: f32 = 10.0;
const WOOD_BUFFER: f32 = 2.0;
const HOUSE_RENT: f32 = 1.0;
const LAND_RENT: f32 = 0.5;
const PRICE_HISTORY: usize = 100;
const MEASUREMENT_VERSION: u32 = 1;
const PRINCIPAL_AMORTIZATION_RATE: f32 = 0.02;
const MIN_PRINCIPAL_INSTALLMENT: f32 = 0.001;
const INTEREST_RATE_SPREAD: f32 = 0.02;

#[derive(Clone, Debug, Serialize, Deserialize)]
struct PriceRing {
    entries: Vec<f32>,
    next: usize,
    count: usize,
    price: f32,
}

impl Default for PriceRing {
    fn default() -> Self {
        Self {
            entries: vec![0.0; PRICE_HISTORY],
            next: 0,
            count: 0,
            price: 5.0,
        }
    }
}

impl PriceRing {
    fn push(&mut self, price: f32) {
        self.entries[self.next] = price;
        self.next = (self.next + 1) % PRICE_HISTORY;
        self.count = (self.count + 1).min(PRICE_HISTORY);
        self.price = self.entries[..self.count].iter().sum::<f32>() / self.count as f32;
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
struct Economy {
    food_prices: PriceRing,
    wood_prices: PriceRing,
    wage_prices: PriceRing,
    treasury: f32,
    trade_count: u64,
    tick_trade_count: u64,
    food_money_price: f32,
    wood_money_price: f32,
    currency_bootstrapped: bool,
    total_wages: f32,
    labour_seekers: usize,
    unemployed: usize,
    food_harvested: f32,
    rent_collected: f32,
    previous_food_price: f32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Simulation {
    measurement_version: u32,
    pub seed: u32,
    pub seed_mode: SeedMode,
    pub initial_population: usize,
    pub max_population: usize,
    next_id: u32,
    pub tick: u64,
    pub policy: Policy,
    pub policy_events: Vec<PolicyEvent>,
    pub agents: Vec<Agent>,
    pub tiles: Vec<Tile>,
    pub bank: Bank,
    pub history: Vec<Stats>,
    rng: Rng,
    economy: Economy,
}

impl Simulation {
    pub fn new(seed: u32, seed_mode: SeedMode, population: usize, max_population: usize) -> Self {
        Self::with_policy(
            seed,
            seed_mode,
            population,
            max_population,
            Policy::default(),
        )
    }

    pub fn with_policy(
        seed: u32,
        seed_mode: SeedMode,
        population: usize,
        max_population: usize,
        policy: Policy,
    ) -> Self {
        let mut map_rng = Rng::new(seed);
        let mut tiles = Vec::with_capacity(MAP_WIDTH * MAP_HEIGHT);
        for y in 0..MAP_HEIGHT {
            for x in 0..MAP_WIDTH {
                let gaussian = |cx: f32, cy: f32, sigma: f32| {
                    let dx = x as f32 - cx;
                    let dy = y as f32 - cy;
                    (-(dx * dx + dy * dy) / (2.0 * sigma * sigma)).exp()
                };
                let food = gaussian(25.0, 12.0, 10.0) * 10.0 * (0.5 + map_rng.next_f32() * 0.5);
                let wood = (gaussian(20.0, 37.0, 14.0) * 18.0 + gaussian(32.0, 40.0, 10.0) * 8.0)
                    * (0.5 + map_rng.next_f32() * 0.5);
                tiles.push(Tile {
                    food,
                    wood,
                    food_max: 10.0,
                    wood_max: 18.0,
                });
            }
        }

        let mut rng = Rng::new(seed);
        let seeds = parse_morocco_seed();
        let count = population.min(max_population);
        let mut agents = Vec::with_capacity(count);
        for i in 0..count {
            let x = rng.index(MAP_WIDTH) as u8;
            let y = rng.index(MAP_HEIGHT) as u8;
            let (decile, food, wood) = if seed_mode == SeedMode::Morocco {
                let (d, f, w) = seeds[i % seeds.len()];
                (d, f, w)
            } else {
                (0, 20.0, 5.0)
            };
            let land = match policy.land_policy {
                LandPolicy::Free => 1.0,
                LandPolicy::State => 0.0,
                LandPolicy::Auctioned => {
                    if seed_mode == SeedMode::Morocco {
                        (decile >= 7) as u8 as f32
                    } else {
                        (i % 10 >= 7) as u8 as f32
                    }
                }
            };
            let mut agent = Agent::new(i as u32, x, y, food, wood, land);
            agent.role = if seed_mode == SeedMode::Morocco {
                (decile >= 9) as u8
            } else {
                (i % 7 == 0) as u8
            };
            neural::init_weights(&mut agent, &mut rng);
            agents.push(agent);
        }
        let mut sim = Self {
            measurement_version: MEASUREMENT_VERSION,
            seed,
            seed_mode,
            initial_population: count,
            max_population,
            next_id: count as u32,
            tick: 0,
            policy,
            policy_events: Vec::new(),
            agents,
            tiles,
            bank: Bank::default(),
            history: Vec::new(),
            rng,
            economy: Economy::default(),
        };
        sim.refresh_wealth(None);
        sim.check_solvency();
        sim
    }

    pub fn set_policy(&mut self, policy: Policy, label: impl Into<String>) {
        self.policy = policy;
        self.check_solvency();
        self.policy_events.push(PolicyEvent {
            tick: self.tick,
            label: label.into(),
            policy: self.policy.clone(),
        });
    }

    pub fn scenario(&self, name: impl Into<String>) -> Scenario {
        Scenario {
            measurement_version: MEASUREMENT_VERSION,
            name: name.into(),
            seed: self.seed,
            seed_mode: self.seed_mode,
            initial_population: self.initial_population,
            policy_events: self.policy_events.clone(),
            history: self.history.clone(),
        }
    }

    pub fn save_state(&self, path: impl AsRef<Path>) -> Result<(), Box<dyn Error>> {
        fs::write(path, serde_json::to_vec(self)?)?;
        Ok(())
    }

    pub fn load_state(path: impl AsRef<Path>) -> Result<Self, Box<dyn Error>> {
        let value: serde_json::Value = serde_json::from_slice(&fs::read(path)?)?;
        if value
            .get("measurement_version")
            .and_then(serde_json::Value::as_u64)
            != Some(MEASUREMENT_VERSION as u64)
        {
            return Err(
                "unsupported measurement version; start a fresh run with corrected accounting"
                    .into(),
            );
        }
        let mut sim: Self = serde_json::from_value(value)?;
        if sim.tiles.len() != MAP_WIDTH * MAP_HEIGHT
            || sim.initial_population == 0
            || sim.max_population == 0
            || sim.initial_population > sim.max_population
            || sim.agents.len() > sim.max_population
        {
            return Err("invalid simulation state dimensions".into());
        }
        sim.refresh_wealth(None);
        sim.check_solvency();
        Ok(sim)
    }

    pub fn run_ticks(&mut self, count: u64) {
        for _ in 0..count {
            self.step();
        }
    }

    pub fn step(&mut self) {
        if self.policy.is_currency_active && !self.economy.currency_bootstrapped {
            self.activate_currency();
        }
        self.refresh_wealth(None);
        self.economy.tick_trade_count = 0;
        self.economy.total_wages = 0.0;
        self.economy.food_harvested = 0.0;
        self.economy.rent_collected = 0.0;

        let count = self.agents.len();
        let mut order: Vec<usize> = (0..count).collect();
        self.rng.shuffle(&mut order);
        let grid_before = self.build_grid(None);
        let ranks = neural::wealth_ranks(&self.agents);
        let decisions: Vec<Decision> = self
            .agents
            .iter()
            .enumerate()
            .map(|(i, agent)| {
                let nearby = self.neighbours(&grid_before, agent.x, agent.y).len();
                let input = neural::inputs(
                    agent,
                    ranks[i],
                    &self.tiles,
                    nearby,
                    self.economy.food_prices.price,
                    self.economy.wood_prices.price,
                    &self.policy,
                );
                neural::infer(agent, &input)
            })
            .collect();

        let mut alive = vec![true; count];
        let mut sheltered: Vec<bool> = self.agents.iter().map(|a| a.houses >= 1.0).collect();
        for &i in &order {
            self.agents[i].age += 1;
            self.harvest(i, decisions[i].move_dir);
            if self.agents[i].role == 1 {
                self.construct(i);
            }
            self.decay_houses(i);
            self.decay_food(i);
            if self.agents[i].energy <= 0.0 && self.agents[i].food <= 0.0 {
                self.close_deceased_debt(i);
                alive[i] = false;
            }
        }
        let grid = self.build_grid(Some(&alive));
        let live_order: Vec<usize> = order.into_iter().filter(|&i| alive[i]).collect();

        if self.policy.is_currency_active {
            self.emergency_food_market(&grid, &live_order);
        }
        self.labour_market(&grid, &live_order, &decisions);
        self.goods_market(&grid, &live_order, &decisions);
        self.housing_market(&grid, &live_order, &mut sheltered);
        for &i in &live_order {
            if !sheltered[i] {
                self.agents[i].energy -= 0.5;
            }
        }
        self.refresh_wealth(Some(&live_order));
        self.redistribute(&live_order);
        self.refresh_wealth(Some(&live_order));
        self.lending(&live_order, &decisions);
        self.reproduce(&live_order);
        self.agents = self
            .agents
            .drain(..)
            .enumerate()
            .filter_map(|(i, agent)| {
                if i >= count || alive[i] {
                    Some(agent)
                } else {
                    None
                }
            })
            .collect();
        self.refresh_wealth(None);
        for tile in &mut self.tiles {
            tile.food = (tile.food + 0.1).min(tile.food_max);
            tile.wood = (tile.wood + 1.0).min(tile.wood_max);
        }
        self.tick += 1;
        if self.tick % 100 == 0 {
            neural::evolve(&mut self.agents, &mut self.rng);
        }
        if self.tick % 60 == 0 {
            let stats = self.stats();
            self.economy.previous_food_price = stats.food_price;
            self.history.push(stats);
        }
    }

    fn valuation(&self) -> WealthValuation {
        WealthValuation {
            is_currency_active: self.economy.currency_bootstrapped,
            food_barter_price: self.economy.food_prices.price,
            food_money_price: self.economy.food_money_price,
            wood_money_price: self.economy.wood_money_price,
        }
    }

    fn refresh_wealth(&mut self, order: Option<&[usize]>) {
        let valuation = self.valuation();
        if let Some(order) = order {
            for &i in order {
                self.agents[i].update_wealth(valuation);
            }
        } else {
            for agent in &mut self.agents {
                agent.update_wealth(valuation);
            }
        }
    }

    fn activate_currency(&mut self) {
        self.economy.food_money_price = self.economy.food_prices.price;
        self.economy.wood_money_price = self.economy.wood_prices.price;
        self.economy.currency_bootstrapped = true;
        for agent in &mut self.agents {
            agent.cash = agent.food * self.economy.food_money_price;
        }
    }

    fn harvest(&mut self, i: usize, direction: u8) {
        let agent = &mut self.agents[i];
        const DX: [i32; 5] = [0, 0, 0, 1, -1];
        const DY: [i32; 5] = [0, -1, 1, 0, 0];
        let dir = (direction as usize).min(4);
        agent.x = (agent.x as i32 + DX[dir]).clamp(0, MAP_WIDTH as i32 - 1) as u8;
        agent.y = (agent.y as i32 + DY[dir]).clamp(0, MAP_HEIGHT as i32 - 1) as u8;
        let tile = &mut self.tiles[agent.y as usize * MAP_WIDTH + agent.x as usize];
        let raw_food = tile.food * 0.3;
        let food = raw_food * (1.0 + agent.labour_hired).powf(0.6) * agent.land.max(1.0).powf(0.4);
        tile.food = (tile.food - raw_food).max(0.0);
        agent.food += food;
        self.economy.food_harvested += food;
        let raw_wood = tile.wood * 0.3;
        agent.wood += raw_wood * (1.0 + agent.labour_hired).powf(0.5);
        tile.wood = (tile.wood - raw_wood).max(0.0);
        let eaten = agent.food.min(0.5);
        agent.food -= eaten;
        agent.energy = (agent.energy - 1.0 + eaten * 1.5).min(100.0);
    }

    fn construct(&mut self, i: usize) {
        let agent = &mut self.agents[i];
        if agent.houses >= 20.0 {
            return;
        }
        let available = agent.wood - WOOD_BUFFER - 4.0;
        if available <= 0.0 {
            return;
        }
        let used = available.min(5.0);
        let produced = 0.05 * (1.0 + agent.labour_hired).powf(0.7) * used.powf(0.3);
        agent.wood -= used;
        agent.houses = (agent.houses + produced).min(20.0);
    }

    fn decay_houses(&mut self, i: usize) {
        let houses = self.agents[i].houses;
        if houses > 10.0 {
            self.agents[i].houses *= 0.995;
        } else if houses > 5.0 {
            self.agents[i].houses *= 0.998;
        } else if houses > 0.0 {
            self.agents[i].houses *= 0.999;
        }
    }

    fn decay_food(&mut self, i: usize) {
        let food = self.agents[i].food;
        if food > 100.0 {
            self.agents[i].food *= 0.992;
        } else if food > 20.0 {
            self.agents[i].food *= 0.998;
        }
    }

    fn build_grid(&self, alive: Option<&[bool]>) -> Vec<Vec<usize>> {
        let mut grid = vec![Vec::new(); 100];
        for (i, agent) in self.agents.iter().enumerate() {
            if alive.is_none_or(|flags| flags[i]) {
                grid[(agent.y as usize / 5) * 10 + agent.x as usize / 5].push(i);
            }
        }
        grid
    }

    fn neighbours(&self, grid: &[Vec<usize>], x: u8, y: u8) -> Vec<usize> {
        let cx = x as i32 / 5;
        let cy = y as i32 / 5;
        let mut result = Vec::new();
        for dy in -2..=2 {
            for dx in -2..=2 {
                let nx = cx + dx;
                let ny = cy + dy;
                if (0..10).contains(&nx) && (0..10).contains(&ny) {
                    result.extend_from_slice(&grid[ny as usize * 10 + nx as usize]);
                }
            }
        }
        result
    }
}

impl Simulation {
    fn emergency_food_market(&mut self, grid: &[Vec<usize>], order: &[usize]) {
        let price = self.economy.food_money_price;
        if price <= 0.0 {
            return;
        }
        for &buyer in order {
            if self.agents[buyer].food >= FOOD_BUFFER || self.agents[buyer].cash < price {
                continue;
            }
            let neighbours = self.neighbours(grid, self.agents[buyer].x, self.agents[buyer].y);
            let sellers: Vec<usize> = neighbours
                .into_iter()
                .filter(|&i| i != buyer && self.agents[i].food > FOOD_BUFFER + 1.0)
                .collect();
            if sellers.is_empty() {
                continue;
            }
            let seller = sellers[self.rng.index(sellers.len())];
            let tax = price * self.policy.tax_rate;
            let (buyer_agent, seller_agent) = pair_mut(&mut self.agents, buyer, seller);
            buyer_agent.food += 1.0;
            buyer_agent.cash -= price;
            seller_agent.food -= 1.0;
            seller_agent.cash += price - tax;
            self.economy.treasury += tax;
            self.economy.trade_count += 1;
            self.economy.tick_trade_count += 1;
        }
    }

    fn labour_market(&mut self, grid: &[Vec<usize>], order: &[usize], decisions: &[Decision]) {
        self.economy.labour_seekers = order.iter().filter(|&&i| decisions[i].action == 2).count();
        for &i in order {
            self.agents[i].labour_sold = 0.0;
            self.agents[i].labour_hired = 0.0;
        }
        for &employer in order {
            if decisions[employer].action != 3 || self.agents[employer].land <= 0.0 {
                continue;
            }
            let neighbours =
                self.neighbours(grid, self.agents[employer].x, self.agents[employer].y);
            let food_value = if self.policy.is_currency_active {
                self.economy.food_money_price
            } else {
                self.economy.food_prices.price
            };
            let wage = food_value * 0.6 * self.agents[employer].land.max(1.0).powf(0.4);
            let available = if self.policy.is_currency_active {
                self.agents[employer].cash
            } else {
                (self.agents[employer].wood - WOOD_BUFFER).max(0.0)
            };
            if wage < self.policy.min_wage || available < wage {
                continue;
            }
            for worker in neighbours {
                if worker == employer
                    || decisions[worker].action != 2
                    || self.agents[worker].labour_sold != 0.0
                    || wage < decisions[worker].reservation_wage
                {
                    continue;
                }
                let tax = wage * self.policy.tax_rate;
                let (employer_agent, worker_agent) = pair_mut(&mut self.agents, employer, worker);
                employer_agent.labour_hired += 1.0;
                worker_agent.labour_sold = 1.0;
                if self.policy.is_currency_active {
                    employer_agent.cash -= wage;
                    worker_agent.cash += wage - tax;
                } else {
                    employer_agent.wood -= wage;
                    worker_agent.wood += wage - tax;
                }
                self.economy.total_wages += wage;
                self.economy.treasury += tax;
                self.economy.wage_prices.push(wage);
                break;
            }
        }
        self.economy.unemployed = order
            .iter()
            .filter(|&&i| decisions[i].action == 2 && self.agents[i].labour_sold == 0.0)
            .count();
    }

    fn goods_market(&mut self, grid: &[Vec<usize>], order: &[usize], decisions: &[Decision]) {
        for &seller in order {
            let neighbours = self.neighbours(grid, self.agents[seller].x, self.agents[seller].y);
            let offer = decisions[seller].offer_price;

            let surplus_food = self.agents[seller].food - FOOD_BUFFER;
            if surplus_food > 2.0 {
                let buyers: Vec<usize> = neighbours
                    .iter()
                    .copied()
                    .filter(|&i| i != seller && self.agents[i].wood > WOOD_BUFFER)
                    .collect();
                if !buyers.is_empty() {
                    let buyer = buyers[self.rng.index(buyers.len())];
                    let available = self.agents[buyer].wood - WOOD_BUFFER;
                    let units = surplus_food.min(available / offer);
                    if offer >= decisions[buyer].accept_threshold && units >= 0.001 {
                        let tax = units * offer * self.policy.tax_rate;
                        let (seller_agent, buyer_agent) = pair_mut(&mut self.agents, seller, buyer);
                        seller_agent.food -= units;
                        seller_agent.wood += units * offer - tax;
                        buyer_agent.wood -= units * offer;
                        buyer_agent.food += units;
                        self.economy.treasury += tax;
                        self.economy.trade_count += 1;
                        self.economy.tick_trade_count += 1;
                        self.economy.food_prices.push(offer);
                    }
                }
            }

            let surplus_wood = self.agents[seller].wood - WOOD_BUFFER;
            if surplus_wood > 2.0 {
                let buyers: Vec<usize> = neighbours
                    .iter()
                    .copied()
                    .filter(|&i| i != seller && self.agents[i].food > FOOD_BUFFER)
                    .collect();
                if !buyers.is_empty() {
                    let buyer = buyers[self.rng.index(buyers.len())];
                    let available = self.agents[buyer].food - FOOD_BUFFER;
                    let units = surplus_wood.min(available / offer);
                    if offer >= decisions[buyer].accept_threshold && units >= 0.001 {
                        let tax = units * offer * self.policy.tax_rate;
                        let (seller_agent, buyer_agent) = pair_mut(&mut self.agents, seller, buyer);
                        seller_agent.wood -= units;
                        seller_agent.food += units * offer - tax;
                        buyer_agent.food -= units * offer;
                        buyer_agent.wood += units;
                        self.economy.treasury += tax;
                        self.economy.trade_count += 1;
                        self.economy.tick_trade_count += 1;
                        self.economy.wood_prices.push(offer);
                    }
                }
            }
        }
    }

    fn housing_market(&mut self, grid: &[Vec<usize>], order: &[usize], sheltered: &mut [bool]) {
        for &landlord in order {
            let slots = ((self.agents[landlord].houses - 1.0).floor() as i32).clamp(0, 5) as usize;
            if slots == 0 {
                continue;
            }
            let neighbours =
                self.neighbours(grid, self.agents[landlord].x, self.agents[landlord].y);
            let mut filled = 0;
            for renter in neighbours {
                if filled >= slots {
                    break;
                }
                if renter == landlord || sheltered[renter] || self.agents[renter].cash < HOUSE_RENT
                {
                    continue;
                }
                let tax = HOUSE_RENT * self.policy.tax_rate;
                let (landlord_agent, renter_agent) = pair_mut(&mut self.agents, landlord, renter);
                landlord_agent.cash += HOUSE_RENT - tax;
                renter_agent.cash -= HOUSE_RENT;
                sheltered[renter] = true;
                self.economy.treasury += tax;
                self.economy.rent_collected += HOUSE_RENT;
                filled += 1;
            }
        }
        if self.policy.land_policy != LandPolicy::Auctioned {
            return;
        }
        for &owner in order {
            let land = self.agents[owner].land;
            let slots = ((land - 1.0).floor() as i32).clamp(0, 5) as usize;
            if slots == 0 {
                continue;
            }
            let rent = LAND_RENT * (land - 1.0);
            let neighbours = self.neighbours(grid, self.agents[owner].x, self.agents[owner].y);
            let mut filled = 0;
            for renter in neighbours {
                if filled >= slots {
                    break;
                }
                if renter == owner
                    || self.agents[renter].land > 0.0
                    || self.agents[renter].cash < rent
                {
                    continue;
                }
                let tax = rent * self.policy.tax_rate;
                let (owner_agent, renter_agent) = pair_mut(&mut self.agents, owner, renter);
                owner_agent.cash += rent - tax;
                renter_agent.cash -= rent;
                self.economy.treasury += tax;
                self.economy.rent_collected += rent;
                filled += 1;
            }
        }
    }

    fn redistribute(&mut self, order: &[usize]) {
        let treasury = self.economy.treasury;
        if treasury <= 0.0 || order.is_empty() {
            return;
        }
        match self.policy.redistribution {
            Redistribution::None => {}
            Redistribution::Ubi => {
                let fraction = self.policy.ubi_amount.clamp(0.0, 1.0);
                let payout = treasury * fraction / order.len() as f32;
                for &i in order {
                    self.agents[i].cash += payout;
                }
                self.economy.treasury *= 1.0 - fraction;
            }
            Redistribution::TargetedWelfare => {
                let mut wealth: Vec<f32> = order.iter().map(|&i| self.agents[i].wealth).collect();
                wealth.sort_by(f32::total_cmp);
                let threshold = wealth[(wealth.len() / 5).min(wealth.len() - 1)];
                let eligible = order
                    .iter()
                    .filter(|&&i| self.agents[i].wealth <= threshold)
                    .count();
                if eligible > 0 {
                    let payout = treasury / eligible as f32;
                    for &i in order {
                        if self.agents[i].wealth <= threshold {
                            self.agents[i].cash += payout;
                        }
                    }
                    self.economy.treasury = 0.0;
                }
            }
            Redistribution::PublicGoods => {
                let food_units =
                    treasury * 0.6 / self.economy.food_prices.price.max(f32::MIN_POSITIVE);
                let wood_units =
                    treasury * 0.4 / self.economy.wood_prices.price.max(f32::MIN_POSITIVE);
                let per_tile_food = food_units / self.tiles.len() as f32;
                let per_tile_wood = wood_units / self.tiles.len() as f32;
                for tile in &mut self.tiles {
                    tile.food = (tile.food + per_tile_food).min(tile.food_max);
                    tile.wood = (tile.wood + per_tile_wood).min(tile.wood_max);
                }
                self.economy.treasury = 0.0;
            }
            Redistribution::Infrastructure => {
                let count = (self.tiles.len() / 5).max(1);
                let mut order: Vec<usize> = (0..self.tiles.len()).collect();
                order.sort_by(|&a, &b| {
                    let yield_of =
                        |tile: &Tile| tile.food / tile.food_max + tile.wood / tile.wood_max;
                    yield_of(&self.tiles[a])
                        .total_cmp(&yield_of(&self.tiles[b]))
                        .then(a.cmp(&b))
                });
                let boost = treasury / count as f32 * 0.01;
                for &i in &order[..count] {
                    self.tiles[i].food_max = (self.tiles[i].food_max + boost).min(20.0);
                    self.tiles[i].wood_max = (self.tiles[i].wood_max + boost).min(36.0);
                }
                self.economy.treasury = 0.0;
            }
        }
    }

    // Seized collateral replaces a loan asset. Only unrecovered principal is a loss.
    fn handle_default(&mut self, i: usize) {
        let agent = &mut self.agents[i];
        let principal = agent.debt.max(0.0);
        let mut remaining = principal;
        for (units, price) in [
            (&mut agent.houses, HOUSE_ASSET_VALUE),
            (&mut agent.food, self.economy.food_money_price),
            (&mut agent.wood, self.economy.wood_money_price),
        ] {
            if remaining <= 0.0 || price <= 0.0 {
                continue;
            }
            let seized = units.max(0.0).min(remaining / price);
            *units = (*units - seized).max(0.0);
            remaining = (remaining - seized * price).max(0.0);
        }
        agent.debt = 0.0;
        self.bank.loans_outstanding = (self.bank.loans_outstanding - principal).max(0.0);
        self.bank.cumulative_write_offs += remaining;
        self.bank.capital_buffer -= remaining;
        self.check_solvency();
    }

    fn close_deceased_debt(&mut self, i: usize) {
        let agent = &mut self.agents[i];
        if agent.debt <= 0.0 {
            return;
        }
        let paid = agent.cash.max(0.0).min(agent.debt);
        agent.cash -= paid;
        agent.debt -= paid;
        self.bank.loans_outstanding = (self.bank.loans_outstanding - paid).max(0.0);
        self.handle_default(i);
    }

    fn lending(&mut self, order: &[usize], decisions: &[Decision]) {
        if !self.policy.is_currency_active {
            return;
        }
        for &i in order {
            let agent = &mut self.agents[i];
            let principal = agent.debt;
            if principal <= 0.0 {
                continue;
            }
            let interest =
                principal * (self.policy.central_bank_rate + INTEREST_RATE_SPREAD).max(0.0);
            let installment = (principal * PRINCIPAL_AMORTIZATION_RATE)
                .max(MIN_PRINCIPAL_INSTALLMENT)
                .min(principal);
            let opening_cash = agent.cash.max(0.0);
            let paid_interest = opening_cash.min(interest);
            let paid_principal = (opening_cash - paid_interest).min(installment);
            agent.cash = opening_cash - paid_interest - paid_principal;
            agent.debt = (principal - paid_principal).max(0.0);
            self.bank.loans_outstanding = (self.bank.loans_outstanding - paid_principal).max(0.0);
            let tax = paid_interest * self.policy.tax_rate.clamp(0.0, 1.0);
            let retained = paid_interest - tax;
            self.economy.treasury += tax;
            self.bank.retained_interest_income += retained;
            self.bank.capital_buffer += retained;
            self.check_solvency();
            if opening_cash < interest + installment {
                self.handle_default(i);
            }
        }
        for &i in order {
            self.check_solvency();
            let agent = &mut self.agents[i];
            if decisions[i].invest_signal <= 0.7
                || agent.debt != 0.0
                || agent.wealth <= 10.0
                || !self.bank.is_solvent
            {
                continue;
            }
            let amount = (agent.wealth * 0.1).min(10.0);
            let projected = self.bank.loans_outstanding + amount;
            let threshold = self.policy.reserve_requirement.max(0.0);
            if self.bank.capital_buffer < 0.0
                || (projected > 0.0 && self.bank.capital_buffer / projected < threshold)
            {
                continue;
            }
            agent.cash += amount;
            agent.debt = amount;
            self.bank.loans_outstanding += amount;
            self.check_solvency();
        }
    }

    fn check_solvency(&mut self) {
        self.bank.is_solvent = self.bank.capital_buffer >= 0.0
            && (self.bank.loans_outstanding <= 0.0
                || self.bank.capital_buffer / self.bank.loans_outstanding
                    >= self.policy.reserve_requirement.max(0.0));
    }

    fn reproduce(&mut self, order: &[usize]) {
        let mut children = Vec::new();
        for &i in order {
            if self.agents.len() + children.len() >= self.max_population {
                break;
            }
            let parent = &mut self.agents[i];
            if parent.food <= 60.0 || parent.age <= 10 || !parent.age.is_multiple_of(20) {
                continue;
            }
            let half = parent.food / 2.0;
            parent.food = half;
            let dx = (self.rng.next_f32() * 2.0 - 1.0).round() as i32;
            let dy = (self.rng.next_f32() * 2.0 - 1.0).round() as i32;
            let x = (parent.x as i32 + dx).clamp(0, MAP_WIDTH as i32 - 1) as u8;
            let y = (parent.y as i32 + dy).clamp(0, MAP_HEIGHT as i32 - 1) as u8;
            let next_id = self.next_id;
            self.next_id += 1;
            let mut child = Agent::new(
                next_id,
                x,
                y,
                half,
                3.0,
                if self.policy.land_policy == LandPolicy::Free {
                    1.0
                } else {
                    0.0
                },
            );
            child.role = parent.role;
            neural::init_weights(&mut child, &mut self.rng);
            children.push(child);
        }
        self.agents.extend(children);
    }

    pub fn stats(&self) -> Stats {
        let n = self.agents.len();
        let mut stats = Stats {
            tick: self.tick,
            population: n,
            food_price: self.economy.food_prices.price,
            wood_price: self.economy.wood_prices.price,
            wage_rate: if self.economy.wage_prices.count == 0 {
                0.0
            } else {
                self.economy.wage_prices.price
            },
            trade_count: self.economy.trade_count,
            tick_trade_count: self.economy.tick_trade_count,
            bank_capital_buffer: self.bank.capital_buffer,
            bank_loans_outstanding: self.bank.loans_outstanding,
            ..Stats::default()
        };
        if n == 0 {
            return stats;
        }
        let nf = n as f32;
        let mut wealth: Vec<f32> = Vec::with_capacity(n);
        for agent in &self.agents {
            stats.avg_food += agent.food / nf;
            stats.avg_wood += agent.wood / nf;
            stats.avg_houses += agent.houses / nf;
            stats.avg_cash += agent.cash / nf;
            stats.role_counts[(agent.role as usize).min(5)] += 1;
            wealth.push(agent.wealth);
        }
        wealth.sort_by(f32::total_cmp);
        let total_wealth: f32 = wealth.iter().sum();
        if total_wealth != 0.0 {
            let weighted: f32 = wealth
                .iter()
                .enumerate()
                .map(|(i, w)| (2 * i as i64 - n as i64 + 1) as f32 * w)
                .sum();
            stats.gini = weighted / (nf * total_wealth);
        }
        for (i, &value) in wealth.iter().enumerate() {
            stats.wealth_by_bracket[((i * 10) / n).min(9)] += value;
        }
        for p in 1..10 {
            stats.wealth_boundaries[p - 1] = wealth[((p * n) / 10).min(n - 1)];
        }
        stats.gdp = self.economy.food_harvested * stats.food_price;
        stats.unemployment_rate = if self.economy.labour_seekers > 0 {
            self.economy.unemployed as f32 / self.economy.labour_seekers as f32
        } else {
            0.0
        };
        stats.labour_share_of_gdp = if stats.gdp > 0.0 {
            self.economy.total_wages / stats.gdp
        } else {
            0.0
        };
        stats.avg_income = self.economy.total_wages / nf;
        stats.land_rent_index = self.economy.rent_collected / nf;
        stats.inflation_rate = if self.economy.previous_food_price > 0.0 {
            (stats.food_price - self.economy.previous_food_price) / self.economy.previous_food_price
        } else {
            0.0
        };
        stats.credit_to_gdp = if stats.gdp > 0.0 {
            (self.bank.loans_outstanding / stats.gdp).min(5.0)
        } else {
            0.0
        };
        stats.bank_solvency =
            (self.bank.capital_buffer / self.bank.loans_outstanding.max(1.0)).min(1.0);
        stats
    }
}

fn parse_morocco_seed() -> Vec<(u8, f32, f32)> {
    include_str!("../data/morocco_urban.csv")
        .lines()
        .skip(1)
        .filter_map(|line| {
            let mut cells = line.split(',');
            Some((
                cells.next()?.parse().ok()?,
                cells.next()?.parse().ok()?,
                cells.next()?.parse().ok()?,
            ))
        })
        .collect()
}

fn pair_mut<T>(items: &mut [T], a: usize, b: usize) -> (&mut T, &mut T) {
    debug_assert_ne!(a, b);
    if a < b {
        let (left, right) = items.split_at_mut(b);
        (&mut left[a], &mut right[0])
    } else {
        let (left, right) = items.split_at_mut(a);
        (&mut right[0], &mut left[b])
    }
}

#[cfg(test)]
mod correctness_tests;
