import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  useEffect(() => {
    const unsubPrices = subscribeToChassisPrices((rows) => setChassisPrices(rows || []));
    const unsubSchedule = subscribeToSchedule((rows) => setScheduleOrders(rows || []), {
      includeNoChassis: true,
      includeNoCustomer: true,
      includeFinished: true,
    });

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

    chassisPrices.forEach((row) => {
      const chassis = String(row.chassisNumber ?? "").trim().toUpperCase();
      const scheduleMatch = chassis ? scheduleByChassis[chassis] : undefined;
      const dealerSlug = resolveDealerSlug(row.salesOfficeName, String(scheduleMatch?.Dealer ?? ""));
      if (!DEALER_SLUGS.has(dealerSlug)) return;

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

      const isStock = normalizeText(row.billToNameFinal) === "stock";
      const forecastDate = parseDate(String(scheduleMatch?.["Forecast Production Date"] ?? ""));
      if (!isStock || !forecastDate) return;

      const arrivalDate = addDays(forecastDate, 30);
      const monthKey = startOfMonthKey(arrivalDate);
      const expectedRevenue = Number(row.finalPriceIncGst ?? invoiceAmount);
      const expectedProfit = expectedRevenue - baseCost;
      forecastProfitTotal += expectedProfit;
      forecastByMonthDealer.set(`${monthKey}|${dealerSlug}`, (forecastByMonthDealer.get(`${monthKey}|${dealerSlug}`) ?? 0) + expectedProfit);
    });

    const months = Array.from(
      new Set([
        ...Array.from(actualByMonthDealer.keys()).map((key) => key.split("|")[0]),
        ...Array.from(forecastByMonthDealer.keys()).map((key) => key.split("|")[0]),
      ])
    ).sort();

    const chartRows = months.map((monthKey) => {
      const base: Record<string, string | number> = {
        month: formatMonthKey(monthKey),
        actualTotal: 0,
        forecastTotal: 0,
      };

      FACTORY_DEALERS.forEach((dealer) => {
        if (dealer.slug === "factory-dealer-total") return;
        const actual = actualByMonthDealer.get(`${monthKey}|${dealer.slug}`) ?? 0;
        const forecast = forecastByMonthDealer.get(`${monthKey}|${dealer.slug}`) ?? 0;
        base[`actual_${dealer.slug}`] = actual;
        base[`forecast_${dealer.slug}`] = forecast;
        base.actualTotal = Number(base.actualTotal) + actual;
        base.forecastTotal = Number(base.forecastTotal) + forecast;
      });

      return base;
    });

    return {
      chartRows,
      actualInvoiceTotal,
      actualProfitTotal,
      forecastProfitTotal,
    };
  }, [chassisPrices, scheduleByChassis]);

  const money = (value: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);

  return (
    <div className="min-h-screen bg-slate-50 p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Overall Dashboard · Profit (Test)</h1>
        <p className="text-sm text-slate-600 mt-1">
          仅包含 Factory dealer：Factory Dealer (Total)、Frankston、Launceston、ST James、Traralgon、Geelong。
        </p>
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
            <CardTitle>Forecast Profit (+30 days, stock)</CardTitle>
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
            <BarChart data={summary.chartRows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
              <Tooltip formatter={(value: number) => money(Number(value))} />
              <Bar dataKey="actualTotal" fill="#16a34a" name="Actual Profit" />
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
            <BarChart data={summary.chartRows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
              <Tooltip formatter={(value: number) => money(Number(value))} />
              <Bar dataKey="forecastTotal" fill="#2563eb" name="Forecast Profit" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
