// Phase 3 — Weight initialisation and SAB read/write.
// Weights live in the SAB at WEIGHTS_START offset per agent — the SAB is the
// single source of truth. TF tensors are built fresh each tick from the SAB.

import { AGENT_FIELDS, AGENT_STRIDE, WEIGHT_COUNT } from '../types/constants';

// Layer dimensions for 40→16→8→7 net
export const L1_IN  = 40;  export const L1_OUT = 16;  // W1: 640 floats
export const L2_IN  = 16;  export const L2_OUT = 8;   // W2: 128 floats
export const L3_IN  = 8;   export const L3_OUT = 7;   // W3: 56 floats

export const W1_SIZE = L1_IN  * L1_OUT;  // 640
export const W2_SIZE = L2_IN  * L2_OUT;  // 128
export const W3_SIZE = L3_IN  * L3_OUT;  // 56

// Box-Muller Gaussian using provided PRNG.
export function gaussianRandom(rand: () => number): number {
  const u1 = Math.max(1e-10, rand());
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Xavier init: std = sqrt(2 / (fanIn + fanOut))
function xavierLayer(fanIn: number, fanOut: number, rand: () => number): Float32Array {
  const std = Math.sqrt(2 / (fanIn + fanOut));
  const w = new Float32Array(fanIn * fanOut);
  for (let i = 0; i < w.length; i++) w[i] = gaussianRandom(rand) * std;
  return w;
}

// Initialise all 3 weight layers for a single agent using Xavier.
// Must be called after initAgent for every new agent (birth and reset).
export function initWeights(sab: Float32Array, agentIdx: number, rand: () => number): void {
  const base = agentIdx * AGENT_STRIDE + AGENT_FIELDS.WEIGHTS_START;
  sab.set(xavierLayer(L1_IN, L1_OUT, rand), base);
  sab.set(xavierLayer(L2_IN, L2_OUT, rand), base + W1_SIZE);
  sab.set(xavierLayer(L3_IN, L3_OUT, rand), base + W1_SIZE + W2_SIZE);
}

// Copy all agent weights from SAB into flat arrays for batched TF matMul.
// Returns flat arrays shaped [n * W_SIZE] — reshape to [n, fanIn, fanOut] in inference.ts.
export function copyWeightsFromSAB(
  sab: Float32Array,
  n: number,
): { w1flat: Float32Array; w2flat: Float32Array; w3flat: Float32Array } {
  const w1flat = new Float32Array(n * W1_SIZE);
  const w2flat = new Float32Array(n * W2_SIZE);
  const w3flat = new Float32Array(n * W3_SIZE);

  for (let i = 0; i < n; i++) {
    const base = i * AGENT_STRIDE + AGENT_FIELDS.WEIGHTS_START;
    w1flat.set(sab.subarray(base,                        base + W1_SIZE),          i * W1_SIZE);
    w2flat.set(sab.subarray(base + W1_SIZE,              base + W1_SIZE + W2_SIZE), i * W2_SIZE);
    w3flat.set(sab.subarray(base + W1_SIZE + W2_SIZE,    base + WEIGHT_COUNT),      i * W3_SIZE);
  }

  return { w1flat, w2flat, w3flat };
}
