// Phase 3 — Uniform crossover of weight arrays.

// For each weight position, independently pick from parentA or parentB with p=0.5.
// Returns a new Float32Array (never mutates inputs).
export function uniformCrossover(
  parentA: Float32Array,
  parentB: Float32Array,
  rand: () => number,
): Float32Array {
  const child = new Float32Array(parentA.length);
  for (let i = 0; i < parentA.length; i++) {
    child[i] = rand() < 0.5 ? parentA[i] : parentB[i];
  }
  return child;
}
