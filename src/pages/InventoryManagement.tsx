// src/pages/InventoryManagement.tsx
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useParams } from "react-router-dom";

import Sidebar from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  subscribeToHandover,
  subscribeToModelAnalysis,
  subscribeToPGIRecords,
  subscribeToSchedule,
  subscribeToYardStock,
  subscribeToYardSizes,
  type ModelAnalysisRecord,
  subscribeShowDealerMappings,
  subscribeTierConfig,
} from "@/lib/firebase";
import { normalizeDealerSlug, prettifyDealerName } from "@/lib/dealerUtils";
import type { ScheduleItem } from "@/types";
import { formatShowDate, parseFlexibleDateToDate, subscribeToShows } from "@/lib/showDatabase";
import type { ShowDealerMapping } from "@/lib/firebase";
import type { ShowRecord } from "@/types/show";
import type { TierConfig, TierTarget } from "@/types/tierConfig";
import { defaultShareTargets, defaultTierTargets } from "@/config/tierDefaults";

type AnyRecord = Record<string, any>;

type ModelStats = {
  currentStock: number;
  recentPgi: number;
  recentHandover: number;
  incoming: number[]; // rolling planning horizon
  tier?: string;
  standardPrice?: number;
};

type MonthBucket = {
  label: string;
  start: Date;
  end: Date;
};

type EmptySlot = {
  item: ScheduleItem;
  forecastDate: Date;
  deliveryDate: Date;
};

type SlotPlan = {
  id: string;
  forecastDate: Date;
  deliveryDate: Date;
  windowStart: Date;
  tier: string;
  tierGoal: number;
  tierBooked: number;
  model: string | null;
  modelTarget: number;
  modelBooked: number;
  recommendation: string;
  projectedModelCount: number;
};

const monthFormatter = new Intl.DateTimeFormat("en-AU", { month: "short", year: "numeric" });

const toStr = (v: unknown) => String(v ?? "");
const toNumber = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};
const pickNumber = (source: AnyRecord, keys: string[]) => {
  for (const key of keys) {
    const val = toNumber(source?.[key]);
    if (val !== undefined) return val;
  }
  return undefined;
};
const slugifyDealerName = (name?: string) =>
  toStr(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const isStockCustomer = (customer?: string) => toStr(customer).toLowerCase().endsWith("stock");

const normalizeTierCode = (tier?: string) => {
  const text = toStr(tier).trim();
  if (!text) return "";
  const match = text.match(/(A1\+|A1|A2|B1|B2)/i);
  if (match) return match[1].toUpperCase();
  return text.split(/[\s–-]/)[0]?.toUpperCase() || "";
};

const hasKey = (obj: any, key: string) => Object.prototype.hasOwnProperty.call(obj ?? {}, key);

const normalizeModelLabel = (label?: string) => {
  const text = toStr(label).trim();
  if (!text) return ["Unknown Model"];

  const normalized = new Set<string>();

  if (/^SRC22F\s*\(2\/3\s*bunks\)$/i.test(text)) {
    normalized.add("SRC22F");
    normalized.add("SRC22F 2 bunks");
    normalized.add("SRC22F 3 bunks");
  } else {
    const base = text.split(/\s+/)[0];
    if (base) normalized.add(base);
    normalized.add(text.replace(/(\bF[^\s]*)\s+.*$/i, "$1"));
    normalized.add(text);
  }

  return Array.from(normalized);
};

const isUnknownModel = (model: string) => {
  const name = toStr(model).trim().toLowerCase();
  return !name || name === "unknown" || name === "unknown model";
};

const getForecastProductionDate = (item: AnyRecord) =>
  (item as any)?.["Forecast Production Date: dd/mm/yyyy"] ??
  (item as any)?.["Forecast Production Date"] ??
  (item as any)?.["Forecast production date"] ??
  (item as any)?.["Forecast Production date"];

const formatStandardPrice = (value?: number) => {
  if (value == null || Number.isNaN(value)) return "—";
  const thousands = value / 1000;
  const formatter = new Intl.NumberFormat("en-AU", {
    maximumSignificantDigits: 3,
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  return `${formatter.format(thousands)}k`;
};

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const raw = String(value).trim();
  const ddmmyyyy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const date = new Date(year, Number(m) - 1, Number(d));
    return isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? null : parsed;
}

const addMonths = (date: Date, count: number) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + count);
  return d;
};

const addDays = (date: Date, count: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + count);
  return d;
};

const startOfMonth = (date: Date) => {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

const startOfDay = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const normalizeProductionStatus = (value?: unknown) => toStr(value).trim().toLowerCase();
const isFinishedProduction = (value?: unknown) => {
  const status = normalizeProductionStatus(value);
  return status === "finished" || status === "finish";
};

export default function InventoryManagement() {
  const { dealerSlug: rawDealerSlug, selectedDealerSlug } = useParams<{ dealerSlug: string; selectedDealerSlug?: string }>();

  const dealerSlug = useMemo(
    () => normalizeDealerSlug(selectedDealerSlug || rawDealerSlug || ""),
    [rawDealerSlug, selectedDealerSlug]
  );

  const [yardStock, setYardStock] = useState<Record<string, AnyRecord>>({});
  const [yardSizes, setYardSizes] = useState<Record<string, AnyRecord>>({});
  const [pgiRecords, setPgiRecords] = useState<Record<string, AnyRecord>>({});
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [handoverRecords, setHandoverRecords] = useState<Record<string, AnyRecord>>({});
  const [modelAnalysis, setModelAnalysis] = useState<Record<string, ModelAnalysisRecord> | ModelAnalysisRecord[] | null>(null);
  const [sortKey, setSortKey] = useState<"currentStock" | "recentHandover" | "recentPgi">("currentStock");
  const [tierFilter, setTierFilter] = useState<string>("");
  const [modelRangeFilter, setModelRangeFilter] = useState<string>("");
  const [modelFilter, setModelFilter] = useState<string>("");

  const [shows, setShows] = useState<ShowRecord[]>([]);
  const [showMappings, setShowMappings] = useState<Record<string, ShowDealerMapping>>({});
  const [tierConfig, setTierConfig] = useState<TierConfig | null>(null);

  const today = useMemo(() => new Date(), []);
  const currentMonthStart = useMemo(() => startOfMonth(today), [today]);
  const previousMonthStart = useMemo(() => startOfMonth(addMonths(today, -1)), [today]);

  useEffect(() => {
    let unsubYard: (() => void) | undefined;
    let unsubHandover: (() => void) | undefined;
    let unsubModelAnalysis: (() => void) | undefined;
    let unsubYardSize: (() => void) | undefined;
    if (dealerSlug) {
      unsubYard = subscribeToYardStock(dealerSlug, (data) => setYardStock(data || {}));
      unsubHandover = subscribeToHandover(dealerSlug, (data) => setHandoverRecords(data || {}));
    }
    unsubModelAnalysis = subscribeToModelAnalysis((data) => setModelAnalysis(data || {}));
    unsubYardSize = subscribeToYardSizes((data) => setYardSizes(data || {}));
    const unsubPgi = subscribeToPGIRecords((data) => setPgiRecords(data || {}));
    const unsubSchedule = subscribeToSchedule(
      (data) => {
        const normalized = Array.isArray(data)
          ? data.filter(Boolean)
          : Object.values(data || {}).filter(Boolean);
        setSchedule(normalized as ScheduleItem[]);
      },
      { includeNoChassis: true, includeNoCustomer: true, includeFinished: true }
    );


    return () => {
      unsubYard?.();
      unsubHandover?.();
      unsubModelAnalysis?.();
      unsubYardSize?.();
      unsubPgi?.();
      unsubSchedule?.();
    };
  }, [dealerSlug]);

  useEffect(() => {
    const unsubShows = subscribeToShows((data) => setShows(data || []));
    const unsubMappings = subscribeShowDealerMappings((data) => setShowMappings(data || {}));
    const unsubTier = subscribeTierConfig((data) => setTierConfig(data));
    return () => {
      unsubShows?.();
      unsubMappings?.();
      unsubTier?.();
    };
  }, []);

  const analysisByModel = useMemo(() => {
    const map: Record<string, ModelAnalysisRecord> = {};
    const registerEntry = (entry: ModelAnalysisRecord, fallbackLabel?: string) => {
      if (!entry && !fallbackLabel) return;
      const raw = toStr((entry as any)?.model || (entry as any)?.Model || fallbackLabel).trim();
      if (!raw) return;
      const labels = normalizeModelLabel(raw);
      labels.forEach((label) => {
        const key = label.toLowerCase();
        if (!key) return;
        map[key] = entry;
      });
    };

    if (Array.isArray(modelAnalysis)) {
      (modelAnalysis as ModelAnalysisRecord[]).forEach((entry) => registerEntry(entry));
    } else {
      Object.entries((modelAnalysis || {}) as Record<string, ModelAnalysisRecord>).forEach(([key, entry]) =>
        registerEntry(entry, key)
      );
    }

    return map;
  }, [modelAnalysis]);

  const scheduleByChassis = useMemo(() => {
    const map: Record<string, Partial<ScheduleItem>> = {};
    for (const item of schedule) {
      if (!item) continue;
      const chassis = toStr((item as any)?.Chassis);
      if (chassis) map[chassis] = item;
    }
    return map;
  }, [schedule]);

  const planningHorizonMonths = 8;

  const monthBuckets = useMemo<MonthBucket[]>(() => {
    return Array.from({ length: planningHorizonMonths }, (_, i) => {
      const bucketStart = startOfMonth(addMonths(currentMonthStart, i));
      const end = startOfMonth(addMonths(bucketStart, 1));
      return {
        start: bucketStart,
        end,
        label: monthFormatter.format(bucketStart),
      };
    });
  }, [currentMonthStart, planningHorizonMonths]);

  const modelRows = useMemo(() => {
    const modelMap = new Map<string, ModelStats>();

    const primaryLabel = (model: string) => normalizeModelLabel(model)[0];

    const ensureModel = (model: string) => {
      if (!modelMap.has(model)) {
        modelMap.set(model, {
          currentStock: 0,
          recentPgi: 0,
          recentHandover: 0,
          incoming: Array(monthBuckets.length).fill(0),
        });
      }
      return modelMap.get(model)!;
    };

    const yardEntries = Object.entries(yardStock || {}).filter(([chassis]) => chassis !== "dealer-chassis");
    yardEntries.forEach(([chassis, payload]) => {
      const rec = payload || {};
      const rawType = toStr(rec.type ?? rec.Type).toLowerCase();
      const scheduleMatch = scheduleByChassis[chassis];
      const customerFromSchedule = toStr((scheduleMatch as any)?.Customer);
      const inferredType = (() => {
        if (rawType.includes("stock")) return "Stock";
        if (rawType.includes("customer") || rawType.includes("retail")) return "Customer";
        if (isStockCustomer(customerFromSchedule)) return "Stock";
        return "Customer";
      })();
      if (inferredType !== "Stock") return;

      const model = primaryLabel(toStr((rec.model ?? (scheduleMatch as any)?.Model) ?? "").trim());
      if (isUnknownModel(model)) return;
      const stats = ensureModel(model);
      stats.currentStock += 1;
    });

    const threeMonthsAgo = startOfDay(addMonths(new Date(), -3));
    const pgiEntries = Object.entries(pgiRecords || {}).map(([chassis, rec]) => ({ chassis, ...(rec || {}) }));
    pgiEntries.forEach(({ chassis, ...rec }) => {
      if (slugifyDealerName((rec as any)?.dealer) !== dealerSlug) return;
      const date =
        parseDate((rec as any)?.pgidate) ||
        parseDate((rec as any)?.PGIDate) ||
        parseDate((rec as any)?.pgIDate) ||
        parseDate((rec as any)?.PgiDate);
      if (!date || date < threeMonthsAgo) return;
      const scheduleMatch = scheduleByChassis[chassis];
      const model = primaryLabel(toStr(((rec as any)?.model ?? (scheduleMatch as any)?.Model) ?? "").trim());
      if (isUnknownModel(model)) return;
      const stats = ensureModel(model);
      stats.recentPgi += 1;
    });

    const handoverEntries = Object.entries(handoverRecords || {}).map(([chassis, rec]) => ({ chassis, ...(rec || {}) }));
    handoverEntries.forEach(({ chassis, ...rec }) => {
      const dealerFromRec = slugifyDealerName((rec as any)?.dealerSlug || (rec as any)?.dealerName || "");
      if (dealerFromRec !== dealerSlug) return;
      const date = parseDate((rec as any)?.handoverAt) || parseDate((rec as any)?.createdAt);
      if (!date || date < threeMonthsAgo) return;
      const scheduleMatch = scheduleByChassis[chassis];
      const model = primaryLabel(
        toStr((rec as any)?.model ?? (scheduleMatch as any)?.Model ?? (scheduleMatch as any)?.model ?? "").trim()
      );
      if (isUnknownModel(model)) return;
      const stats = ensureModel(model);
      stats.recentHandover += 1;
    });

    const horizonStart = previousMonthStart;
    const horizonEnd = monthBuckets[monthBuckets.length - 1]?.end;
    if (horizonStart && horizonEnd) {
      schedule.forEach((item) => {
        const dealerMatches = slugifyDealerName((item as any)?.Dealer) === dealerSlug || !dealerSlug;
        if (!dealerMatches) return;
        if (!isStockCustomer((item as any)?.Customer)) return;
        const model = primaryLabel(toStr((item as any)?.Model || "").trim());
        if (!model) return;
        if (!modelMap.has(model)) return;

        const productionStatus = normalizeProductionStatus((item as any)?.["Regent Production"]);
        if (isFinishedProduction(productionStatus)) return;

        const forecastRaw =
          (item as any)?.["Forecast Production Date: dd/mm/yyyy"] ??
          (item as any)?.["Forecast Production Date"] ??
          (item as any)?.["Forecast production date"];
        const forecastDate = parseDate(forecastRaw);
        if (!forecastDate) return;
        const arrivalDate = addDays(forecastDate, 40);
        if (arrivalDate < horizonStart || arrivalDate >= horizonEnd) return;

        const stats = ensureModel(model);

        const isCarryOver = arrivalDate >= previousMonthStart && arrivalDate < currentMonthStart;
        const fallsThisMonth = arrivalDate < addMonths(currentMonthStart, 1);
        if (isCarryOver || fallsThisMonth) {
          stats.incoming[0] += 1;
          return;
        }

        const monthIndex = monthBuckets.findIndex((bucket) => arrivalDate >= bucket.start && arrivalDate < bucket.end);
        if (monthIndex >= 0) {
          stats.incoming[monthIndex] += 1;
        }
      });
    }

    const rows = Array.from(modelMap.entries()).map(([model, stats]) => {
      const analysis = analysisByModel[model.toLowerCase()];
      const tier = normalizeTierCode(analysis?.tier || analysis?.Tier);
      const standardPrice = toNumber(
        (analysis as any)?.standard_price || (analysis as any)?.standardPrice || (analysis as any)?.StandardPrice
      );
      return { model, ...stats, tier, standardPrice };
    });

    const sorter: Record<typeof sortKey, (a: ModelStats & { model: string }, b: ModelStats & { model: string }) => number> = {
      currentStock: (a, b) => b.currentStock - a.currentStock || a.model.localeCompare(b.model),
      recentHandover: (a, b) => b.recentHandover - a.recentHandover || a.model.localeCompare(b.model),
      recentPgi: (a, b) => b.recentPgi - a.recentPgi || a.model.localeCompare(b.model),
    };

    return rows.sort(sorter[sortKey]);
  }, [
    analysisByModel,
    currentMonthStart,
    dealerSlug,
    handoverRecords,
    monthBuckets,
    pgiRecords,
    previousMonthStart,
    schedule,
    scheduleByChassis,
    sortKey,
    yardStock,
  ]);

  const dealerDisplayName = useMemo(() => prettifyDealerName(dealerSlug), [dealerSlug]);
  const sidebarOrders = useMemo(() => schedule.filter((item) => slugifyDealerName((item as any)?.Dealer) === dealerSlug), [schedule, dealerSlug]);

  const dealerShowMapping = useMemo(() => {
    return Object.values(showMappings || {}).find(
      (item) => normalizeDealerSlug(item?.dealerSlug) === dealerSlug
    );
  }, [dealerSlug, showMappings]);

  const dealerShows = useMemo(() => {
    if (!dealerShowMapping) return [];
    return shows.filter((show) => show.dealership === dealerShowMapping.dealership);
  }, [dealerShowMapping, shows]);

  const showFootnotes = useMemo(() => {
    if (!dealerShows.length) return [] as Array<{ index: number; monthIndex: number; show: ShowRecord; startDate: Date }>;
    const enriched = dealerShows
      .map((show) => ({ show, startDate: parseFlexibleDateToDate(show.startDate) }))
      .filter((entry) => entry.startDate) as Array<{ show: ShowRecord; startDate: Date }>;

    const sorted = enriched.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    const result: Array<{ index: number; monthIndex: number; show: ShowRecord; startDate: Date }> = [];

    sorted.forEach((entry, idx) => {
      const monthIndex = monthBuckets.findIndex((bucket) => entry.startDate >= bucket.start && entry.startDate < bucket.end);
      if (monthIndex >= 0) {
        result.push({ index: idx + 1, monthIndex, show: entry.show, startDate: entry.startDate });
      }
    });

    return result;
  }, [dealerShows, monthBuckets]);

  const monthShowMarkers = useMemo(() => {
    const markers = Array.from({ length: monthBuckets.length }, () => [] as number[]);
    showFootnotes.forEach(({ index, monthIndex }) => {
      if (monthIndex >= 0 && monthIndex < markers.length) {
        markers[monthIndex].push(index);
      }
    });
    return markers;
  }, [monthBuckets.length, showFootnotes]);

  const tierColor = (tier?: string) => {
    const key = normalizeTierCode(tier);
    const palette: Record<string, { bg: string; border: string; text: string; pill: string }> = {
      "A1+": { bg: "bg-sky-50", border: "border-sky-200", text: "text-sky-900", pill: "bg-sky-100 text-sky-800" },
      A1: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-900", pill: "bg-blue-100 text-blue-800" },
      A2: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-900", pill: "bg-emerald-100 text-emerald-800" },
      B1: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-900", pill: "bg-amber-100 text-amber-800" },
      B2: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-900", pill: "bg-purple-100 text-purple-800" },
    };
    return palette[key] || { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-900", pill: "bg-slate-100 text-slate-700" };
  };

  const prioritizedTierModels = useMemo(() => {
    const priorities = ["A1", "A1+", "A2", "B1"];
    const values = Array.isArray(modelAnalysis)
      ? (modelAnalysis as ModelAnalysisRecord[])
      : Object.values((modelAnalysis || {}) as Record<string, ModelAnalysisRecord>);

    const entries = values
      .map((entry) => {
        const tier = normalizeTierCode((entry as any)?.tier || (entry as any)?.Tier);
        return { entry, tier };
      })
      .filter(({ tier }) => priorities.includes(tier));

    return priorities
      .map((tier) => ({
        tier,
        models: entries
          .filter((item) => item.tier === tier)
          .flatMap((item) =>
            normalizeModelLabel((item.entry as any)?.model || (item.entry as any)?.Model).map((label) => ({
              ...item.entry,
              model: label,
            }))
          ),
      }))
      .filter(({ models }) => models.length > 0);
  }, [modelAnalysis]);

  const [expandedModel, setExpandedModel] = useState<string | null>(null);

  const tierTargets = useMemo(() => {
    const configTargets = tierConfig?.tierTargets || {};
    const merged: Record<string, TierTarget> = { ...defaultTierTargets };

    Object.entries(configTargets).forEach(([tier, target]) => {
      merged[tier] = { ...defaultTierTargets[tier], ...target } as TierTarget;
    });

    return merged;
  }, [tierConfig]);

  const shareTargets = useMemo(() => ({ ...defaultShareTargets, ...(tierConfig?.shareTargets || {}) }), [tierConfig]);

  const filteredRows = useMemo(() => {
    return modelRows.filter((row) => {
      const tierMatches = tierFilter ? normalizeTierCode(row.tier) === normalizeTierCode(tierFilter) : true;
      const modelRange = row.model.slice(0, 3).toUpperCase();
      const rangeMatches = modelRangeFilter ? modelRange === modelRangeFilter.toUpperCase() : true;
      const modelMatches = modelFilter ? row.model.toLowerCase() === modelFilter.toLowerCase() : true;
      return tierMatches && rangeMatches && modelMatches;
    });
  }, [modelFilter, modelRangeFilter, modelRows, tierFilter]);

  const filterOptions = useMemo(() => {
    const tiers = Array.from(
      new Set(modelRows.map((row) => normalizeTierCode(row.tier)).filter((tier) => tier))
    ).sort();
    const ranges = Array.from(
      new Set(modelRows.map((row) => row.model.slice(0, 3).toUpperCase()).filter(Boolean))
    ).sort();
    const models = Array.from(new Set(modelRows.map((row) => row.model))).sort((a, b) => a.localeCompare(b));
    return { tiers, ranges, models };
  }, [modelRows]);

  const totalsRow = useMemo(() => {
    const base = {
      currentStock: 0,
      recentHandover: 0,
      recentPgi: 0,
      incoming: Array(monthBuckets.length).fill(0),
    };

    filteredRows.forEach((row) => {
      base.currentStock += row.currentStock || 0;
      base.recentHandover += row.recentHandover || 0;
      base.recentPgi += row.recentPgi || 0;
      row.incoming.forEach((val, idx) => {
        base.incoming[idx] = (base.incoming[idx] || 0) + (val || 0);
      });
    });

    return base;
  }, [filteredRows, monthBuckets.length]);

  const yardStockBreakdown = useMemo(() => {
    const entries = Object.entries(yardStock || {}).filter(([chassis]) => chassis !== "dealer-chassis");
    let stockCount = 0;
    let customerCount = 0;

    entries.forEach(([chassis, payload]) => {
      const rec = payload || {};
      const rawType = toStr(rec.type ?? rec.Type).toLowerCase();
      const scheduleMatch = scheduleByChassis[chassis];
      const customerFromSchedule = toStr((scheduleMatch as any)?.Customer);
      const inferredType = (() => {
        if (isStockCustomer(customerFromSchedule)) return "Stock";
        if (rawType.includes("stock")) return "Stock";
        if (rawType.includes("customer") || rawType.includes("retail")) return "Customer";
        return "Customer";
      })();

      if (inferredType === "Stock") {
        stockCount += 1;
      } else {
        customerCount += 1;
      }
    });

    return { stockCount, customerCount, total: stockCount + customerCount };
  }, [scheduleByChassis, yardStock]);

  const yardCapacityStats = useMemo(() => {
    const entries = Object.entries(yardSizes || {});
    const normalized = (value: unknown) => normalizeDealerSlug(toStr(value));

    const matchedEntry =
      entries.find(([key]) => normalized(key) === dealerSlug) ||
      entries.find(([, value]) =>
        normalized(
          (value as AnyRecord)?.dealer ||
            (value as AnyRecord)?.dealerName ||
            (value as AnyRecord)?.name ||
            (value as AnyRecord)?.yard
        ) === dealerSlug
      );

    const record = (matchedEntry?.[1] as AnyRecord) || {};
    const maxCapacity = pickNumber(record, [
      "Max Yard Capacity",
      "max_yard_capacity",
      "maxyardcapacity",
      "maxYardCapacity",
      "yard_capacity",
      "max_yardcapacity",
      "max_capacity",
      "maxCapacity",
      "Max",
      "MAX",
      "max",
    ]);
    const minVanVolume = pickNumber(record, [
      "Min Van Volumn",
      "Min Van Volume",
      "min_van_volumn",
      "min_van_volume",
      "minVanVolume",
      "minVanVolumn",
      "min_van",
      "minimum_van_volume",
      "Min",
      "MIN",
      "min",
    ]);
    const label = toStr(
      (record as AnyRecord)?.dealer ||
        (record as AnyRecord)?.dealerName ||
        (record as AnyRecord)?.yard ||
        (record as AnyRecord)?.name ||
        matchedEntry?.[0] ||
        dealerDisplayName
    );

    return { maxCapacity, minVanVolume, label, record, found: Boolean(matchedEntry) };
  }, [dealerDisplayName, dealerSlug, yardSizes]);

  const currentStockTotal = totalsRow.currentStock;
  const yardStockTotal = yardStockBreakdown.total;
  const capacityPercent =
    yardCapacityStats.maxCapacity && yardCapacityStats.maxCapacity > 0
      ? Math.min(200, Math.round((yardStockTotal / yardCapacityStats.maxCapacity) * 1000) / 10)
      : null;
  const remainingCapacity =
    yardCapacityStats.maxCapacity && yardCapacityStats.maxCapacity > 0
      ? yardCapacityStats.maxCapacity - yardStockTotal
      : null;
  const barMaxBase = Math.max(
    yardCapacityStats.maxCapacity || 0,
    yardStockTotal || 0,
    yardCapacityStats.minVanVolume || 0
  );
  const barMax = barMaxBase > 0 ? barMaxBase * 1.1 : 0;
  const stockFillPercent = barMax > 0 ? (yardStockBreakdown.stockCount / barMax) * 100 : 0;
  const customerFillPercent = barMax > 0 ? (yardStockBreakdown.customerCount / barMax) * 100 : 0;
  const totalFillPercent = barMax > 0 ? (yardStockTotal / barMax) * 100 : 0;
  const minMarkerPercent =
    yardCapacityStats.minVanVolume && barMax > 0 ? (yardCapacityStats.minVanVolume / barMax) * 100 : null;

  const emptySlots = useMemo<EmptySlot[]>(() => {
    return schedule
      .filter((item) => slugifyDealerName((item as any)?.Dealer) === dealerSlug)
      .filter((item) => {
        const hasDealer = toStr((item as any)?.Dealer).trim() !== "";
        const lacksChassis = !hasKey(item, "Chassis");
        return hasDealer && lacksChassis;
      })
      .map((item) => {
        const forecastDate = parseDate(getForecastProductionDate(item));
        if (!forecastDate) return null;
        return { item, forecastDate, deliveryDate: addDays(forecastDate, 40) };
      })
      .filter(Boolean) as EmptySlot[];
  }, [dealerSlug, schedule]);

  const prioritizedEmptySlots = useMemo(() => {
    return [...emptySlots]
      .sort((a, b) => a.forecastDate.getTime() - b.forecastDate.getTime())
      .slice(0, 10);
  }, [emptySlots]);

  const firstEmptySlot = prioritizedEmptySlots[0];

  const emptySlotStockAssessment = useMemo(() => {
    if (!firstEmptySlot) return null;

    const emptySlotDate = firstEmptySlot.forecastDate;
    const windowStart = addDays(emptySlotDate, -90);
    const last30Start = addDays(emptySlotDate, -30);
    const today = startOfDay(new Date());
    const futureWindowEnd = addDays(today, 90);

    let past90Stock = 0;
    let past30Stock = 0;
    let future90Stock = 0;

    schedule.forEach((item) => {
      const dealerMatches = slugifyDealerName((item as any)?.Dealer) === dealerSlug || !dealerSlug;
      if (!dealerMatches) return;
      if (!isStockCustomer((item as any)?.Customer)) return;

      const forecastDate = parseDate(getForecastProductionDate(item));
      if (!forecastDate) return;
      const arrivalDate = addDays(forecastDate, 40);

      if (arrivalDate >= windowStart && arrivalDate < emptySlotDate) past90Stock += 1;
      if (arrivalDate >= last30Start && arrivalDate < emptySlotDate) past30Stock += 1;
      if (arrivalDate >= today && arrivalDate <= futureWindowEnd) future90Stock += 1;
    });

    const minVolume = yardCapacityStats.minVanVolume;
    const min60Target = minVolume != null ? minVolume * 0.6 : null;
    const min20Target = minVolume != null ? minVolume * 0.2 : null;

    return {
      emptySlotDate,
      past90Stock,
      past30Stock,
      future90Stock,
      min60Target,
      min20Target,
      meets90: min60Target != null ? past90Stock >= min60Target : null,
      meets30: min20Target != null ? past30Stock >= min20Target : null,
      meetsFuture90: min60Target != null ? future90Stock >= min60Target : null,
    };
  }, [dealerSlug, firstEmptySlot, schedule, yardCapacityStats.minVanVolume]);

  const emptySlotPlans = useMemo<SlotPlan[]>(() => {
    if (monthBuckets.length === 0) return [] as SlotPlan[];
    const rollingWindowDays = 90;
    const capacityBaseline = (() => {
      const { maxCapacity, minVanVolume } = yardCapacityStats;
      if (maxCapacity && minVanVolume) return Math.round((maxCapacity + minVanVolume) / 2);
      if (maxCapacity) return maxCapacity;
      if (minVanVolume) return minVanVolume;
      return currentStockTotal;
    })();
    const tierGoals: Record<string, number> = Object.fromEntries(
      Object.entries(shareTargets).map(([tier, pct]) => [tier, Math.max(1, Math.floor(capacityBaseline * pct))])
    );
    const tierOrder = ["A1", "A1+", "A2", "B1"];

    const horizonStart = monthBuckets[0]?.start;
    const horizonEnd = monthBuckets[monthBuckets.length - 1]?.end;

    const slots = prioritizedEmptySlots;

    const tierModels: Record<string, string[]> = {};
    modelRows.forEach((row) => {
      const tier = normalizeTierCode(row.tier);
      if (!tier) return;
      tierModels[tier] = tierModels[tier] || [];
      tierModels[tier].push(row.model);
    });
    const perModelGoals: Record<string, number> = {};
    Object.entries(tierModels).forEach(([tier, models]) => {
      const goal = tierGoals[tier] || 0;
      const target = models.length > 0 ? Math.max(1, Math.floor(goal / models.length)) : 0;
      models.forEach((model) => {
        perModelGoals[model.toLowerCase()] = target;
      });
    });

    const initialOrders: { tier: string; model: string; forecastDate: Date }[] = [];
    schedule.forEach((item) => {
      const dealerMatches = slugifyDealerName((item as any)?.Dealer) === dealerSlug || !dealerSlug;
      const hasChassis = Boolean((item as any)?.Chassis);
      const isStock = isStockCustomer((item as any)?.Customer);
      if (!dealerMatches || !hasChassis || !isStock) return;
      const forecastRaw =
        (item as any)?.["Forecast Production Date: dd/mm/yyyy"] ||
        (item as any)?.["Forecast Production Date"] ||
        (item as any)?.["Forecast production date"];
      const forecastDate = parseDate(forecastRaw);
      if (!forecastDate) return;
      if (horizonStart && horizonEnd && (forecastDate < horizonStart || forecastDate >= horizonEnd)) return;
      const modelLabel = normalizeModelLabel(toStr((item as any)?.Model))[0] || "";
      const analysis = analysisByModel[modelLabel.toLowerCase()];
      const tier = normalizeTierCode(analysis?.tier || analysis?.Tier);
      if (!tier) return;
      initialOrders.push({ tier, model: modelLabel, forecastDate });
    });

    const plannedOrders = [...initialOrders];

    const countInWindow = (tier: string, referenceDate: Date) => {
      const windowStart = addDays(referenceDate, -rollingWindowDays);
      return plannedOrders.filter(
        (order) => order.tier === tier && order.forecastDate >= windowStart && order.forecastDate <= referenceDate
      ).length;
    };

    const countModelInWindow = (model: string, referenceDate: Date) => {
      const windowStart = addDays(referenceDate, -rollingWindowDays);
      return plannedOrders.filter(
        (order) =>
          order.model.toLowerCase() === model.toLowerCase() &&
          order.forecastDate >= windowStart &&
          order.forecastDate <= referenceDate
      ).length;
    };

    const pickModelWithLargestDeficit = (referenceDate: Date) => {
      const scored = Object.entries(tierModels)
        .flatMap(([tier, models]) => models.map((model) => ({ tier, model })))
        .map(({ tier, model }) => {
          const goal = perModelGoals[model.toLowerCase()] || 0;
          const tally = countModelInWindow(model, referenceDate);
          return { tier, model, goal, tally, deficit: goal - tally };
        })
        .sort((a, b) => {
          if (b.deficit !== a.deficit) return b.deficit - a.deficit;
          const tierRankA = tierOrder.indexOf(a.tier);
          const tierRankB = tierOrder.indexOf(b.tier);
          if (tierRankA !== tierRankB) return tierRankA - tierRankB;
          return a.model.localeCompare(b.model);
        });

      return scored[0];
    };

    const pickFallbackTier = (referenceDate: Date) => {
      const deficits = Object.entries(tierGoals).map(([tier, goal]) => {
        const tally = countInWindow(tier, referenceDate);
        return { tier, goal, tally, deficit: goal - tally };
      });

      const positive = deficits.filter((d) => d.deficit > 0);
      if (positive.length > 0) {
        return positive.sort((a, b) => b.deficit - a.deficit || tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier))[0];
      }

      const fallback = deficits.sort((a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier))[0];
      return fallback;
    };

    const plans: SlotPlan[] = [];
    slots.forEach((slot, idx) => {
      const windowStart = addDays(slot.forecastDate, -rollingWindowDays);

      const modelPick = pickModelWithLargestDeficit(slot.forecastDate);
      const hasModelDeficit = modelPick && modelPick.deficit > 0;

      let tier = modelPick?.tier || "A1";
      let tierGoal = tierGoals[tier] || 0;
      let tierTally = countInWindow(tier, slot.forecastDate);
      let tierDeficit = Math.max(tierGoal - tierTally, 0);

      let selectedModel = modelPick?.model || null;
      let perModelTarget = selectedModel ? perModelGoals[selectedModel.toLowerCase()] || 0 : 0;
      let modelTally = selectedModel ? countModelInWindow(selectedModel, slot.forecastDate) : 0;
      let modelDeficit = Math.max(perModelTarget - modelTally, 0);

      if (!hasModelDeficit) {
        const fallbackTier = pickFallbackTier(slot.forecastDate);
        tier = fallbackTier?.tier || tier;
        tierGoal = fallbackTier?.goal || tierGoal;
        tierTally = countInWindow(tier, slot.forecastDate);
        tierDeficit = Math.max(tierGoal - tierTally, 0);

        const candidates = (tierModels[tier] || []).sort((a, b) => a.localeCompare(b));
        selectedModel = candidates[0] || null;
        perModelTarget = selectedModel ? perModelGoals[selectedModel.toLowerCase()] || 0 : 0;
        modelTally = selectedModel ? countModelInWindow(selectedModel, slot.forecastDate) : 0;
        modelDeficit = Math.max(perModelTarget - modelTally, 0);
      }

      if (selectedModel) {
        plannedOrders.push({ tier, model: selectedModel, forecastDate: slot.forecastDate });
      }

      const sharePct = shareTargets[tier] ?? 0;
      const recommendation = selectedModel
        ? `Order ${selectedModel} (${Math.max(modelDeficit, tierDeficit)} needed in tier ${tier}).`
        : `Assign a mapped model for tier ${tier} to meet the split target.`;

      plans.push({
        id: `${slot.item?.id || idx}-${slot.forecastDate.toISOString()}`,
        forecastDate: slot.forecastDate,
        deliveryDate: slot.deliveryDate,
        windowStart,
        tier,
        tierGoal,
        tierBooked: tierTally,
        model: selectedModel,
        modelTarget: perModelTarget,
        modelBooked: modelTally,
        recommendation,
        projectedModelCount: modelTally + (selectedModel ? 1 : 0),
      });
    });

    return plans;
  }, [
    analysisByModel,
    currentStockTotal,
    dealerSlug,
    prioritizedEmptySlots,
    shareTargets,
    modelRows,
    monthBuckets,
    schedule,
    yardCapacityStats.maxCapacity,
    yardCapacityStats.minVanVolume,
  ]);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        orders={sidebarOrders}
        selectedDealer="locked"
        onDealerSelect={() => {}}
        hideOtherDealers={true}
        currentDealerName={dealerDisplayName}
        showStats={false}
      />

      <div className="flex-1 overflow-auto">
        <div className="p-4 md:p-6 lg:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Inventory Management</h2>
            </div>
          </div>

          <Card className="relative overflow-hidden border border-slate-200 bg-gradient-to-r from-sky-50 via-white to-indigo-50 shadow-md">
            <CardHeader className="relative pb-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="text-3xl font-semibold text-slate-900">{dealerDisplayName}</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Current Yard Stock</p>
                  <div className="mt-2 flex items-end gap-2 text-3xl font-semibold text-slate-900">
                    <span>{currentStockTotal ?? "—"}</span>
                    <span className="text-sm font-medium text-slate-500">vans</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Live yard stock across all models.</p>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Target Max</p>
                  <div className="mt-2 flex items-end gap-2 text-3xl font-semibold text-slate-900">
                    <span>{yardCapacityStats.maxCapacity ?? "—"}</span>
                    <span className="text-sm font-medium text-slate-500">vans</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Configured yard capacity limit.</p>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Target Min</p>
                  <div className="mt-2 flex items-end gap-2 text-3xl font-semibold text-slate-900">
                    <span>{yardCapacityStats.minVanVolume ?? "—"}</span>
                    <span className="text-sm font-medium text-slate-500">vans</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Minimum on-yard volume for a healthy pipeline.</p>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-700">
                  <div className="flex flex-col">
                    <span className="text-xs uppercase tracking-wide text-slate-500">Yard Fill</span>
                    {capacityPercent != null ? (
                      <span className="text-lg font-semibold">{capacityPercent}% utilised</span>
                    ) : (
                      <span className="text-lg font-semibold">Capacity data not set</span>
                    )}
                  </div>
                  {remainingCapacity != null && (
                    <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 shadow-sm">
                      {remainingCapacity >= 0 ? `${remainingCapacity} slots free` : `${Math.abs(remainingCapacity)} over capacity`}
                    </div>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-end text-xs font-semibold text-slate-600">
                  {barMax > 0 && (
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 shadow-sm">Scale to max {Math.ceil(barMax)}</span>
                  )}
                </div>
                <div className="mt-2">
                  <div className="relative h-12 w-full overflow-visible rounded-full bg-slate-100 shadow-inner">
                    <div className="absolute inset-y-0 left-0 flex overflow-visible">
                      <div
                        className="h-full rounded-l-full bg-gradient-to-r from-emerald-300 via-sky-300 to-indigo-300 shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
                        style={{ width: `${stockFillPercent}%` }}
                      />
                      <div
                        className="absolute left-0 top-0 h-full rounded-r-full bg-amber-300/80 shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
                        style={{ left: `${stockFillPercent}%`, width: `${customerFillPercent}%` }}
                      />
                    </div>

                    {yardStockBreakdown.stockCount > 0 && (
                      <div
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-slate-800 shadow"
                        style={{ left: `${stockFillPercent / 2}%` }}
                      >
                        Stock: {yardStockBreakdown.stockCount}
                      </div>
                    )}

                    {yardStockBreakdown.customerCount > 0 && (
                      <div
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-amber-900 shadow"
                        style={{ left: `${stockFillPercent + customerFillPercent / 2}%` }}
                      >
                        Customer: {yardStockBreakdown.customerCount}
                      </div>
                    )}

                    {yardStockTotal > 0 && (
                      <div
                        className="absolute -top-7 -translate-x-1/2 whitespace-nowrap rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-900 shadow-sm"
                        style={{ left: `${totalFillPercent}%` }}
                      >
                        Total: {yardStockTotal}
                      </div>
                    )}

                    {yardCapacityStats.minVanVolume && minMarkerPercent != null && (
                      <div
                        className="absolute top-1/2 -translate-y-1/2"
                        style={{ left: `${minMarkerPercent}%` }}
                      >
                        <div className="h-6 w-px bg-rose-500/80" />
                        <div className="absolute left-1/2 top-6 -translate-x-1/2 whitespace-nowrap rounded border border-rose-100 bg-white px-2 py-0.5 text-[10px] font-semibold text-rose-600 shadow-sm">
                          Target Min: {yardCapacityStats.minVanVolume}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                  {yardCapacityStats.maxCapacity && (
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold shadow-sm">
                      Target Max: {yardCapacityStats.maxCapacity}
                    </span>
                  )}
                  {yardCapacityStats.minVanVolume && (
                    <span className="rounded-full border border-rose-100 bg-rose-50 px-3 py-1 font-semibold text-rose-700 shadow-sm">
                      Target Min: {yardCapacityStats.minVanVolume}
                    </span>
                  )}
                </div>
                {!yardCapacityStats.found && (
                  <p className="mt-2 text-xs italic text-amber-700">
                    No yardsize entry matched this dealer yet. Add Max/Min volumes in the yardsize feed to unlock full insights.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200">
            <CardHeader className="border-b border-slate-200 pb-4">
              <CardTitle className="text-lg font-semibold text-slate-900">Stock Min Checkpoint</CardTitle>
              <p className="text-sm text-slate-600">
                Anchored to the first empty slot: checks the prior 90/30 days and looks 90 days forward from today against the
                yard minimum.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {!firstEmptySlot ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  No empty slots within the planning window.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-500">First Empty Slot</div>
                      <div className="text-base font-semibold text-slate-900">
                        {firstEmptySlot.forecastDate.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}
                      </div>
                      <div className="text-xs text-slate-600">Expected delivery {monthFormatter.format(firstEmptySlot.deliveryDate)}</div>
                    </div>
                    <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                      Window anchored to production date (arrival +40 days)
                    </div>
                  </div>

                  {emptySlotStockAssessment && (
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">90 days before first empty</div>
                        <div className="mt-2 text-3xl font-semibold text-slate-900">{emptySlotStockAssessment.past90Stock}</div>
                        <p className="mt-1 text-sm text-slate-700">Stock arrivals before the empty slot.</p>
                        <div
                          className={`mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                            emptySlotStockAssessment.meets90 == null
                              ? "border border-slate-200 bg-slate-50 text-slate-700"
                              : emptySlotStockAssessment.meets90
                                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border border-rose-200 bg-rose-50 text-rose-700"
                          }`}
                        >
                          {emptySlotStockAssessment.meets90 == null
                            ? "Min target not set"
                            : emptySlotStockAssessment.meets90
                              ? `Reached 60% of min (${Math.round(emptySlotStockAssessment.min60Target || 0)})`
                              : `Below 60% of min (${Math.round(emptySlotStockAssessment.min60Target || 0)})`}
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">30 days before first empty</div>
                        <div className="mt-2 text-3xl font-semibold text-slate-900">{emptySlotStockAssessment.past30Stock}</div>
                        <p className="mt-1 text-sm text-slate-700">Recent arrivals leading into the slot.</p>
                        <div
                          className={`mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                            emptySlotStockAssessment.meets30 == null
                              ? "border border-slate-200 bg-slate-50 text-slate-700"
                              : emptySlotStockAssessment.meets30
                                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border border-rose-200 bg-rose-50 text-rose-700"
                          }`}
                        >
                          {emptySlotStockAssessment.meets30 == null
                            ? "Min target not set"
                            : emptySlotStockAssessment.meets30
                              ? `Reached 20% of min (${Math.round(emptySlotStockAssessment.min20Target || 0)})`
                              : `Below 20% of min (${Math.round(emptySlotStockAssessment.min20Target || 0)})`}
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Next 90 days (from today)</div>
                        <div className="mt-2 text-3xl font-semibold text-slate-900">{emptySlotStockAssessment.future90Stock}</div>
                        <p className="mt-1 text-sm text-slate-700">Upcoming stock that could restore the yard.</p>
                        <div
                          className={`mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                            emptySlotStockAssessment.meetsFuture90 == null
                              ? "border border-slate-200 bg-slate-50 text-slate-700"
                              : emptySlotStockAssessment.meetsFuture90
                                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border border-rose-200 bg-rose-50 text-rose-700"
                          }`}
                        >
                          {emptySlotStockAssessment.meetsFuture90 == null
                            ? "Min target not set"
                            : emptySlotStockAssessment.meetsFuture90
                              ? `Future window hits 60% of min (${Math.round(emptySlotStockAssessment.min60Target || 0)})`
                              : `Future window below 60% of min (${Math.round(emptySlotStockAssessment.min60Target || 0)})`}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200">
            <CardHeader className="border-b border-slate-200 pb-4">
              <CardTitle className="text-lg font-semibold text-slate-900">Restock Guidance</CardTitle>
              <p className="text-sm text-slate-600">
                Empty-slot ordering plan that balances tier targets (from Tier Config) over the prior 90 days.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-700">
                Upcoming empty stock slots and the orders needed to keep each tier on track over the previous 90 days.
              </p>
              {emptySlotPlans.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  No empty slots within the planning window.
                </div>
              ) : (
                <div className="overflow-auto">
                  <Table className="min-w-[980px] text-sm">
                    <TableHeader className="bg-slate-100/80">
                      <TableRow className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-700">
                        <TableHead className="text-left">Forecast Production</TableHead>
                        <TableHead className="text-left">Forecast Delivery</TableHead>
                        <TableHead className="text-left">90-day Requirement & Order</TableHead>
                        <TableHead className="text-left">Tier</TableHead>
                        <TableHead className="text-right">Post-order 90d Model Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {emptySlotPlans.map((slot) => (
                        <TableRow
                          key={slot.id}
                          className="border-b last:border-0 [&>td]:px-3 [&>td]:py-2 [&>th]:px-3 [&>th]:py-2"
                        >
                          <TableCell className="font-semibold text-slate-900">
                            {slot.forecastDate.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}
                          </TableCell>
                          <TableCell className="text-slate-900">
                            {monthFormatter.format(slot.deliveryDate)}
                          </TableCell>
                          <TableCell className="max-w-md space-y-0.5 text-slate-800">
                            <div className="font-semibold text-slate-900">
                              {slot.model || "Assign a tier model"}
                            </div>
                            <div className="text-xs leading-snug text-slate-600">{slot.recommendation}</div>
                          </TableCell>
                          <TableCell className="font-semibold text-slate-900">{slot.tier}</TableCell>
                          <TableCell className="text-right font-semibold text-slate-900">
                            {slot.projectedModelCount}
                            <div className="text-xs font-medium text-slate-500">
                              After order (current {slot.modelBooked})
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200">
            <CardHeader className="border-b border-slate-200 pb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-lg font-semibold text-slate-900">Stock Model Outlook</CardTitle>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700">
                  <span className="uppercase tracking-wide text-slate-500">Sort by</span>
                  {[{ key: "currentStock", label: "Current Yard Stock" }, { key: "recentHandover", label: "Handover (Last 3 Months)" }, { key: "recentPgi", label: "Factory PGI (Last 3 Months)" }].map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setSortKey(option.key as typeof sortKey)}
                      className={`rounded-full border px-3 py-1 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-300 ${
                        sortKey === option.key
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <select
                  value={modelRangeFilter}
                  onChange={(e) => setModelRangeFilter(e.target.value)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  <option value="">Model Range (all)</option>
                  {filterOptions.ranges.map((range) => (
                    <option key={range} value={range}>
                      {range}
                    </option>
                  ))}
                </select>
                <select
                  value={modelFilter}
                  onChange={(e) => setModelFilter(e.target.value)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  <option value="">Model (all)</option>
                  {filterOptions.models.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
                <select
                  value={tierFilter}
                  onChange={(e) => setTierFilter(e.target.value)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  <option value="">Tier (all)</option>
                  {filterOptions.tiers.map((tier) => (
                    <option key={tier} value={tier}>
                      {tier}
                    </option>
                  ))}
                </select>
              </div>
            </CardHeader>
            <CardContent className="overflow-auto">
              {showFootnotes.length > 0 && (
                <div className="mb-4 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Show activations</div>
                  <div className="flex flex-wrap items-center gap-2">
                    {showFootnotes.map(({ index, show }) => (
                      <span
                        key={`${show.id}-${index}`}
                        className="inline-flex items-center gap-2 rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-900 shadow-sm"
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-600 text-xs font-bold text-white shadow-inner">
                          {index}
                        </span>
                        <span className="font-semibold text-amber-900">{show.name || "Show"}</span>
                        <span className="text-xs text-amber-800">{formatShowDate(show.startDate)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <Table className="min-w-[1150px] text-sm">
                <TableHeader className="bg-slate-100/80">
                  <TableRow className="border-b border-slate-200">
                    <TableHead colSpan={3} className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                      Model Info
                    </TableHead>
                    <TableHead
                      colSpan={3}
                      className="border-l border-slate-200 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-700"
                    >
                      Yard Snapshot
                    </TableHead>
                    <TableHead
                      colSpan={monthBuckets.length + 1}
                      className="border-l border-slate-200 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-700"
                    >
                      Inbound Schedule
                    </TableHead>
                  </TableRow>
                  <TableRow className="border-b border-amber-200/80 bg-amber-50/60">
                    <TableHead
                      colSpan={6}
                      className="pl-3 text-left text-[11px] font-semibold uppercase tracking-wide text-amber-800"
                    >
                      Show markers
                    </TableHead>
                    {monthBuckets.map((bucket, idx) => (
                      <TableHead
                        key={`markers-${bucket.label}`}
                        className={`text-right ${idx === 0 ? "border-l border-amber-200/80" : ""}`}
                      >
                        {monthShowMarkers[idx].length > 0 ? (
                          <div className="flex flex-wrap justify-end gap-2">
                            {monthShowMarkers[idx].map((marker) => (
                              <span
                                key={`${bucket.label}-marker-${marker}`}
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-200 text-base font-extrabold text-amber-900 shadow-[0_0_0_1px_rgba(217,119,6,0.45)]"
                              >
                                {marker}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11px] font-semibold text-amber-300">—</span>
                        )}
                      </TableHead>
                    ))}
                    <TableHead className="text-right text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                      Total
                    </TableHead>
                  </TableRow>
                  <TableRow className="border-b border-slate-200">
                    <TableHead className="w-[72px] text-xs uppercase tracking-wide text-slate-600">Tier</TableHead>
                    <TableHead className="w-[140px] max-w-[140px] text-xs uppercase tracking-wide text-slate-600">Stock Model</TableHead>
                    <TableHead className="w-[104px] text-right text-xs uppercase tracking-wide text-slate-600">Standard Price</TableHead>
                    <TableHead className="w-[110px] border-l border-slate-200 text-right text-xs uppercase tracking-wide text-slate-600">
                      Current Yard Stock
                    </TableHead>
                    <TableHead className="w-[118px] text-right text-xs uppercase tracking-wide text-red-600">Handover (Last 3 Months)</TableHead>
                    <TableHead className="w-[118px] text-right text-xs uppercase tracking-wide text-slate-600">Factory PGI (Last 3 Months)</TableHead>
                    {monthBuckets.map((bucket, idx) => (
                      <TableHead
                        key={bucket.label}
                        className={`w-[90px] text-right text-[13px] uppercase tracking-wide text-slate-700 ${idx === 0 ? "border-l border-slate-200" : ""}`}
                      >
                        <span className="block text-right text-xs font-semibold text-slate-800">{bucket.label}</span>
                      </TableHead>
                    ))}
                    <TableHead className="w-[90px] text-right text-xs uppercase tracking-wide text-slate-700">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7 + monthBuckets.length}>
                        <div className="py-6 text-center text-slate-500">No stock models in yard inventory.</div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      <TableRow className="border-b border-slate-300/80 bg-slate-100 text-slate-900">
                        <TableCell className="font-semibold">Total</TableCell>
                        <TableCell className="font-semibold">—</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">—</TableCell>
                        <TableCell className="border-l border-slate-300 text-right font-semibold tabular-nums">{totalsRow.currentStock}</TableCell>
                        <TableCell className="text-right font-semibold text-red-600 tabular-nums">{totalsRow.recentHandover}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{totalsRow.recentPgi}</TableCell>
                        {totalsRow.incoming.map((val, idx) => (
                          <TableCell key={`total-${idx}`} className={`text-right font-semibold tabular-nums ${idx === 0 ? "border-l border-slate-300" : ""}`}>
                            {val}
                          </TableCell>
                        ))}
                        <TableCell className="text-right font-semibold tabular-nums">
                          {totalsRow.incoming.reduce((sum, v) => sum + (v || 0), 0)}
                        </TableCell>
                      </TableRow>
                      {filteredRows.map((row, idx) => {
                        const colors = tierColor(row.tier);
                        const inboundTotal = row.incoming.reduce((sum, v) => sum + (v || 0), 0);
                        return (
                          <TableRow
                            key={row.model}
                            className={`border-b border-slate-200/70 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"} hover:bg-slate-50 ${colors.bg}`}
                          >
                            <TableCell className="align-middle">
                              {row.tier ? (
                                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${colors.pill}`}>{row.tier}</span>
                              ) : (
                                <span className="text-xs text-slate-500">—</span>
                              )}
                            </TableCell>
                            <TableCell className={`max-w-[140px] whitespace-normal font-semibold leading-tight text-slate-900 ${colors.text}`}>
                              {row.model}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-slate-900 tabular-nums">
                              {formatStandardPrice(row.standardPrice)}
                            </TableCell>
                            <TableCell className="border-l border-slate-200 text-right font-semibold text-slate-900 tabular-nums">{row.currentStock}</TableCell>
                            <TableCell className="text-right font-semibold text-red-600 tabular-nums">{row.recentHandover}</TableCell>
                            <TableCell className="text-right font-semibold text-slate-900 tabular-nums">{row.recentPgi}</TableCell>
                            {monthBuckets.map((_, monthIdx) => (
                              <TableCell
                                key={`${row.model}-${monthIdx}`}
                                className={`text-right font-medium text-slate-800 tabular-nums ${monthIdx === 0 ? "border-l border-slate-200" : ""}`}
                              >
                                {row.incoming[monthIdx] ?? 0}
                              </TableCell>
                            ))}
                            <TableCell className="text-right font-semibold text-slate-900 tabular-nums">{inboundTotal}</TableCell>
                          </TableRow>
                        );
                      })}
                    </>
                  )}
                </TableBody>
              </Table>
            </CardContent>
            </Card>
            {prioritizedTierModels.length > 0 && (
              <Card className="shadow-sm border-slate-200">
              <CardHeader className="border-b border-slate-200 pb-4">
                <CardTitle className="text-lg font-semibold text-slate-900">Priority Inventory</CardTitle>
                <p className="text-sm text-slate-600">
                  Tiers A1, A1+, A2, and B1 appear together so the core range, flagship showcase, supporting structures, and niche
                  bets stay aligned with strategy.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {prioritizedTierModels.map(({ tier, models }) => {
                  const colors = tierColor(tier);
                  const tierMeta = tierTargets[tier];
                  return (
                    <div
                      key={tier}
                      className={`rounded-2xl border ${colors.border} bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04)] transition hover:shadow-[0_6px_24px_rgba(15,23,42,0.08)]`}
                    >
                      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${colors.pill}`}>Tier {tier}</span>
                          {tierMeta && (
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{tierMeta.label}</span>
                          )}
                        </div>
                        {tierMeta?.role && <span className="text-sm text-slate-600">{tierMeta.role}</span>}
                      </div>

                      <div className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {models.map((entry) => {
                            const modelLabel = toStr((entry as any)?.model || (entry as any)?.Model || "").trim() || "Unknown Model";
                            const key = `${tier}-${modelLabel}`;
                            const isOpen = expandedModel === key;
                            return (
                              <div key={key} className="min-w-[180px]">
                                <button
                                  type="button"
                                  onClick={() => setExpandedModel(isOpen ? null : key)}
                                  className={`group inline-flex w-full items-center justify-between gap-2 rounded-full border ${colors.border} bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-300`}
                                >
                                  <span className="truncate">{modelLabel}</span>
                                  {isOpen ? (
                                    <ChevronUp className="h-4 w-4 text-slate-500 group-hover:text-slate-700" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4 text-slate-500 group-hover:text-slate-700" />
                                  )}
                                </button>
                                {isOpen && (
                                  <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 shadow-inner">
                                    {entry.function_layout && (
                                      <div className="mb-2">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Functional Layout</div>
                                        <p className="mt-1 leading-relaxed text-slate-800">{entry.function_layout}</p>
                                      </div>
                                    )}
                                    {entry.key_strengths && (
                                      <div className="mb-2">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Key Strengths</div>
                                        <p className="mt-1 leading-relaxed text-slate-800">{entry.key_strengths}</p>
                                      </div>
                                    )}
                                    {entry.strategic_role && (
                                      <div>
                                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Strategic Role</div>
                                        <p className="mt-1 leading-relaxed text-slate-800">{entry.strategic_role}</p>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
