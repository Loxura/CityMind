use crate::model::{Agent, MAP_HEIGHT, MAP_WIDTH, Policy, Tile, WEIGHT_COUNT};
use crate::rng::Rng;

pub const INPUT_SIZE: usize = 40;
const H1: usize = 16;
const H2: usize = 8;
const OUTPUT_SIZE: usize = 7;

#[derive(Clone, Copy, Debug, Default)]
pub struct Decision {
    pub move_dir: u8,
    pub action: u8,
    pub offer_price: f32,
    pub accept_threshold: f32,
    pub reservation_wage: f32,
    pub invest_signal: f32,
}

pub fn init_weights(agent: &mut Agent, rng: &mut Rng) {
    for (offset, fan_in, fan_out) in [(0, 40, 16), (640, 16, 8), (768, 8, 7)] {
        let std = (2.0_f32 / (fan_in + fan_out) as f32).sqrt();
        for weight in &mut agent.weights[offset..offset + fan_in * fan_out] {
            *weight = rng.gaussian() * std;
        }
    }
}

pub fn wealth_ranks(agents: &[Agent]) -> Vec<f32> {
    let mut order: Vec<usize> = (0..agents.len()).collect();
    order.sort_by(|&a, &b| {
        agents[a]
            .wealth
            .total_cmp(&agents[b].wealth)
            .then(a.cmp(&b))
    });
    let mut ranks = vec![0.0; agents.len()];
    let denom = agents.len().saturating_sub(1).max(1) as f32;
    for (rank, index) in order.into_iter().enumerate() {
        ranks[index] = rank as f32 / denom;
    }
    ranks
}

fn clamp01(value: f32) -> f32 {
    value.clamp(0.0, 1.0)
}
fn sigmoid(value: f32) -> f32 {
    1.0 / (1.0 + (-value).exp())
}

pub fn inputs(
    agent: &Agent,
    rank: f32,
    tiles: &[Tile],
    nearby_count: usize,
    food_price: f32,
    wood_price: f32,
    policy: &Policy,
) -> [f32; INPUT_SIZE] {
    let mut x = [0.0; INPUT_SIZE];
    x[0] = clamp01(agent.food / 200.0);
    x[1] = clamp01(agent.wood / 200.0);
    x[2] = clamp01(agent.tools / 50.0);
    x[3] = clamp01(agent.clothing / 100.0);
    x[4] = clamp01(agent.fish / 100.0);
    x[5] = clamp01(agent.houses / 20.0);
    x[6] = clamp01(agent.land / 50.0);
    x[7] = clamp01(agent.cash / 10_000.0);
    x[8] = clamp01(agent.debt / agent.wealth.max(1.0));
    x[9] = clamp01(agent.energy / 100.0);
    x[10] = rank;
    x[11] = agent.labour_sold;
    x[12] = clamp01(agent.wage_reservation / 50.0);
    x[14] = clamp01(agent.labour_hired / 20.0);
    let mut k = 0;
    for dy in -1..=1 {
        for dx in -1..=1 {
            let tx = (agent.x as i32 + dx).clamp(0, MAP_WIDTH as i32 - 1) as usize;
            let ty = (agent.y as i32 + dy).clamp(0, MAP_HEIGHT as i32 - 1) as usize;
            let tile = &tiles[ty * MAP_WIDTH + tx];
            x[15 + k] = clamp01(tile.food / 10.0);
            x[24 + k] = clamp01(tile.wood / 18.0);
            k += 1;
        }
    }
    x[33] = clamp01(nearby_count as f32 / 30.0);
    x[34] = clamp01(food_price / 20.0);
    x[35] = clamp01(wood_price / 20.0);
    x[37] = sigmoid(policy.central_bank_rate);
    x[38] = policy.tax_rate;
    x
}

pub fn infer(agent: &Agent, input: &[f32; INPUT_SIZE]) -> Decision {
    debug_assert_eq!(agent.weights.len(), WEIGHT_COUNT);
    let mut h1 = [0.0_f32; H1];
    let mut h2 = [0.0_f32; H2];
    let mut out = [0.0_f32; OUTPUT_SIZE];
    for j in 0..H1 {
        for i in 0..INPUT_SIZE {
            h1[j] += input[i] * agent.weights[i * H1 + j];
        }
        h1[j] = h1[j].max(0.0);
    }
    for j in 0..H2 {
        for i in 0..H1 {
            h2[j] += h1[i] * agent.weights[640 + i * H2 + j];
        }
        h2[j] = h2[j].max(0.0);
    }
    for j in 0..OUTPUT_SIZE {
        for i in 0..H2 {
            out[j] += h2[i] * agent.weights[768 + i * OUTPUT_SIZE + j];
        }
    }
    Decision {
        move_dir: (sigmoid(out[0]) * 5.0).floor().min(4.0) as u8,
        action: (sigmoid(out[1]) * 4.0).floor().min(3.0) as u8,
        offer_price: (out[2].tanh() * 50.0).max(0.01),
        accept_threshold: (out[3].tanh() * 50.0).max(0.01),
        reservation_wage: sigmoid(out[4]) * 30.0,
        invest_signal: sigmoid(out[5]),
    }
}

pub fn evolve(agents: &mut [Agent], rng: &mut Rng) {
    if agents.is_empty() {
        return;
    }
    let n = agents.len();
    let mut ranked: Vec<usize> = (0..n).collect();
    ranked.sort_by(|&a, &b| {
        agents[b]
            .wealth
            .total_cmp(&agents[a].wealth)
            .then(a.cmp(&b))
    });
    let elite = (n / 5).max(1);
    let crossed = n * 3 / 5;
    let top = (n / 2).max(1);
    let mut replacements = Vec::with_capacity(n);
    for i in 0..n {
        if i < elite {
            replacements.push(agents[ranked[i]].weights.clone());
        } else if i < elite + crossed {
            let a = tournament(&ranked, top, rng);
            let b = tournament(&ranked, top, rng);
            let weights = (0..WEIGHT_COUNT)
                .map(|k| {
                    let parent = if rng.next_f32() < 0.5 { a } else { b };
                    agents[parent].weights[k] + rng.gaussian() * 0.02
                })
                .collect();
            replacements.push(weights);
        } else {
            let mut fresh = Agent::new(0, 0, 0, 0.0, 0.0, 0.0);
            init_weights(&mut fresh, rng);
            replacements.push(fresh.weights);
        }
    }
    for (rank, weights) in replacements.into_iter().enumerate() {
        agents[ranked[rank]].weights = weights;
    }
}

fn tournament(ranked: &[usize], top: usize, rng: &mut Rng) -> usize {
    let a = rng.index(top);
    let b = rng.index(top);
    if (a <= b && rng.next_f32() < 0.7) || (a > b && rng.next_f32() < 0.3) {
        ranked[a]
    } else {
        ranked[b]
    }
}
