export type TierTarget = {
  label: string;
  role: string;
  minimum: number;
  ceiling?: number;
};

export type TierConfig = {
  shareTargets?: Record<string, number>;
  tierTargets?: Record<string, TierTarget>;
  updatedAt?: string;
};
