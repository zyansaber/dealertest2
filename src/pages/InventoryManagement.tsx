// src/pages/InventoryManagement.tsx
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import Sidebar from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { subscribeToHandover, subscribeToPGIRecords, subscribeToSchedule, subscribeToYardStock } from "@/lib/firebase";
import { normalizeDealerSlug, prettifyDealerName } from "@/lib/dealerUtils";
import type { ScheduleItem } from "@/types";

type AnyRecord = Record<string, any>;

type ModelStats = {
  currentStock: number;
  recentPgi: number;
  recentHandover: number;
  incoming: number[]; // six months
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

  useEffect(() => {
    let unsubYard: (() => void) | undefined;
    let unsubHandover: (() => void) | undefined;
    if (dealerSlug) {
      unsubYard = subscribeToYardStock(dealerSlug, (data) => setYardStock(data || {}));
      unsubHandover = subscribeToHandover(dealerSlug, (data) => setHandoverRecords(data || {}));
    }
    const unsubPgi = subscribeToPGIRecords((data) => setPgiRecords(data || {}));
    const unsubSchedule = subscribeToSchedule(
      (data) => setSchedule(Array.isArray(data) ? data : []),
      { includeNoChassis: true, includeNoCustomer: true, includeFinished: true }
    );

    return () => {
      unsubYard?.();
      unsubHandover?.();
      unsubPgi?.();
      unsubSchedule?.();
    };
  }, [dealerSlug]);

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
      .map(([model, stats]) => ({ model, ...stats }))
      .sort((a, b) => b.currentStock - a.currentStock || a.model.localeCompare(b.model));
  }, [dealerSlug, handoverRecords, monthBuckets, pgiRecords, schedule, scheduleByChassis, yardStock]);

  const dealerDisplayName = useMemo(() => prettifyDealerName(dealerSlug), [dealerSlug]);
  const sidebarOrders = useMemo(() => schedule.filter((item) => slugifyDealerName((item as any)?.Dealer) === dealerSlug), [schedule, dealerSlug]);

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

          <Card className="shadow-sm border-slate-200">
            <CardHeader className="border-b border-slate-200 pb-4">
              <CardTitle className="text-lg font-semibold text-slate-900">Stock Model Outlook</CardTitle>
            </CardHeader>
            <CardContent className="overflow-auto">
              <Table className="min-w-[720px] text-sm">
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="font-semibold text-slate-700">Stock Model</TableHead>
                    <TableHead className="text-right font-semibold text-slate-700">Current Yard Stock</TableHead>
                    <TableHead className="text-right font-semibold text-red-600">Handover (Last 3 Months)</TableHead>
                    <TableHead className="text-right font-semibold text-slate-700">Factory PGI (Last 3 Months)</TableHead>
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
                      <TableCell colSpan={4 + monthBuckets.length}>
                        <div className="py-6 text-center text-slate-500">No stock models in yard inventory.</div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    modelRows.map((row) => (
                      <TableRow key={row.model} className="hover:bg-slate-50/80">
                        <TableCell className="font-medium text-slate-900">{row.model}</TableCell>
                        <TableCell className="text-right text-slate-800">{row.currentStock}</TableCell>
                        <TableCell className="text-right font-semibold text-red-600">{row.recentHandover}</TableCell>
                        <TableCell className="text-right text-slate-800">{row.recentPgi}</TableCell>
                        {monthBuckets.map((_, idx) => (
                          <TableCell key={`${row.model}-${idx}`} className="text-right text-slate-800">
                            {row.incoming[idx] ?? 0}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
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
