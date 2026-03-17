// Sim Worker entry point.
// Runs entirely off the main thread. Never imports React or DOM APIs.

console.log('[SimWorker] module loaded');

// Surface any unhandled promise rejections as ERROR messages
self.addEventListener('unhandledrejection', (e) => {
  const msg = { type: 'ERROR', message: `Unhandled rejection: ${e.reason}` };
  self.postMessage(msg);
});

import { SAB_SIZE, STATS_INTERVAL, INITIAL_AGENT_COUNT, AGENT_FIELDS } from '../types/constants';
import { tick, initAgents, seedRng } from './tick';
import { createMap } from './map';
import { computeStats } from './stats';
import { resetMarket, getMarketStats } from './market';
import { defaultPolicy, applyPolicyPatch } from './policy';
import { getField } from './agent';
import EvoWorkerCtor from '../evolution/worker.ts?worker';
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

  const { foodPrice, woodPrice } = getMarketStats();
  activeCount = tick(sabView, activeCount, tiles, policy, tickNumber, foodPrice, woodPrice);
  tickNumber++;

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
  }
}

function handleInit(agentCount: number, seed: number, initPolicy: PolicyState): void {
  console.log(`[SimWorker] handleInit called — agentCount=${agentCount} seed=${seed}`);
  try {
    console.log(`[SimWorker] allocating SAB: ${SAB_SIZE} bytes`);
    sab = new SharedArrayBuffer(SAB_SIZE);
    sabView = new Float32Array(sab);
    tiles = createMap(seed);
    policy = initPolicy;

    resetMarket();
    seedRng(seed);
    activeCount = initAgents(sabView, agentCount, seed);
    tickNumber = 0;
    running = true;

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
        handleInit(msg.agentCount, msg.seed, msg.policy);
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
        handleInit(INITIAL_AGENT_COUNT, msg.seed, defaultPolicy());
        break;

      default:
        break;
    }
  } catch (e) {
    const err: SimToMain = { type: 'ERROR', message: String(e) };
    self.postMessage(err);
  }
});
