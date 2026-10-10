import { initAgent, setField } from '../../src/sim/agent';
import { AGENT_FIELDS, AGENT_STRIDE, INITIAL_ENERGY } from '../../src/types/constants';

export type AgentFieldOverrides = Partial<Record<keyof typeof AGENT_FIELDS, number>>;

export interface SimFixture {
  sab: Float32Array;
  activeCount: number;
}

export function createSimFixture(agentFields: AgentFieldOverrides[]): SimFixture {
  const sab = new Float32Array(agentFields.length * AGENT_STRIDE);

  agentFields.forEach((fields, index) => {
    initAgent(sab, index, index, 0, 0, 20, 5, INITIAL_ENERGY, 1);

    for (const [name, value] of Object.entries(fields)) {
      if (value !== undefined) {
        setField(sab, index, AGENT_FIELDS[name as keyof typeof AGENT_FIELDS], value);
      }
    }
  });

  return { sab, activeCount: agentFields.length };
}
