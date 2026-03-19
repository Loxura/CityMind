// Sim Worker entry point.
// Runs entirely off the main thread. Never imports React or DOM APIs.

console.log('[SimWorker] module loaded');

// Surface any unhandled promise rejections as ERROR messages
self.addEventListener('unhandledrejection', (e) => {
  const msg = { type: 'ERROR', message: `Unhandled rejection: ${e.reason}` };
  self.postMessage(msg);
});

import { SAB_SIZE, STATS_INTERVAL, INITIAL_AGENT_COUNT, AGENT_FIELDS } from '../types/constants';
import { MOROCCO_URBAN_SEED } from './seeds/moroccoUrbanSeed';
import { tick, initAgents, seedRng } from './tick';
import { createMap } from './map';
import { computeStats, resetStats } from './stats';
import { resetMarket, activateCurrency, getMarketStats } from './market';
import { defaultPolicy, applyPolicyPatch, resetBankState } from './policy';
import { resetLendingActiveTick } from './bank';
import { getField } from './agent';
import EvoWorkerCtor from '../evolution/worker.ts?worker';
import * as tf from '@tensorflow/tfjs';
import { runInference } from '../net/inference';
import { buildInputMatrix, computeWealthRanks } from '../net/inputs';
import { copyWeightsFromSAB } from '../net/weights';
import { SpatialGrid } from './grid';
import type { MainToSim, SimToMain } from '../types/messages';
import type { TileMap } from './map';
import type { PolicyState } from '../types/sim';

let sab: SharedArrayBuffer;
let sabView: Float32Array;
let tiles: TileMap;
let policy: PolicyState = defaultPolicy();
let activeCount = 0;
let tickNumber = 0;
let running = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

// Phase 7: currency activation tracking
let prevCurrencyActive = false;

// Evolution Worker — spawned once and reused across resets
let evoWorker: Worker | null = null;

function ensureEvoWorker(sharedSab: SharedArrayBuffer): void {
  if (evoWorker) {
    evoWorker.terminate();
  }
  evoWorker = new EvoWorkerCtor();
  evoWorker.addEventListener('message', (e: MessageEvent) => {
    if (e.data.type === 'EVOLVED') {
      console.log(`[SimWorker] evolution complete — mutationCount=${e.data.mutationCount}`);
    }
  });
  // Share the SAB — Evolution Worker reads/writes weights directly
  evoWorker.postMessage({ type: 'INIT_SAB', sab: sharedSab });
}

// Collect fitness scores (wealth) for all active agents into a snapshot Float32Array.
function collectFitness(n: number): Float32Array {
  const scores = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    scores[i] = getField(sabView, i, AGENT_FIELDS.WEALTH);
  }
  return scores;
}

function doTick(): void {
  if (!running) return;

  // Phase 7: detect currency activation (false → true transition)
  if (policy.isCurrencyActive && !prevCurrencyActive) {
    activateCurrency(sabView, activeCount);
    console.log(`[Phase7] Currency activated at tick=${tickNumber} pop=${activeCount}`);
  }
  prevCurrencyActive = policy.isCurrencyActive;

  const { foodPrice, woodPrice } = getMarketStats();
  activeCount = tick(sabView, activeCount, tiles, policy, tickNumber, foodPrice, woodPrice);
  tickNumber++;

  // Flush TF.js WebGL texture pool every 10 ticks.
  // At variable population the pool accumulates stale shape keys from n-varying weight tensors
  // ([n,40,16], [n,16,8], [n,8,7]). An empty scope forces the texture manager to GC dead entries.
  if (tickNumber % 10 === 0) {
    tf.engine().startScope();
    tf.engine().endScope();
  }

  // Send EVOLVE every 100 ticks — sim does NOT wait for the response
  if (tickNumber % 100 === 0 && evoWorker) {
    evoWorker.postMessage({
      type: 'EVOLVE',
      fitnessScores: collectFitness(activeCount),
      agentCount: activeCount,
    });
  }

  if (tickNumber % STATS_INTERVAL === 0) {
    const stats = computeStats(sabView, activeCount, tickNumber);
    console.log(`[SimWorker] tick=${stats.tick} pop=${stats.population} avgFood=${stats.avgFood.toFixed(2)} avgWood=${stats.avgWood.toFixed(2)} gini=${stats.gini.toFixed(3)} foodPrice=${stats.foodPrice.toFixed(3)} trades=${stats.tradeCount} tickTrades=${stats.tickTradeCount}`);
    const msg: SimToMain = { type: 'STATS', stats };
    self.postMessage(msg);

    // ── Emergency market diagnostic ──────────────────────────────────────────
    // Three signals that distinguish "market broken" from "no sellers nearby":
    //   emergencyTrades  — food purchases that actually executed this tick
    //   foodMoneyPrice   — cash cost per 1 food; if too high agents can't afford to buy
    //   cashRichStarving — agents with cash > foodMoneyPrice AND food < FOOD_SURVIVAL_BUFFER
    //                      (want to buy but something stops them)
    const { emergencyTradeCount: emTrades, foodMoneyPrice: fmp } = getMarketStats();
    let cashRichStarving = 0;
    if (fmp > 0) {
      for (let i = 0; i < activeCount; i++) {
        const food = getField(sabView, i, AGENT_FIELDS.FOOD);
        const cash = getField(sabView, i, AGENT_FIELDS.CASH);
        if (food < 10 && cash >= fmp) cashRichStarving++;
      }
    }
    console.log(`[DiagEM] tick=${tickNumber} emergencyTrades=${emTrades} foodMoneyPrice=${fmp.toFixed(3)} cashRichStarving=${cashRichStarving}`);
  }

  // GPU memory monitor — must be flat after tick 100 if disposal is working.
  // If numBytes climbs steadily, the tensor leak is still active.
  if (tickNumber % 300 === 0) {
    const mem = tf.memory();
    console.log(
      `[SimWorker] tf.memory tick=${tickNumber}` +
      ` tensors=${mem.numTensors}` +
      ` buffers=${mem.numDataBuffers}` +
      ` bytes=${(mem.numBytes / 1024 / 1024).toFixed(2)}MB`,
    );
  }
}

function handleInit(agentCount: number, seed: number, initPolicy: PolicyState, seedMode: 'morocco' | 'flat' = 'morocco'): void {
  console.log(`[SimWorker] handleInit called — agentCount=${agentCount} seed=${seed} seedMode=${seedMode}`);
  try {
    console.log(`[SimWorker] allocating SAB: ${SAB_SIZE} bytes`);
    sab = new SharedArrayBuffer(SAB_SIZE);
    sabView = new Float32Array(sab);
    tiles = createMap(seed);
    policy = initPolicy;

    resetMarket();
    resetStats();
    resetBankState();
    resetLendingActiveTick();
    prevCurrencyActive = false;
    seedRng(seed);
    const agentSeeds = seedMode === 'flat' ? undefined : MOROCCO_URBAN_SEED;
    activeCount = initAgents(sabView, agentCount, seed, policy.landPolicy, agentSeeds);
    tickNumber = 0;
    running = true;

    // Warm up TF.js WebGL shader compilation before the tick loop starts.
    // Without this, the first N ticks are slow as shaders JIT-compile on first use.
    console.log('[SimWorker] warming up TF.js shaders...');
    const _warmGrid = new SpatialGrid();
    const _ranks    = computeWealthRanks(sabView, activeCount);
    const _inputs   = buildInputMatrix(sabView, activeCount, tiles, 1, 1, policy, _ranks, _warmGrid);
    const { w1flat: _w1, w2flat: _w2, w3flat: _w3 } = copyWeightsFromSAB(sabView, activeCount);
    runInference(_inputs, _w1, _w2, _w3, activeCount);
    console.log(`[SimWorker] TF.js backend: ${tf.getBackend()}`);

    // Spawn/reset Evolution Worker and share the SAB
    ensureEvoWorker(sab);

    console.log(`[SimWorker] INIT complete: ${activeCount} agents, seed=${seed}, SAB=${SAB_SIZE} bytes`);
    const ready: SimToMain = { type: 'READY', sab };
    self.postMessage(ready);

    // Tick loop: aim for ~60 ticks/sec
    if (intervalId !== null) clearInterval(intervalId);
    intervalId = setInterval(doTick, 1000 / 60);
  } catch (e) {
    const err: SimToMain = { type: 'ERROR', message: String(e) };
    self.postMessage(err);
  }
}

self.addEventListener('message', (e: MessageEvent<MainToSim>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'INIT':
        handleInit(msg.agentCount, msg.seed, msg.policy, msg.seedMode ?? 'morocco');
        break;

      case 'POLICY':
        policy = applyPolicyPatch(policy, msg.policy);
        break;

      case 'PAUSE':
        running = false;
        break;

      case 'RESUME':
        running = true;
        break;

      case 'RESET':
        if (intervalId !== null) { clearInterval(intervalId); intervalId = null; }
        handleInit(INITIAL_AGENT_COUNT, msg.seed, defaultPolicy(), msg.seedMode ?? 'morocco');
        break;

      default:
        break;
    }
  } catch (e) {
    const err: SimToMain = { type: 'ERROR', message: String(e) };
    self.postMessage(err);
  }
});
