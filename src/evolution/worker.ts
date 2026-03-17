// Phase 3 — Evolution Worker entry point.
// Runs async, never blocks the Sim Worker tick loop.
// Receives SAB by reference (shared memory), reads/writes agent weights directly.
//
// Protocol:
//   Sim → Evo: { type: 'INIT_SAB', sab: SharedArrayBuffer }
//   Sim → Evo: { type: 'EVOLVE', fitnessScores: Float32Array, agentCount: number }
//   Evo → Sim: { type: 'EVOLVED', mutationCount: number }
//
// Evolution strategy (per CLAUDE.md):
//   top 20%  → elite: copy unchanged
//   next 60% → tournament select 2 parents from top 50%, uniform crossover + mutation
//   bottom 20% → fresh Xavier weights (exploration)

console.log('[EvoWorker] module loaded');

import { AGENT_FIELDS, AGENT_STRIDE, WEIGHT_COUNT } from '../types/constants';
import { rankByFitness, tournamentSelect } from './selection';
import { uniformCrossover } from './crossover';
import { gaussianMutate } from './mutation';

// Layer sizes duplicated here to avoid importing from net/ (keep workers independent)
const W1_SIZE = 640;  // 40 * 16
const W2_SIZE = 128;  // 16 * 8
// W3 = 56 floats; offset = W1+W2
const _W3_OFFSET = W1_SIZE + W2_SIZE;

let sabView: Float32Array | null = null;

function rand(): number { return Math.random(); }

function gaussianSample(): number {
  const u1 = Math.max(1e-10, rand());
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function xavierLayer(fanIn: number, fanOut: number): Float32Array {
  const std = Math.sqrt(2 / (fanIn + fanOut));
  const w = new Float32Array(fanIn * fanOut);
  for (let i = 0; i < w.length; i++) w[i] = gaussianSample() * std;
  return w;
}

function freshWeights(): Float32Array {
  const w = new Float32Array(WEIGHT_COUNT);
  w.set(xavierLayer(40, 16), 0);
  w.set(xavierLayer(16, 8),  W1_SIZE);
  w.set(xavierLayer(8,  7),  _W3_OFFSET);
  return w;
}

function readWeights(agentIdx: number): Float32Array {
  const base = agentIdx * AGENT_STRIDE + AGENT_FIELDS.WEIGHTS_START;
  // slice (copy) so we don't hold a view into a SAB that Sim Worker may mutate
  return sabView!.slice(base, base + WEIGHT_COUNT);
}

function writeWeights(agentIdx: number, weights: Float32Array): void {
  const base = agentIdx * AGENT_STRIDE + AGENT_FIELDS.WEIGHTS_START;
  sabView!.set(weights, base);
}

function evolve(fitnessScores: Float32Array, n: number): void {
  if (!sabView || n === 0) return;

  const ranked    = rankByFitness(fitnessScores, n);
  const eliteN    = Math.max(1, Math.floor(n * 0.2));
  const crossN    = Math.floor(n * 0.6);
  const randomN   = n - eliteN - crossN;
  const topN      = Math.max(1, Math.floor(n * 0.5));  // tournament pool

  // Buffer all new weight arrays before writing anything back.
  // This prevents reading partially-overwritten parents during crossover.
  const newWeights: Float32Array[] = new Array(n);

  // Elite: top 20% carry forward unchanged
  for (let i = 0; i < eliteN; i++) {
    newWeights[i] = readWeights(ranked[i]);
  }

  // Crossover: next 60% from tournament selection of top 50%, then mutate
  for (let i = eliteN; i < eliteN + crossN; i++) {
    const pA = tournamentSelect(ranked, rand, topN);
    const pB = tournamentSelect(ranked, rand, topN);
    const child = uniformCrossover(readWeights(pA), readWeights(pB), rand);
    gaussianMutate(child, rand);
    newWeights[i] = child;
  }

  // Random: bottom 20% get fresh Xavier weights (exploration)
  for (let i = eliteN + crossN; i < n; i++) {
    newWeights[i] = freshWeights();
  }

  // Write all new weights back to SAB in ranked slot order.
  // ranked[i] = the agent slot that receives newWeights[i].
  let mutationCount = 0;
  for (let i = 0; i < n; i++) {
    writeWeights(ranked[i], newWeights[i]);
    if (i >= eliteN) mutationCount++;
  }

  self.postMessage({ type: 'EVOLVED', mutationCount });
  console.log(`[EvoWorker] evolved n=${n} elite=${eliteN} cross=${crossN} random=${randomN} mutations=${mutationCount}`);
}

self.addEventListener('message', (e: MessageEvent) => {
  const msg = e.data;
  if (msg.type === 'INIT_SAB') {
    sabView = new Float32Array(msg.sab as SharedArrayBuffer);
    console.log(`[EvoWorker] SAB attached, ${sabView.length} floats`);
  } else if (msg.type === 'EVOLVE') {
    evolve(msg.fitnessScores as Float32Array, msg.agentCount as number);
  }
});
