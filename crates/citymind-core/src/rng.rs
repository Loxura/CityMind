use serde::{Deserialize, Serialize};

// Mulberry32, matching the TypeScript simulation's seeded stream.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Rng {
    state: u32,
}

impl Rng {
    pub fn new(seed: u32) -> Self {
        Self { state: seed }
    }
    pub fn next_u32(&mut self) -> u32 {
        self.state = self.state.wrapping_add(0x6d2b79f5);
        let mut t = self.state;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        t ^ (t >> 14)
    }
    pub fn next_f32(&mut self) -> f32 {
        self.next_u32() as f64 as f32 / 4_294_967_296.0
    }
    pub fn index(&mut self, len: usize) -> usize {
        ((self.next_f32() * len as f32) as usize).min(len - 1)
    }
    pub fn shuffle<T>(&mut self, values: &mut [T]) {
        for i in (1..values.len()).rev() {
            let j = self.index(i + 1);
            values.swap(i, j);
        }
    }
    pub fn gaussian(&mut self) -> f32 {
        let u1 = self.next_f32().max(1e-10);
        let u2 = self.next_f32();
        (-2.0 * u1.ln()).sqrt() * (2.0 * std::f32::consts::PI * u2).cos()
    }
}
