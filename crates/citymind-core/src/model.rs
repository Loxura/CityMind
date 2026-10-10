use serde::{Deserialize, Serialize};

pub const MAP_WIDTH: usize = 50;
pub const MAP_HEIGHT: usize = 50;
pub const WEIGHT_COUNT: usize = 824;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Redistribution {
    #[default]
    None,
    Ubi,
    TargetedWelfare,
    PublicGoods,
    Infrastructure,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LandPolicy {
    #[default]
    Free,
    Auctioned,
    State,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SeedMode {
    #[default]
    Morocco,
    Flat,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Policy {
    pub tax_rate: f32,
    pub redistribution: Redistribution,
    pub ubi_amount: f32,
    pub min_wage: f32,
    pub land_policy: LandPolicy,
    pub is_currency_active: bool,
    pub central_bank_rate: f32,
    pub money_supply_growth: f32,
    pub reserve_requirement: f32,
    pub capital_gains_tax: f32,
    pub margin_lending_limit: f32,
}

impl Default for Policy {
    fn default() -> Self {
        Self {
            tax_rate: 0.0,
            redistribution: Redistribution::None,
            ubi_amount: 0.0,
            min_wage: 0.0,
            land_policy: LandPolicy::Free,
            is_currency_active: false,
            central_bank_rate: 0.0,
            money_supply_growth: 0.0,
            reserve_requirement: 0.1,
            capital_gains_tax: 0.0,
            margin_lending_limit: 0.0,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Agent {
    pub id: u32,
    pub role: u8,
    pub x: u8,
    pub y: u8,
    pub food: f32,
    pub wood: f32,
    pub tools: f32,
    pub houses: f32,
    pub clothing: f32,
    pub fish: f32,
    pub labour_sold: f32,
    pub labour_hired: f32,
    pub wage_reservation: f32,
    pub land: f32,
    pub cash: f32,
    pub debt: f32,
    pub shares: f32,
    pub wealth: f32,
    pub age: u32,
    pub energy: f32,
    pub weights: Vec<f32>,
}

impl Agent {
    pub fn new(id: u32, x: u8, y: u8, food: f32, wood: f32, land: f32) -> Self {
        Self {
            id,
            role: 0,
            x,
            y,
            food,
            wood,
            tools: 0.0,
            houses: 0.0,
            clothing: 0.0,
            fish: 0.0,
            labour_sold: 0.0,
            labour_hired: 0.0,
            wage_reservation: 0.0,
            land,
            cash: 0.0,
            debt: 0.0,
            shares: 0.0,
            wealth: food + wood,
            age: 0,
            energy: 100.0,
            weights: vec![0.0; WEIGHT_COUNT],
        }
    }
    pub fn update_wealth(&mut self) {
        self.wealth = self.food + self.wood + self.cash + self.houses * 20.0;
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Tile {
    pub food: f32,
    pub wood: f32,
    pub food_max: f32,
    pub wood_max: f32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Bank {
    pub deposits: f32,
    pub loans_outstanding: f32,
    pub capital_buffer: f32,
    pub non_performing_loans: f32,
    pub is_solvent: bool,
}

impl Default for Bank {
    fn default() -> Self {
        Self {
            deposits: 0.0,
            loans_outstanding: 0.0,
            capital_buffer: 2000.0,
            non_performing_loans: 0.0,
            is_solvent: true,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PolicyEvent {
    pub tick: u64,
    pub label: String,
    pub policy: Policy,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Scenario {
    pub name: String,
    pub seed: u32,
    pub seed_mode: SeedMode,
    pub initial_population: usize,
    pub policy_events: Vec<PolicyEvent>,
    pub history: Vec<Stats>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Stats {
    pub tick: u64,
    pub population: usize,
    pub avg_food: f32,
    pub avg_wood: f32,
    pub avg_houses: f32,
    pub avg_cash: f32,
    pub gini: f32,
    pub wealth_by_bracket: [f32; 10],
    pub wealth_boundaries: [f32; 9],
    pub food_price: f32,
    pub wood_price: f32,
    pub gdp: f32,
    pub wage_rate: f32,
    pub unemployment_rate: f32,
    pub labour_share_of_gdp: f32,
    pub land_rent_index: f32,
    pub avg_income: f32,
    pub inflation_rate: f32,
    pub credit_to_gdp: f32,
    pub bank_solvency: f32,
    pub bank_loans_outstanding: f32,
    pub bank_capital_buffer: f32,
    pub role_counts: [usize; 6],
    pub trade_count: u64,
    pub tick_trade_count: u64,
}
