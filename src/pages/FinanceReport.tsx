import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ChartContainer,
  ChartLegend,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { subscribeToYardNewVanInvoices } from "@/lib/firebase";
import type { YardNewVanInvoice } from "@/types";
import {
  isFinanceReportEnabled,
  normalizeDealerSlug,
  prettifyDealerName,
} from "@/lib/dealerUtils";
import { AlertTriangle } from "lucide-react";
import { format, isValid, parse, parseISO, startOfMonth, startOfYear, subMonths } from "date-fns";
import { Area, Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";

const currency = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

const compactCurrency = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const currency = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

const defaultDateRange = () => {
  const today = new Date();
  return {
    start: format(startOfMonth(subMonths(today, 2)), "yyyy-MM-dd"),
    end: format(today, "yyyy-MM-dd"),
  };
};

const parseInvoiceDate = (value?: string): Date | null => {
  if (!value) return null;
  const isoCandidate = parseISO(value);
  if (isValid(isoCandidate)) return isoCandidate;

  const slashCandidate = parse(value, "dd/MM/yyyy", new Date());
  if (isValid(slashCandidate)) return slashCandidate;

  const nativeCandidate = new Date(value);
  return isValid(nativeCandidate) ? nativeCandidate : null;
};

const formatCompactMoney = (value: number) => {
  if (!Number.isFinite(value)) return "$0";
  return compactCurrency.format(value);
};


const formatPercent = (value: number) => {
  if (!Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
};

type QuickRangePreset = "LAST_3_MONTHS" | "THIS_MONTH" | "THIS_YEAR";
type MonthlyTrendDatum = {
  key: string;
  label: string;
  revenue: number;
  units: number;
  avgDiscountRate: number;
};

const FinanceReport = () => {
  const { dealerSlug: rawDealerSlug } = useParams<{ dealerSlug: string }>();
  const dealerSlug = useMemo(() => normalizeDealerSlug(rawDealerSlug), [rawDealerSlug]);
  const dealerDisplayName = useMemo(() => prettifyDealerName(dealerSlug), [dealerSlug]);
  const financeEnabled = isFinanceReportEnabled(dealerSlug);

  const [invoices, setInvoices] = useState<YardNewVanInvoice[]>([]);
  const [dateRange, setDateRange] = useState(defaultDateRange);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dealerSlug || !financeEnabled) {
      setInvoices([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = subscribeToYardNewVanInvoices(dealerSlug, (data) => {
      setInvoices(data);
      setLoading(false);
    });

    return unsub;
  }, [dealerSlug, financeEnabled]);

  const filteredInvoices = useMemo(() => {
    const startDate = dateRange.start ? new Date(dateRange.start) : null;
    const endDate = dateRange.end ? new Date(dateRange.end) : null;

    return invoices
      .filter((invoice) => {
        const invoiceDate = parseInvoiceDate(invoice.invoiceDate);
        if (!invoiceDate) return false;
        if (startDate && invoiceDate < startDate) return false;
        if (endDate) {
          const endOfDay = new Date(endDate);
          endOfDay.setHours(23, 59, 59, 999);
          if (invoiceDate > endOfDay) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const dateA = parseInvoiceDate(a.invoiceDate)?.getTime() ?? 0;
        const dateB = parseInvoiceDate(b.invoiceDate)?.getTime() ?? 0;
        return dateB - dateA;
      });
  }, [invoices, dateRange]);

  const summary = useMemo(() => {
    const totalRevenue = filteredInvoices.reduce((sum, invoice) => sum + invoice.finalSalePrice, 0);
    const totalDiscount = filteredInvoices.reduce((sum, invoice) => sum + invoice.discountAmount, 0);
    const totalCost = filteredInvoices.reduce((sum, invoice) => sum + invoice.purchasePrice, 0);
    const averageSalePrice = filteredInvoices.length ? totalRevenue / filteredInvoices.length : 0;
    const grossMargin = totalRevenue - totalCost;
    const totalUnits = filteredInvoices.length;
    const averageDiscountRate = totalRevenue ? totalDiscount / totalRevenue : 0;
    const grossMarginRate = totalRevenue ? grossMargin / totalRevenue : 0;

    return {
      totalRevenue,
      totalDiscount,
      averageSalePrice,
      grossMargin,
      totalCost,
      totalUnits,
      averageDiscountRate,
      grossMarginRate,
    };
  }, [filteredInvoices]);

  const analytics = useMemo(() => {
    if (!filteredInvoices.length) {
      return {
        averageMarginRate: 0,
        averagePurchase: 0,
        highestSale: null as YardNewVanInvoice | null,
        strongestMarginInvoice: null as YardNewVanInvoice | null,
        strongestMarginRate: 0,
        modelMix: [] as Array<{
          model: string;
          units: number;
          revenue: number;
          margin: number;
          avgSale: number;
          marginRate: number;
        }>,
        discountBreakdown: [] as Array<{
          label: string;
          units: number;
          revenue: number;
          share: number;
        }>,
      };
    }

    const discountSegments = [
      { label: "Minimal (<$5k)", min: 0, max: 4999 },
      { label: "$5k – $10k", min: 5000, max: 9999 },
      { label: "$10k – $15k", min: 10000, max: 14999 },
      { label: ">$15k", min: 15000, max: Number.POSITIVE_INFINITY },
    ];

    const discountStats = discountSegments.map((segment) => ({
      ...segment,
      units: 0,
      revenue: 0,
    }));

    let marginRateSum = 0;
    let highestSale: YardNewVanInvoice | null = null;
    let strongestMarginInvoice: { invoice: YardNewVanInvoice; rate: number } | null = null;
    const modelMap = new Map<
      string,
      { units: number; revenue: number; margin: number }
    >();

    filteredInvoices.forEach((invoice) => {
      const margin = invoice.finalSalePrice - invoice.purchasePrice;
      const marginRate = invoice.finalSalePrice ? margin / invoice.finalSalePrice : 0;
      marginRateSum += marginRate;

      if (!highestSale || invoice.finalSalePrice > highestSale.finalSalePrice) {
        highestSale = invoice;
      }

      if (!strongestMarginInvoice || marginRate > strongestMarginInvoice.rate) {
        strongestMarginInvoice = { invoice, rate: marginRate };
      }

      const modelKey = invoice.model?.trim() || "Unspecified";
      const existing = modelMap.get(modelKey) ?? { units: 0, revenue: 0, margin: 0 };
      existing.units += 1;
      existing.revenue += invoice.finalSalePrice;
      existing.margin += margin;
      modelMap.set(modelKey, existing);

      const discountValue = Math.abs(invoice.discountAmount);
      const tier = discountStats.find((segment) => discountValue >= segment.min && discountValue <= segment.max);
      if (tier) {
        tier.units += 1;
        tier.revenue += invoice.finalSalePrice;
      }
    });

    const modelMix = Array.from(modelMap.entries())
      .map(([model, stats]) => ({
        model,
        ...stats,
        avgSale: stats.units ? stats.revenue / stats.units : 0,
        marginRate: stats.revenue ? stats.margin / stats.revenue : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const discountBreakdown = discountStats.map((segment) => ({
      label: segment.label,
      units: segment.units,
      revenue: segment.revenue,
      share: summary.totalUnits ? segment.units / summary.totalUnits : 0,
    }));

    return {
      averageMarginRate: summary.totalUnits ? marginRateSum / summary.totalUnits : 0,
      averagePurchase: summary.totalUnits ? summary.totalCost / summary.totalUnits : 0,
      highestSale,
      strongestMarginInvoice: strongestMarginInvoice?.invoice ?? null,
      strongestMarginRate: strongestMarginInvoice?.rate ?? 0,
      modelMix,
      discountBreakdown,
    };
  }, [filteredInvoices, summary.totalCost, summary.totalUnits]);

  const monthlySummary = useMemo(() => {
    const monthlyMap = new Map<
      string,
      { label: string; revenue: number; discount: number; count: number }
    >();

    filteredInvoices.forEach((invoice) => {
      const invoiceDate = parseInvoiceDate(invoice.invoiceDate);
      if (!invoiceDate) return;
      const key = format(invoiceDate, "yyyy-MM");
      const existing = monthlyMap.get(key) ?? {
        label: format(invoiceDate, "MMMM yyyy"),
        revenue: 0,
        discount: 0,
        count: 0,
      };

      existing.revenue += invoice.finalSalePrice;
      existing.discount += invoice.discountAmount;
      existing.count += 1;
      monthlyMap.set(key, existing);
    });

    return Array.from(monthlyMap.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, value]) => ({
        key,
        ...value,
        avgSalePrice: value.count ? value.revenue / value.count : 0,
        avgDiscountRate: value.revenue ? value.discount / value.revenue : 0,
      }));
  }, [filteredInvoices]);

  const momentum = useMemo(() => {
    if (!monthlySummary.length) {
      return {
        currentLabel: "No data",
        previousLabel: null as string | null,
        revenueDelta: null as number | null,
        discountDelta: null as number | null,
        currentDiscountRate: 0,
      };
    }

    const [current, previous] = monthlySummary;
    const revenueDelta = previous ? (current.revenue - previous.revenue) / previous.revenue : null;
    const discountDelta = previous ? current.avgDiscountRate - previous.avgDiscountRate : null;

    return {
      currentLabel: current.label,
      previousLabel: previous?.label ?? null,
      revenueDelta,
      discountDelta,
      currentDiscountRate: current.avgDiscountRate,
    };
  }, [monthlySummary]);

  const handleDateChange = (key: "start" | "end", value: string) => {
    setDateRange((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleQuickRange = (preset: QuickRangePreset) => {
    const today = new Date();

    if (preset === "THIS_MONTH") {
      setDateRange({
        start: format(startOfMonth(today), "yyyy-MM-dd"),
        end: format(today, "yyyy-MM-dd"),
      });
      return;
    }

    if (preset === "THIS_YEAR") {
      setDateRange({
        start: format(startOfYear(today), "yyyy-MM-dd"),
        end: format(today, "yyyy-MM-dd"),
      });
      return;
    }

    setDateRange(defaultDateRange());
  };

  const monthlyTrendData = useMemo<MonthlyTrendDatum[]>(() => {
    if (!monthlySummary.length) return [];

    const chronological = [...monthlySummary].reverse();

    return chronological.map((month) => ({
      key: month.key,
      label: month.label,
      revenue: month.revenue,
      units: month.count,
      avgDiscountRate: month.avgDiscountRate,
    }));
  }, [monthlySummary]);
  
  const content = (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Date Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="start-date">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={dateRange.start}
                onChange={(event) => handleDateChange("end", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Quick Ranges</Label>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="flex-1" onClick={() => handleQuickRange("LAST_3_MONTHS")}>
                  Last 3 Months
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => handleQuickRange("THIS_MONTH")}>
                  This Month
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => handleQuickRange("THIS_YEAR")}>
                  This Year
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Performance Trend</CardTitle>
          <p className="text-sm text-muted-foreground">
            Track actual revenue, unit volume, and discount rate across months
          </p>
        </CardHeader>
        <CardContent>
          {monthlyTrendData.length === 0 ? (
            <p className="text-muted-foreground">Need invoices across multiple months to show a trend.</p>
          ) : (
            <ChartContainer
              config={{
                revenue: { label: "Revenue", color: "hsl(var(--chart-1))" },
                avgDiscountRate: { label: "Avg Discount %", color: "hsl(var(--chart-2))" },
                units: { label: "Invoice Units", color: "hsl(var(--chart-3))" },
              }}
              className="h-[360px]"
            >
              <ComposedChart data={monthlyTrendData} margin={{ left: 12, right: 12, top: 12, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={20} />
                <YAxis
                  yAxisId="revenue"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => formatCompactMoney(value as number)}
                />
                <YAxis
                  yAxisId="discount"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${Math.round((value as number) * 100)}%`}
                />
                <YAxis yAxisId="units" hide domain={[0, "auto"]} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      indicator="line"
                      formatter={(value, name, item, __, payload) => {
                        if (!payload || typeof value !== "number") return null;

                        if (item?.dataKey === "revenue") {
                          return (
                            <div className="flex flex-1 justify-between">
                              <span>Revenue</span>
                              <span className="font-medium">{currency.format(value)}</span>
                            </div>
                          );
                        }

                        if (item?.dataKey === "units") {
                          return (
                            <div className="flex flex-1 justify-between">
                              <span>Invoice Units</span>
                              <span className="font-medium">{value}</span>
                            </div>
                          );
                        }

                        return (
                          <div className="flex flex-1 justify-between">
                            <span>Avg Discount %</span>
                            <span className="font-medium">{formatPercent(value)}</span>
                          </div>
                        );
                      }}
                    />
                  }
                />
                <ChartLegend />
                <Bar dataKey="units" yAxisId="units" fill="var(--color-units)" radius={[4, 4, 0, 0]} barSize={22} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  yAxisId="revenue"
                  stroke="var(--color-revenue)"
                  strokeWidth={2}
                  fill="url(#revenueGradient)"
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="avgDiscountRate"
                  yAxisId="discount"
                  stroke="var(--color-avgDiscountRate)"
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="6 4"
                />
              </ComposedChart>
            </ChartContainer>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            Revenue (area), invoice units (bars), and discount rate (line) now use their true values so you can compare scale
            and direction at a glance.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Total Revenue (ex GST)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">
              {currency.format(summary.totalRevenue)}
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Based on {filteredInvoices.length} invoices
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total Discount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">
              {currency.format(summary.totalDiscount)}
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Incl. surcharges and adjustments
            </p>

          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Average Sale Price</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">
              {currency.format(summary.averageSalePrice)}
            </div>
            <p className="text-sm text-slate-500 mt-1">Per vehicle</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Gross Margin</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">
              {currency.format(summary.grossMargin)}
            </div>
            <p className="text-sm text-slate-500 mt-1">Revenue minus purchase cost</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Units Delivered</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">{summary.totalUnits}</div>
            <p className="text-sm text-slate-500 mt-1">Invoices within selected period</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Average Margin %</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">
              {formatPercent(analytics.averageMarginRate)}
            </div>
            <p className="text-sm text-slate-500 mt-1">Per unit margin over sale price</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Average Discount %</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">
              {formatPercent(summary.averageDiscountRate)}
            </div>
            <p className="text-sm text-slate-500 mt-1">Total discount vs revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Average Purchase Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">
              {currency.format(analytics.averagePurchase)}
            </div>
            <p className="text-sm text-slate-500 mt-1">Per chassis procurement</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Momentum</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Latest month</p>
              <p className="text-xl font-semibold">{momentum.currentLabel}</p>
            </div>
            {momentum.previousLabel ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Revenue change vs {momentum.previousLabel}</p>
                    <p className="text-lg font-semibold">
                      {momentum.revenueDelta == null ? "-" : formatPercent(momentum.revenueDelta)}
                    </p>
                  </div>
                  {momentum.revenueDelta != null && (
                    <Badge variant={momentum.revenueDelta >= 0 ? "default" : "secondary"}>
                      {momentum.revenueDelta >= 0 ? "Growth" : "Decline"}
                    </Badge>
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Discount trend</p>
                  <div className="flex items-center gap-3">
                    <Progress
                      value={Math.min(Math.max(momentum.currentDiscountRate * 100, 0), 100)}
                      className="w-full"
                    />
                    <span className="text-sm font-medium">
                      {momentum.discountDelta == null ? "-" : formatPercent(momentum.discountDelta)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Current discount rate {formatPercent(momentum.currentDiscountRate)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">Need at least two months of data to show momentum.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Profitability Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Margin rate</p>
                <p className="text-xl font-semibold">{formatPercent(summary.grossMarginRate)}</p>
              </div>
              <Progress value={Math.min(Math.max(summary.grossMarginRate * 100, 0), 100)} className="w-32" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Discount rate</p>
                <p className="text-xl font-semibold">{formatPercent(summary.averageDiscountRate)}</p>
              </div>
              <Progress value={Math.min(Math.max(summary.averageDiscountRate * 100, 0), 100)} className="w-32" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Average sale price</p>
                <p className="text-xl font-semibold">{currency.format(summary.averageSalePrice)}</p>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <p>Avg purchase {currency.format(analytics.averagePurchase)}</p>
                <p>Avg margin {currency.format(summary.averageSalePrice - analytics.averagePurchase)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Revenue & Discount Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {monthlySummary.length === 0 ? (
            <p className="text-muted-foreground">No invoices for the selected period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead className="text-right">Avg Sale</TableHead>
                  <TableHead className="text-right">Avg Discount %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlySummary.map((month) => (
                  <TableRow key={month.key}>
                    <TableCell className="font-medium">{month.label}</TableCell>
                    <TableCell className="text-right">{month.count}</TableCell>
                    <TableCell className="text-right">{currency.format(month.revenue)}</TableCell>
                    <TableCell className="text-right">{currency.format(month.discount)}</TableCell>
                    <TableCell className="text-right">{currency.format(month.avgSalePrice)}</TableCell>
                    <TableCell className="text-right">
                      {(month.avgDiscountRate * 100).toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Model Mix</CardTitle>
            <p className="text-sm text-muted-foreground">Top performing models by revenue</p>
          </CardHeader>
          <CardContent>
            {analytics.modelMix.length === 0 ? (
              <p className="text-muted-foreground">No models recorded.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Margin %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.modelMix.slice(0, 5).map((model) => (
                    <TableRow key={model.model}>
                      <TableCell className="font-medium">{model.model}</TableCell>
                      <TableCell className="text-right">{model.units}</TableCell>
                      <TableCell className="text-right">{currency.format(model.revenue)}</TableCell>
                      <TableCell className="text-right">{formatPercent(model.marginRate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Discount Profile</CardTitle>
            <p className="text-sm text-muted-foreground">Distribution of concessions</p>
          </CardHeader>
          <CardContent>
            {analytics.discountBreakdown.length === 0 ? (
              <p className="text-muted-foreground">No discount data captured.</p>
            ) : (
              <div className="space-y-4">
                {analytics.discountBreakdown.map((segment) => (
                  <div key={segment.label}>
                    <div className="flex items-center justify-between text-sm font-medium">
                      <span>{segment.label}</span>
                      <span>{segment.units} units</span>
                    </div>
                    <Progress value={segment.share * 100} className="mt-2" />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>{formatPercent(segment.share)} of sales</span>
                      <span>{currency.format(segment.revenue)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invoice Detail</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredInvoices.length === 0 ? (
            <p className="text-muted-foreground">No matching invoices.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Chassis</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Purchase</TableHead>
                  <TableHead className="text-right">Sale (ex GST)</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">Margin %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map((invoice) => {
                  const invoiceDate = parseInvoiceDate(invoice.invoiceDate);
                  const margin = invoice.finalSalePrice - invoice.purchasePrice;
                  const marginRate = invoice.finalSalePrice ? margin / invoice.finalSalePrice : 0;
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell>
                        {invoiceDate ? format(invoiceDate, "dd MMM yyyy") : "-"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{invoice.chassisNumber}</TableCell>
                      <TableCell>{invoice.customer || "-"}</TableCell>
                      <TableCell>{invoice.model || "-"}</TableCell>
                      <TableCell className="text-right">{currency.format(invoice.purchasePrice)}</TableCell>
                      <TableCell className="text-right">{currency.format(invoice.finalSalePrice)}</TableCell>
                      <TableCell className="text-right">{currency.format(invoice.discountAmount)}</TableCell>
                      <TableCell className="text-right">{currency.format(margin)}</TableCell>
                      <TableCell className="text-right">{formatPercent(marginRate)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        orders={[]}
        selectedDealer={dealerSlug}
        onDealerSelect={() => {}}
        hideOtherDealers
        currentDealerName={dealerDisplayName}
        showStats={false}
      />
      <main className="flex-1 p-6 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">
            Finance Report — {dealerDisplayName}
          </h1>
          <p className="text-muted-foreground">Performance snapshots for new van sales</p>
        </header>

        <Tabs defaultValue="new-vans" className="space-y-6">
          <TabsList>
            <TabsTrigger value="new-vans">New Van Sales</TabsTrigger>
            <TabsTrigger value="parts" disabled>
              Parts Sales
            </TabsTrigger>
            <TabsTrigger value="second-hand" disabled>
              Second Hand Van Sales
            </TabsTrigger>
          </TabsList>

          <TabsContent value="new-vans">
            {loading ? (
              <Card>
                <CardContent className="p-10 text-center text-muted-foreground">
                  Loading finance data...
                </CardContent>
              </Card>
            ) : !financeEnabled ? (
              <Card>
                <CardContent className="p-10 text-center">
                  <div className="flex items-center justify-center gap-2 text-red-600">
                    <AlertTriangle className="h-5 w-5" />
                    Finance report is not available for this dealer.
                  </div>
                </CardContent>
              </Card>
            ) : (
              content
            )}
          </TabsContent>

          <TabsContent value="parts">
            <Card>
              <CardContent className="p-10 text-center text-muted-foreground">
                Parts analytics is under construction.
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="second-hand">
            <Card>
              <CardContent className="p-10 text-center text-muted-foreground">
                Second hand sales analytics is under construction.
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default FinanceReport;
