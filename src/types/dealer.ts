// src/types/dealer.ts
export interface DealerConfig {
  slug: string;
  name: string;
  code: string;
  isActive: boolean;
  powerbiUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DealerGroupConfig {
  slug: string;
  name: string;
  code: string;
  isActive: boolean;
  isGroup: true;
  includedDealers: string[]; // Array of dealer slugs
  powerbiUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DealerConfigs {
  [slug: string]: DealerConfig | DealerGroupConfig;
}

// Type guard to check if a config is a group
export function isDealerGroup(config: DealerConfig | DealerGroupConfig): config is DealerGroupConfig {
  return 'isGroup' in config && config.isGroup === true;
}
