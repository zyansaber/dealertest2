// src/pages/InventoryManagement.tsx
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
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
  type ModelAnalysisRecord,
} from "@/lib/firebase";
import { normalizeDealerSlug, prettifyDealerName } from "@/lib/dealerUtils";
import type { ScheduleItem } from "@/types";

type AnyRecord = Record<string, any>;

type ModelStats = {
  currentStock: number;
  recentPgi: number;
  recentHandover: number;
  incoming: number[]; // six months
  tier?: string;
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

const monthFormatter = new Intl.DateTimeFormat("en-AU", { month: "short", year: "numeric" });

const toStr = (v: unknown) => String(v ?? "");
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
  if (/^SRC22F\s*\(2\/3\s*bunks\)$/i.test(text)) {
    return ["SRC22F 2 bunks", "SRC22F 3 bunks"];
  }
  return [text];
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

export default function InventoryManagement() {
  const { dealerSlug: rawDealerSlug, selectedDealerSlug } = useParams<{ dealerSlug: string; selectedDealerSlug?: string }>();

  const dealerSlug = useMemo(
    () => normalizeDealerSlug(selectedDealerSlug || rawDealerSlug || ""),
    [rawDealerSlug, selectedDealerSlug]
  );

  const [yardStock, setYardStock] = useState<Record<string, AnyRecord>>({});
  const [pgiRecords, setPgiRecords] = useState<Record<string, AnyRecord>>({});
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [handoverRecords, setHandoverRecords] = useState<Record<string, AnyRecord>>({});
  const [modelAnalysis, setModelAnalysis] = useState<Record<string, ModelAnalysisRecord> | ModelAnalysisRecord[] | null>(null);

  useEffect(() => {
    let unsubYard: (() => void) | undefined;
    let unsubHandover: (() => void) | undefined;
    let unsubModelAnalysis: (() => void) | undefined;
    if (dealerSlug) {
      unsubYard = subscribeToYardStock(dealerSlug, (data) => setYardStock(data || {}));
      unsubHandover = subscribeToHandover(dealerSlug, (data) => setHandoverRecords(data || {}));
    }
    unsubModelAnalysis = subscribeToModelAnalysis((data) => setModelAnalysis(data || {}));
    const unsubPgi = subscribeToPGIRecords((data) => setPgiRecords(data || {}));
    const unsubSchedule = subscribeToSchedule(
      (data) => setSchedule(Array.isArray(data) ? data : []),
      { includeNoChassis: true, includeNoCustomer: true, includeFinished: true }
    );

    return () => {
      unsubYard?.();
      unsubHandover?.();
      unsubModelAnalysis?.();
      unsubPgi?.();
      unsubSchedule?.();
    };
  }, [dealerSlug]);

  const analysisByModel = useMemo(() => {
    const map: Record<string, ModelAnalysisRecord> = {};
    const values = Array.isArray(modelAnalysis)
      ? (modelAnalysis as ModelAnalysisRecord[])
      : Object.values((modelAnalysis || {}) as Record<string, ModelAnalysisRecord>);

    values.forEach((entry) => {
      if (!entry) return;
      const model = toStr((entry as any)?.model || (entry as any)?.Model).trim();
      if (!model) return;
      map[model.toLowerCase()] = entry;
    });

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

  const monthBuckets = useMemo<MonthBucket[]>(() => {
    const start = startOfMonth(addMonths(new Date(), 1));
    return Array.from({ length: 6 }, (_, i) => {
      const bucketStart = startOfMonth(addMonths(start, i));
      const end = startOfMonth(addMonths(bucketStart, 1));
      return {
        start: bucketStart,
        end,
        label: monthFormatter.format(bucketStart),
      };
    });
  }, []);

  const modelRows = useMemo(() => {
    const modelMap = new Map<string, ModelStats>();

    const ensureModel = (model: string) => {
      if (!modelMap.has(model)) {
        modelMap.set(model, { currentStock: 0, recentPgi: 0, recentHandover: 0, incoming: Array(6).fill(0) });
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

      const model = toStr((rec.model ?? (scheduleMatch as any)?.Model) ?? "Unknown").trim() || "Unknown";
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
      const model = toStr(((rec as any)?.model ?? (scheduleMatch as any)?.Model) ?? "Unknown").trim() || "Unknown";
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
      const model =
        toStr((rec as any)?.model ?? (scheduleMatch as any)?.Model ?? (scheduleMatch as any)?.model ?? "Unknown").trim() ||
        "Unknown";
      const stats = ensureModel(model);
      stats.recentHandover += 1;
    });

    const horizonStart = monthBuckets[0]?.start;
    const horizonEnd = monthBuckets[monthBuckets.length - 1]?.end;
    if (horizonStart && horizonEnd) {
      schedule.forEach((item) => {
        const dealerMatches = slugifyDealerName((item as any)?.Dealer) === dealerSlug || !dealerSlug;
        if (!dealerMatches) return;
        const customer = (item as any)?.Customer;
        if (isStockCustomer(customer)) return;
        const model = toStr((item as any)?.Model || "").trim();
        if (!model) return;
        if (!modelMap.has(model)) return;

        const forecastRaw =
          (item as any)?.["Forecast Melbourne Factory Start Date"] ??
          (item as any)?.["Forecast Production Date"] ??
          (item as any)?.["Forecast production date"];
        const forecastDate = parseDate(forecastRaw);
        if (!forecastDate) return;
        const arrivalDate = addDays(forecastDate, 30);
        if (arrivalDate < horizonStart || arrivalDate >= horizonEnd) return;

        const monthIndex = monthBuckets.findIndex((bucket) => arrivalDate >= bucket.start && arrivalDate < bucket.end);
        if (monthIndex >= 0) {
          const stats = ensureModel(model);
          stats.incoming[monthIndex] += 1;
        }
      });
    }

    return Array.from(modelMap.entries())
      .map(([model, stats]) => {
        const tier = normalizeTierCode(
          analysisByModel[model.toLowerCase()]?.tier || analysisByModel[model.toLowerCase()]?.Tier
        );
        return { model, ...stats, tier };
      })
      .sort((a, b) => b.currentStock - a.currentStock || a.model.localeCompare(b.model));
  }, [analysisByModel, dealerSlug, handoverRecords, monthBuckets, pgiRecords, schedule, scheduleByChassis, yardStock]);

  const dealerDisplayName = useMemo(() => prettifyDealerName(dealerSlug), [dealerSlug]);
  const sidebarOrders = useMemo(() => schedule.filter((item) => slugifyDealerName((item as any)?.Dealer) === dealerSlug), [schedule, dealerSlug]);

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

  const tierTargets: Record<string, { label: string; role: string; minimum: number; ceiling?: number }> = {
    A1: { label: "Core", role: "Never run dry; keep multiple couple options visible.", minimum: 3 },
    "A1+": { label: "Flagship", role: "Prioritise showcase quality; always have a demo.", minimum: 1 },
    A2: { label: "Supporting", role: "Fill structural gaps like family bunk and hybrid.", minimum: 1 },
    B1: { label: "Niche", role: "Tightly control volume; refresh quickly.", minimum: 0, ceiling: 1 },
  };

  const tierAggregates = useMemo(() => {
    const totals: Record<string, { stock: number; incoming: number[] }> = {};
    Object.keys(tierTargets).forEach((tier) => {
      totals[tier] = { stock: 0, incoming: Array(monthBuckets.length).fill(0) };
    });

    modelRows.forEach((row) => {
      const tier = normalizeTierCode(row.tier);
      if (!tier || !totals[tier]) return;
      totals[tier].stock += row.currentStock;
      row.incoming.forEach((val, idx) => {
        totals[tier].incoming[idx] = (totals[tier].incoming[idx] || 0) + (val || 0);
      });
    });

    return totals;
  }, [modelRows, monthBuckets.length]);

  const emptySlots = useMemo<EmptySlot[]>(() => {
    return schedule
      .filter((item) => slugifyDealerName((item as any)?.Dealer) === dealerSlug)
      .filter((item) => {
        const hasDealer = toStr((item as any)?.Dealer).trim() !== "";
        const lacksChassis = !hasKey(item, "Chassis");
        return hasDealer && lacksChassis;
      })
      .map((item) => {
        const forecastRaw =
          (item as any)?.["Forecast Production Date"] ||
          (item as any)?.["Forecast production date"] ||
          (item as any)?.["Forecast Production date"];
        const forecastDate = parseDate(forecastRaw);
        if (!forecastDate) return null;
        return { item, forecastDate, deliveryDate: addDays(forecastDate, 40) };
      })
      .filter(Boolean) as EmptySlot[];
  }, [dealerSlug, schedule]);

  const emptySlotRecommendations = useMemo(() => {
    if (monthBuckets.length === 0) return [] as string[];

    const slotsByMonth = monthBuckets.map(() => 0);
    emptySlots.forEach((slot) => {
      const monthIndex = monthBuckets.findIndex(
        (bucket) => slot.deliveryDate >= bucket.start && slot.deliveryDate < bucket.end
      );
      if (monthIndex >= 0) slotsByMonth[monthIndex] += 1;
    });

    const priorities = ["A1", "A1+", "A2", "B1"];
    const suggestions: string[] = [];

    slotsByMonth.forEach((count, idx) => {
      if (count === 0) return;
      const available: Record<string, number> = {};
      priorities.forEach((tier) => {
        const totals = tierAggregates[tier] || { stock: 0, incoming: [] };
        available[tier] = totals.stock + (totals.incoming[idx] || 0);
      });

      const assignments: Record<string, number> = {};
      for (let i = 0; i < count; i += 1) {
        const targetTier = priorities.find((tier) => available[tier] < (tierTargets[tier]?.minimum ?? 0)) || "A1";
        assignments[targetTier] = (assignments[targetTier] || 0) + 1;
        available[targetTier] += 1;
      }

      const parts = priorities
        .filter((tier) => assignments[tier])
        .map(
          (tier) =>
            `${assignments[tier]} × ${tier} (${tierTargets[tier]?.label ?? ""}${tierTargets[tier]?.label ? "" : ""})`
        );

      if (parts.length > 0) {
        suggestions.push(`${monthBuckets[idx].label}: fill ${parts.join(", ")} to cover empty slots.`);
      }
    });

    return suggestions;
  }, [emptySlots, monthBuckets, tierAggregates, tierTargets]);

  const aiControlInsights = useMemo(() => {
    const insights: string[] = [];

    const emptySlotTotal = emptySlots.length;
    if (emptySlotTotal > 0) {
      insights.push(
        `${emptySlotTotal} empty production slot${emptySlotTotal === 1 ? " is" : "s are"} available—fill them with the highest-priority shortfalls below.`
      );
    }

    Object.entries(tierTargets).forEach(([tier, meta]) => {
      const aggregates = tierAggregates[tier] || { stock: 0, incoming: Array(monthBuckets.length).fill(0) };
      const nearInbound = aggregates.incoming.slice(0, 2).reduce((sum, v) => sum + (v || 0), 0);
      const coverNext60 = aggregates.stock + nearInbound;
      const min = meta.minimum ?? 0;

      if (coverNext60 < min) {
        insights.push(
          `Tier ${tier} ${meta.label}: short ${min - coverNext60} over the next 60 days—allocate earliest slots to restore yard coverage.`
        );
        return;
      }

      if (meta.ceiling !== undefined && coverNext60 > meta.ceiling) {
        insights.push(
          `Tier ${tier} ${meta.label}: tracking ${coverNext60 - meta.ceiling} above the ceiling—slow future allocations and rotate ageing stock first.`
        );
        return;
      }

      const thirdMonthInbound = aggregates.incoming[2] || 0;
      if (thirdMonthInbound === 0 && coverNext60 === min) {
        insights.push(
          `Tier ${tier} ${meta.label}: just on the minimum with no third-month cover—secure at least one slot in month three to avoid gaps.`
        );
        return;
      }

      insights.push(`Tier ${tier} ${meta.label}: balanced—keep demo rotation and monitor month-three arrivals.`);
    });

    return insights;
  }, [emptySlots.length, monthBuckets.length, tierAggregates, tierTargets]);

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
              <p className="text-sm text-slate-600">
                Yard stock strategy overview by model, PGI trend, and six-month inbound outlook.
              </p>
            </div>
          </div>

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

          <Card className="shadow-sm border-slate-200">
            <CardHeader className="border-b border-slate-200 pb-4">
              <CardTitle className="text-lg font-semibold text-slate-900">AI Restock Guidance</CardTitle>
              <p className="text-sm text-slate-600">
                Draft capture advice based on current yard stock, inbound builds, and the empty slots timeline.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                {Object.entries(tierTargets).map(([tier, meta]) => {
                  const colors = tierColor(tier);
                  const aggregates = tierAggregates[tier] || { stock: 0, incoming: Array(monthBuckets.length).fill(0) };
                  const nearTermInbound = aggregates.incoming.slice(0, 2).reduce((sum, v) => sum + (v || 0), 0);
                  return (
                    <div
                      key={tier}
                      className={`flex items-start gap-3 rounded-xl border ${colors.border} bg-white/70 px-4 py-3 shadow-[0_1px_3px_rgba(15,23,42,0.08)]`}
                    >
                      <div className={`mt-0.5 h-8 w-8 flex items-center justify-center rounded-full ${colors.pill} font-bold`}>
                        {tier}
                      </div>
                      <div className="space-y-1 text-sm text-slate-700">
                        <div className="flex items-center gap-2 font-semibold text-slate-900">
                          <span>{meta.label}</span>
                          <span className="text-xs font-medium text-slate-500">Min {meta.minimum}{meta.ceiling !== undefined ? ` • Max ${meta.ceiling}` : ""}</span>
                        </div>
                        <p className="text-slate-600 leading-relaxed">{meta.role}</p>
                        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                          <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-800">Stock now: {aggregates.stock}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-800">Inbound (next 2 mo): {nearTermInbound}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  Empty slot capture suggestions
                </div>
                {emptySlotRecommendations.length === 0 ? (
                  <p className="text-slate-600">No empty slots on the horizon; keep monitoring the schedule.</p>
                ) : (
                  <ul className="list-disc space-y-1 pl-5">
                    {emptySlotRecommendations.map((item) => (
                      <li key={item} className="leading-relaxed text-slate-800">
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-2 rounded-xl border border-indigo-200 bg-white p-4 text-sm text-slate-700 shadow-inner">
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <AlertCircle className="h-4 w-4 text-indigo-500" />
                  AI control insights
                </div>
                <p className="text-slate-600">
                  Slow down and sanity-check the inbound plan: the assistant highlights where coverage is thin, balanced, or over-supplied
                  based on stock on hand and the next three months of arrivals.
                </p>
                <ul className="list-disc space-y-1 pl-5 text-slate-800">
                  {aiControlInsights.map((line) => (
                    <li key={line} className="leading-relaxed">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200">
            <CardHeader className="border-b border-slate-200 pb-4">
              <CardTitle className="text-lg font-semibold text-slate-900">Stock Model Outlook</CardTitle>
            </CardHeader>
            <CardContent className="overflow-auto">
              <Table className="min-w-[980px] text-sm">
                <TableHeader className="bg-slate-100/80">
                  <TableRow className="border-b border-slate-200">
                    <TableHead className="w-[90px] text-xs uppercase tracking-wide text-slate-600">Tier</TableHead>
                    <TableHead className="w-[200px] text-xs uppercase tracking-wide text-slate-600">Stock Model</TableHead>
                    <TableHead className="w-[140px] text-right text-xs uppercase tracking-wide text-slate-600">Current Yard Stock</TableHead>
                    <TableHead className="w-[150px] text-right text-xs uppercase tracking-wide text-red-600">Handover (Last 3 Months)</TableHead>
                    <TableHead className="w-[150px] text-right text-xs uppercase tracking-wide text-slate-600">Factory PGI (Last 3 Months)</TableHead>
                    {monthBuckets.map((bucket) => (
                      <TableHead key={bucket.label} className="text-right text-xs uppercase tracking-wide text-slate-600">
                        {bucket.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {modelRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5 + monthBuckets.length}>
                        <div className="py-6 text-center text-slate-500">No stock models in yard inventory.</div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    modelRows.map((row, idx) => {
                      const colors = tierColor(row.tier);
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
                          <TableCell className={`font-semibold text-slate-900 ${colors.text}`}>{row.model}</TableCell>
                          <TableCell className="text-right font-semibold text-slate-900 tabular-nums">{row.currentStock}</TableCell>
                          <TableCell className="text-right font-semibold text-red-600 tabular-nums">{row.recentHandover}</TableCell>
                          <TableCell className="text-right font-semibold text-slate-900 tabular-nums">{row.recentPgi}</TableCell>
                          {monthBuckets.map((_, monthIdx) => (
                            <TableCell
                              key={`${row.model}-${monthIdx}`}
                              className="text-right font-medium text-slate-800 tabular-nums"
                            >
                              {row.incoming[monthIdx] ?? 0}
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
