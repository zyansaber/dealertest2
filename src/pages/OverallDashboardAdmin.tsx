import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  setOverallDashboardTierPlannerConfig,
  setTargetHighlightConfig,
  subscribeOverallDashboardTierPlannerConfig,
  subscribeTargetHighlightConfig,
  subscribeToHandoverAll,
  subscribeToSchedule,
  subscribeToYardStockAll,
  type OverallDashboardTierPlannerConfig,
  type TierRuleConfig,
} from "@/lib/firebase";
import { TARGET_MODEL_RANGES, toPercentValue } from "@/lib/targetHighlight";
import type { ScheduleItem } from "@/types";

const TIERS = ["tier1", "tier2", "tier3", "tier4"] as const;
const UNASSIGNED_TIER = "__unassigned__";

type TierKey = (typeof TIERS)[number];

type OrderModelStats = {
  model: string;
  total6m: number;
  total12m: number;
  stock6m: number;
  stock12m: number;
  customer6m: number;
  customer12m: number;
};

type DealerModelOutlook = {
  dealer: string;
  model: string;
  yard: number;
  incoming: number;
  handover6mStock: number;
  handover3mStock: number;
  capacityNow: number;
};

type TierGapRow = DealerModelOutlook & {
  tier: TierKey;
  basis: "handover6m" | "handover3m";
  required: number;
  gap: number;
};

type Tier1DealerDebugRow = DealerModelOutlook & {
  handover6mMultiplier: number;
  handover3mMultiplier: number;
  requiredBy6m: number;
  requiredBy3m: number;
  gapBy6m: number;
  gapBy3m: number;
};

type HandoverDebugRow = {
  dealer: string;
  model: string;
  chassis: string;
  handoverAt: string;
  scheduleCustomer: string;
  customerType: "Stock" | "Customer";
  in6m: boolean;
  in3m: boolean;
};

const toStr = (value: unknown) => String(value ?? "").trim();
const toNumber = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const normalizeDealer = (value?: string) =>
  toStr(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const normalizeDealerSlug = (raw?: string) => {
  const slug = normalizeDealer(raw);
  const match = slug.match(/^(.*?)-([a-z0-9]{6})$/);
  return match ? match[1] : slug;
};
const normalizeModel = (value?: string) => toStr(value).toUpperCase();
const normalizeChassis = (value?: string) => toStr(value).toUpperCase();
const normalizeChassisLoose = (value?: string) => normalizeChassis(value).replace(/[^A-Z0-9]/g, "");
const isStockCustomer = (customer?: string) => /stock$/i.test(toStr(customer));
const isTierKey = (value?: string): value is TierKey => TIERS.includes((value || "") as TierKey);

const defaultTierRule = (): TierRuleConfig => ({
  enabled: true,
  handover6mMultiplier: 1,
  handover3mMultiplier: 1,
  note: "",
});

const parseDate = (value?: string) => {
  const raw = toStr(value);
  if (!raw) return null;
  const ddmmyyyy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const parsed = new Date(Number(ddmmyyyy[3]), Number(ddmmyyyy[2]) - 1, Number(ddmmyyyy[1]));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

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

const PLANNING_MONTHS = 8;
const STOCK_MODEL_OUTLOOK_YEAR = 2026;

const FACTORY_DEALER_NAMES = ["Frankston", "Launceston", "ST James", "Traralgon", "Geelong"];
const FACTORY_DEALER_SLUGS = new Set(FACTORY_DEALER_NAMES.map((name) => normalizeDealer(name)));
const FACTORY_DEALER_OPTIONS = FACTORY_DEALER_NAMES.map((name) => ({ label: name, slug: normalizeDealer(name) }));


export default function OverallDashboardAdmin() {
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [focusRanges, setFocusRanges] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [orders, setOrders] = useState<ScheduleItem[]>([]);
  const [yardStockAll, setYardStockAll] = useState<Record<string, Record<string, any>>>({});
  const [handoverAll, setHandoverAll] = useState<Record<string, Record<string, any>>>({});

  const [tierConfig, setTierConfig] = useState<OverallDashboardTierPlannerConfig>({
    selectedTier: "tier1",
    rules: TIERS.reduce((acc, tier) => ({ ...acc, [tier]: defaultTierRule() }), {} as Record<TierKey, TierRuleConfig>),
    modelTierAssignments: {},
  });
  const [savingTier, setSavingTier] = useState(false);
  const [factoryDealerFilter, setFactoryDealerFilter] = useState<string>("all");

  useEffect(() => {
    const unsub = subscribeTargetHighlightConfig((data) => {
      setTargets(data?.modelRangeTargets || {});
      setFocusRanges((data?.focusModelRanges || []).filter(Boolean));
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    const unsubSchedule = subscribeToSchedule((data) => setOrders(Array.isArray(data) ? data : []));
    const unsubYard = subscribeToYardStockAll((data) => setYardStockAll(data || {}));
    const unsubHandover = subscribeToHandoverAll((data) => setHandoverAll(data || {}));
    const unsubTier = subscribeOverallDashboardTierPlannerConfig((data) => {
      setTierConfig((prev) => ({
        ...prev,
        ...data,
        selectedTier: isTierKey(data?.selectedTier) ? data?.selectedTier : prev.selectedTier || "tier1",
        rules: {
          ...(prev.rules || {}),
          ...(data?.rules || {}),
        },
        modelTierAssignments: {
          ...(prev.modelTierAssignments || {}),
          ...(data?.modelTierAssignments || {}),
        },
      }));
    });

    return () => {
      unsubSchedule?.();
      unsubYard?.();
      unsubHandover?.();
      unsubTier?.();
    };
  }, []);

  const totalPercent = useMemo(
    () => focusRanges.reduce((sum, range) => sum + toPercentValue(Number(targets[range] ?? 0)), 0),
    [focusRanges, targets]
  );

  const { scheduleByChassis, scheduleByChassisLoose } = useMemo(() => {
    const map: Record<string, ScheduleItem> = {};
    const looseMap: Record<string, ScheduleItem> = {};

    const register = (raw: unknown, order: ScheduleItem) => {
      const exact = normalizeChassis(String(raw ?? ""));
      if (exact) map[exact] = order;
      const loose = normalizeChassisLoose(String(raw ?? ""));
      if (loose) looseMap[loose] = order;
    };

    orders.forEach((order) => {
      register((order as any)?.Chassis, order);
      register((order as any)?.chassis, order);
      register((order as any)?.chassisNumber, order);
      register((order as any)?.chassisnumber, order);
      register((order as any)?.["Chassis Number"], order);
    });

    return { scheduleByChassis: map, scheduleByChassisLoose: looseMap };
  }, [orders]);

  const findScheduleMatch = (chassisLike?: string) => {
    const exact = normalizeChassis(chassisLike);
    if (exact && scheduleByChassis[exact]) return scheduleByChassis[exact];
    const loose = normalizeChassisLoose(chassisLike);
    if (loose && scheduleByChassisLoose[loose]) return scheduleByChassisLoose[loose];
    return undefined;
  };

  const modelStats = useMemo(() => {
    const now = new Date();
    const start6m = addMonths(now, -6);
    const start12m = addMonths(now, -12);
    const stats = new Map<string, OrderModelStats>();

    const ensure = (model: string) => {
      if (!stats.has(model)) {
        stats.set(model, {
          model,
          total6m: 0,
          total12m: 0,
          stock6m: 0,
          stock12m: 0,
          customer6m: 0,
          customer12m: 0,
        });
      }
      return stats.get(model)!;
    };

    orders.forEach((order) => {
      const model = normalizeModel(order?.Model);
      if (!model) return;
      const date = parseDate(toStr(order?.["Order Received Date"]) || toStr(order?.["Forecast Production Date"]));
      if (!date) return;
      const row = ensure(model);
      const stock = isStockCustomer(toStr(order?.Customer));

      if (date >= start12m && date <= now) {
        row.total12m += 1;
        if (stock) row.stock12m += 1;
        else row.customer12m += 1;
      }

      if (date >= start6m && date <= now) {
        row.total6m += 1;
        if (stock) row.stock6m += 1;
        else row.customer6m += 1;
      }
    });

    return Array.from(stats.values()).sort((a, b) => b.total12m - a.total12m || b.total6m - a.total6m);
  }, [orders]);

  const topSummary = useMemo(() => {
    const top6 = [...modelStats].sort((a, b) => b.total6m - a.total6m)[0];
    const top12 = [...modelStats].sort((a, b) => b.total12m - a.total12m)[0];
    const topStock6 = [...modelStats].sort((a, b) => b.stock6m - a.stock6m)[0];
    const topStock12 = [...modelStats].sort((a, b) => b.stock12m - a.stock12m)[0];
    const topCustomer6 = [...modelStats].sort((a, b) => b.customer6m - a.customer6m)[0];
    const topCustomer12 = [...modelStats].sort((a, b) => b.customer12m - a.customer12m)[0];
    return { top6, top12, topStock6, topStock12, topCustomer6, topCustomer12 };
  }, [modelStats]);

  const assignedTierByModel = useMemo(() => {
    const result: Record<string, TierKey> = {};
    Object.entries(tierConfig.modelTierAssignments || {}).forEach(([model, tier]) => {
      const normalizedModel = normalizeModel(model);
      if (!normalizedModel || !isTierKey(String(tier))) return;
      result[normalizedModel] = String(tier) as TierKey;
    });
    return result;
  }, [tierConfig.modelTierAssignments]);

  const tierCounts = useMemo(() => {
    const counts: Record<TierKey, number> = { tier1: 0, tier2: 0, tier3: 0, tier4: 0 };
    Object.values(assignedTierByModel).forEach((tier) => {
      counts[tier] = (counts[tier] || 0) + 1;
    });
    return counts;
  }, [assignedTierByModel]);

  const monthBuckets = useMemo(() => {
    const base = startOfMonth(new Date(STOCK_MODEL_OUTLOOK_YEAR, 0, 1));
    return Array.from({ length: PLANNING_MONTHS }, (_, index) => {
      const start = startOfMonth(addMonths(base, index));
      return { start, end: startOfMonth(addMonths(start, 1)) };
    });
  }, []);

  const outlookRows = useMemo(() => {
    const now = new Date();
    const threeMonthsAgo = startOfDay(addMonths(now, -3));
    const sixMonthsAgo = startOfDay(addMonths(now, -6));

    const map = new Map<string, DealerModelOutlook>();
    const ensure = (dealer: string, model: string) => {
      const key = `${dealer}__${model}`;
      if (!map.has(key)) {
        map.set(key, { dealer, model, yard: 0, incoming: 0, handover3mStock: 0, handover6mStock: 0, capacityNow: 0 });
      }
      return map.get(key)!;
    };

    const inferYardType = (record: Record<string, any>, scheduleMatch?: ScheduleItem) => {
      const customer = toStr((scheduleMatch as any)?.Customer ?? record?.customer);
      const rawType = toStr(record?.type ?? record?.Type).toLowerCase();
      if (isStockCustomer(customer)) return "Stock";
      if (rawType.includes("stock")) return "Stock";
      if (rawType.includes("customer") || rawType.includes("retail")) return "Customer";
      if (rawType) return "Customer";
      return "Customer";
    };

    Object.entries(yardStockAll || {}).forEach(([dealerSlug, stockRows]) => {
      Object.entries(stockRows || {}).forEach(([chassis, payload]) => {
        if (chassis === "dealer-chassis") return;
        const scheduleMatch = findScheduleMatch(chassis);
        if (inferYardType((payload as any) || {}, scheduleMatch) !== "Stock") return;
        const model = normalizeModel((payload as any)?.model || scheduleMatch?.Model);
        if (!model) return;
        const normalizedDealer = normalizeDealerSlug(dealerSlug);
        if (!FACTORY_DEALER_SLUGS.has(normalizedDealer)) return;
        ensure(normalizedDealer, model).yard += 1;
      });
    });

    const horizonStart = monthBuckets[0]?.start;
    const horizonEnd = monthBuckets[monthBuckets.length - 1]?.end;

    if (horizonStart && horizonEnd) {
      orders.forEach((order) => {
        if (!isStockCustomer(order?.Customer)) return;
        const dealer = normalizeDealerSlug(order?.Dealer);
        const model = normalizeModel(order?.Model);
        if (!dealer || !model) return;
        if (!FACTORY_DEALER_SLUGS.has(dealer)) return;
        const forecast = parseDate(order?.["Forecast Production Date"]);
        if (!forecast) return;
        const arrivalDate = addDays(forecast, 30);
        if (arrivalDate.getFullYear() !== STOCK_MODEL_OUTLOOK_YEAR) return;
        if (arrivalDate < horizonStart || arrivalDate >= horizonEnd) return;
        ensure(dealer, model).incoming += 1;
      });
    }

    Object.entries(handoverAll || {}).forEach(([dealerSlug, rows]) => {
      const handoverDealer = normalizeDealerSlug(dealerSlug);
      if (!FACTORY_DEALER_SLUGS.has(handoverDealer)) return;

      Object.entries(rows || {}).forEach(([key, payload]) => {
        const rec = payload as any;
        const date = parseDate(rec?.handoverAt || rec?.createdAt);
        if (!date || date < sixMonthsAgo) return;

        const chassis = normalizeChassis(rec?.__sourceChassis || rec?.chassis || rec?.chassisNumber || key);
        const scheduleMatch = findScheduleMatch(chassis);
        const model = normalizeModel(rec?.model || scheduleMatch?.Model);
        if (!model) return;

        const row = ensure(handoverDealer, model);
        row.handover6mStock += 1;
        if (date >= threeMonthsAgo) row.handover3mStock += 1;
      });
    });

    return Array.from(map.values())
      .map((row) => ({ ...row, capacityNow: row.yard + row.incoming }))
      .filter((row) => row.handover6mStock > 0 || row.handover3mStock > 0 || row.capacityNow > 0)
      .sort((a, b) => a.dealer.localeCompare(b.dealer) || b.capacityNow - a.capacityNow);
  }, [handoverAll, monthBuckets, orders, scheduleByChassis, scheduleByChassisLoose, yardStockAll]);

  const selectedTier = (isTierKey(tierConfig.selectedTier) ? tierConfig.selectedTier : "tier1") as TierKey;
  const activeRule = (tierConfig.rules?.[selectedTier] || defaultTierRule()) as TierRuleConfig;
  const selectedTierAssignedCount = useMemo(
    () => Object.values(assignedTierByModel).filter((tier) => tier === selectedTier).length,
    [assignedTierByModel, selectedTier]
  );

  const tier1Rule = (tierConfig.rules?.tier1 || defaultTierRule()) as TierRuleConfig;
  const tier1RowsInScope = useMemo(
    () => outlookRows.filter((row) => assignedTierByModel[row.model] === "tier1"),
    [assignedTierByModel, outlookRows]
  );

  const tier1DealerDebugRows = useMemo(() => {
    const filtered = factoryDealerFilter === "all"
      ? tier1RowsInScope
      : tier1RowsInScope.filter((row) => row.dealer === factoryDealerFilter);

    return filtered
      .map((row) => {
        const handover6mMultiplier = toNumber(tier1Rule.handover6mMultiplier);
        const handover3mMultiplier = toNumber(tier1Rule.handover3mMultiplier);
        const requiredBy6m = row.handover6mStock * handover6mMultiplier;
        const requiredBy3m = row.handover3mStock * handover3mMultiplier;
        return {
          ...row,
          handover6mMultiplier,
          handover3mMultiplier,
          requiredBy6m,
          requiredBy3m,
          gapBy6m: Math.ceil(requiredBy6m - row.capacityNow),
          gapBy3m: Math.ceil(requiredBy3m - row.capacityNow),
        } as Tier1DealerDebugRow;
      })
      .sort((a, b) => b.requiredBy6m - a.requiredBy6m || b.requiredBy3m - a.requiredBy3m);
  }, [factoryDealerFilter, tier1RowsInScope, tier1Rule.handover3mMultiplier, tier1Rule.handover6mMultiplier]);

  const tierGapRows = useMemo(() => {
    if (!activeRule.enabled) return [] as TierGapRow[];

    const rowsInScope = selectedTierAssignedCount > 0
      ? outlookRows.filter((row) => assignedTierByModel[row.model] === selectedTier)
      : outlookRows;

    const dealerFilteredRows = factoryDealerFilter === "all"
      ? rowsInScope
      : rowsInScope.filter((row) => row.dealer === factoryDealerFilter);

    return dealerFilteredRows
      .flatMap((row) => {
        const requiredBy6m = row.handover6mStock * toNumber(activeRule.handover6mMultiplier);
        const requiredBy3m = row.handover3mStock * toNumber(activeRule.handover3mMultiplier);
        const sixGap = requiredBy6m - row.capacityNow;
        const threeGap = requiredBy3m - row.capacityNow;
        const gaps: TierGapRow[] = [];
        if (sixGap > 0) {
          gaps.push({ ...row, tier: selectedTier, basis: "handover6m", required: requiredBy6m, gap: Math.ceil(sixGap) });
        }
        if (threeGap > 0) {
          gaps.push({ ...row, tier: selectedTier, basis: "handover3m", required: requiredBy3m, gap: Math.ceil(threeGap) });
        }
        return gaps;
      })
      .sort((a, b) => b.gap - a.gap);
  }, [activeRule, assignedTierByModel, factoryDealerFilter, outlookRows, selectedTier, selectedTierAssignedCount]);

  const srh16FrankstonHandoverDebugRows = useMemo(() => {
    const now = new Date();
    const threeMonthsAgo = startOfDay(addMonths(now, -3));
    const sixMonthsAgo = startOfDay(addMonths(now, -6));
    const rows: HandoverDebugRow[] = [];

    Object.entries(handoverAll?.frankston || {}).forEach(([key, payload]) => {
      const rec = payload as any;
      const date = parseDate(rec?.handoverAt || rec?.createdAt);
      if (!date) return;
      const chassis = normalizeChassis(rec?.__sourceChassis || rec?.chassis || rec?.chassisNumber || key);
      const scheduleMatch = findScheduleMatch(chassis);
      const model = normalizeModel(rec?.model || scheduleMatch?.Model);
      if (model !== "SRH16") return;

      const customer = toStr((scheduleMatch as any)?.Customer);
      rows.push({
        dealer: "frankston",
        model,
        chassis: chassis || key,
        handoverAt: toStr(rec?.handoverAt || rec?.createdAt),
        scheduleCustomer: customer || "(no schedule customer)",
        customerType: isStockCustomer(customer) ? "Stock" : "Customer",
        in6m: date >= sixMonthsAgo,
        in3m: date >= threeMonthsAgo,
      });
    });

    return rows
      .filter((row) => row.in6m)
      .sort((a, b) => (a.handoverAt < b.handoverAt ? 1 : -1));
  }, [handoverAll, scheduleByChassis, scheduleByChassisLoose]);

  const handleModelTierChange = (model: string, nextTier: string) => {
    const normalizedModel = normalizeModel(model);
    if (!normalizedModel) return;

    setTierConfig((prev) => {
      const nextAssignments = { ...(prev.modelTierAssignments || {}) };
      if (nextTier === UNASSIGNED_TIER) {
        delete nextAssignments[normalizedModel];
      } else {
        nextAssignments[normalizedModel] = nextTier;
      }
      return { ...prev, modelTierAssignments: nextAssignments };
    });
  };

  const handleSaveTargetHighlight = async () => {
    try {
      setSaving(true);
      await setTargetHighlightConfig({ modelRangeTargets: targets, focusModelRanges: focusRanges });
      toast.success("Target and focus model range saved to Firebase");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTierPlanner = async () => {
    try {
      setSavingTier(true);
      const cleanModelAssignments = Object.fromEntries(
        Object.entries(tierConfig.modelTierAssignments || {})
          .map(([model, tier]) => [normalizeModel(model), String(tier)])
          .filter(([model, tier]) => Boolean(model) && isTierKey(tier))
      );

      await setOverallDashboardTierPlannerConfig({
        selectedTier,
        rules: TIERS.reduce(
          (acc, tier) => ({ ...acc, [tier]: { ...defaultTierRule(), ...(tierConfig.rules?.[tier] || {}) } }),
          {} as Record<TierKey, TierRuleConfig>
        ),
        modelTierAssignments: cleanModelAssignments,
      });
      toast.success("Tier planner + model assignments saved to Firebase");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save tier planner");
    } finally {
      setSavingTier(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Overall Dashboard Admin</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Model Range Target (%) & Focus Selection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              {TARGET_MODEL_RANGES.map((range) => {
                const checked = focusRanges.includes(range);
                return (
                  <div key={range} className="rounded-lg border bg-white p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <Label htmlFor={`target-${range}`} className="font-semibold">
                        {range}
                      </Label>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`focus-${range}`}
                          checked={checked}
                          onCheckedChange={(next) => {
                            const enabled = Boolean(next);
                            setFocusRanges((prev) =>
                              enabled ? Array.from(new Set([...prev, range])) : prev.filter((item) => item !== range)
                            );
                          }}
                        />
                        <Label htmlFor={`focus-${range}`} className="text-xs text-slate-600">
                          Focus
                        </Label>
                      </div>
                    </div>
                    <Input
                      id={`target-${range}`}
                      type="number"
                      min={0}
                      step={0.1}
                      value={targets[range] ?? ""}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setTargets((prev) => ({ ...prev, [range]: Number.isFinite(value) ? value : 0 }));
                      }}
                    />
                  </div>
                );
              })}
            </div>

            <div className="rounded-md border border-dashed bg-slate-100 p-3 text-sm text-slate-700">
              Focus ranges: {focusRanges.length} | Total focus target: {totalPercent.toFixed(1)}%
            </div>

            <Button onClick={handleSaveTargetHighlight} disabled={saving}>
              {saving ? "Saving..." : "Save to Firebase"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tier 1 / 2 / 3 / 4 Model Planner</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border bg-blue-50 p-3 text-sm text-blue-900">
              先在下方每个 <strong>Model</strong> 旁边选择 Tier（Tier1-4），再根据选中的 Tier 设置规则并查看缺口建议。
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Working tier</Label>
                <Select
                  value={selectedTier}
                  onValueChange={(value) => setTierConfig((prev) => ({ ...prev, selectedTier: value as TierKey }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose tier" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIERS.map((tier) => (
                      <SelectItem key={tier} value={tier}>
                        {tier.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{selectedTier.toUpperCase()} × Handover 6m(stock)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  value={activeRule.handover6mMultiplier ?? 1}
                  onChange={(event) => {
                    const value = toNumber(event.target.value);
                    setTierConfig((prev) => ({
                      ...prev,
                      rules: { ...(prev.rules || {}), [selectedTier]: { ...activeRule, handover6mMultiplier: value } },
                    }));
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label>{selectedTier.toUpperCase()} × Handover 3m(stock)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  value={activeRule.handover3mMultiplier ?? 1}
                  onChange={(event) => {
                    const value = toNumber(event.target.value);
                    setTierConfig((prev) => ({
                      ...prev,
                      rules: { ...(prev.rules || {}), [selectedTier]: { ...activeRule, handover3mMultiplier: value } },
                    }));
                  }}
                />
              </div>

              <div className="flex items-end">
                <Button onClick={handleSaveTierPlanner} disabled={savingTier} className="w-full">
                  {savingTier ? "Saving..." : "Save Tier Rules + Model Mapping"}
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Factory dealer filter</Label>
                <Select value={factoryDealerFilter} onValueChange={setFactoryDealerFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All factory dealers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All factory dealers</SelectItem>
                    {FACTORY_DEALER_OPTIONS.map((option) => (
                      <SelectItem key={option.slug} value={option.slug}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <Badge variant="secondary">Top model 6m: {topSummary.top6?.model || "-"} ({topSummary.top6?.total6m || 0})</Badge>
              <Badge variant="secondary">Top model 12m: {topSummary.top12?.model || "-"} ({topSummary.top12?.total12m || 0})</Badge>
              <Badge variant="secondary">Top stock/customer model: 6m {topSummary.topStock6?.model || "-"} / {topSummary.topCustomer6?.model || "-"}</Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              {TIERS.map((tier) => (
                <Badge key={tier} variant="outline">
                  {tier.toUpperCase()} models: {tierCounts[tier] || 0}
                </Badge>
              ))}
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Orders 6m</TableHead>
                  <TableHead className="text-right">Orders 12m</TableHead>
                  <TableHead className="text-right">Stock 6m</TableHead>
                  <TableHead className="text-right">Stock 12m</TableHead>
                  <TableHead className="text-right">Customer 6m</TableHead>
                  <TableHead className="text-right">Customer 12m</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {modelStats.slice(0, 40).map((row) => {
                  const assignedTier = assignedTierByModel[row.model] || UNASSIGNED_TIER;
                  return (
                    <TableRow key={row.model}>
                      <TableCell className="font-medium">{row.model}</TableCell>
                      <TableCell>
                        <Select value={assignedTier} onValueChange={(value) => handleModelTierChange(row.model, value)}>
                          <SelectTrigger className="h-9 w-[140px]">
                            <SelectValue placeholder="Set tier" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={UNASSIGNED_TIER}>Unassigned</SelectItem>
                            {TIERS.map((tier) => (
                              <SelectItem key={tier} value={tier}>
                                {tier.toUpperCase()}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">{row.total6m}</TableCell>
                      <TableCell className="text-right">{row.total12m}</TableCell>
                      <TableCell className="text-right">{row.stock6m}</TableCell>
                      <TableCell className="text-right">{row.stock12m}</TableCell>
                      <TableCell className="text-right">{row.customer6m}</TableCell>
                      <TableCell className="text-right">{row.customer12m}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="rounded-md border bg-slate-50 p-3 text-sm text-slate-700">
              以下先固定展示 <strong>TIER1 + Factory dealer</strong> 明细（可按 dealer filter），用于排查：
              requiredBy6m、handover6mStock、handover6mMultiplier、requiredBy3m、handover3mStock、handover3mMultiplier（handover先全量计数；下方会列出 SRH16+frankston 每个chassis对应的schedule customer并标记Stock/Customer供检测）。
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tier</TableHead>
                  <TableHead>Dealer</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Yard + Incoming</TableHead>
                  <TableHead className="text-right">handover6mStock</TableHead>
                  <TableHead className="text-right">handover6mMultiplier</TableHead>
                  <TableHead className="text-right">requiredBy6m</TableHead>
                  <TableHead className="text-right">handover3mStock</TableHead>
                  <TableHead className="text-right">handover3mMultiplier</TableHead>
                  <TableHead className="text-right">requiredBy3m</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tier1DealerDebugRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-slate-500">
                      No tier1 dealer/model rows found. Please assign models to tier1 first.
                    </TableCell>
                  </TableRow>
                ) : (
                  tier1DealerDebugRows.slice(0, 400).map((row, idx) => (
                    <TableRow key={`tier1-${row.dealer}-${row.model}-${idx}`}>
                      <TableCell>TIER1</TableCell>
                      <TableCell>{row.dealer}</TableCell>
                      <TableCell>{row.model}</TableCell>
                      <TableCell className="text-right">{row.capacityNow}</TableCell>
                      <TableCell className="text-right">{row.handover6mStock}</TableCell>
                      <TableCell className="text-right">{row.handover6mMultiplier}</TableCell>
                      <TableCell className="text-right">{Math.ceil(row.requiredBy6m)}</TableCell>
                      <TableCell className="text-right">{row.handover3mStock}</TableCell>
                      <TableCell className="text-right">{row.handover3mMultiplier}</TableCell>
                      <TableCell className="text-right">{Math.ceil(row.requiredBy3m)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <div className="rounded-md border bg-amber-50 p-3 text-sm text-amber-900">
              检测表（固定 SRH16 + frankston，近6个月 handover）：列出每个 chassis 在 schedule 里的 customer 名称，以及 Stock/Customer 判断。
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dealer</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Chassis</TableHead>
                  <TableHead>Handover At</TableHead>
                  <TableHead>Schedule Customer Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>in 3m</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {srh16FrankstonHandoverDebugRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-slate-500">
                      No SRH16 handover rows found for frankston in last 6 months.
                    </TableCell>
                  </TableRow>
                ) : (
                  srh16FrankstonHandoverDebugRows.map((row, idx) => (
                    <TableRow key={`${row.chassis}-${idx}`}>
                      <TableCell>{row.dealer}</TableCell>
                      <TableCell>{row.model}</TableCell>
                      <TableCell className="font-mono text-xs">{row.chassis}</TableCell>
                      <TableCell>{row.handoverAt}</TableCell>
                      <TableCell>{row.scheduleCustomer}</TableCell>
                      <TableCell>{row.customerType}</TableCell>
                      <TableCell>{row.in3m ? "Yes" : "No"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <div className="rounded-md border bg-slate-50 p-3 text-sm text-slate-700">
              下方仍保留当前 Working Tier 的 gap结果（只展示缺口&gt;0）。
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tier</TableHead>
                  <TableHead>Dealer</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Yard + Incoming</TableHead>
                  <TableHead className="text-right">Required</TableHead>
                  <TableHead>Basis</TableHead>
                  <TableHead className="text-right">Suggestion (order more)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tierGapRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-slate-500">
                      No gaps found for {selectedTier.toUpperCase()} rule.
                    </TableCell>
                  </TableRow>
                ) : (
                  tierGapRows.slice(0, 200).map((row, idx) => (
                    <TableRow key={`${row.dealer}-${row.model}-${row.basis}-${idx}`}>
                      <TableCell>{row.tier.toUpperCase()}</TableCell>
                      <TableCell>{row.dealer}</TableCell>
                      <TableCell>{row.model}</TableCell>
                      <TableCell className="text-right">{row.capacityNow}</TableCell>
                      <TableCell className="text-right">{Math.ceil(row.required)}</TableCell>
                      <TableCell>{row.basis === "handover6m" ? "Handover 6m(stock)" : "Handover 3m(stock)"}</TableCell>
                      <TableCell className="text-right font-semibold text-rose-600">+{row.gap}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
