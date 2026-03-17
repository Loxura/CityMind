import type { SimStats, PolicyState } from './sim';

// Main thread → Sim Worker
export type MainToSim =
  | { type: 'INIT';   agentCount: number; seed: number; policy: PolicyState }
  | { type: 'POLICY'; policy: Partial<PolicyState> }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'RESET';  seed: number }

// Sim Worker → Main thread
export type SimToMain =
  | { type: 'READY'; sab: SharedArrayBuffer }
  | { type: 'STATS'; stats: SimStats }
  | { type: 'ERROR'; message: string }

// Sim Worker → Evolution Worker (Phase 3+)
export type SimToEvolution =
  | { type: 'EVOLVE'; fitnessScores: Float32Array; agentCount: number }

// Evolution Worker → Sim Worker (Phase 3+)
export type EvolutionToSim =
  | { type: 'EVOLVED'; mutationCount: number }
