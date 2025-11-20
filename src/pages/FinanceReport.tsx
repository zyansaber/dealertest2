import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  subscribeToNewSales,
  subscribeToSecondHandSales,
  subscribeToStockToCustomer,
  subscribeToYardNewVanInvoices,
} from "@/lib/firebase";
import type { NewSaleRecord, SecondHandSale, StockToCustomerRecord, YardNewVanInvoice } from "@/types";
import {
  isFinanceReportEnabled,
  normalizeDealerSlug,
  prettifyDealerName,
} from "@/lib/dealerUtils";
import { AlertTriangle, FileDown } from "lucide-react";
import { addDays, format, isValid, parse, parseISO, startOfMonth, startOfWeek, startOfYear, subMonths } from "date-fns";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  XAxis,
  YAxis,
} from "recharts";
import * as XLSX from "xlsx";

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

const defaultDateRange = () => {
  const today = new Date();
  return {
    start: format(startOfYear(today), "yyyy-MM-dd"),
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

const getInvoiceDate = (invoice: YardNewVanInvoice) =>
  parseInvoiceDate(invoice.createdOn ?? invoice.invoiceDate);

const buildMonthSequence = (startMonth: Date, endMonth: Date) => {
  const months: { key: string; label: string }[] = [];
  const cursor = new Date(startMonth.getFullYear(), startMonth.getMonth(), 1);
  const finalMonth = new Date(endMonth.getFullYear(), endMonth.getMonth(), 1);

  while (cursor <= finalMonth) {
    months.push({ key: format(cursor, "yyyy-MM"), label: format(cursor, "MMM yyyy") });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
};

const formatPercent = (value: number) => {
  if (!Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
};

const formatCompactMoney = (value: number) => {
  if (!Number.isFinite(value)) return "$0";
  return compactCurrency.format(value);
};

type QuickRangePreset = "THIS_WEEK" | "LAST_3_MONTHS" | "THIS_MONTH" | "THIS_YEAR";
type MonthlyTrendDatum = {
  key: string;
  label: string;
  revenue: number;
  units: number;
  avgDiscountRate: number;
};

type SecondHandTrendDatum = {
  key: string;
  label: string;
  revenue: number;
  pgiCount: number;
  grCount: number;
  avgMarginRate: number;
};

const FinanceReport = () => {
  const { dealerSlug: rawDealerSlug } = useParams<{ dealerSlug: string }>();
  const dealerSlug = useMemo(() => normalizeDealerSlug(rawDealerSlug), [rawDealerSlug]);
  const dealerDisplayName = useMemo(() => prettifyDealerName(dealerSlug), [dealerSlug]);
  const financeEnabled = isFinanceReportEnabled(dealerSlug);

  const [invoices, setInvoices] = useState<YardNewVanInvoice[]>([]);
  const [secondHandSales, setSecondHandSales] = useState<SecondHandSale[]>([]);
  const [newSales, setNewSales] = useState<NewSaleRecord[]>([]);
  const [stockToCustomerOrders, setStockToCustomerOrders] = useState<StockToCustomerRecord[]>([]);
  const [dateRange, setDateRange] = useState(defaultDateRange);
  const [loading, setLoading] = useState(true);
  const [secondHandLoading, setSecondHandLoading] = useState(true);
  const [newSalesLoading, setNewSalesLoading] = useState(true);
  const [stockToCustomerLoading, setStockToCustomerLoading] = useState(true);
  const [weeklyDialogOpen, setWeeklyDialogOpen] = useState(false);

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

  useEffect(() => {
    if (!dealerSlug) {
      setSecondHandSales([]);
      setSecondHandLoading(false);
      return;
    }

    setSecondHandLoading(true);
    const unsub = subscribeToSecondHandSales(dealerSlug, (data) => {
      setSecondHandSales(data);
      setSecondHandLoading(false);
    });

    return unsub;
  }, [dealerSlug]);

  useEffect(() => {
    if (!dealerSlug) {
      setNewSales([]);
      setNewSalesLoading(false);
      return;
    }

    setNewSalesLoading(true);
    const unsub = subscribeToNewSales(dealerSlug, (data) => {
      setNewSales(data);
      setNewSalesLoading(false);
    });

    return unsub;
  }, [dealerSlug]);

  useEffect(() => {
    if (!dealerSlug) {
      setStockToCustomerOrders([]);
      setStockToCustomerLoading(false);
      return;
    }

    setStockToCustomerLoading(true);
    const unsub = subscribeToStockToCustomer(dealerSlug, (data) => {
      setStockToCustomerOrders(data);
      setStockToCustomerLoading(false);
    });

    return unsub;
  }, [dealerSlug]);
  
  const filteredInvoices = useMemo(() => {
    const startDate = dateRange.start ? new Date(dateRange.start) : null;
    const endDate = dateRange.end ? new Date(dateRange.end) : null;

    return invoices
      .filter((invoice) => {
        const invoiceDate = getInvoiceDate(invoice);
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
        const dateA = getInvoiceDate(a)?.getTime() ?? 0;
        const dateB = getInvoiceDate(b)?.getTime() ?? 0;
        return dateB - dateA;
      });
  }, [invoices, dateRange]);

  const filteredSecondHandSales = useMemo(() => {
    const startDate = dateRange.start ? new Date(dateRange.start) : null;
    const endDate = dateRange.end ? new Date(dateRange.end) : null;

    return secondHandSales
      .filter((sale) => {
        const invoiceDate = parseInvoiceDate(sale.invoiceDate);
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
  }, [secondHandSales, dateRange]);

  const filteredNewSales = useMemo(() => {
    const startDate = dateRange.start ? new Date(dateRange.start) : null;
    const endDate = dateRange.end ? new Date(dateRange.end) : null;

    return newSales
      .filter((sale) => {
        const createdOn = parseInvoiceDate(sale.createdOn);
        if (!createdOn) return false;
        if (startDate && createdOn < startDate) return false;
        if (endDate) {
          const endOfDay = new Date(endDate);
          endOfDay.setHours(23, 59, 59, 999);
          if (createdOn > endOfDay) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const dateA = parseInvoiceDate(a.createdOn)?.getTime() ?? 0;
        const dateB = parseInvoiceDate(b.createdOn)?.getTime() ?? 0;
        return dateB - dateA;
      });
  }, [newSales, dateRange]);

const filteredStockToCustomer = useMemo(() => {
    const startDate = dateRange.start ? new Date(dateRange.start) : null;
    const endDate = dateRange.end ? new Date(dateRange.end) : null;

    return stockToCustomerOrders
      .filter((record) => {
        const updateDate = parseInvoiceDate(record.updateDate);
        if (!updateDate) return false;
        if (startDate && updateDate < startDate) return false;
        if (endDate) {
          const endOfDay = new Date(endDate);
          endOfDay.setHours(23, 59, 59, 999);
          if (updateDate > endOfDay) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const dateA = parseInvoiceDate(a.updateDate)?.getTime() ?? 0;
        const dateB = parseInvoiceDate(b.updateDate)?.getTime() ?? 0;
        return dateB - dateA;
      });
  }, [stockToCustomerOrders, dateRange]);


  const retailNewSales = useMemo(
    () => filteredNewSales.filter((sale) => (sale.billToNameFinal ?? "").toLowerCase() !== "stock"),
    [filteredNewSales]
  );

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

  const secondHandSummary = useMemo(() => {
    const totalRevenue = filteredSecondHandSales.reduce((sum, sale) => sum + sale.finalInvoicePrice, 0);
    const totalCost = filteredSecondHandSales.reduce((sum, sale) => sum + sale.poLineNetValue, 0);
    const totalUnits = filteredSecondHandSales.length;
    const grossMargin = totalRevenue - totalCost;
    const lossUnits = filteredSecondHandSales.filter((sale) => sale.finalInvoicePrice - sale.poLineNetValue < 0).length;

    let timeFromPGIToGRSum = 0;
    let timeFromPGIToGRCount = 0;
    filteredSecondHandSales.forEach((sale) => {
      const pgiDate = parseInvoiceDate(sale.pgiDate);
      const grDate = parseInvoiceDate(sale.grDate);
      if (grDate && pgiDate) {
        const diffDays = Math.round((pgiDate.getTime() - grDate.getTime()) / (1000 * 60 * 60 * 24));
        timeFromPGIToGRSum += diffDays;
        timeFromPGIToGRCount += 1;
      }
    });

    return {
      totalRevenue,
      totalCost,
      grossMargin,
      totalUnits,
      lossUnits,
      averageMarginRate: totalRevenue ? grossMargin / totalRevenue : 0,
      averageDaysPGIToGR: timeFromPGIToGRCount ? timeFromPGIToGRSum / timeFromPGIToGRCount : null,
    };
  }, [filteredSecondHandSales]);

    const newSalesSummary = useMemo(() => {
    const modelCounts = new Map<string, number>();
    retailNewSales.forEach((sale) => {
      const key = sale.materialDesc0010?.trim() || "Unspecified";
      modelCounts.set(key, (modelCounts.get(key) ?? 0) + 1);
    });

    const modelBreakdown = Array.from(modelCounts.entries())
      .map(([model, count]) => ({ model, count }))
      .sort((a, b) => b.count - a.count);

    return {
      retailCount: retailNewSales.length,
      uniqueModels: modelCounts.size,
      modelBreakdown,
    };
  }, [retailNewSales]);

  const yardDateStats = useMemo(() => {
    const startDate = dateRange.start ? new Date(dateRange.start) : null;
    const endDate = dateRange.end ? new Date(dateRange.end) : null;

    const pgiDateCount = invoices.filter((invoice) => {
      const pgiDate = parseInvoiceDate(invoice.pgiDate);
      if (!pgiDate) return false;
      if (startDate && pgiDate < startDate) return false;
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        if (pgiDate > endOfDay) return false;
      }
      return true;
    }).length;

    return {
      invoiceDateCount: filteredInvoices.length,
      pgiDateCount,
    };
  }, [filteredInvoices, invoices, dateRange]);

  const stockToCustomerSummary = useMemo(() => {
    const uniqueMaterials = new Set(
      filteredStockToCustomer.map((record) => record.materialDesc || record.materialCode || "Unspecified")
    );

  const latestUpdate = filteredStockToCustomer.reduce<Date | null>((latest, record) => {
      const updateDate = parseInvoiceDate(record.updateDate);
      if (!updateDate) return latest;
      if (!latest || updateDate > latest) return updateDate;
      return latest;
    }, null);

    return {
      totalConversions: filteredStockToCustomer.length,
      uniqueMaterials: uniqueMaterials.size,
      latestUpdate,
    };
  }, [filteredStockToCustomer]);

  type WeeklyActivityRow = { label: string; retail: number; stockToCustomer: number; pgi: number; start: number };

  const weeklyActivity = useMemo(() => {
    const retailDates = retailNewSales
      .map((sale) => parseInvoiceDate(sale.createdOn))
      .filter(Boolean) as Date[];
    const stockToCustomerDates = filteredStockToCustomer
      .map((record) => parseInvoiceDate(record.updateDate))
      .filter(Boolean) as Date[];
    const pgiDates = filteredInvoices.map((invoice) => parseInvoiceDate(invoice.pgiDate)).filter(Boolean) as Date[];

    const allDates = [...retailDates, ...stockToCustomerDates, ...pgiDates];
    if (!allDates.length) return [] as WeeklyActivityRow[];

    const minDate = allDates.reduce((min, date) => (date < min ? date : min));
    const maxDate = allDates.reduce((max, date) => (date > max ? date : max));
    const startWeek = startOfWeek(minDate, { weekStartsOn: 1 });
    const endWeek = startOfWeek(maxDate, { weekStartsOn: 1 });

    const weeks: WeeklyActivityRow[] = [];
    for (let cursor = new Date(startWeek); cursor <= endWeek; cursor = addDays(cursor, 7)) {
      const weekStart = new Date(cursor);
      const weekEnd = addDays(weekStart, 6);
      const inWeek = (date: Date) => date >= weekStart && date <= weekEnd;

      weeks.push({
        label: `${format(weekStart, "dd MMM yyyy")} - ${format(weekEnd, "dd MMM yyyy")}`,
        retail: retailDates.filter((date) => inWeek(date)).length,
        stockToCustomer: stockToCustomerDates.filter((date) => inWeek(date)).length,
        pgi: pgiDates.filter((date) => inWeek(date)).length,
        start: weekStart.getTime(),
      });
    }

    return weeks.sort((a, b) => b.start - a.start);
  }, [filteredInvoices, filteredStockToCustomer, retailNewSales]);

  const weeklyExportRows = useMemo(
    () =>
      weeklyActivity.map((week) => ({
        Week: week.label,
        "Retail Sales": week.retail,
        "Stock → Customer": week.stockToCustomer,
        "PGI Number": week.pgi,
      })),
    [weeklyActivity]
  );

  const handleExportWeeklyActivity = () => {
    if (!weeklyExportRows.length) return;

    try {
      const ws = XLSX.utils.json_to_sheet(weeklyExportRows);
      const colWidths = Object.keys(weeklyExportRows[0]).map((key) => ({ wch: Math.max(key.length, 18) }));
      ws["!cols"] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Weekly Activity");
      XLSX.writeFile(wb, "weekly_activity.xlsx");
    } catch (err) {
      console.error("Failed to export weekly activity:", err);
    }
  };
  
  const retailSalesByMonth = useMemo(() => {
    const createdDates = retailNewSales
      .map((sale) => parseInvoiceDate(sale.createdOn))
      .filter(Boolean) as Date[];

    if (!createdDates.length) return [];

    const explicitStart = dateRange.start ? startOfMonth(new Date(dateRange.start)) : null;
    const explicitEnd = dateRange.end ? startOfMonth(new Date(dateRange.end)) : null;

    const startMonth = explicitStart ?? startOfMonth(createdDates.reduce((min, date) => (date < min ? date : min)));
    const endMonth = explicitEnd ?? startOfMonth(createdDates.reduce((max, date) => (date > max ? date : max)));

    const months = buildMonthSequence(startMonth, endMonth);
    const buckets = new Map(months.map((month) => [month.key, { label: month.label, retailSales: 0 }]));

    retailNewSales.forEach((sale) => {
      const createdDate = parseInvoiceDate(sale.createdOn);
      if (!createdDate) return;

      const key = format(createdDate, "yyyy-MM");
      const bucket = buckets.get(key);
      if (!bucket) return;

      bucket.retailSales += 1;
    });

    return months.map((month) => buckets.get(month.key)!);
  }, [dateRange.end, dateRange.start, retailNewSales]);

  const invoiceCountByMonth = useMemo(() => {
    const invoiceDates = filteredInvoices
      .map((invoice) => getInvoiceDate(invoice))
      .filter(Boolean) as Date[];
    if (!invoiceDates.length) return [];

    const explicitStart = dateRange.start ? startOfMonth(new Date(dateRange.start)) : null;
    const explicitEnd = dateRange.end ? startOfMonth(new Date(dateRange.end)) : null;

    const startMonth = explicitStart ?? startOfMonth(invoiceDates.reduce((min, date) => (date < min ? date : min)));
    const endMonth = explicitEnd ?? startOfMonth(invoiceDates.reduce((max, date) => (date > max ? date : max)));

    const months = buildMonthSequence(startMonth, endMonth);
    const buckets = new Map(months.map((month) => [month.key, { label: month.label, invoiceCount: 0 }]));

    filteredInvoices.forEach((invoice) => {
      const invoiceDate = getInvoiceDate(invoice);
      if (!invoiceDate) return;

      const key = format(invoiceDate, "yyyy-MM");
      const bucket = buckets.get(key);
      if (!bucket) return;

      bucket.invoiceCount += 1;
    });

    return months.map((month) => buckets.get(month.key)!);
  }, [dateRange.end, dateRange.start, filteredInvoices]);

  const stockToCustomerTrend = useMemo(() => {
    const updateDates = filteredStockToCustomer
      .map((record) => parseInvoiceDate(record.updateDate))
      .filter(Boolean) as Date[];

    if (!updateDates.length) return [];

    const explicitStart = dateRange.start ? startOfMonth(new Date(dateRange.start)) : null;
    const explicitEnd = dateRange.end ? startOfMonth(new Date(dateRange.end)) : null;

    const startMonth = explicitStart ?? startOfMonth(updateDates.reduce((min, date) => (date < min ? date : min)));
    const endMonth = explicitEnd ?? startOfMonth(updateDates.reduce((max, date) => (date > max ? date : max)));

    const months = buildMonthSequence(startMonth, endMonth);
    const buckets = new Map(months.map((month) => [month.key, { label: month.label, conversions: 0 }]));

    filteredStockToCustomer.forEach((record) => {
      const updateDate = parseInvoiceDate(record.updateDate);
      if (!updateDate) return;

      const key = format(updateDate, "yyyy-MM");
      const bucket = buckets.get(key);
      if (!bucket) return;

      bucket.conversions += 1;
    });

    return months.map((month) => buckets.get(month.key)!);
  }, [dateRange.end, dateRange.start, filteredStockToCustomer]);

  const retailModelBarData = useMemo(
    () =>
      newSalesSummary.modelBreakdown.slice(0, 8).map((model) => ({
        label: model.model,
        modelCount: model.count,
      })),
    [newSalesSummary.modelBreakdown]
  );

  const stockToCustomerMaterialMix = useMemo(
    () => {
      const counts = new Map<string, number>();

      filteredStockToCustomer.forEach((record) => {
        const key = record.materialDesc || record.materialCode || "Unspecified";
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });

      return Array.from(counts.entries())
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);
    },
    [filteredStockToCustomer]
  );

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
      const invoiceDate = getInvoiceDate(invoice);
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

    if (preset === "THIS_WEEK") {
      setDateRange({
        start: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
        end: format(today, "yyyy-MM-dd"),
      });
      return;
    }

    if (preset === "THIS_MONTH") {
      setDateRange({
        start: format(startOfMonth(today), "yyyy-MM-dd"),
        end: format(today, "yyyy-MM-dd"),
      });
      return;
    }

    if (preset === "LAST_3_MONTHS") {
      setDateRange({
        start: format(startOfMonth(subMonths(today, 2)), "yyyy-MM-dd"),
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
    const invoiceDates = filteredInvoices.map((invoice) => getInvoiceDate(invoice)).filter(Boolean) as Date[];

    if (!invoiceDates.length) return [];

    const explicitStart = dateRange.start ? startOfMonth(new Date(dateRange.start)) : null;
    const explicitEnd = dateRange.end ? startOfMonth(new Date(dateRange.end)) : null;

    const startMonth = explicitStart ?? startOfMonth(invoiceDates.reduce((min, date) => (date < min ? date : min)));
    const endMonth = explicitEnd ?? startOfMonth(invoiceDates.reduce((max, date) => (date > max ? date : max)));

    const months = buildMonthSequence(startMonth, endMonth);

    const monthBuckets = new Map(
      months.map((month) => [month.key, { revenue: 0, discount: 0, units: 0 }])
    );

    filteredInvoices.forEach((invoice) => {
      const invoiceDate = getInvoiceDate(invoice);
      if (!invoiceDate) return;
      const key = format(invoiceDate, "yyyy-MM");
      const bucket = monthBuckets.get(key);
      if (!bucket) return;

      bucket.revenue += invoice.finalSalePrice;
      bucket.discount += invoice.discountAmount;
      bucket.units += 1;
    });

    return months.map((month) => {
      const bucket = monthBuckets.get(month.key)!;
      return {
        key: month.key,
        label: month.label,
        revenue: bucket.revenue,
        units: bucket.units,
        avgDiscountRate: bucket.revenue ? -(bucket.discount / bucket.revenue) : 0,
      };
    });
  }, [dateRange.end, dateRange.start, filteredInvoices]);

  const newCustomerOrderTrend = useMemo(() => {
    const createdDates = filteredNewSales
      .map((sale) => parseInvoiceDate(sale.createdOn))
      .filter(Boolean) as Date[];

    if (!createdDates.length) return [] as { key: string; label: string; revenue: number; orders: number; discountRate: number }[];

    const explicitStart = dateRange.start ? startOfMonth(new Date(dateRange.start)) : null;
    const explicitEnd = dateRange.end ? startOfMonth(new Date(dateRange.end)) : null;

    const startMonth = explicitStart ?? startOfMonth(createdDates.reduce((min, date) => (date < min ? date : min)));
    const endMonth = explicitEnd ?? startOfMonth(createdDates.reduce((max, date) => (date > max ? date : max)));

    const months = buildMonthSequence(startMonth, endMonth);
    const buckets = new Map(
      months.map((month) => [month.key, { label: month.label, revenue: 0, orders: 0, zg00Sum: 0 }])
    );

    filteredNewSales.forEach((sale) => {
      const createdDate = parseInvoiceDate(sale.createdOn);
      if (!createdDate) return;

      const key = format(createdDate, "yyyy-MM");
      const bucket = buckets.get(key);
      if (!bucket) return;

      bucket.revenue += sale.finalPriceExGst ?? 0;
      bucket.orders += 1;
      bucket.zg00Sum += sale.zg00Amount ?? 0;
    });

    return months.map((month) => {
      const bucket = buckets.get(month.key)!;
      const discountRate = bucket.revenue ? -(bucket.zg00Sum / bucket.revenue) : 0;

      return {
        key: month.key,
        label: bucket.label,
        revenue: bucket.revenue,
        orders: bucket.orders,
        discountRate,
      };
    });
  }, [dateRange.end, dateRange.start, filteredNewSales]);

  const secondHandTrendData = useMemo<SecondHandTrendDatum[]>(() => {
    const trackedDates = filteredSecondHandSales
      .map((sale) => [parseInvoiceDate(sale.invoiceDate), parseInvoiceDate(sale.pgiDate), parseInvoiceDate(sale.grDate)])
      .flat()
      .filter(Boolean) as Date[];

    if (!trackedDates.length) return [];

    const explicitStart = dateRange.start ? startOfMonth(new Date(dateRange.start)) : null;
    const explicitEnd = dateRange.end ? startOfMonth(new Date(dateRange.end)) : null;

    const startMonth = explicitStart ?? startOfMonth(trackedDates.reduce((min, date) => (date < min ? date : min)));
    const endMonth = explicitEnd ?? startOfMonth(trackedDates.reduce((max, date) => (date > max ? date : max)));

    const months = buildMonthSequence(startMonth, endMonth);

    const monthBuckets = new Map(
      months.map((month) => [month.key, { revenue: 0, pgiCount: 0, grCount: 0, marginSum: 0 }])
    );

    filteredSecondHandSales.forEach((sale) => {
      const invoiceDate = parseInvoiceDate(sale.invoiceDate);
      const pgiDate = parseInvoiceDate(sale.pgiDate);
      const grDate = parseInvoiceDate(sale.grDate);
      const margin = sale.finalInvoicePrice - sale.poLineNetValue;

      if (invoiceDate) {
        const key = format(invoiceDate, "yyyy-MM");
        const bucket = monthBuckets.get(key);
        if (bucket) {
          bucket.revenue += sale.finalInvoicePrice;
          bucket.marginSum += margin;
        }
      }

      if (pgiDate) {
        const key = format(pgiDate, "yyyy-MM");
        const bucket = monthBuckets.get(key);
        if (bucket) {
          bucket.pgiCount += 1;
        }
      }

      if (grDate) {
        const key = format(grDate, "yyyy-MM");
        const bucket = monthBuckets.get(key);
        if (bucket) {
          bucket.grCount += 1;
        }
      }
    });

    return months.map((month) => {
      const bucket = monthBuckets.get(month.key)!;
      return {
        key: month.key,
        label: month.label,
        revenue: bucket.revenue,
        pgiCount: bucket.pgiCount,
        grCount: bucket.grCount,
        avgMarginRate: bucket.revenue ? bucket.marginSum / bucket.revenue : 0,
      };
    });
  }, [dateRange.end, dateRange.start, filteredSecondHandSales]);

  const hasTrendData = useMemo(() => monthlyTrendData.some((month) => month.units > 0), [monthlyTrendData]);
  const hasNewCustomerTrend = useMemo(
    () => newCustomerOrderTrend.some((month) => month.orders > 0 || month.revenue > 0),
    [newCustomerOrderTrend]
  );
  const hasSecondHandTrend = useMemo(
    () =>
      secondHandTrendData.some(
        (month) => month.pgiCount > 0 || month.grCount > 0 || month.revenue > 0
      ),
    [secondHandTrendData]
  );

  const basicPerformanceContent = (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Date Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="basic-start-date">Start Date</Label>
              <Input
                id="basic-start-date"
                type="date"
                value={dateRange.start}
                onChange={(event) => handleDateChange("start", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="basic-end-date">End Date</Label>
              <Input
                id="basic-end-date"
                type="date"
                value={dateRange.end}
                onChange={(event) => handleDateChange("end", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Quick Ranges</Label>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="flex-1" onClick={() => handleQuickRange("THIS_WEEK")}>
                  This Week
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => handleQuickRange("THIS_MONTH")}>
                  This Month
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => handleQuickRange("LAST_3_MONTHS")}>
                  Last 3 Months
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => handleQuickRange("THIS_YEAR")}>
                  This Year
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-600">Performance at a glance</p>
          <p className="text-xs text-muted-foreground">Retail sales, SAP conversions, and PGIs</p>
        </div>
        <Dialog open={weeklyDialogOpen} onOpenChange={setWeeklyDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">View weekly breakdown</Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[80vh]">
            <DialogHeader className="gap-2 sm:flex sm:flex-row sm:items-center sm:justify-between">
              <div>
                <DialogTitle>Weekly performance</DialogTitle>
                <DialogDescription>
                  Counts for retail sales, Stock → Customer conversions, and PGI events grouped by week (Mon–Sun).
                </DialogDescription>
              </div>
              <Button variant="secondary" size="sm" onClick={handleExportWeeklyActivity} disabled={!weeklyExportRows.length}>
                <FileDown className="mr-2 h-4 w-4" />
                Export to Excel
              </Button>
            </DialogHeader>
            {weeklyActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No weekly activity available for the selected range.</p>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">Total weeks</p>
                    <p className="text-xl font-semibold">{weeklyActivity.length}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">Avg retail / week</p>
                    <p className="text-xl font-semibold">
                      {(
                        weeklyActivity.reduce((sum, week) => sum + week.retail, 0) / weeklyActivity.length
                      ).toFixed(1)}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">Avg SAP conversions / week</p>
                    <p className="text-xl font-semibold">
                      {(
                        weeklyActivity.reduce((sum, week) => sum + week.stockToCustomer, 0) / weeklyActivity.length
                      ).toFixed(1)}
                    </p>
                  </div>
                </div>
                <div className="rounded-lg border bg-white">
                  <ScrollArea className="max-h-[520px] h-[420px] rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="font-semibold">Week</TableHead>
                          <TableHead className="font-semibold">Retail Sales</TableHead>
                          <TableHead className="font-semibold">Stock → Customer</TableHead>
                          <TableHead className="font-semibold">PGI Number</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {weeklyActivity.map((week) => (
                          <TableRow key={week.label}>
                            <TableCell className="font-medium">{week.label}</TableCell>
                            <TableCell>{week.retail}</TableCell>
                            <TableCell>{week.stockToCustomer}</TableCell>
                            <TableCell>{week.pgi}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader>
            <CardTitle>Retail Sales (new customer orders)</CardTitle>
            <p className="text-sm text-muted-foreground">billToNameFinal ≠ stock</p>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-slate-900">{newSalesSummary.retailCount}</div>
            <p className="text-sm text-muted-foreground mt-1">Filtered by created date</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Model Variety</CardTitle>
            <p className="text-sm text-muted-foreground">Unique material descriptions</p>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-slate-900">{newSalesSummary.uniqueModels}</div>
            <p className="text-sm text-muted-foreground mt-1">Across retail sales</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Invoice Number</CardTitle>
            <p className="text-sm text-muted-foreground">yardnewvaninvoice invoiceDate</p>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-slate-900">{yardDateStats.invoiceDateCount}</div>
            <p className="text-sm text-muted-foreground mt-1">Within selected range</p>

          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>PGI Number</CardTitle>
            <p className="text-sm text-muted-foreground">yardnewvaninvoice pgiDate</p>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-slate-900">{yardDateStats.pgiDateCount}</div>
            <p className="text-sm text-muted-foreground mt-1">Throughput marker</p>
          </CardContent>
        </Card>
          <Card>
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Stock → Customer</CardTitle>
              <Badge variant="outline" className="text-[11px]">SAP</Badge>
            </div>
            <p className="text-sm text-muted-foreground">Sales orders converted from stock</p>
          </CardHeader>
          <CardContent>
            {stockToCustomerLoading ? (
              <p className="text-muted-foreground">Loading SAP conversions...</p>
            ) : (
              <>
                <div className="text-3xl font-semibold text-slate-900">
                  {stockToCustomerSummary.totalConversions}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {stockToCustomerSummary.latestUpdate
                    ? `Last update ${format(stockToCustomerSummary.latestUpdate, "dd MMM yyyy")}`
                    : "No SAP stock conversions"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {stockToCustomerSummary.uniqueMaterials} material descriptions
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Retail Sales</CardTitle>
              <p className="text-sm text-muted-foreground">Non-stock sales grouped by month</p>
            </CardHeader>
            <CardContent>
              {retailSalesByMonth.length === 0 ? (
                <p className="text-muted-foreground">No retail sales recorded in this range.</p>
              ) : (
                <ChartContainer
                  config={{
                    retailSales: { label: "Retail Sales", color: "#2563eb" },
                  }}
                  className="h-72"
                >
                  <BarChart
                    data={retailSalesByMonth}
                    margin={{ top: 12, left: 16, right: 16, bottom: 12 }}
                    barCategoryGap="32%"
                    barGap={8}
                  >
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} tickMargin={8} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar
                      dataKey="retailSales"
                      fill="#2563eb"
                      radius={[8, 8, 0, 0]}
                      maxBarSize={40}
                    >
                      <LabelList dataKey="retailSales" position="top" offset={8} fill="#0f172a" />
                    </Bar>
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Invoice Number</CardTitle>
              <p className="text-sm text-muted-foreground">yardnewvaninvoice invoiceDate grouped by month</p>
            </CardHeader>
            <CardContent>
              {invoiceCountByMonth.length === 0 ? (
                <p className="text-muted-foreground">No invoices recorded in this range.</p>
              ) : (
                <ChartContainer
                  config={{
                    invoiceCount: { label: "Invoice Number", color: "#16a34a" },
                  }}
                  className="h-72"
                >
                  <BarChart
                    data={invoiceCountByMonth}
                    margin={{ top: 12, left: 16, right: 16, bottom: 12 }}
                    barCategoryGap="32%"
                    barGap={8}
                  >
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} tickMargin={8} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar
                      dataKey="invoiceCount"
                      fill="#16a34a" // 绿色
                      radius={[8, 8, 0, 0]}
                      maxBarSize={40}
                    >
                      <LabelList dataKey="invoiceCount" position="top" offset={8} fill="#0f172a" />
                    </Bar>
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Retail Model Volume</CardTitle>
              <p className="text-sm text-muted-foreground">Top models ranked by unit count</p>
            </CardHeader>
            <CardContent>
              {retailModelBarData.length === 0 ? (
                <p className="text-muted-foreground">No retail model data available for this range.</p>
              ) : (
                <ChartContainer
                  config={{
                    modelCount: { label: "Units", color: "#f97316" },
                  }}
                  className="h-72"
                >
                  <BarChart data={retailModelBarData} margin={{ left: 12, right: 12, bottom: 12 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} angle={-25} textAnchor="end" height={60} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="modelCount" fill="var(--color-modelCount)" radius={[6, 6, 0, 0]} barSize={28} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>SAP Stock → Customer Trend</CardTitle>
                <Badge variant="outline" className="text-[11px]">SAP</Badge>
              </div>
              <p className="text-sm text-muted-foreground">Monthly conversions aligned to UDATE_YYYYMMDD</p>
            </CardHeader>
            <CardContent>
              {stockToCustomerLoading ? (
                <p className="text-muted-foreground">Loading SAP stock-to-customer feed...</p>
              ) : stockToCustomerTrend.length === 0 ? (
                <p className="text-muted-foreground">No SAP stock-to-customer conversions in this range.</p>
              ) : (
                <ChartContainer
                  config={{
                    conversions: { label: "Conversions", color: "#0ea5e9" },
                  }}
                  className="h-80"
                >
                  <ComposedChart data={stockToCustomerTrend} margin={{ top: 12, left: 12, right: 12, bottom: 4 }}>
                    <defs>
                      <linearGradient id="sapConversionGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-conversions)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--color-conversions)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          indicator="line"
                          formatter={(value) => (
                            <div className="flex flex-1 justify-between">
                              <span>Conversions</span>
                              <span className="font-medium">{value as number}</span>
                            </div>
                          )}
                        />
                      }
                    />
                    <Area
                      dataKey="conversions"
                      type="monotone"
                      fill="url(#sapConversionGradient)"
                      stroke="var(--color-conversions)"
                      strokeWidth={2}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      dataKey="conversions"
                      type="monotone"
                      stroke="var(--color-conversions)"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </ComposedChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>SAP Material Description Volume</CardTitle>
                <Badge variant="outline" className="text-[11px]">SAP</Badge>
              </div>
              <p className="text-sm text-muted-foreground">Top SO_Material_0010_Desc ranked by conversion count</p>
            </CardHeader>
            <CardContent>
              {stockToCustomerLoading ? (
                <p className="text-muted-foreground">Pulling SAP material breakdown...</p>
              ) : stockToCustomerMaterialMix.length === 0 ? (
                <p className="text-muted-foreground">No SAP stock-to-customer materials in this window.</p>
              ) : (
                <ChartContainer
                  config={{
                    value: { label: "Conversions", color: "#a855f7" },
                  }}
                  className="h-80"
                >
                  <BarChart data={stockToCustomerMaterialMix} margin={{ left: 12, right: 12, bottom: 12 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={80} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="value" fill="var(--color-value)" radius={[10, 10, 4, 4]} barSize={32}>
                      <LabelList dataKey="value" position="top" offset={8} fill="#0f172a" />
                    </Bar>
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Retail Model Mix</CardTitle>
              <p className="text-sm text-muted-foreground">Breakdown of non-stock sales by type</p>
            </CardHeader>
            <CardContent>
              {newSalesSummary.modelBreakdown.length === 0 ? (
                <p className="text-muted-foreground">No retail sales recorded in this range.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {newSalesSummary.modelBreakdown.map((model) => (
                      <TableRow key={model.model}>
                        <TableCell className="font-medium">{model.model}</TableCell>
                        <TableCell className="text-right">{model.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Retail Sales Detail</CardTitle>
          <p className="text-sm text-muted-foreground">Created date, sales office, and customer category</p>
        </CardHeader>
        <CardContent>
          {retailNewSales.length === 0 ? (
            <p className="text-muted-foreground">No non-stock sales for this window.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Created</TableHead>
                  <TableHead>Sales Office</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>billToNameFinal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {retailNewSales.slice(0, 30).map((sale) => {
                  const createdDate = parseInvoiceDate(sale.createdOn);
                  return (
                    <TableRow key={sale.id}>
                      <TableCell className="font-medium">
                        {createdDate ? format(createdDate, "dd MMM yyyy") : "-"}
                      </TableCell>
                      <TableCell>{sale.salesOfficeName || "-"}</TableCell>
                      <TableCell>{sale.materialDesc0010 || "Unspecified"}</TableCell>
                      <TableCell>{sale.billToNameFinal || "-"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            Showing up to 30 recent retail sales. Use the date filters to focus on this week, month, last three months, this year, or a custom range.
          </p>
        </CardContent>
      </Card>
    </div>
  );

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
                onChange={(event) => handleDateChange("start", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={dateRange.end}
                onChange={(event) => handleDateChange("end", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Quick Ranges</Label>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="flex-1" onClick={() => handleQuickRange("THIS_WEEK")}>
                  This Week
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => handleQuickRange("THIS_MONTH")}>
                  This Month
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => handleQuickRange("LAST_3_MONTHS")}>
                  Last 3 Months
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
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="w-full overflow-x-auto space-y-2">
              <h4 className="text-sm font-semibold">Invoice revenue trend</h4>
              {!hasTrendData ? (
                <p className="text-muted-foreground">Need invoices across multiple months to show a trend.</p>
              ) : (
                <ChartContainer
                  config={{
                    revenue: { label: "Revenue", color: "hsl(var(--chart-1))" },
                    avgDiscountRate: { label: "Monthly discount rate", color: "#ef4444" },
                    units: { label: "Invoice units", color: "hsl(var(--chart-3))" },
                  }}
                  className="h-[360px] min-w-[960px]"
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
                      domain={[(dataMin: number) => Math.min(dataMin, -0.01), 0]}
                      tickFormatter={(value) => formatPercent(value as number)}
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
                                <span>Monthly discount rate</span>
                                <span className="font-medium">{formatPercent(value)}</span>
                              </div>
                            );
                          }}
                        />
                      }
                    />
                    <ChartLegend
                      verticalAlign="top"
                      align="left"
                      content={
                        <ChartLegendContent
                          className="justify-start gap-3 text-sm text-muted-foreground [&>div]:gap-2 [&>div]:rounded-full [&>div]:border [&>div]:border-border/60 [&>div]:bg-muted/40 [&>div]:px-3 [&>div]:py-1 [&>div>div:first-child]:h-2.5 [&>div>div:first-child]:w-2.5"
                        />
                      }
                    />
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
                      dot={{ r: 3, strokeWidth: 2, fill: "#fff" }}
                      activeDot={{ r: 5, strokeWidth: 2 }}
                    />
                  </ComposedChart>
                </ChartContainer>
              )}
              <p className="text-xs text-muted-foreground">
                Revenue (area), invoice units (bars), and discount rate (line) now use their true values so you can compare
                scale and direction at a glance.
              </p>
            </div>

            <div className="w-full overflow-x-auto space-y-2">
              <h4 className="text-sm font-semibold">New customer order sales and trend</h4>
              {!hasNewCustomerTrend ? (
                <p className="text-muted-foreground">
                  Need new customer orders across multiple months to show revenue, order count, and ZG00 trends.
                </p>
              ) : (
                <ChartContainer
                  config={{
                    revenue: { label: "Order revenue (ex GST)", color: "hsl(var(--chart-1))" },
                    orders: { label: "Order count", color: "hsl(var(--chart-4))" },
                    discountRate: { label: "Monthly discount rate", color: "#ef4444" },
                  }}
                  className="h-[360px] min-w-[960px]"
                >
                  <ComposedChart data={newCustomerOrderTrend} margin={{ left: 12, right: 12, top: 12, bottom: 0 }}>
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
                      domain={[(dataMin: number) => Math.min(dataMin, -0.01), 0]}
                      tickFormatter={(value) => formatPercent(value as number)}
                    />
                    <YAxis yAxisId="orders" hide domain={[0, "auto"]} />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          indicator="line"
                          formatter={(value, name, item, __, payload) => {
                            if (!payload || typeof value !== "number") return null;

                            if (item?.dataKey === "revenue") {
                              return (
                                <div className="flex flex-1 justify-between">
                                  <span>Order revenue (ex GST)</span>
                                  <span className="font-medium">{currency.format(value)}</span>
                                </div>
                              );
                            }

                            if (item?.dataKey === "orders") {
                              return (
                                <div className="flex flex-1 justify-between">
                                  <span>Orders</span>
                                  <span className="font-medium">{value}</span>
                                </div>
                              );
                            }

                            return (
                              <div className="flex flex-1 justify-between">
                                <span>Monthly discount rate</span>
                                <span className="font-medium">{formatPercent(value)}</span>
                              </div>
                            );
                          }}
                        />
                      }
                    />
                    <ChartLegend
                      verticalAlign="top"
                      align="left"
                      content={
                        <ChartLegendContent
                          className="justify-start gap-3 text-sm text-muted-foreground [&>div]:gap-2 [&>div]:rounded-full [&>div]:border [&>div]:border-border/60 [&>div]:bg-muted/40 [&>div]:px-3 [&>div]:py-1 [&>div>div:first-child]:h-2.5 [&>div>div:first-child]:w-2.5"
                        />
                      }
                    />
                    <Bar
                      dataKey="revenue"
                      yAxisId="revenue"
                      fill="#2563eb" // 蓝色：订单金额
                      radius={[4, 4, 0, 0]}
                      barSize={22}
                    />
                    <Bar
                      dataKey="orders"
                      yAxisId="orders"
                      fill="#f97316" // 橙色：订单数量
                      radius={[4, 4, 0, 0]}
                      barSize={18}
                    />
                    <Line
                      type="monotone"
                      dataKey="discountRate"
                      yAxisId="discount"
                      stroke="var(--color-discountRate)"
                      strokeWidth={2}
                      dot={{ r: 3, strokeWidth: 2, fill: "#fff" }}
                      activeDot={{ r: 5, strokeWidth: 2 }}
                    />
                  </ComposedChart>
                </ChartContainer>
              )}
              <p className="text-xs text-muted-foreground">
                Bars show order revenue (ex GST) and order count, with the red line highlighting the monthly discount rate
                (ZG00 percentage) each month.
              </p>
            </div>
          </div>
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
                  const invoiceDate = getInvoiceDate(invoice);
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

  const secondHandContent = (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Date Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="sh-start-date">Start Date</Label>
              <Input
                id="sh-start-date"
                type="date"
                value={dateRange.start}
                onChange={(event) => handleDateChange("start", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sh-end-date">End Date</Label>
              <Input
                id="sh-end-date"
                type="date"
                value={dateRange.end}
                onChange={(event) => handleDateChange("end", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Quick Ranges</Label>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="flex-1" onClick={() => handleQuickRange("THIS_WEEK")}>
                  This Week
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => handleQuickRange("THIS_MONTH")}>
                  This Month
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => handleQuickRange("LAST_3_MONTHS")}>
                  Last 3 Months
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
          <CardTitle>Second Hand Trend</CardTitle>
          <p className="text-sm text-muted-foreground">
            Rolling 12 months of revenue and margin health for pre-owned stock, plus throughput of PGI
            completions and GR receipts
          </p>
        </CardHeader>
        <CardContent>
          {!hasSecondHandTrend ? (
            <p className="text-muted-foreground">Need PGI, GR, or invoice activity across multiple months to show a trend.</p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <ChartContainer
                config={{
                  revenue: { label: "Revenue", color: "#2563eb" },
                  avgMarginRate: { label: "Average margin", color: "#ef4444" },
                }}
                className="h-[360px] min-w-[560px]"
              >
                <ComposedChart data={secondHandTrendData} margin={{ left: 12, right: 12, top: 12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={20} />
                  <YAxis
                    yAxisId="revenue"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => formatCompactMoney(value as number)}
                  />
                  <YAxis
                    yAxisId="margin"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => formatPercent(value as number)}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        indicator="line"
                        formatter={(value, name, item) => {
                          if (typeof value !== "number") return null;

                          if (item?.dataKey === "revenue") {
                            return (
                              <div className="flex flex-1 justify-between">
                                <span>Revenue</span>
                                <span className="font-medium">{currency.format(value)}</span>
                              </div>
                            );
                          }

                          return (
                            <div className="flex flex-1 justify-between">
                              <span>Average margin</span>
                              <span className="font-medium">{formatPercent(value)}</span>
                            </div>
                          );
                        }}
                      />
                    }
                  />
                  <ChartLegend
                    verticalAlign="top"
                    align="left"
                    content={
                      <ChartLegendContent
                        className="justify-start gap-3 text-sm text-muted-foreground [&>div]:gap-2 [&>div]:rounded-full [&>div]:border [&>div]:border-border/60 [&>div]:bg-muted/40 [&>div]:px-3 [&>div]:py-1 [&>div>div:first-child]:h-2.5 [&>div>div:first-child]:w-2.5"
                      />
                    }
                  />
                  <Bar
                    dataKey="revenue"
                    yAxisId="revenue"
                    fill="var(--color-revenue)"
                    radius={[4, 4, 0, 0]}
                    barSize={28}
                  />
                  <Line
                    type="monotone"
                    dataKey="avgMarginRate"
                    yAxisId="margin"
                    stroke="var(--color-avgMarginRate)"
                    strokeWidth={2.5}
                    dot={{ r: 3, strokeWidth: 2, fill: "#fff" }}
                    activeDot={{ r: 5, strokeWidth: 2 }}
                  />
                </ComposedChart>
              </ChartContainer>

              <ChartContainer
                config={{
                  grCount: { label: "GR receipts", color: "#3b82f6" },   // Tailwind blue-500
                  pgiCount: { label: "PGI completed", color: "#22c55e" }, // Tailwind green-500
                }}
                className="h-[360px] min-w-[560px]"
              >
                <ComposedChart data={secondHandTrendData} margin={{ left: 12, right: 12, top: 12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={20} />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        indicator="dot"
                        formatter={(value, name) => {
                          if (typeof value !== "number") return null;

                          if (name === "grCount") {
                            return (
                              <div className="flex flex-1 justify-between">
                                <span>GR receipts</span>
                                <span className="font-medium">{value}</span>
                              </div>
                            );
                          }

                          return (
                            <div className="flex flex-1 justify-between">
                              <span>PGI completed</span>
                              <span className="font-medium">{value}</span>
                            </div>
                          );
                        }}
                      />
                    }
                  />
                  <ChartLegend
                    verticalAlign="top"
                    align="left"
                    content={
                      <ChartLegendContent
                        className="justify-start gap-3 text-sm text-muted-foreground [&>div]:gap-2 [&>div]:rounded-full [&>div]:border [&>div]:border-border/60 [&>div]:bg-muted/40 [&>div]:px-3 [&>div]:py-1 [&>div>div:first-child]:h-2.5 [&>div>div:first-child]:w-2.5"
                      />
                    }
                  />
                  <Bar dataKey="grCount" fill="var(--color-grCount)" radius={[4, 4, 0, 0]} barSize={24} />
                  <Bar dataKey="pgiCount" fill="var(--color-pgiCount)" radius={[4, 4, 0, 0]} barSize={24} />
                </ComposedChart>
              </ChartContainer>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            Revenue uses invoice date; the red line tracks monthly margin rate. PGI and GR bars show throughput volume.
          </p>
        </CardContent>
      </Card>

<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
  {/* 1. Total Revenue */}
  <Card>
    <CardHeader>
      <CardTitle>Total Revenue</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-semibold text-slate-900">
        {currency.format(secondHandSummary.totalRevenue)}
      </div>
      <p className="text-sm text-slate-500 mt-1">
        Across {filteredSecondHandSales.length} invoices
      </p>
    </CardContent>
  </Card>

  {/* 2. Total PO Cost */}
  <Card>
    <CardHeader>
      <CardTitle>Total PO Cost</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-semibold text-slate-900">
        {currency.format(secondHandSummary.totalCost)}
      </div>
      <p className="text-sm text-slate-500 mt-1">PO line net value</p>
    </CardContent>
  </Card>

  {/* 3. Units Sold  ← 提前放这里 */}
  <Card>
    <CardHeader>
      <CardTitle>Units Sold</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-semibold text-slate-900">
        {secondHandSummary.totalUnits}
      </div>
      <p className="text-sm text-slate-500 mt-1">Filtered invoice count</p>
    </CardContent>
  </Card>

  {/* 4. Loss-making Deals  ← 紧跟在 Units Sold 后面，这样一行并排 */}
  <Card>
    <CardHeader>
      <CardTitle>Loss-making Deals</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-semibold text-slate-900">
        {secondHandSummary.lossUnits} (
        {secondHandSummary.totalUnits
          ? Math.round(
              (secondHandSummary.lossUnits / secondHandSummary.totalUnits) *
                100
            )
          : 0}
        %)
      </div>
      <p className="text-sm text-slate-500 mt-1">
        Units with negative margin
      </p>
    </CardContent>
  </Card>

  {/* 5. Gross Margin */}
  <Card>
    <CardHeader>
      <CardTitle>Gross Margin</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-semibold text-slate-900">
        {currency.format(secondHandSummary.grossMargin)}
      </div>
      <p className="text-sm text-slate-500 mt-1">Sale minus PO cost</p>
    </CardContent>
  </Card>

  {/* 6. Average Margin % */}
  <Card>
    <CardHeader>
      <CardTitle>Average Margin %</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-semibold text-slate-900">
        {formatPercent(secondHandSummary.averageMarginRate)}
      </div>
      <p className="text-sm text-slate-500 mt-1">
        Margin over sale price
      </p>
    </CardContent>
  </Card>

  {/* 7. Average Days from PGI to GR */}
  <Card>
    <CardHeader>
      <CardTitle>Average Days from PGI to GR</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-semibold text-slate-900">
        {secondHandSummary.averageDaysPGIToGR == null
          ? "-"
          : `${secondHandSummary.averageDaysPGIToGR.toFixed(1)} days`}
      </div>
      <p className="text-sm text-slate-500 mt-1">
        Speed from PGI to GR
      </p>
    </CardContent>
  </Card>
</div>

      <Card>
        <CardHeader>
          <CardTitle>Invoice Detail</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredSecondHandSales.length === 0 ? (
            <p className="text-muted-foreground">No matching invoices.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Chassis</TableHead>
                  <TableHead>SO</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">PO Value</TableHead>
                  <TableHead className="text-right">Sale (ex GST)</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">Margin %</TableHead>
                  <TableHead className="text-right">PGI → GR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSecondHandSales.map((sale) => {
                  const invoiceDate = parseInvoiceDate(sale.invoiceDate);
                  const pgiDate = parseInvoiceDate(sale.pgiDate);
                  const grDate = parseInvoiceDate(sale.grDate);
                  const margin = sale.finalInvoicePrice - sale.poLineNetValue;
                  const marginRate = sale.finalInvoicePrice ? margin / sale.finalInvoicePrice : 0;
                  const daysToGR = grDate && pgiDate
                    ? Math.round((pgiDate.getTime() - grDate.getTime()) / (1000 * 60 * 60 * 24))
                    : null;
                  return (
                    <TableRow key={sale.id}>
                      <TableCell>{invoiceDate ? format(invoiceDate, "dd MMM yyyy") : "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{sale.chassis || "-"}</TableCell>
                      <TableCell>{sale.so || "-"}</TableCell>
                      <TableCell>{sale.item || sale.material || "-"}</TableCell>
                      <TableCell className="text-right">{currency.format(sale.poLineNetValue)}</TableCell>
                      <TableCell className="text-right">{currency.format(sale.finalInvoicePrice)}</TableCell>
                      <TableCell className="text-right">{currency.format(margin)}</TableCell>
                      <TableCell className="text-right">{formatPercent(marginRate)}</TableCell>
                      <TableCell className="text-right">
                        {daysToGR == null ? "-" : `${daysToGR} days`}
                      </TableCell>
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
          <p className="text-muted-foreground">Performance snapshots for new and second hand van sales</p>
        </header>

        <Tabs defaultValue="basic" className="space-y-6">
          <TabsList>
            <TabsTrigger value="basic">Basic performance data</TabsTrigger>
            <TabsTrigger value="new-vans">New Van Sales</TabsTrigger>
            <TabsTrigger value="parts" disabled>
              Parts Sales
            </TabsTrigger>
            <TabsTrigger value="second-hand">
              Second Hand Van Sales
            </TabsTrigger>
          </TabsList>

          <TabsContent value="basic">
            {newSalesLoading ? (
              <Card>
                <CardContent className="p-10 text-center text-muted-foreground">
                  Loading basic performance data...
                </CardContent>
              </Card>
            ) : (
              basicPerformanceContent
            )}
          </TabsContent>

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
            {secondHandLoading ? (
              <Card>
                <CardContent className="p-10 text-center text-muted-foreground">
                  Loading second hand sales...
                </CardContent>
              </Card>
            ) : filteredSecondHandSales.length === 0 && !secondHandSales.length ? (
              <Card>
                <CardContent className="p-10 text-center text-muted-foreground">
                  No second hand sales found for this dealer.
                </CardContent>
              </Card>
            ) : (
              secondHandContent
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default FinanceReport;
