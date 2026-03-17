// Phase 3 — Fitness ranking and tournament selection for neuroevolution.

// Rank agents by fitness score (descending). Returns array of agent indices,
// best agent first: ranked[0] = index of wealthiest agent.
export function rankByFitness(fitnessScores: Float32Array, n: number): number[] {
  const indices: number[] = Array.from({ length: n }, (_, i) => i);
  indices.sort((a, b) => fitnessScores[b] - fitnessScores[a]);
  return indices;
}

// Tournament selection: pick 2 random candidates from the top topN agents,
// return the one with the better rank (lower index = better fitness).
// Both candidates are guaranteed to be from the top fraction, so either
// parent is acceptable — coin flip between them adds stochasticity.
export function tournamentSelect(
  ranked: number[],
  rand: () => number,
  topN: number,
): number {
  const idxA = Math.floor(rand() * topN);
  const idxB = Math.floor(rand() * topN);
  // Pick lower ranked index (better fitness); coin flip breaks ties
  return (idxA <= idxB ? rand() < 0.7 : rand() < 0.3) ? ranked[idxA] : ranked[idxB];
}
