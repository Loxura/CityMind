// Phase 3 — Batched neural net forward pass using TF.js.
//
// Architecture: 40 → 16 → 8 → 7 (ReLU hidden layers, raw logits out).
// Per-agent weights: W tensors are shaped [n, fanIn, fanOut] so one matMul
// call per layer processes all n agents simultaneously.
//
// NEVER call tf.predict or run inference per-agent — that is n shader dispatches.
// This file is the only place tf.matMul is called for net inference.
//
// Memory management: every tensor is explicitly disposed as soon as it is no
// longer needed. Do NOT rely on tf.tidy() alone — calling dataSync() inside
// tidy pins TF.js's internal GPU readback buffer, preventing texture release
// until JS GC runs. At 60fps this causes GPU memory to saturate and crash.
// Explicit disposal is the only pattern that guarantees per-tick cleanup.

import * as tf from '@tensorflow/tfjs';
import { L1_IN, L1_OUT, L2_IN, L2_OUT, L3_IN, L3_OUT } from './weights';

export const INPUT_SIZE  = 40;
export const OUTPUT_SIZE = 7;

// Run batched forward pass for all n agents.
// inputMatrix: Float32Array [n * 40]  (row-major)
// w1flat:      Float32Array [n * 640]  (per-agent W1, row-major [fanIn, fanOut] per agent)
// w2flat:      Float32Array [n * 128]
// w3flat:      Float32Array [n * 56]
// Returns raw logits Float32Array [n * 7] — independent copy, no TF.js buffer reference.
export function runInference(
  inputMatrix: Float32Array,
  w1flat: Float32Array,
  w2flat: Float32Array,
  w3flat: Float32Array,
  n: number,
): Float32Array {
  if (n === 0) return new Float32Array(0);

  // ── Layer 0: input ────────────────────────────────────────────────────────
  const x    = tf.tensor2d(inputMatrix, [n, INPUT_SIZE]);
  const xExp = tf.expandDims(x, 1) as tf.Tensor3D;    // [n, 1, 40]
  x.dispose();

  // ── Layer 1: W1 [n, 40, 16] ───────────────────────────────────────────────
  const W1      = tf.tensor3d(w1flat, [n, L1_IN, L1_OUT]);
  const mm1     = tf.matMul(xExp, W1) as tf.Tensor3D;  // [n, 1, 16]
  xExp.dispose(); W1.dispose();
  const relu1   = tf.relu(mm1) as tf.Tensor3D;
  mm1.dispose();
  const h1      = tf.squeeze(relu1, [1]) as tf.Tensor2D;  // [n, 16]
  relu1.dispose();

  // ── Layer 2: W2 [n, 16, 8] ────────────────────────────────────────────────
  const h1Exp   = tf.expandDims(h1, 1) as tf.Tensor3D;   // [n, 1, 16]
  h1.dispose();
  const W2      = tf.tensor3d(w2flat, [n, L2_IN, L2_OUT]);
  const mm2     = tf.matMul(h1Exp, W2) as tf.Tensor3D;   // [n, 1, 8]
  h1Exp.dispose(); W2.dispose();
  const relu2   = tf.relu(mm2) as tf.Tensor3D;
  mm2.dispose();
  const h2      = tf.squeeze(relu2, [1]) as tf.Tensor2D;  // [n, 8]
  relu2.dispose();

  // ── Layer 3: W3 [n, 8, 7] ─────────────────────────────────────────────────
  const h2Exp   = tf.expandDims(h2, 1) as tf.Tensor3D;   // [n, 1, 8]
  h2.dispose();
  const W3      = tf.tensor3d(w3flat, [n, L3_IN, L3_OUT]);
  const mm3     = tf.matMul(h2Exp, W3) as tf.Tensor3D;   // [n, 1, 7]
  h2Exp.dispose(); W3.dispose();
  const out     = tf.squeeze(mm3, [1]) as tf.Tensor2D;   // [n, 7] raw logits
  mm3.dispose();

  // ── Readback ──────────────────────────────────────────────────────────────
  // new Float32Array(...) creates an independent CPU copy — severs any
  // internal TF.js buffer reference that would keep the texture alive.
  const result = new Float32Array(out.dataSync());
  out.dispose();

  return result;
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
