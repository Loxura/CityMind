// Phase 3 — Batched neural net forward pass using TF.js.
//
// Architecture: 40 → 16 → 8 → 7 (ReLU hidden layers, raw logits out).
// Per-agent weights: W tensors are shaped [n, fanIn, fanOut] so one matMul
// call per layer processes all n agents simultaneously.
//
// NEVER call tf.predict or run inference per-agent — that is n shader dispatches.
// This file is the only place tf.matMul is called for net inference.

import * as tf from '@tensorflow/tfjs';
import { L1_IN, L1_OUT, L2_IN, L2_OUT, L3_IN, L3_OUT } from './weights';

export const INPUT_SIZE  = 40;
export const OUTPUT_SIZE = 7;

// Run batched forward pass for all n agents.
// inputMatrix: Float32Array [n * 40]  (row-major)
// w1flat:      Float32Array [n * 640]  (per-agent W1, row-major [fanIn, fanOut] per agent)
// w2flat:      Float32Array [n * 128]
// w3flat:      Float32Array [n * 56]
// Returns raw logits Float32Array [n * 7].
export function runInference(
  inputMatrix: Float32Array,
  w1flat: Float32Array,
  w2flat: Float32Array,
  w3flat: Float32Array,
  n: number,
): Float32Array {
  if (n === 0) return new Float32Array(0);

  return tf.tidy(() => {
    // x: [n, 40] → expand to [n, 1, 40] for batched matMul
    const x    = tf.tensor2d(inputMatrix, [n, INPUT_SIZE]);
    const xExp = tf.expandDims(x, 1) as tf.Tensor3D;   // [n, 1, 40]

    // W1: [n, 40, 16] — one weight matrix per agent
    const W1 = tf.tensor3d(w1flat, [n, L1_IN, L1_OUT]);
    // matMul([n, 1, 40], [n, 40, 16]) = [n, 1, 16] → squeeze → [n, 16]
    const h1 = tf.squeeze(
      tf.relu(tf.matMul(xExp, W1)) as tf.Tensor3D,
      [1],
    ) as tf.Tensor2D;   // [n, 16]

    const h1Exp = tf.expandDims(h1, 1) as tf.Tensor3D;  // [n, 1, 16]
    const W2 = tf.tensor3d(w2flat, [n, L2_IN, L2_OUT]);
    const h2 = tf.squeeze(
      tf.relu(tf.matMul(h1Exp, W2)) as tf.Tensor3D,
      [1],
    ) as tf.Tensor2D;   // [n, 8]

    const h2Exp = tf.expandDims(h2, 1) as tf.Tensor3D;  // [n, 1, 8]
    const W3 = tf.tensor3d(w3flat, [n, L3_IN, L3_OUT]);
    const out = tf.squeeze(
      tf.matMul(h2Exp, W3) as tf.Tensor3D,
      [1],
    ) as tf.Tensor2D;   // [n, 7] raw logits

    return out.dataSync() as Float32Array;
  });
}

// Decode dim 0 (move direction): sigmoid → 5 bins → [stay=0, N=1, S=2, E=3, W=4]
export function decodeMoveDir(logit: number): number {
  return Math.min(4, Math.floor((1 / (1 + Math.exp(-logit))) * 5));
}

// Decode dim 1 (primary action): sigmoid → 4 bins → [harvest=0, trade=1, sell-labour=2, hire-labour=3]
export function decodePrimaryAction(logit: number): number {
  return Math.min(3, Math.floor((1 / (1 + Math.exp(-logit))) * 4));
}

// Decode dims 2-3 (prices): tanh → *50, floor at 0.01 to avoid zero prices
export function decodePrice(logit: number): number {
  return Math.max(0.01, Math.tanh(logit) * 50);
}

// Decode dim 4 (reservation wage): sigmoid → *30
export function decodeReservationWage(logit: number): number {
  return (1 / (1 + Math.exp(-logit))) * 30;
}
