import { parseFlexibleDateToDate } from "@/lib/showDatabase";
import type { CampervanScheduleItem, ScheduleItem } from "@/types";

export const TARGET_MODEL_RANGES = ["SRC", "SRH", "SRL", "SRP", "SRS", "SRT", "SRV", "NGC", "NGB"] as const;

const toStr = (value: unknown) => String(value ?? "").trim();

export const getModelRange = (model?: string, chassis?: string) => {
  const modelValue = toStr(model);
  if (modelValue) return modelValue.slice(0, 3).toUpperCase();
  const chassisValue = toStr(chassis);
  if (chassisValue) return chassisValue.slice(0, 3).toUpperCase();
  return "OTHER";
};

const parseDate = (value?: string | null) => {
  const raw = toStr(value);
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const parsed = new Date(year, month - 1, day);
    if (parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day) {
      return parsed;
    }
  }
  return parseFlexibleDateToDate(raw || undefined);
};

const normalizeDealer = (name?: string) => {
  const value = toStr(name);
  return value || "Unknown Dealer";
};

const isFinished = (value?: string) => {
  const raw = toStr(value).toLowerCase();
  return raw === "finished" || raw === "finish";
};

type DealerRangeCount = Record<string, Record<string, number>>;

export const buildDealerRangeCounts2026 = (
  schedule: ScheduleItem[],
  campervans: CampervanScheduleItem[]
): DealerRangeCount => {
  const result: DealerRangeCount = {};

  const bump = (dealer: string, range: string) => {
    if (!result[dealer]) result[dealer] = {};
    if (!result[dealer][range]) result[dealer][range] = 0;
    result[dealer][range] += 1;
  };

  schedule.forEach((item) => {
    if (isFinished((item as any)?.["Regent Production"])) return;
    const date = parseDate(item?.["Forecast Production Date"]);
    if (!date || date.getFullYear() !== 2026) return;
    const dealer = normalizeDealer(item?.Dealer);
    const range = getModelRange(item?.Model, (item as any)?.Chassis);
    bump(dealer, range);
  });

  campervans.forEach((item) => {
    if (isFinished(String(item?.regentProduction ?? ""))) return;
    const date = parseDate(String(item?.forecastProductionDate ?? ""));
    if (!date || date.getFullYear() !== 2026) return;
    const dealer = normalizeDealer(String(item?.dealer ?? ""));
    const range = getModelRange(String(item?.model ?? ""), String(item?.chassisNumber ?? ""));
    bump(dealer, range);
  });

  return result;
};

export const toPercentValue = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
};
