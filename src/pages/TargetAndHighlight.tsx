import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, ReferenceLine } from "recharts";

import OverallDashboardSidebar from "@/components/OverallDashboardSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  subscribeAllDealerConfigs,
  subscribeTargetHighlightConfig,
  subscribeToCampervanSchedule,
  subscribeToSchedule,
  subscribeToSchedule2024,
  subscribeToYardStockAll,
  subscribeToHandoverAll,
  subscribeOverallDashboardTierPlannerConfig,
  type TargetHighlightConfig,
  type OverallDashboardTierPlannerConfig,
} from "@/lib/firebase";
import { buildDealerRangeCounts2026 } from "@/lib/targetHighlight";
import type { CampervanScheduleItem, ScheduleItem } from "@/types";

type DealerChartRow = {
  dealer: string;
  result: number;
  target: number;
  difference: number;
};

type GapRow = {
  dealer: string;
  model: string;
  tier: string;
  yardIncoming: number;
  handover6mStock: number;
  requiredBy6m: number;
  gapBy6m: number;
};

const normalizeKey = (value: unknown) => String(value ?? "").trim().toLowerCase();
const toStr = (value: unknown) => String(value ?? "").trim();
const toNum = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const normalizeDealer = (value?: string) => toStr(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const normalizeDealerSlug = (raw?: string) => {
  const slug = normalizeDealer(raw);
  const match = slug.match(/^(.*?)-([a-z0-9]{6})$/);
  return match ? match[1] : slug;
};
const normalizeModel = (value?: string) => toStr(value).toUpperCase();
const normalizeChassis = (value?: string) => toStr(value).toUpperCase();
const normalizeChassisLoose = (value?: string) => normalizeChassis(value).replace(/[^A-Z0-9]/g, "");
const isStockCustomer = (customer?: string) => /stock$/i.test(toStr(customer));
const addMonths = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount);
  return next;
};
const addDays = (date: Date, count: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + count);
  return d;
};
const startOfDay = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};
const startOfMonth = (date: Date) => {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};
const parseDate = (value?: string) => {
  const raw = toStr(value);
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

const FACTORY_DEALER_NAMES = ["Frankston", "Launceston", "ST James", "Traralgon", "Geelong"];
const FACTORY_DEALER_SLUGS = new Set(FACTORY_DEALER_NAMES.map((name) => normalizeDealer(name)));
const STOCK_MODEL_OUTLOOK_YEAR = 2026;
const PLANNING_MONTHS = 8;

export default function TargetAndHighlight() {
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [schedule2024, setSchedule2024] = useState<ScheduleItem[]>([]);
  const [campervans, setCampervans] = useState<CampervanScheduleItem[]>([]);
  const [config, setConfig] = useState<TargetHighlightConfig | null>(null);
  const [dealerConfigs, setDealerConfigs] = useState<Record<string, any>>({});
  const [yardStockAll, setYardStockAll] = useState<Record<string, Record<string, any>>>({});
  const [handoverAll, setHandoverAll] = useState<Record<string, Record<string, any>>>({});
  const [tierConfig, setTierConfig] = useState<OverallDashboardTierPlannerConfig | null>(null);

  useEffect(() => {
    const scheduleOptions = { includeNoChassis: true, includeNoCustomer: true, includeFinished: true };
    const unsubSchedule = subscribeToSchedule((data) => setSchedule((data || []) as ScheduleItem[]), scheduleOptions);
    const unsubSchedule2024 = subscribeToSchedule2024((data) => setSchedule2024((data || []) as ScheduleItem[]), scheduleOptions);
    const unsubCamper = subscribeToCampervanSchedule((data) => setCampervans((data || []) as CampervanScheduleItem[]));
    const unsubConfig = subscribeTargetHighlightConfig((data) => setConfig(data));
    const unsubDealerConfigs = subscribeAllDealerConfigs((data) => setDealerConfigs(data || {}));
    const unsubYard = subscribeToYardStockAll((data) => setYardStockAll(data || {}));
    const unsubHandover = subscribeToHandoverAll((data) => setHandoverAll(data || {}));
    const unsubTier = subscribeOverallDashboardTierPlannerConfig((data) => setTierConfig(data || null));

    return () => {
      unsubSchedule?.();
      unsubSchedule2024?.();
      unsubCamper?.();
      unsubConfig?.();
      unsubDealerConfigs?.();
      unsubYard?.();
      unsubHandover?.();
      unsubTier?.();
    };
  }, []);

  const focusRanges = useMemo(() => config?.focusModelRanges || [], [config]);
  const rangeTargets = useMemo(() => config?.modelRangeTargets || {}, [config]);
  const modelTierAssignments = useMemo(() => tierConfig?.modelTierAssignments || {}, [tierConfig]);
  const activeTier = useMemo(() => String(tierConfig?.selectedTier || "tier1"), [tierConfig?.selectedTier]);
  const activeMultiplier6m = useMemo(() => toNum((tierConfig?.rules || {})?.[activeTier]?.handover6mMultiplier), [tierConfig, activeTier]);

  const dealerRangeCounts = useMemo(() => buildDealerRangeCounts2026(schedule, campervans), [schedule, campervans]);

  const activeDealers = useMemo(() => {
    return Object.entries(dealerConfigs)
      .map(([slug, cfg]) => ({
        slug,
        name: String(cfg?.name || slug),
        isActive: cfg?.isActive !== false,
      }))
      .filter((item) => item.isActive);
  }, [dealerConfigs]);

  const charts = useMemo(() => {
    const countsByNormalizedDealer = new Map<string, Record<string, number>>();
    Object.entries(dealerRangeCounts).forEach(([dealer, counts]) => {
      const key = normalizeKey(dealer);
      if (!key) return;
      countsByNormalizedDealer.set(key, counts || {});
    });

    return focusRanges.map((range) => {
      const targetPct = Number(rangeTargets[range] ?? 0) / 100;

      const rows: DealerChartRow[] = activeDealers
        .map((dealer) => {
          const byName = countsByNormalizedDealer.get(normalizeKey(dealer.name));
          const bySlug = countsByNormalizedDealer.get(normalizeKey(dealer.slug));
          const counts = byName || bySlug || {};

          const productionConfirmedTotal = Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
          const result = Number(counts[range] || 0);
          const target = Number((productionConfirmedTotal * targetPct).toFixed(2));
          const difference = Number((result - target).toFixed(2));

          return { dealer: dealer.name, result, target, difference };
        })
        .filter((row) => row.result > 0 || row.target > 0)
        .sort((a, b) => b.difference - a.difference);

      const totalResult = rows.reduce((sum, row) => sum + row.result, 0);
      const totalTarget = rows.reduce((sum, row) => sum + row.target, 0);
      const totalDifference = Number((totalResult - totalTarget).toFixed(2));

      return { range, rows, totalResult, totalTarget, totalDifference };
    });
  }, [activeDealers, dealerRangeCounts, focusRanges, rangeTargets]);

  const { scheduleByChassis, scheduleByChassisLoose } = useMemo(() => {
    const map: Record<string, any> = {};
    const looseMap: Record<string, any> = {};
    const register = (raw: unknown, order: any) => {
      const exact = normalizeChassis(String(raw ?? ""));
      if (exact) map[exact] = order;
      const loose = normalizeChassisLoose(String(raw ?? ""));
      if (loose) looseMap[loose] = order;
    };

    [...schedule, ...schedule2024].forEach((order) => {
      register((order as any)?.Chassis, order);
      register((order as any)?.chassis, order);
      register((order as any)?.chassisNumber, order);
      register((order as any)?.chassisnumber, order);
      register((order as any)?.["Chassis Number"], order);
    });

    return { scheduleByChassis: map, scheduleByChassisLoose: looseMap };
  }, [schedule, schedule2024]);

  const findScheduleMatch = (chassisLike?: string) => {
    const exact = normalizeChassis(chassisLike);
    if (exact && scheduleByChassis[exact]) return scheduleByChassis[exact];
    const loose = normalizeChassisLoose(chassisLike);
    if (loose && scheduleByChassisLoose[loose]) return scheduleByChassisLoose[loose];
    return undefined;
  };

  const monthBuckets = useMemo(() => {
    const base = startOfMonth(new Date(STOCK_MODEL_OUTLOOK_YEAR, 0, 1));
    return Array.from({ length: PLANNING_MONTHS }, (_, index) => {
      const start = startOfMonth(addMonths(base, index));
      return { start, end: startOfMonth(addMonths(start, 1)) };
    });
  }, []);

  const gapRows = useMemo(() => {
    const now = new Date();
    const sixMonthsAgo = startOfDay(addMonths(now, -6));
    const horizonStart = monthBuckets[0]?.start;
    const horizonEnd = monthBuckets[monthBuckets.length - 1]?.end;

    const map = new Map<string, { dealer: string; model: string; yard: number; incoming: number; handover6mStock: number }>();
    const ensure = (dealer: string, model: string) => {
      const key = `${dealer}__${model}`;
      if (!map.has(key)) map.set(key, { dealer, model, yard: 0, incoming: 0, handover6mStock: 0 });
      return map.get(key)!;
    };

    Object.entries(yardStockAll || {}).forEach(([dealerSlug, rows]) => {
      const dealer = normalizeDealerSlug(dealerSlug);
      if (!FACTORY_DEALER_SLUGS.has(dealer)) return;
      Object.entries(rows || {}).forEach(([chassis, payload]) => {
        if (chassis === "dealer-chassis") return;
        const scheduleMatch = findScheduleMatch(chassis);
        if (!isStockCustomer(toStr((scheduleMatch as any)?.Customer ?? (payload as any)?.customer))) return;
        const model = normalizeModel((payload as any)?.model || (scheduleMatch as any)?.Model);
        if (!model) return;
        ensure(dealer, model).yard += 1;
      });
    });

    if (horizonStart && horizonEnd) {
      schedule.forEach((order) => {
        if (!isStockCustomer((order as any)?.Customer)) return;
        const dealer = normalizeDealerSlug((order as any)?.Dealer);
        if (!FACTORY_DEALER_SLUGS.has(dealer)) return;
        const model = normalizeModel((order as any)?.Model);
        if (!model) return;
        const forecast = parseDate((order as any)?.["Forecast Production Date"]);
        if (!forecast) return;
        const arrival = addDays(forecast, 30);
        if (arrival.getFullYear() !== STOCK_MODEL_OUTLOOK_YEAR) return;
        if (arrival < horizonStart || arrival >= horizonEnd) return;
        ensure(dealer, model).incoming += 1;
      });
    }

    Object.entries(handoverAll || {}).forEach(([dealerSlug, rows]) => {
      const dealer = normalizeDealerSlug(dealerSlug);
      if (!FACTORY_DEALER_SLUGS.has(dealer)) return;
      Object.entries(rows || {}).forEach(([key, rec]: [string, any]) => {
        const date = parseDate(rec?.handoverAt || rec?.createdAt);
        if (!date || date < sixMonthsAgo) return;
        const chassis = normalizeChassis(rec?.__sourceChassis || rec?.chassis || rec?.chassisNumber || key);
        const scheduleMatch = findScheduleMatch(chassis);
        if (!isStockCustomer(toStr((scheduleMatch as any)?.Customer))) return;
        const model = normalizeModel(rec?.model || (scheduleMatch as any)?.Model);
        if (!model) return;
        ensure(dealer, model).handover6mStock += 1;
      });
    });

    return Array.from(map.values())
      .filter((row) => normalizeKey(modelTierAssignments[row.model]) === normalizeKey(activeTier))
      .map((row) => {
        const yardIncoming = row.yard + row.incoming;
        const requiredBy6m = row.handover6mStock * activeMultiplier6m;
        const gapBy6m = Math.ceil(requiredBy6m - yardIncoming);
        return {
          dealer: row.dealer,
          model: row.model,
          tier: activeTier,
          yardIncoming,
          handover6mStock: row.handover6mStock,
          requiredBy6m,
          gapBy6m,
        } as GapRow;
      })
      .filter((row) => row.gapBy6m > 0)
      .sort((a, b) => b.gapBy6m - a.gapBy6m);
  }, [activeMultiplier6m, activeTier, handoverAll, modelTierAssignments, monthBuckets, schedule, yardStockAll]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex">
        <OverallDashboardSidebar />
        <main className="flex-1 p-6">
          <div className="mx-auto max-w-7xl space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold">Target and Highlight</h1>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>2026 Schedule Production Confirmed vs Target (Focus Model Ranges)</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">
                Target base uses each dealer&apos;s current Production Confirmed in 2026 (records with chassis), multiplied by admin model-range percentage.
              </CardContent>
            </Card>

            {charts.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-slate-600">
                  No focus model range selected yet. Please configure in /overall-dashboard/admin.
                </CardContent>
              </Card>
            ) : (
              charts.map((chart) => (
                <Card key={chart.range}>
                  <CardHeader>
                    <CardTitle>
                      {chart.range} | Target {chart.totalTarget.toFixed(2)} | Total Result {chart.totalResult} | Total Difference {chart.totalDifference.toFixed(2)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[340px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chart.rows} margin={{ top: 10, right: 16, left: 0, bottom: 75 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="dealer" angle={-35} textAnchor="end" interval={0} height={90} />
                          <YAxis />
                          <Tooltip
                            formatter={(value: any, name: string) => {
                              const labelMap: Record<string, string> = {
                                result: "Result",
                                target: "Target",
                                difference: "Difference",
                              };
                              return [value, labelMap[name] || name];
                            }}
                          />
                          <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
                          <Bar dataKey="difference" radius={[6, 6, 0, 0]}>
                            {chart.rows.map((entry) => (
                              <Cell key={`${chart.range}-${entry.dealer}`} fill={entry.difference >= 0 ? "#16a34a" : "#dc2626"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}

            <Card>
              <CardHeader>
                <CardTitle>
                  Tier Gap (from requiredBy6m - (Yard + Incoming)) | Active tier: {activeTier.toUpperCase()} | Multiplier: {activeMultiplier6m}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tier</TableHead>
                      <TableHead>Dealer</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">Yard + Incoming</TableHead>
                      <TableHead className="text-right">Handover 6m (Stock)</TableHead>
                      <TableHead className="text-right">RequiredBy6m</TableHead>
                      <TableHead className="text-right">Gap</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gapRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-slate-500">No positive gap rows.</TableCell>
                      </TableRow>
                    ) : (
                      gapRows.slice(0, 300).map((row, idx) => (
                        <TableRow key={`${row.dealer}-${row.model}-${idx}`}>
                          <TableCell>{row.tier.toUpperCase()}</TableCell>
                          <TableCell>{row.dealer}</TableCell>
                          <TableCell>{row.model}</TableCell>
                          <TableCell className="text-right">{row.yardIncoming}</TableCell>
                          <TableCell className="text-right">{row.handover6mStock}</TableCell>
                          <TableCell className="text-right">{Math.ceil(row.requiredBy6m)}</TableCell>
                          <TableCell className="text-right font-semibold text-rose-600">+{row.gapBy6m}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
