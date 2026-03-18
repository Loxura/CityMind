export type AgentRole = 'farmer' | 'builder' | 'merchant' | 'banker' | 'capitalist' | 'worker';
export type TechId = 'grain_silo' | 'sawmill' | 'fishery' | 'textile_mill' | 'bank_charter' | 'stock_listing';
export type RedistributionModel = 'ubi' | 'targeted_welfare' | 'public_goods' | 'infrastructure' | 'none';
export type SeedMode = 'morocco' | 'flat';

export interface SimStats {
  tick:             number;
  population:       number;
  avgFood:          number;
  avgWood:          number;
  // Phase 2+ fields — stub zero in Phase 1
  gdp:              number;
  gini:             number;
  wealthBrackets:   number[];   // agent count per decile bin
  wealthByBracket:  number[];   // total wealth held per decile bin (Piketty view)
  foodPrice:        number;
  woodPrice:        number;
  wageRate:         number;
  unemploymentRate: number;
  labourShareOfGdp: number;
  landRentIndex:    number;
  avgIncome:        number;
  inflationRate:    number;
  creditToGdp:      number;
  roleCounts:       Record<AgentRole, number>;
  techsUnlocked:    TechId[];
  stockIndex:       number;
  bankSolvency:     number;
  tradeCount:       number;  // cumulative completed trades since last INIT/RESET
  tickTradeCount:   number;  // trades executed in the most recent tick only
}

export interface PolicyState {
  taxRate:            number;   // 0-0.5
  redistribution:     RedistributionModel;
  ubiAmount:          number;
  minWage:            number;
  landPolicy:         'state' | 'auctioned' | 'free';
  centralBankRate:    number;   // Phase 7+
  moneySupplyGrowth:  number;   // Phase 7+
  reserveRequirement: number;   // Phase 8+
  capitalGainsTax:    number;   // Phase 9+
  marginLendingLimit: number;   // Phase 9+
}
