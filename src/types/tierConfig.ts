export type TierTarget = {
  label: string;
  role: string;
  minimum: number;
  ceiling?: number;
};

export type TierLayoutTier = {
  code: string;
  name: string;
  description?: string;
  models: string[];
  sortOrder?: number;
};

export type DealerTierLayout = {
  tiers: TierLayoutTier[];
  updatedAt?: string;
  updatedBy?: string;
  slug?: string;
};

export type TierConfig = {
  shareTargets?: Record<string, number>;
  tierTargets?: Record<string, TierTarget>;
  defaultLayout?: DealerTierLayout;
  dealerLayouts?: Record<string, DealerTierLayout>;
  updatedAt?: string;
};

export type DealerLayoutSnapshot = {
  layout: DealerTierLayout | null;
  defaultLayout: DealerTierLayout | null;
  source: "dealer" | "default" | "none";
};
