// Phase 3 — Gaussian mutation for neuroevolution.

const MUTATION_SIGMA = 0.02;

// Box-Muller Gaussian sample using provided random source.
function gaussianSample(rand: () => number): number {
  const u1 = Math.max(1e-10, rand());
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Add Gaussian noise (σ=0.02) to every weight in-place.
// Applied to all non-elite agents after crossover.
export function gaussianMutate(weights: Float32Array, rand: () => number): void {
  for (let i = 0; i < weights.length; i++) {
    weights[i] += gaussianSample(rand) * MUTATION_SIGMA;
  }
}
