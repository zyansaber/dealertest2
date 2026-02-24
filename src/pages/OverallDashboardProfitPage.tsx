import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { subscribeToChassisPrices, subscribeToSchedule } from "@/lib/firebase";
import type { ChassisPriceRecord, ScheduleItem } from "@/types";

const FACTORY_DEALERS = [
  { slug: "factory-dealer-total", label: "Factory Dealer (Total)", aliases: ["factory dealer", "factory dealer total"] },
  { slug: "frankston", label: "Frankston", aliases: ["frankston", "3141"] },
  { slug: "launceston", label: "Launceston", aliases: ["launceston", "3126"] },
  { slug: "st-james", label: "ST James", aliases: ["st james", "st-james", "3121"] },
  { slug: "traralgon", label: "Traralgon", aliases: ["traralgon", "3123"] },
  { slug: "geelong", label: "Geelong", aliases: ["geelong", "3128"] },
] as const;

const DEALER_SLUGS = new Set(FACTORY_DEALERS.map((dealer) => dealer.slug).filter((slug) => slug !== "factory-dealer-total"));

const normalizeText = (value: unknown) => String(value ?? "").trim().toLowerCase();

const parseDate = (value?: string | null) => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const d = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  return Number.isNaN(d.getTime()) ? null : d;
};

const startOfMonthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const formatMonthKey = (monthKey: string) => {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, (month || 1) - 1, 1).toLocaleDateString("en-AU", { month: "short", year: "numeric" });
};

const addDays = (date: Date, days: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const resolveDealerSlug = (salesOfficeName?: string, scheduleDealer?: string) => {
  const office = normalizeText(salesOfficeName);
  const dealer = normalizeText(scheduleDealer);

  const found = FACTORY_DEALERS.find((option) => option.aliases.some((alias) => office === alias));
  if (found && found.slug !== "factory-dealer-total") return found.slug;

  const dealerHit = FACTORY_DEALERS.find((option) => option.aliases.some((alias) => dealer === alias));
  if (dealerHit && dealerHit.slug !== "factory-dealer-total") return dealerHit.slug;

  return "";
};

export default function OverallDashboardProfitPage() {
  const [chassisPrices, setChassisPrices] = useState<ChassisPriceRecord[]>([]);
  const [scheduleOrders, setScheduleOrders] = useState<ScheduleItem[]>([]);
  const [selectedDealer, setSelectedDealer] = useState<string>("factory-dealer-total");

  useEffect(() => {
    const unsubPrices = subscribeToChassisPrices((rows) => setChassisPrices(rows || []));
    const unsubSchedule = subscribeToSchedule(
      (rows) => setScheduleOrders(rows || []),
      {
        includeNoChassis: true,
        includeNoCustomer: true,
        includeFinished: true,
      }
    );

    return () => {
      unsubPrices?.();
      unsubSchedule?.();
    };
  }, []);

  const scheduleByChassis = useMemo(() => {
    const map: Record<string, ScheduleItem> = {};
    scheduleOrders.forEach((order) => {
      const chassis = String(order?.Chassis ?? "").trim().toUpperCase();
      if (chassis) map[chassis] = order;
    });
    return map;
  }, [scheduleOrders]);

  const summary = useMemo(() => {
    const actualByMonthDealer = new Map<string, number>();
    const forecastByMonthDealer = new Map<string, number>();
    let actualInvoiceTotal = 0;
    let actualProfitTotal = 0;
    let forecastProfitTotal = 0;

    const dealerFilter = (slug: string) => selectedDealer === "factory-dealer-total" || slug === selectedDealer;

    chassisPrices.forEach((row) => {
      const chassis = String(row.chassisNumber ?? "").trim().toUpperCase();
      const scheduleMatch = chassis ? scheduleByChassis[chassis] : undefined;
      const dealerSlug = resolveDealerSlug(row.salesOfficeName, String(scheduleMatch?.Dealer ?? ""));
      if (!DEALER_SLUGS.has(dealerSlug) || !dealerFilter(dealerSlug)) return;

      const baseCost = Number(row.soNetValue3110IncGst ?? 0);
      const invoiceAmount = Number(row.invoiceNetValueIncGst ?? 0);
      const invoiceDate = parseDate(row.invoiceDate312x);
      const hasInvoice = Boolean(row.hasInvoice) && !!invoiceDate;

      if (hasInvoice) {
        const monthKey = startOfMonthKey(invoiceDate);
        actualInvoiceTotal += invoiceAmount;
        const profit = invoiceAmount - baseCost;
        actualProfitTotal += profit;
        actualByMonthDealer.set(`${monthKey}|${dealerSlug}`, (actualByMonthDealer.get(`${monthKey}|${dealerSlug}`) ?? 0) + profit);
      }

      // Forecast profit: MUST be stock + hasInvoice=false
      const isStock = normalizeText(row.billToNameFinal) === "stock";
      const isUninvoiced = row.hasInvoice === false;
      const forecastDate = parseDate(String(scheduleMatch?.["Forecast Production Date"] ?? ""));
      if (!isStock || !isUninvoiced || !forecastDate) return;

      const arrivalDate = addDays(forecastDate, 30);
      const monthKey = startOfMonthKey(arrivalDate);
      const expectedRevenue = Number(row.finalPriceIncGst ?? 0);
      const expectedProfit = expectedRevenue - baseCost;
      forecastProfitTotal += expectedProfit;
      forecastByMonthDealer.set(`${monthKey}|${dealerSlug}`, (forecastByMonthDealer.get(`${monthKey}|${dealerSlug}`) ?? 0) + expectedProfit);
    });

    const buildChartRows = (source: Map<string, number>, prefix: "actual" | "forecast") => {
      const months = Array.from(new Set(Array.from(source.keys()).map((key) => key.split("|")[0]))).sort();
      return months.map((monthKey) => {
        const base: Record<string, string | number> = {
          month: formatMonthKey(monthKey),
          total: 0,
        };

        FACTORY_DEALERS.forEach((dealer) => {
          if (dealer.slug === "factory-dealer-total") return;
          const value = source.get(`${monthKey}|${dealer.slug}`) ?? 0;
          base[`${prefix}_${dealer.slug}`] = value;
          base.total = Number(base.total) + value;
        });

        return base;
      });
    };

    return {
      actualChartRows: buildChartRows(actualByMonthDealer, "actual"),
      forecastChartRows: buildChartRows(forecastByMonthDealer, "forecast"),
      actualInvoiceTotal,
      actualProfitTotal,
      forecastProfitTotal,
    };
  }, [chassisPrices, scheduleByChassis, selectedDealer]);

  const money = (value: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);

  return (
    <div className="min-h-screen bg-slate-50 p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Overall Dashboard · Profit (Test)</h1>
          <p className="text-sm text-slate-600 mt-1">仅包含 Factory dealer：Factory Dealer (Total)、Frankston、Launceston、ST James、Traralgon、Geelong。</p>
        </div>
        <div className="w-full md:w-72">
          <p className="text-xs text-slate-500 mb-1">Dealer</p>
          <Select value={selectedDealer} onValueChange={setSelectedDealer}>
            <SelectTrigger>
              <SelectValue placeholder="Select dealer" />
            </SelectTrigger>
            <SelectContent>
              {FACTORY_DEALERS.map((dealer) => (
                <SelectItem key={dealer.slug} value={dealer.slug}>
                  {dealer.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Invoice Amount (inc GST)</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{money(summary.actualInvoiceTotal)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Actual Profit</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{money(summary.actualProfitTotal)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Forecast Profit (+30 days, stock, hasInvoice=false)</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{money(summary.forecastProfitTotal)}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Actual Profit by Invoice Month</CardTitle>
        </CardHeader>
        <CardContent className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={summary.actualChartRows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
              <Tooltip formatter={(value: number) => money(Number(value))} />
              <Bar dataKey="total" fill="#16a34a" name="Actual Profit" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Forecast Profit from Forecast Delivery Volume (+30 days)</CardTitle>
        </CardHeader>
        <CardContent className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={summary.forecastChartRows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
              <Tooltip formatter={(value: number) => money(Number(value))} />
              <Bar dataKey="total" fill="#2563eb" name="Forecast Profit" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
