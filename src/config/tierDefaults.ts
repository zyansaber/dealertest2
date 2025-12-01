import type { TierTarget } from "@/types/tierConfig";

export const defaultTierTargets: Record<string, TierTarget> = {
  A1: { label: "Core", role: "Never run dry; keep multiple couple options visible.", minimum: 3 },
  "A1+": { label: "Flagship", role: "Prioritise showcase quality; always have a demo.", minimum: 1 },
  A2: { label: "Supporting", role: "Fill structural gaps like family bunk and hybrid.", minimum: 1 },
  B1: { label: "Niche", role: "Tightly control volume; refresh quickly.", minimum: 0, ceiling: 1 },
};

export const defaultShareTargets: Record<string, number> = { A1: 0.4, "A1+": 0.3, A2: 0.2, B1: 0.1 };
