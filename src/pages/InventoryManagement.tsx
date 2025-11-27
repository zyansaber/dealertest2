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
    const priorities = ["A1+", "A1", "A2", "B1"];
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
                <CardTitle className="text-lg font-semibold text-slate-900">Product Inventory Tiers</CardTitle>
                <p className="text-sm text-slate-600">
                  A1+, A1, A2, and B1 tiers displayed together. Click a model to view its functional layout, key strengths, and
                  strategic role.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                  <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 pb-3">
                    {prioritizedTierModels.map(({ tier }) => {
                      const colors = tierColor(tier);
                      return (
                        <span key={tier} className={`text-xs font-semibold px-3 py-1 rounded-full ${colors.pill}`}>
                          {tier}
                        </span>
                      );
                    })}
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {prioritizedTierModels.flatMap(({ tier, models }) => {
                      const colors = tierColor(tier);
                      return models.map((entry) => {
                        const modelLabel = toStr((entry as any)?.model || (entry as any)?.Model || "").trim() || "Unknown Model";
                        const isOpen = expandedModel === modelLabel;
                        return (
                          <div key={`${tier}-${modelLabel}`} className="flex-1 min-w-[220px]">
                            <button
                              type="button"
                              onClick={() => setExpandedModel(isOpen ? null : modelLabel)}
                              className={`w-full rounded-lg border ${colors.border} bg-white px-3 py-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-300`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <div className="text-sm font-semibold text-slate-900">{modelLabel}</div>
                                  <div className="text-xs text-slate-600">Tier {tier}</div>
                                </div>
                                {isOpen ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                              </div>
                            </button>
                            {isOpen && (
                              <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-sm">
                                {entry.function_layout && (
                                  <div className="mb-2">
                                    <div className="font-semibold text-slate-900">Functional Layout</div>
                                    <p className="leading-relaxed">{entry.function_layout}</p>
                                  </div>
                                )}
                                {entry.key_strengths && (
                                  <div className="mb-2">
                                    <div className="font-semibold text-slate-900">Key Strengths</div>
                                    <p className="leading-relaxed">{entry.key_strengths}</p>
                                  </div>
                                )}
                                {entry.strategic_role && (
                                  <div>
                                    <div className="font-semibold text-slate-900">Strategic Role</div>
                                    <p className="leading-relaxed">{entry.strategic_role}</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      });
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="shadow-sm border-slate-200">
            <CardHeader className="border-b border-slate-200 pb-4">
              <CardTitle className="text-lg font-semibold text-slate-900">Stock Model Outlook</CardTitle>
            </CardHeader>
            <CardContent className="overflow-auto">
              <Table className="min-w-[920px] text-sm table-fixed">
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="w-[80px] font-semibold text-slate-700">Tier</TableHead>
                    <TableHead className="w-[180px] font-semibold text-slate-700">Stock Model</TableHead>
                    <TableHead className="w-[140px] text-right font-semibold text-slate-700">Current Yard Stock</TableHead>
                    <TableHead className="w-[160px] text-right font-semibold text-red-600">Handover (Last 3 Months)</TableHead>
                    <TableHead className="w-[160px] text-right font-semibold text-slate-700">Factory PGI (Last 3 Months)</TableHead>
                    {monthBuckets.map((bucket) => (
                      <TableHead key={bucket.label} className="text-right font-semibold text-slate-700">
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
                    modelRows.map((row) => {
                      const colors = tierColor(row.tier);
                      return (
                        <TableRow key={row.model} className={`hover:bg-slate-50/80 ${colors.bg}`}>
                          <TableCell className="font-medium text-slate-900">
                            {row.tier ? (
                              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${colors.pill}`}>{row.tier}</span>
                            ) : (
                              <span className="text-xs text-slate-500">—</span>
                            )}
                          </TableCell>
                          <TableCell className={`font-medium ${colors.text}`}>{row.model}</TableCell>
                          <TableCell className="text-right text-slate-800">{row.currentStock}</TableCell>
                          <TableCell className="text-right font-semibold text-red-600">{row.recentHandover}</TableCell>
                          <TableCell className="text-right text-slate-800">{row.recentPgi}</TableCell>
                          {monthBuckets.map((_, idx) => (
                            <TableCell key={`${row.model}-${idx}`} className="text-right text-slate-800">
                              {row.incoming[idx] ?? 0}
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
