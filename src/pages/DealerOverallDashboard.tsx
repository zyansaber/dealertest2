import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, Minus, FileX, CircleDot } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import Sidebar from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { subscribeDealerConfig, subscribeToSchedule } from "@/lib/firebase";
import { parseFlexibleDateToDate } from "@/lib/showDatabase";
import type { ScheduleItem } from "@/types";

const TARGET_YEAR = 2026;

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

const isStockOrder = (order: ScheduleItem) => toStr(order.Customer).toLowerCase().endsWith("stock");

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
  const dealerSlug = useMemo(() => normalizeDealerSlug(rawDealerSlug), [rawDealerSlug]);

  const [allOrders, setAllOrders] = useState<ScheduleItem[]>([]);
  const [dealerConfig, setDealerConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {
    const unsubSchedule = subscribeToSchedule(
      (data) => {
        setAllOrders(data || []);
        setLoading(false);
      },
      { includeNoChassis: true, includeNoCustomer: true }
    );

    return () => {
      unsubSchedule?.();
    };
  }, []);

  useEffect(() => {
    if (!dealerSlug) return;

    const unsubConfig = subscribeDealerConfig(dealerSlug, (config) => {
      setDealerConfig(config);
      setConfigLoading(false);
    });

    return unsubConfig;
  }, [dealerSlug]);

  const dealerOrdersAll = useMemo(() => {
    if (!dealerSlug) return [];
    return (allOrders || []).filter((order) => slugifyDealerName(order?.Dealer) === dealerSlug);
  }, [allOrders, dealerSlug]);

  const dealerOrders = useMemo(
    () => dealerOrdersAll.filter((order) => hasChassis(order) && toStr(order.Customer).trim() !== ""),
    [dealerOrdersAll]
  );

  const dealerDisplayName = useMemo(() => {
    if (dealerConfig?.name) return dealerConfig.name;
    const fromOrder = dealerOrdersAll[0]?.Dealer;
    return fromOrder && fromOrder.trim().length > 0 ? fromOrder : prettifyDealerName(dealerSlug);
  }, [dealerConfig, dealerOrdersAll, dealerSlug]);

  const hasAccess = useMemo(() => {
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

  const forecast2026Orders = useMemo(
    () => dealerOrdersAll.filter((order) => getYear(order["Forecast Production Date"]) === TARGET_YEAR),
    [dealerOrdersAll]
  );

  const forecast2026Count = forecast2026Orders.length;
  const forecast2026WithChassis = forecast2026Orders.filter((order) => hasChassis(order)).length;

  const orderReceived2026Count = useMemo(
    () =>
      dealerOrdersAll.filter((order) => getYear(order["Order Received Date"]) === TARGET_YEAR).length,
    [dealerOrdersAll]
  );

  const totalDaysInYear = useMemo(() => {
    const start = new Date(TARGET_YEAR, 0, 1);
    const end = new Date(TARGET_YEAR + 1, 0, 1);
    return Math.round((end.getTime() - start.getTime()) / 86400000);
  }, []);

  const elapsedDays = useMemo(() => {
    const start = new Date(TARGET_YEAR, 0, 1);
    const end = new Date(TARGET_YEAR + 1, 0, 1);
    if (today < start) return 0;
    if (today >= end) return totalDaysInYear;
    return Math.round((today.getTime() - start.getTime()) / 86400000) + 1;
  }, [today, totalDaysInYear]);

  const ytdTarget = initialTarget ? (initialTarget * elapsedDays) / totalDaysInYear : 0;

  const cutoffDate = useMemo(() => addDays(today, 140), [today]);

  const neededAfterCutoff = useMemo(() => {
    if (!initialTarget) return 0;
    const countBefore = forecast2026Orders.filter((order) => {
      const parsed = parseDate(order["Forecast Production Date"]);
      return parsed ? parsed <= cutoffDate : false;
    }).length;
    return Math.max(initialTarget - countBefore, 0);
  }, [forecast2026Orders, cutoffDate, initialTarget]);

  const ordersLastTenWeeks = useMemo(() => {
    const start = addDays(today, -70);
    return dealerOrdersAll.filter((order) => {
      const parsed = parseDate(order["Order Received Date"]);
      return parsed ? parsed >= start && parsed <= today : false;
    });
  }, [dealerOrdersAll, today]);

  const avgOrdersLastTenWeeks = ordersLastTenWeeks.length / 10;
  const targetPerWeek = initialTarget ? initialTarget / 52 : 0;

  const unsignedCount = useMemo(() => dealerOrdersAll.filter(isUnsigned).length, [dealerOrdersAll]);

  const emptySlots = useMemo(() => dealerOrdersAll.filter(isEmptySlot), [dealerOrdersAll]);

  const { redSlotsCount, blueSlotsCount } = useMemo(() => {
    let red = 0;
    let blue = 0;
    emptySlots.forEach((order) => {
      const weeks = getWeeksUntil(order["Forecast Production Date"], today);
      if (weeks !== null && weeks < 22) {
        red += 1;
      } else {
        blue += 1;
      }
    });
    return { redSlotsCount: red, blueSlotsCount: blue };
  }, [emptySlots, today]);

  const deliveryByMonth = useMemo(() => {
    const buckets = new Map<
      string,
      { label: string; sort: number; stock: number; customer: number }
    >();

    dealerOrders.forEach((order) => {
      const startDate = parseDate((order as any)?.["Forecast Melbourne Factory Start Date"]);
      if (!startDate) return;
      const deliveryDate = addDays(startDate, 40);
      const key = `${deliveryDate.getFullYear()}-${deliveryDate.getMonth() + 1}`;
      const label = deliveryDate.toLocaleDateString("en-AU", { month: "short", year: "numeric" });
      const sort = new Date(deliveryDate.getFullYear(), deliveryDate.getMonth(), 1).getTime();
      const entry = buckets.get(key) || { label, sort, stock: 0, customer: 0 };
      if (isStockOrder(order)) {
        entry.stock += 1;
      } else {
        entry.customer += 1;
      }
      buckets.set(key, entry);
    });

    return Array.from(buckets.values()).sort((a, b) => a.sort - b.sort);
  }, [dealerOrders]);

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

  return (
    <div className="flex min-h-screen">
      <Sidebar
        orders={dealerOrders}
        selectedDealer={dealerDisplayName}
        onDealerSelect={() => {}}
        hideOtherDealers={true}
        currentDealerName={dealerDisplayName}
        showStats={false}
      />

      <main className="flex-1 flex flex-col bg-slate-50">
        <header className="bg-white border-b border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Overall Dashboard — {dealerDisplayName}</h1>
              <p className="text-slate-600 mt-1">Schedule insights and target pacing for {TARGET_YEAR}.</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="overflow-hidden border-slate-200">
              <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-lime-500 to-teal-500" />
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-600">Modified Yearly Target in {TARGET_YEAR}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <div className={`text-3xl font-bold tracking-tight ${deltaColor(forecast2026Count, initialTarget)}`}>
                  {formatNumber(forecast2026Count)}
                </div>
                <p className="text-xs text-slate-500">Initial Target: {formatNumber(initialTarget)}</p>
                <DeltaIndicator actual={forecast2026Count} target={initialTarget} />
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-slate-200">
              <div className="h-1 w-full bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500" />
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-600">Order Received Date in {TARGET_YEAR}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <div className={`text-3xl font-bold tracking-tight ${deltaColor(orderReceived2026Count, ytdTarget)}`}>
                  {formatNumber(orderReceived2026Count)}
                </div>
                <p className="text-xs text-slate-500">Initial target YTD: {formatNumber(Math.round(ytdTarget))}</p>
                <DeltaIndicator actual={orderReceived2026Count} target={ytdTarget} />
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-slate-200">
              <div className="h-1 w-full bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500" />
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-600">Chassis Assigned in {TARGET_YEAR}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <div className="text-3xl font-bold tracking-tight text-slate-900">
                  {formatNumber(forecast2026WithChassis)}
                </div>
                <p className="text-xs text-slate-500">
                  Needed after +140 days: {formatNumber(neededAfterCutoff)}
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
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-blue-600">Blue slots: {formatNumber(blueSlotsCount)}</span>
                  <span className="text-rose-600">Red slots: {formatNumber(redSlotsCount)}</span>
                </div>
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
                <CardTitle className="text-sm text-slate-600">Blue Slots</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-2xl font-semibold text-blue-600">{formatNumber(blueSlotsCount)}</div>
                <p className="text-xs text-slate-500 mt-1">Empty slots with FPD ≥ 22 weeks.</p>
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
          </div>
        </header>

        <div className="flex-1 p-6">
          <Card>
            <CardHeader>
              <CardTitle>Forecast Delivery Volume (FPD + 40 days)</CardTitle>
              <p className="text-sm text-muted-foreground">
                Monthly delivery counts for dealer orders, split by stock vs customer.
              </p>
            </CardHeader>
            <CardContent>
              {deliveryByMonth.length === 0 ? (
                <p className="text-muted-foreground">No delivery dates found for the current dealer orders.</p>
              ) : (
                <ChartContainer
                  config={{
                    stock: { label: "Stock", color: "#3b82f6" },
                    customer: { label: "Customer", color: "#10b981" },
                  }}
                  className="h-80"
                >
                  <BarChart data={deliveryByMonth} margin={{ top: 12, left: 16, right: 16, bottom: 12 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} tickMargin={8} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="stock" fill="var(--color-stock)" radius={[6, 6, 0, 0]} stackId="delivery" />
                    <Bar dataKey="customer" fill="var(--color-customer)" radius={[6, 6, 0, 0]} stackId="delivery" />
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
