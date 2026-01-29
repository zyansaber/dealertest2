import { Fragment, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, Minus, FileX, CircleDot, TrendingUp, Boxes, ChevronDown, ChevronUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";

import Sidebar from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  subscribeDealerConfig,
  subscribeAllDealerConfigs,
  subscribeToCampervanSchedule,
  subscribeToHandover,
  subscribeToPGIRecords,
  subscribeToSchedule,
  subscribeToYardStock,
} from "@/lib/firebase";
import { parseFlexibleDateToDate } from "@/lib/showDatabase";
import type { CampervanScheduleItem, ScheduleItem } from "@/types";
import { isDealerGroup } from "@/types/dealer";

const PLANNING_MONTHS = 8;
const monthFormatter = new Intl.DateTimeFormat("en-AU", { month: "short", year: "numeric" });

type AnyRecord = Record<string, any>;

type MonthBucket = {
  label: string;
  start: Date;
  end: Date;
};

type ModelRangeRow = {
  modelRange: string;
  currentStock: number;
  recentPgi: number;
  recentHandover: number;
  incoming: number[];
};

const toStr = (value: unknown) => String(value ?? "");

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeDealerSlug = (raw?: string): string => {
  const slug = toStr(raw).toLowerCase();
  const match = slug.match(/^(.*?)-([a-z0-9]{6})$/);
  return match ? match[1] : slug;
};

const slugifyDealerName = (name?: string): string =>
  toStr(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const prettifyDealerName = (slug: string): string =>
  slug
    .replace(/-/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 }).format(value);

const formatDecimal = (value: number) =>
  new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 }).format(value);

const formatPercent = (value: number) => `${Math.abs(value).toFixed(1)}%`;

const addDays = (date: Date, count: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + count);
  return d;
};

const addMonths = (date: Date, count: number) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + count);
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

const parseDate = (value?: string | null) => parseFlexibleDateToDate(value ?? undefined);

const getYear = (value?: string | null) => {
  const parsed = parseDate(value ?? undefined);
  return parsed?.getFullYear() ?? null;
};

const getWeeksUntil = (value?: string | null, today: Date) => {
  const parsed = parseDate(value ?? undefined);
  if (!parsed) return null;
  const diffMs = parsed.getTime() - today.getTime();
  return diffMs / (7 * 24 * 60 * 60 * 1000);
};

const isStockCustomer = (customer?: string) => /stock$/i.test(toStr(customer).trim());

const isStockOrder = (order: ScheduleItem) => isStockCustomer(order.Customer);

const hasChassis = (order: ScheduleItem) => "Chassis" in order && toStr(order.Chassis).trim() !== "";

const isUnsigned = (order: ScheduleItem) => {
  const signed = toStr(order["Signed Plans Received"]).trim().toLowerCase();
  return hasChassis(order) && (!signed || signed === "no");
};

const isEmptySlot = (order: ScheduleItem) => {
  const hasDealer = toStr(order.Dealer).trim() !== "";
  const hasChassisKey = Object.prototype.hasOwnProperty.call(order ?? {}, "Chassis");
  return hasDealer && !hasChassisKey;
};

const inferYardType = (record: AnyRecord, scheduleMatch?: AnyRecord) => {
  const customer = toStr(scheduleMatch?.Customer ?? record?.customer);
  const rawType = toStr(record?.type ?? record?.Type).trim().toLowerCase();

  if (isStockCustomer(customer)) return "Stock";
  if (rawType.includes("stock")) return "Stock";
  if (rawType.includes("customer") || rawType.includes("retail")) return "Customer";
  if (rawType) return "Customer";
  return "Customer";
};

const getModelRange = (model?: string, chassis?: string) => {
  const modelValue = toStr(model).trim();
  if (modelValue) return modelValue.slice(0, 3).toUpperCase();
  const chassisValue = toStr(chassis).trim();
  if (chassisValue) return chassisValue.slice(0, 3).toUpperCase();
  return "UNK";
};

const getTargetValue = (config: any) =>
  toNumber(
    config?.initialTarget2026 ??
      config?.initialTarget ??
      config?.target2026 ??
      config?.yearlyTarget2026 ??
      config?.targetYearly2026 ??
      0
  );

const DeltaIndicator = ({ actual, target }: { actual: number; target: number }) => {
  if (!target) {
    return <span className="text-xs text-slate-400">No target</span>;
  }

  const diff = actual - target;
  const percent = (diff / target) * 100;
  const isPositive = diff > 0;
  const isNegative = diff < 0;
  const Icon = isPositive ? ArrowUpRight : isNegative ? ArrowDownRight : Minus;
  const color = isPositive ? "text-emerald-600" : isNegative ? "text-rose-600" : "text-slate-400";

  return (
    <div className={`flex items-center gap-1 text-xs font-semibold ${color}`}>
      <Icon className="h-4 w-4" />
      <span>{formatPercent(percent)}</span>
    </div>
  );
};

export default function DealerOverallDashboard() {
  const { dealerSlug: rawDealerSlug } = useParams<{ dealerSlug: string }>();
  const isGlobalView = !rawDealerSlug;
  const normalizedSlug = useMemo(() => normalizeDealerSlug(rawDealerSlug), [rawDealerSlug]);
  const [selectedDealerSlug, setSelectedDealerSlug] = useState<string | null>(null);
  const dealerSlug = isGlobalView ? selectedDealerSlug : normalizedSlug;

  const [allOrders, setAllOrders] = useState<ScheduleItem[]>([]);
  const [campervanSchedule, setCampervanSchedule] = useState<CampervanScheduleItem[]>([]);
  const [dealerConfig, setDealerConfig] = useState<any>(null);
  const [dealerConfigs, setDealerConfigs] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [configLoading, setConfigLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [trendMode, setTrendMode] = useState<"week" | "month">("week");
  const [expandedRange, setExpandedRange] = useState<string | null>(null);
  const [yardStock, setYardStock] = useState<Record<string, AnyRecord>>({});
  const [pgiRecords, setPgiRecords] = useState<Record<string, AnyRecord>>({});
  const [handoverRecords, setHandoverRecords] = useState<Record<string, AnyRecord>>({});

  useEffect(() => {
    const unsubSchedule = subscribeToSchedule(
      (data) => {
        setAllOrders(data || []);
        setLoading(false);
      },
      { includeNoChassis: true, includeNoCustomer: true }
    );

    const unsubCampervan = subscribeToCampervanSchedule((data) => {
      setCampervanSchedule(data || []);
    });

    return () => {
      unsubSchedule?.();
      unsubCampervan?.();
    };
  }, []);

  useEffect(() => {
    if (isGlobalView) {
      const unsubConfigs = subscribeAllDealerConfigs((data) => setDealerConfigs(data || {}));
      setConfigLoading(false);
      return () => {
        unsubConfigs?.();
      };
    }
  }, [isGlobalView]);

  useEffect(() => {
    if (!dealerSlug) {
      setDealerConfig(null);
      return;
    }
    setConfigLoading(true);

    const unsubConfig = subscribeDealerConfig(dealerSlug, (config) => {
      setDealerConfig(config);
      setConfigLoading(false);
    });

    const unsubYard = subscribeToYardStock(dealerSlug, (data) => setYardStock(data || {}));
    const unsubHandover = subscribeToHandover(dealerSlug, (data) => setHandoverRecords(data || {}));
    const unsubPgi = subscribeToPGIRecords((data) => setPgiRecords(data || {}));

    return () => {
      unsubConfig?.();
      unsubYard?.();
      unsubHandover?.();
      unsubPgi?.();
    };
  }, [dealerSlug]);

  const dealerOrdersAll = useMemo(() => {
    if (!dealerSlug) return allOrders || [];
    return (allOrders || []).filter((order) => slugifyDealerName(order?.Dealer) === dealerSlug);
  }, [allOrders, dealerSlug]);

  const dealerCampervanSchedule = useMemo(() => {
    if (!dealerSlug) return campervanSchedule || [];
    return (campervanSchedule || []).filter(
      (item) => slugifyDealerName((item as any)?.dealer ?? (item as any)?.Dealer) === dealerSlug
    );
  }, [campervanSchedule, dealerSlug]);

  const dealerOrders = useMemo(
    () => dealerOrdersAll.filter((order) => hasChassis(order) && toStr(order.Customer).trim() !== ""),
    [dealerOrdersAll]
  );

  const dealerDisplayName = useMemo(() => {
    if (!dealerSlug) return "Overall";
    if (dealerConfig?.name) return dealerConfig.name;
    const fallbackConfig = dealerConfigs?.[dealerSlug];
    if (fallbackConfig?.name) return fallbackConfig.name;
    const fromOrder = dealerOrdersAll[0]?.Dealer;
    return fromOrder && fromOrder.trim().length > 0 ? fromOrder : prettifyDealerName(dealerSlug);
  }, [dealerConfig, dealerConfigs, dealerOrdersAll, dealerSlug]);

  const dealerOptions = useMemo(() => {
    return Object.entries(dealerConfigs || {})
      .filter(([, config]) => config && !isDealerGroup(config))
      .map(([slug, config]) => ({ slug, name: config?.name || prettifyDealerName(slug) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [dealerConfigs]);

  const hasAccess = useMemo(() => {
    if (!dealerSlug) return true;
    if (configLoading) return true;
    if (!dealerConfig) return false;
    return dealerConfig.isActive;
  }, [dealerConfig, configLoading]);

  const today = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }, []);

  const initialTarget = useMemo(() => getTargetValue(dealerConfig), [dealerConfig]);

  const forecastYearOrders = useMemo(
    () => dealerOrdersAll.filter((order) => getYear(order["Forecast Production Date"]) === selectedYear),
    [dealerOrdersAll, selectedYear]
  );

  const forecastYearCount = forecastYearOrders.length;
  const forecastYearWithChassis = forecastYearOrders.filter((order) => hasChassis(order)).length;

  const orderReceivedYearCount = useMemo(
    () => dealerOrdersAll.filter((order) => getYear(order["Order Received Date"]) === selectedYear).length,
    [dealerOrdersAll, selectedYear]
  );

  const totalDaysInYear = useMemo(() => {
    const start = new Date(selectedYear, 0, 1);
    const end = new Date(selectedYear + 1, 0, 1);
    return Math.round((end.getTime() - start.getTime()) / 86400000);
  }, [selectedYear]);

  const elapsedDays = useMemo(() => {
    const start = new Date(selectedYear, 0, 1);
    const end = new Date(selectedYear + 1, 0, 1);
    if (today < start) return 0;
    if (today >= end) return totalDaysInYear;
    return Math.round((today.getTime() - start.getTime()) / 86400000) + 1;
  }, [today, totalDaysInYear, selectedYear]);

  const ytdTarget = initialTarget ? (initialTarget * elapsedDays) / totalDaysInYear : 0;

  const ordersLastTenWeeks = useMemo(() => {
    const start = addDays(today, -70);
    return dealerOrdersAll.filter((order) => {
      const parsed = parseDate(order["Order Received Date"]);
      return parsed ? parsed >= start && parsed <= today && parsed.getFullYear() === selectedYear : false;
    });
  }, [dealerOrdersAll, selectedYear, today]);

  const avgOrdersLastTenWeeks = ordersLastTenWeeks.length / 10;
  const targetPerWeek = initialTarget ? initialTarget / 52 : 0;

  const unsignedCount = useMemo(
    () => dealerOrdersAll.filter((order) => isUnsigned(order) && getYear(order["Forecast Production Date"]) === selectedYear).length,
    [dealerOrdersAll, selectedYear]
  );

  const redSlotsCount = useMemo(() => {
    return dealerOrdersAll.filter(isEmptySlot).reduce((count, order) => {
      const weeks = getWeeksUntil(order["Forecast Production Date"], today);
      const matchesYear = getYear(order["Forecast Production Date"]) === selectedYear;
      return count + (matchesYear && weeks !== null && weeks < 22 ? 1 : 0);
    }, 0);
  }, [dealerOrdersAll, selectedYear, today]);

  const monthBuckets = useMemo<MonthBucket[]>(() => {
    const base = startOfMonth(today);
    return Array.from({ length: PLANNING_MONTHS }, (_, index) => {
      const start = startOfMonth(addMonths(base, index));
      return {
        start,
        end: startOfMonth(addMonths(start, 1)),
        label: monthFormatter.format(start),
      };
    });
  }, [today]);

  const orderVolumeByMonth = useMemo(() => {
    const buckets = monthBuckets.map((bucket) => ({
      label: bucket.label,
      start: bucket.start,
      end: bucket.end,
      stock: 0,
      customer: 0,
      total: 0,
    }));

    const addToBucket = (date: Date | null, type: "stock" | "customer") => {
      if (!date) return;
      const shifted = addDays(date, 40);
      if (shifted.getFullYear() !== selectedYear) return;
      const bucket = buckets.find((entry) => shifted >= entry.start && shifted < entry.end);
      if (!bucket) return;
      bucket[type] += 1;
      bucket.total += 1;
    };

    dealerOrders.forEach((order) => {
      const forecastDate = parseDate(order["Forecast Production Date"]);
      addToBucket(forecastDate, isStockOrder(order) ? "stock" : "customer");
    });

    dealerCampervanSchedule.forEach((item) => {
      const forecastDate = parseDate(item.forecastProductionDate);
      addToBucket(forecastDate, "customer");
    });

    return buckets;
  }, [dealerOrders, dealerCampervanSchedule, monthBuckets, selectedYear]);

  const weeklyOrderTrend = useMemo(() => {
    const startOfWeek = (date: Date) => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = (day + 6) % 7;
      d.setDate(d.getDate() - diff);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const buckets = Array.from({ length: 10 }).map((_, index) => {
      const weekStart = addDays(startOfWeek(today), -7 * (9 - index));
      return {
        weekStart,
        label: weekStart.toLocaleDateString("en-AU", { month: "short", day: "numeric" }),
        stock: 0,
        customer: 0,
        total: 0,
      };
    });

    dealerOrdersAll.forEach((order) => {
      const receivedDate = parseDate(order["Order Received Date"]);
      if (!receivedDate) return;
      if (receivedDate.getFullYear() !== selectedYear) return;
      const weekStart = startOfWeek(receivedDate);
      const bucket = buckets.find((item) => item.weekStart.getTime() === weekStart.getTime());
      if (!bucket) return;
      if (isStockOrder(order)) {
        bucket.stock += 1;
      } else {
        bucket.customer += 1;
      }
      bucket.total += 1;
    });

    return buckets;
  }, [dealerOrdersAll, selectedYear, today]);

  const monthlyOrderTrend = useMemo(() => {
    const base = startOfMonth(addMonths(today, -5));
    const buckets = Array.from({ length: 6 }).map((_, index) => {
      const start = startOfMonth(addMonths(base, index));
      return {
        label: monthFormatter.format(start),
        start,
        end: startOfMonth(addMonths(start, 1)),
        stock: 0,
        customer: 0,
        total: 0,
      };
    });

    const addToBucket = (date: Date | null, type: "stock" | "customer") => {
      if (!date) return;
      if (date.getFullYear() !== selectedYear) return;
      const bucket = buckets.find((entry) => date >= entry.start && date < entry.end);
      if (!bucket) return;
      bucket[type] += 1;
      bucket.total += 1;
    };

    dealerOrdersAll.forEach((order) => {
      const receivedDate = parseDate(order["Order Received Date"]);
      addToBucket(receivedDate, isStockOrder(order) ? "stock" : "customer");
    });

    return buckets;
  }, [dealerOrdersAll, selectedYear, today]);

  const scheduleByChassis = useMemo(() => {
    const map: Record<string, Partial<ScheduleItem>> = {};
    dealerOrdersAll.forEach((item) => {
      const chassis = toStr(item?.Chassis);
      if (chassis) map[chassis] = item;
    });
    return map;
  }, [dealerOrdersAll]);

  const modelRangeRows = useMemo(() => {
    const rangeMap = new Map<string, ModelRangeRow>();

    const ensureRange = (range: string) => {
      const key = range || "UNK";
      if (!rangeMap.has(key)) {
        rangeMap.set(key, {
          modelRange: key,
          currentStock: 0,
          recentPgi: 0,
          recentHandover: 0,
          incoming: Array(monthBuckets.length).fill(0),
        });
      }
      return rangeMap.get(key)!;
    };

    Object.entries(yardStock || {})
      .filter(([chassis]) => chassis !== "dealer-chassis")
      .forEach(([chassis, payload]) => {
        const scheduleMatch = scheduleByChassis[chassis];
        const inferredType = inferYardType(payload || {}, scheduleMatch);
        if (inferredType !== "Stock") return;
        const range = getModelRange(payload?.model ?? scheduleMatch?.Model, chassis);
        ensureRange(range).currentStock += 1;
      });

    const threeMonthsAgo = startOfDay(addMonths(today, -3));
    Object.entries(pgiRecords || {}).forEach(([chassis, rec]) => {
      if (slugifyDealerName((rec as any)?.dealer) !== dealerSlug) return;
      const date =
        parseDate((rec as any)?.pgidate) ||
        parseDate((rec as any)?.PGIDate) ||
        parseDate((rec as any)?.pgIDate) ||
        parseDate((rec as any)?.PgiDate);
      if (!date || date < threeMonthsAgo) return;
      const scheduleMatch = scheduleByChassis[chassis];
      const range = getModelRange((rec as any)?.model ?? scheduleMatch?.Model, chassis);
      ensureRange(range).recentPgi += 1;
    });

    Object.entries(handoverRecords || {}).forEach(([chassis, rec]) => {
      const dealerFromRec = slugifyDealerName((rec as any)?.dealerSlug || (rec as any)?.dealerName || "");
      if (dealerFromRec !== dealerSlug) return;
      const date = parseDate((rec as any)?.handoverAt) || parseDate((rec as any)?.createdAt);
      if (!date || date < threeMonthsAgo) return;
      const scheduleMatch = scheduleByChassis[chassis];
      const range = getModelRange((rec as any)?.model ?? scheduleMatch?.Model, chassis);
      ensureRange(range).recentHandover += 1;
    });

    const horizonStart = monthBuckets[0]?.start;
    const horizonEnd = monthBuckets[monthBuckets.length - 1]?.end;

    if (horizonStart && horizonEnd) {
      dealerOrdersAll.forEach((item) => {
        if (!isStockCustomer((item as any)?.Customer)) return;
        const forecastDate = parseDate((item as any)?.["Forecast Production Date"]);
        if (!forecastDate) return;
        const arrivalDate = addDays(forecastDate, 40);
        if (arrivalDate.getFullYear() !== selectedYear) return;
        if (arrivalDate < horizonStart || arrivalDate >= horizonEnd) return;
        const range = getModelRange((item as any)?.Model, (item as any)?.Chassis);
        const row = ensureRange(range);
        const monthIndex = monthBuckets.findIndex((bucket) => arrivalDate >= bucket.start && arrivalDate < bucket.end);
        if (monthIndex >= 0) {
          row.incoming[monthIndex] += 1;
        }
      });

      dealerCampervanSchedule.forEach((item) => {
        const forecastDate = parseDate(item.forecastProductionDate);
        if (!forecastDate) return;
        const arrivalDate = addDays(forecastDate, 40);
        if (arrivalDate.getFullYear() !== selectedYear) return;
        if (arrivalDate < horizonStart || arrivalDate >= horizonEnd) return;
        const range = getModelRange(item.model, item.chassisNumber);
        const row = ensureRange(range);
        const monthIndex = monthBuckets.findIndex((bucket) => arrivalDate >= bucket.start && arrivalDate < bucket.end);
        if (monthIndex >= 0) {
          row.incoming[monthIndex] += 1;
        }
      });
    }

    return Array.from(rangeMap.values()).sort((a, b) => a.modelRange.localeCompare(b.modelRange));
  }, [dealerCampervanSchedule, dealerOrdersAll, dealerSlug, handoverRecords, monthBuckets, pgiRecords, scheduleByChassis, today, yardStock]);

  const modelRangeDetails = useMemo(() => {
    const details = new Map<string, Record<string, number>>();
    const increment = (range: string, model: string) => {
      const rangeKey = range || "UNK";
      const modelKey = toStr(model).trim() || "Unknown";
      if (!details.has(rangeKey)) {
        details.set(rangeKey, {});
      }
      const bucket = details.get(rangeKey)!;
      bucket[modelKey] = (bucket[modelKey] || 0) + 1;
    };

    dealerOrdersAll.forEach((item) => {
      const range = getModelRange((item as any)?.Model, (item as any)?.Chassis);
      const modelLabel = toStr((item as any)?.Model).trim() || range;
      increment(range, modelLabel);
    });

    dealerCampervanSchedule.forEach((item) => {
      const range = getModelRange(item.model, item.chassisNumber);
      increment(range, item.model || range);
    });

    return details;
  }, [dealerCampervanSchedule, dealerOrdersAll]);

  const topModelOrders = useMemo(() => {
    const end = today;
    const start = addMonths(startOfMonth(today), -12);
    const bucket = new Map<string, { model: string; stock: number; customer: number; total: number }>();

    const addEntry = (model: string, type: "stock" | "customer") => {
      const key = model || "Unknown";
      if (!bucket.has(key)) {
        bucket.set(key, { model: key, stock: 0, customer: 0, total: 0 });
      }
      const entry = bucket.get(key)!;
      entry[type] += 1;
      entry.total += 1;
    };

    dealerOrdersAll.forEach((order) => {
      const receivedDate = parseDate(order["Order Received Date"]);
      if (!receivedDate || receivedDate < start || receivedDate > end) return;
      if (receivedDate.getFullYear() !== selectedYear) return;
      const model = toStr(order.Model).trim();
      addEntry(model, isStockOrder(order) ? "stock" : "customer");
    });

    dealerCampervanSchedule.forEach((item) => {
      const receivedDate = parseDate((item as any)?.orderReceivedDate ?? (item as any)?.OrderReceivedDate ?? (item as any)?.orderDate);
      if (!receivedDate || receivedDate < start || receivedDate > end) return;
      if (receivedDate.getFullYear() !== selectedYear) return;
      addEntry(toStr(item.model).trim(), "customer");
    });

    return Array.from(bucket.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [dealerCampervanSchedule, dealerOrdersAll, selectedYear, today]);

  const stockLevel = useMemo(() => {
    return Object.keys(yardStock || {}).filter((key) => key !== "dealer-chassis").length;
  }, [yardStock]);

  if (!configLoading && !hasAccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="text-center py-16">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CircleDot className="w-8 h-8 text-red-600" />
            </div>
            <CardTitle className="text-xl text-slate-700 mb-2">Access Denied</CardTitle>
            <p className="text-slate-500 mb-6">
              This dealer portal is currently inactive or does not exist. Please contact the administrator for access.
            </p>
            <p className="text-sm text-slate-400">Dealer: {dealerDisplayName}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading || configLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-600">Loading overall dashboard…</div>
      </div>
    );
  }

  const deltaColor = (actual: number, target: number) =>
    target && actual !== target ? (actual > target ? "text-emerald-600" : "text-rose-600") : "text-slate-900";

  const totalIncoming = (incoming: number[]) => incoming.reduce((sum, value) => sum + value, 0);

  return (
    <div className="flex min-h-screen">
      {isGlobalView ? (
        <aside className="w-64 border-r border-slate-200 bg-slate-950 text-slate-100">
          <div className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Dealers</div>
            <div className="mt-3 space-y-1">
              <button
                type="button"
                onClick={() => setSelectedDealerSlug(null)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition ${
                  dealerSlug === null ? "bg-slate-800 text-white" : "text-slate-200 hover:bg-slate-800 hover:text-white"
                }`}
              >
                Overall
              </button>
              {dealerOptions.map((dealer) => (
                <button
                  key={dealer.slug}
                  type="button"
                  onClick={() => setSelectedDealerSlug(dealer.slug)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition ${
                    dealerSlug === dealer.slug
                      ? "bg-slate-800 text-white"
                      : "text-slate-200 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  {dealer.name}
                </button>
              ))}
            </div>
          </div>
        </aside>
      ) : (
        <Sidebar
          orders={dealerOrders}
          selectedDealer={dealerDisplayName}
          onDealerSelect={() => {}}
          hideOtherDealers={true}
          currentDealerName={dealerDisplayName}
          showStats={false}
        />
      )}

      <main className="flex-1 flex flex-col bg-slate-50">
        <header className="bg-white border-b border-slate-200 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Overall Dashboard — {dealerDisplayName}</h1>
              <p className="text-slate-600 mt-1">Schedule insights and target pacing for {selectedYear}.</p>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              {[2025, 2026].map((year) => (
                <button
                  key={year}
                  type="button"
                  onClick={() => setSelectedYear(year)}
                  className={`rounded-full border px-3 py-1 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-300 ${
                    selectedYear === year
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="overflow-hidden border-slate-200">
              <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-lime-500 to-teal-500" />
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-600">Modified Yearly Target in {selectedYear}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <div className={`text-3xl font-bold tracking-tight ${deltaColor(forecastYearCount, initialTarget)}`}>
                  {formatNumber(forecastYearCount)}
                </div>
                <p className="text-xs text-slate-500">Initial Target: {formatNumber(initialTarget)}</p>
                <DeltaIndicator actual={forecastYearCount} target={initialTarget} />
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-slate-200">
              <div className="h-1 w-full bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500" />
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-600">Order received in {selectedYear}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <div className={`text-3xl font-bold tracking-tight ${deltaColor(orderReceivedYearCount, ytdTarget)}`}>
                  {formatNumber(orderReceivedYearCount)}
                </div>
                <p className="text-xs text-slate-500">Initial target YTD: {formatNumber(Math.round(ytdTarget))}</p>
                <DeltaIndicator actual={orderReceivedYearCount} target={ytdTarget} />
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-slate-200">
              <div className="h-1 w-full bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500" />
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-600">Production confirmed in {selectedYear}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <div className="text-3xl font-bold tracking-tight text-slate-900">
                  {formatNumber(forecastYearWithChassis)}
                </div>
                <p className="text-xs text-slate-500">
                  Initial target YTD: {formatNumber(Math.round(ytdTarget))}
                </p>
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-slate-200">
              <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500" />
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-600">Avg Orders (Last 10 Weeks)</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <div className="text-3xl font-bold tracking-tight text-slate-900">
                  {formatDecimal(avgOrdersLastTenWeeks)}
                </div>
                <p className="text-xs text-slate-500">
                  Target per week: {formatDecimal(targetPerWeek)}
                </p>
                <div className="text-xs text-rose-600">Red slots: {formatNumber(redSlotsCount)}</div>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-600 flex items-center gap-2">
                  <FileX className="h-4 w-4 text-indigo-500" />
                  Unsigned Orders
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-2xl font-semibold text-slate-900">{formatNumber(unsignedCount)}</div>
                <p className="text-xs text-slate-500 mt-1">Have chassis but no signed plans.</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-600">Red Slots</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-2xl font-semibold text-rose-600">{formatNumber(redSlotsCount)}</div>
                <p className="text-xs text-slate-500 mt-1">Empty slots with FPD &lt; 22 weeks.</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-600 flex items-center gap-2">
                  <Boxes className="h-4 w-4 text-slate-500" />
                  Stock Level
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-2xl font-semibold text-slate-900">{formatNumber(stockLevel)}</div>
                <p className="text-xs text-slate-500 mt-1">Current yard stock count.</p>
              </CardContent>
            </Card>
          </div>
        </header>

        <div className="flex-1 space-y-6 p-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Forecast Production Volume (+40 days)</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Next {PLANNING_MONTHS} months, stacked by customer vs stock (schedule + campervan).
                </p>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    stock: { label: "Stock", color: "#3b82f6" },
                    customer: { label: "Customer", color: "#10b981" },
                    total: { label: "Total", color: "#0f172a" },
                  }}
                  className="h-80"
                >
                  <BarChart data={orderVolumeByMonth} margin={{ top: 20, left: 16, right: 16, bottom: 12 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} tickMargin={8} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="stock" fill="var(--color-stock)" radius={[0, 0, 0, 0]} stackId="production" />
                    <Bar dataKey="customer" fill="var(--color-customer)" radius={[6, 6, 0, 0]} stackId="production">
                      <LabelList dataKey="total" position="top" offset={8} fill="#0f172a" />
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-slate-500" />
                    Order Received Trend
                  </CardTitle>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <button
                      type="button"
                      onClick={() => setTrendMode("week")}
                      className={`rounded-full border px-3 py-1 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-300 ${
                        trendMode === "week"
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      Week
                    </button>
                    <button
                      type="button"
                      onClick={() => setTrendMode("month")}
                      className={`rounded-full border px-3 py-1 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-300 ${
                        trendMode === "month"
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      Month
                    </button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">Weekly or monthly order volume split by customer vs stock.</p>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    stock: { label: "Stock", color: "#3b82f6" },
                    customer: { label: "Customer", color: "#10b981" },
                  }}
                  className="h-80"
                >
                  <BarChart
                    data={trendMode === "week" ? weeklyOrderTrend : monthlyOrderTrend}
                    margin={{ top: 16, left: 16, right: 16, bottom: 12 }}
                  >
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} tickMargin={8} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="stock" fill="var(--color-stock)" radius={[0, 0, 0, 0]} stackId="trend" />
                    <Bar dataKey="customer" fill="var(--color-customer)" radius={[6, 6, 0, 0]} stackId="trend">
                      <LabelList dataKey="total" position="top" offset={8} fill="#0f172a" />
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Stock Model Outlook (Model Range)</CardTitle>
              <p className="text-sm text-muted-foreground">Aggregated by model range across yard, handover, PGI, and inbound schedule.</p>
            </CardHeader>
            <CardContent className="overflow-auto">
              <Table className="min-w-[900px] text-sm">
                <TableHeader className="bg-slate-100/80">
                  <TableRow className="border-b border-slate-200">
                    <TableHead className="text-left text-xs uppercase tracking-wide text-slate-600">Model Range</TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wide text-slate-600">Current Yard Stock</TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wide text-red-600">Handover (Last 3 Months)</TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wide text-slate-600">Factory PGI (Last 3 Months)</TableHead>
                    {monthBuckets.map((bucket, idx) => (
                      <TableHead
                        key={bucket.label}
                        className={`text-right text-xs uppercase tracking-wide text-slate-600 ${idx === 0 ? "border-l border-slate-200" : ""}`}
                      >
                        {bucket.label}
                      </TableHead>
                    ))}
                    <TableHead className="text-right text-xs uppercase tracking-wide text-slate-600">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {modelRangeRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5 + monthBuckets.length}>
                        <div className="py-6 text-center text-slate-500">No model range data available.</div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    modelRangeRows.map((row) => {
                      const detail = modelRangeDetails.get(row.modelRange) || {};
                      const detailEntries = Object.entries(detail).sort((a, b) => b[1] - a[1]);
                      const isExpanded = expandedRange === row.modelRange;
                      return (
                        <Fragment key={row.modelRange}>
                          <TableRow key={row.modelRange} className="border-b border-slate-200/70">
                            <TableCell className="font-semibold text-slate-900">
                              <button
                                type="button"
                                onClick={() => setExpandedRange(isExpanded ? null : row.modelRange)}
                                className="flex items-center gap-2 text-left"
                              >
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-slate-500" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-slate-500" />
                                )}
                                <span>{row.modelRange}</span>
                              </button>
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums text-slate-900">
                              {row.currentStock}
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums text-red-600">
                              {row.recentHandover}
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums text-slate-900">
                              {row.recentPgi}
                            </TableCell>
                            {row.incoming.map((value, idx) => (
                              <TableCell
                                key={`${row.modelRange}-${idx}`}
                                className={`text-right font-medium tabular-nums text-slate-800 ${idx === 0 ? "border-l border-slate-200" : ""}`}
                              >
                                {value}
                              </TableCell>
                            ))}
                            <TableCell className="text-right font-semibold tabular-nums text-slate-900">
                              {totalIncoming(row.incoming)}
                            </TableCell>
                          </TableRow>
                          {isExpanded &&
                            detailEntries.map(([model, count]) => (
                              <TableRow key={`${row.modelRange}-${model}`} className="border-b border-slate-200/70 bg-slate-50/80">
                                <TableCell className="pl-8 text-sm font-medium text-slate-700">{model}</TableCell>
                                <TableCell className="text-right text-sm text-slate-500">—</TableCell>
                                <TableCell className="text-right text-sm text-slate-500">—</TableCell>
                                <TableCell className="text-right text-sm text-slate-500">—</TableCell>
                                {row.incoming.map((_, idx) => (
                                  <TableCell
                                    key={`${row.modelRange}-${model}-${idx}`}
                                    className={`text-right text-sm text-slate-500 ${idx === 0 ? "border-l border-slate-200" : ""}`}
                                  >
                                    —
                                  </TableCell>
                                ))}
                                <TableCell className="text-right font-semibold tabular-nums text-slate-900">
                                  {count}
                                </TableCell>
                              </TableRow>
                            ))}
                        </Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Top 10 Models (Last 12 Months)</CardTitle>
              <p className="text-sm text-muted-foreground">Order received volume split by customer vs stock.</p>
            </CardHeader>
            <CardContent>
              {topModelOrders.length === 0 ? (
                <p className="text-muted-foreground">No order received data in the last 12 months.</p>
              ) : (
                <ChartContainer
                  config={{
                    stock: { label: "Stock", color: "#3b82f6" },
                    customer: { label: "Customer", color: "#10b981" },
                    total: { label: "Total", color: "#0f172a" },
                  }}
                  className="h-[420px]"
                >
                  <BarChart data={topModelOrders} margin={{ top: 16, left: 16, right: 16, bottom: 12 }} layout="vertical">
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="model" tickLine={false} axisLine={false} width={140} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="stock" fill="var(--color-stock)" stackId="top10" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="customer" fill="var(--color-customer)" stackId="top10" radius={[0, 6, 6, 0]}>
                      <LabelList dataKey="total" position="right" fill="#0f172a" />
                    </Bar>
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
