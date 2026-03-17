// Sim Worker entry point.
// Runs entirely off the main thread. Never imports React or DOM APIs.

import { SAB_SIZE, STATS_INTERVAL, INITIAL_AGENT_COUNT } from '../types/constants';
import { tick, initAgents, seedRng } from './tick';
import { createMap } from './map';
import { computeStats } from './stats';
import { defaultPolicy, applyPolicyPatch } from './policy';
import type { MainToSim, SimToMain } from '../types/messages';
import type { TileMap } from './map';
import type { PolicyState } from '../types/sim';

let sab: SharedArrayBuffer;
let sabView: Float32Array;
let tiles: TileMap;
let policy: PolicyState = defaultPolicy();
let activeCount = 0;
let tickNumber  = 0;
let running     = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

function doTick(): void {
  if (!running) return;
  activeCount = tick(sabView, activeCount, tiles, policy, tickNumber);
  tickNumber++;

  if (tickNumber % STATS_INTERVAL === 0) {
    const stats = computeStats(sabView, activeCount, tickNumber);
    console.log(`[SimWorker] tick=${stats.tick} pop=${stats.population} avgFood=${stats.avgFood.toFixed(2)} avgWood=${stats.avgWood.toFixed(2)}`);
    const msg: SimToMain = { type: 'STATS', stats };
    self.postMessage(msg);
  }
}

function handleInit(agentCount: number, seed: number, initPolicy: PolicyState): void {
  try {
    sab     = new SharedArrayBuffer(SAB_SIZE);
    sabView = new Float32Array(sab);
    tiles   = createMap(seed);
    policy  = initPolicy;

    seedRng(seed);
    activeCount = initAgents(sabView, agentCount, seed);
    tickNumber  = 0;
    running     = true;

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
