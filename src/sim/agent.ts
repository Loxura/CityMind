import { AGENT_STRIDE, AGENT_FIELDS, WEIGHT_COUNT } from '../types/constants';

// Never use raw index arithmetic on the SAB. Always use these accessors.

export function getField(sab: Float32Array, agentIdx: number, field: number): number {
  return sab[agentIdx * AGENT_STRIDE + field];
}

export function setField(sab: Float32Array, agentIdx: number, field: number, value: number): void {
  sab[agentIdx * AGENT_STRIDE + field] = value;
}

export function getWeights(sab: Float32Array, agentIdx: number): Float32Array {
  const start = agentIdx * AGENT_STRIDE + AGENT_FIELDS.WEIGHTS_START;
  return sab.subarray(start, start + WEIGHT_COUNT);
}

export function initAgent(
  sab: Float32Array,
  agentIdx: number,
  id: number,
  x: number,
  y: number,
  food: number,
  wood: number,
  energy: number,
): void {
  setField(sab, agentIdx, AGENT_FIELDS.ID,               id);
  setField(sab, agentIdx, AGENT_FIELDS.ROLE,             0);
  setField(sab, agentIdx, AGENT_FIELDS.X,                x);
  setField(sab, agentIdx, AGENT_FIELDS.Y,                y);
  setField(sab, agentIdx, AGENT_FIELDS.FOOD,             food);
  setField(sab, agentIdx, AGENT_FIELDS.WOOD,             wood);
  setField(sab, agentIdx, AGENT_FIELDS.TOOLS,            0);
  setField(sab, agentIdx, AGENT_FIELDS.HOUSES,           0);
  setField(sab, agentIdx, AGENT_FIELDS.CLOTHING,         0);
  setField(sab, agentIdx, AGENT_FIELDS.FISH,             0);
  setField(sab, agentIdx, AGENT_FIELDS.LABOUR_SOLD,      0);
  setField(sab, agentIdx, AGENT_FIELDS.LABOUR_HIRED,     0);
  setField(sab, agentIdx, AGENT_FIELDS.WAGE_RESERVATION, 0);
  setField(sab, agentIdx, AGENT_FIELDS.LAND,             0);
  setField(sab, agentIdx, AGENT_FIELDS.CASH,             0);
  setField(sab, agentIdx, AGENT_FIELDS.DEBT,             0);
  setField(sab, agentIdx, AGENT_FIELDS.SHARES,           0);
  setField(sab, agentIdx, AGENT_FIELDS.WEALTH,           food + wood);
  setField(sab, agentIdx, AGENT_FIELDS.AGE,              0);
  setField(sab, agentIdx, AGENT_FIELDS.ENERGY,           energy);
}
