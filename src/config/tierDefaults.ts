import type { DealerTierLayout, TierTarget } from "@/types/tierConfig";

export const defaultTierTargets: Record<string, TierTarget> = {
  A1: { label: "Core", role: "Never run dry; keep multiple couple options visible.", minimum: 3 },
  "A1+": { label: "Flagship", role: "Prioritise showcase quality; always have a demo.", minimum: 1 },
  A2: { label: "Supporting", role: "Fill structural gaps like family bunk and hybrid.", minimum: 1 },
  B1: { label: "Niche", role: "Tightly control volume; refresh quickly.", minimum: 0, ceiling: 1 },
};

export const defaultShareTargets: Record<string, number> = { A1: 0.4, "A1+": 0.3, A2: 0.2, B1: 0.1 };

export const defaultDealerTierLayout: DealerTierLayout = {
  tiers: [
    {
      code: "A1",
      name: "A1 Core",
      description: "Anchor range that keeps the yard balanced and never runs dry.",
      models: [],
      sortOrder: 1,
    },
    {
      code: "A1+",
      name: "A1+ Flagship",
      description: "Hero pieces for showcase and demo stock.",
      models: [],
      sortOrder: 2,
    },
    {
      code: "A2",
      name: "A2 Supporting",
      description: "Structural fillers like family bunk and hybrid coverage.",
      models: [],
      sortOrder: 3,
    },
    {
      code: "B1",
      name: "B1 Niche",
      description: "Controlled bets and fast refresh experiments.",
      models: [],
      sortOrder: 4,
    },
  ],
};
