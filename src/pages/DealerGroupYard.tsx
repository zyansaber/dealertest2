// src/pages/DealerYard.tsx
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  subscribeToPGIRecords,
  subscribeToYardStock,
  receiveChassisToYard,
  subscribeToSchedule,
  addManualChassisToYard,
  dispatchFromYard,
  subscribeToHandover,
} from "@/lib/firebase";
import type { ScheduleItem } from "@/types";
import ProductRegistrationForm from "@/components/ProductRegistrationForm";
import { Truck, PackageCheck, Handshake, Warehouse } from "lucide-react";
import * as XLSX from "xlsx";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

type PGIRec = {
  pgidate?: string | null;
  dealer?: string | null;
  model?: string | null;
  customer?: string | null;
};
type YardRec = {
  receivedAt?: string | null;
  model?: string | null;
  customer?: string | null;
  type?: string | null;
  Type?: string | null;
  wholesalepo?: string | number | null;
};
type HandoverRec = {
  handoverAt?: string | null;
  createdAt?: string | null;
  dealerSlug?: string | null;
  dealerName?: string | null;
};

const toStr = (v: unknown) => String(v ?? "");
const lower = (v: unknown) => toStr(v).toLowerCase();
const cleanLabel = (v: unknown, fallback = "Unknown") => {
  const str = toStr(v).trim();
  if (!str) return fallback;
  return str;
};

function normalizeDealerSlug(raw?: string): string {
  const slug = lower(raw);
  const m = slug?.match(/^(.*?)-([a-z0-9]{6})$/);
  return m ? m[1] : slug;
}
function slugifyDealerName(name?: string): string {
  return toStr(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function prettifyDealerName(slug: string): string {
  const s = slug.replace(/-/g, " ").trim();
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
function parseDDMMYYYY(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  try {
    const parts = String(dateStr).split("/");
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) return d;
    }
  } catch (e) {
    console.warn("parseDDMMYYYY failed:", e);
  }
  return null;
}
function daysSinceISO(iso?: string | null): number {
  if (!iso) return 0;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 0;
  const ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}
function isDateWithinRange(d: Date | null, start: Date | null, end: Date | null): boolean {
  if (!d) return false;
  const t = d.getTime();
  const s = start ? start.getTime() : -Infinity;
  const e = end ? end.getTime() : Infinity;
  return t >= s && t <= e;
}
function startOfWeekMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0-6 Sun-Sat
  const diff = (day + 6) % 7; // Monday=0
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function fmtMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function fmtMonthLabel(d: Date): string {
  return d.toLocaleString(undefined, { month: "short", year: "numeric" });
}
function fmtWeekLabel(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}
function isSecondhandChassis(chassis?: string | null): boolean {
  if (!chassis) return false;
  const c = String(chassis).toUpperCase();
  // Three letters, first is L/N/S, followed by 23/24/25, then digits
  return /^[LNS][A-Z]{2}(?:23|24|25)\d+$/.test(c);
}

// Excel rows type
type ExcelRow = {
  Model?: string;
  "Model Range"?: string;
  Function?: string;
  Layout?: string;
  Height?: string | number;
  Length?: string | number;
  Axle?: string | number;
  "TOP 10"?: string | number;
  "TOP 15"?: string | number;
  "Top 15"?: string | number;
  "TOP15"?: string | number;
  "Top15"?: string | number;
};

const WHOLESALE_SLUGS = new Set(["frankston", "geelong", "launceston", "st-james", "tralagon"]);

const currencyFormatter = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 2,
});

const parseWholesaleValue = (val: unknown): number | null => {
  if (val == null) return null;
  if (typeof val === "number" && !isNaN(val)) return val;
  const str = String(val).replace(/[^\d.-]/g, "");
  if (!str) return null;
  const num = Number(str);
  return isNaN(num) ? null : num;
};

function parseNum(val: unknown): number | null {
  if (val == null) return null;
  const s = String(val).replace(/[^\d.]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
function countBy(rows: ExcelRow[], key: keyof ExcelRow) {
  const map: Record<string, number> = {};
  rows.forEach((r) => {
    const raw = r[key];
    const k = toStr(raw).trim();
    if (!k) return;
    map[k] = (map[k] || 0) + 1;
  });
  return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}
function countTop15(rows: ExcelRow[]) {
  let cnt = 0;
  for (const r of rows) {
    const cands = [r["TOP 15"], r["Top 15"], r["TOP15"], r["Top15"], r["TOP 10"]];
    const v = cands.find((x) => x != null && String(x).trim() !== "");
    if (v == null) continue;
    const s = String(v).trim();
    if (/^\d+$/.test(s)) {
      const num = parseInt(s, 10);
      if (!isNaN(num) && num <= 15) cnt++;
    } else {
      const ls = s.toLowerCase();
      if (ls.includes("yes") || ls === "y" || ls.includes("top")) cnt++;
    }
  }
  return cnt;
}

// Days in Yard buckets (updated as requested)
const yardRangeDefs = [
  { label: "0–30", min: 0, max: 30 },
  { label: "31–90", min: 31, max: 90 },
  { label: "91–180", min: 91, max: 180 },
  { label: "180+", min: 181, max: 9999 },
];

// Colors
const PIE_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16", "#d946ef", "#0ea5e9", "#14b8a6"];

export default function DealerYard() {
  const { dealerSlug: rawDealerSlug } = useParams<{ dealerSlug: string }>();
  const dealerSlug = useMemo(() => normalizeDealerSlug(rawDealerSlug), [rawDealerSlug]);

  const [pgi, setPgi] = useState<Record<string, PGIRec>>({});
  const [yard, setYard] = useState<Record<string, YardRec>>({});
  const [handover, setHandover] = useState<Record<string, HandoverRec>>({});
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);

  // On The Road date range (PGI list controls)
  const [rangeType, setRangeType] = useState<"7d" | "30d" | "90d" | "custom">("7d");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  // KPI date range (independent from PGI list)
  const [kpiRangeType, setKpiRangeType] = useState<"7d" | "30d" | "90d" | "custom">("7d");
  const [kpiCustomStart, setKpiCustomStart] = useState<string>("");
  const [kpiCustomEnd, setKpiCustomEnd] = useState<string>("");

  // Modal: Product Registration
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [handoverData, setHandoverData] = useState<null | { chassis: string; model?: string | null; dealerName?: string | null; dealerSlug?: string | null; handoverAt: string }>(null);

  // Manual add chassis
  const [manualChassis, setManualChassis] = useState("");
  const [manualStatus, setManualStatus] = useState<null | { type: "ok" | "err"; msg: string }>(null);

  // Excel insights
  const [excelRows, setExcelRows] = useState<ExcelRow[]>([]);
  const [activeCategory, setActiveCategory] = useState<"range" | "function" | "layout" | "axle" | "length" | "height">("range");

  // Yard Inventory filters (controlled only via charts)
  const [selectedRangeBucket, setSelectedRangeBucket] = useState<string | null>(null);
  const [selectedModelRange, setSelectedModelRange] = useState<string | "All">("All");
  const [selectedFunction, setSelectedFunction] = useState<string | "All">("All");
  const [selectedLayout, setSelectedLayout] = useState<string | "All">("All");
  const [selectedType, setSelectedType] = useState<"Stock" | "Customer" | "All">("Stock");

  const [onTheRoadAll, setOnTheRoadAll] = useState<PGIRec[]>([]);
  const [yardStockAll, setYardStockAll] = useState<Record<string, YardRec>>({});
  const [handoverAll, setHandoverAll] = useState<Record<string, HandoverRec>>({});

  const scheduleByChassis = useMemo(() => {
    const map: Record<string, ScheduleItem> = {};
    schedule.forEach((item) => {
      const chassis = String(item?.Chassis ?? "").trim();
      if (!chassis) return;
      map[chassis] = item;
    });
    return map;
  }, [schedule]);

  useEffect(() => {
    const unsubPGI = subscribeToPGIRecords((value) => {
      setPgi(value || {});
      setOnTheRoadAll(Object.values(value || {}));
    });
    return () => unsubPGI();
  }, []);

  useEffect(() => {
    const unsubYard = subscribeToYardStock(dealerSlug, (value) => {
      setYard(value || {});
      setYardStockAll(value || {});
    });
    return () => unsubYard();
  }, [dealerSlug]);

  useEffect(() => {
    const unsubHandover = subscribeToHandover(dealerSlug, (value) => {
      setHandover(value || {});
      setHandoverAll(value || {});
    });
    return () => unsubHandover();
  }, [dealerSlug]);

  useEffect(() => {
    const unsubSchedule = subscribeToSchedule((items) => {
      setSchedule(items);
    });
    return () => unsubSchedule();
  }, []);

  const dealerDisplayName = useMemo(() => prettifyDealerName(dealerSlug), [dealerSlug]);

  const [startDate, endDate] = useMemo(() => {
    if (rangeType === "custom" && customStart && customEnd) {
      return [new Date(customStart), new Date(customEnd)] as [Date, Date];
    }
    const mapDays: Record<typeof rangeType, number> = { "7d": 7, "30d": 30, "90d": 90, custom: 7 };
    const days = mapDays[rangeType];
    const e = new Date();
    e.setHours(23, 59, 59, 999);
    const s = new Date();
    s.setDate(e.getDate() - (days - 1));
    s.setHours(0, 0, 0, 0);
    return [s, e] as [Date, Date];
  }, [rangeType, customStart, customEnd]);

  const [kpiStartDate, kpiEndDate] = useMemo(() => {
    if (kpiRangeType === "custom" && kpiCustomStart && kpiCustomEnd) {
      return [new Date(kpiCustomStart), new Date(kpiCustomEnd)] as [Date, Date];
    }
    const mapDays: Record<typeof kpiRangeType, number> = { "7d": 7, "30d": 30, "90d": 90, custom: 7 };
    const days = mapDays[kpiRangeType];
    const e = new Date();
    e.setHours(23, 59, 59, 999);
    const s = new Date();
    s.setDate(e.getDate() - (days - 1));
    s.setHours(0, 0, 0, 0);
    return [s, e] as [Date, Date];
  }, [kpiRangeType, kpiCustomStart, kpiCustomEnd]);

  // Yard list
  const modelMetaMap = useMemo(() => {
    const map: Record<
      string,
      {
        range: string;
        functionName: string;
        layout: string;
        axle: string;
        length: string;
        height: string;
      }
    > = {};
    excelRows.forEach((r) => {
      const mdl = toStr(r.Model).trim().toLowerCase();
      if (!mdl) return;
      map[mdl] = {
        range: cleanLabel(r["Model Range"]),
        functionName: cleanLabel(r.Function),
        layout: cleanLabel(r.Layout),
        axle: cleanLabel(r.Axle),
        length: cleanLabel(r.Length),
        height: cleanLabel(r.Height),
      };
    });
    return map;
  }, [excelRows]);

  const yardList = useMemo(() => {
    const entries = Object.entries(yard || {});
    return entries.map(([chassis, rec]) => {
      const sch = scheduleByChassis[chassis];
      const customer = toStr(sch?.Customer ?? rec?.customer);
      const rawType = toStr(rec?.type ?? rec?.Type).trim().toLowerCase();
      const wholesaleRaw =
        (rec as any)?.wholesalepo ?? (rec as any)?.wholesalePO ?? (rec as any)?.wholesalePo ?? null;
      const wholesalePrice = parseWholesaleValue(wholesaleRaw);
      const normalizedType = (() => {
        if (!rawType) {
          if (/stock$/i.test(customer)) return "Stock";
          return "Customer";
        }
        if (rawType === "stock" || rawType.includes("stock")) return "Stock";
        if (rawType === "customer" || rawType === "retail" || rawType.includes("customer")) return "Customer";
        if (rawType) return cleanLabel(rec?.type ?? rec?.Type);
        return "Customer";
      })();
      const model = toStr(sch?.Model ?? rec?.model);
      const receivedAtISO = rec?.receivedAt ?? null;
      const daysInYard = daysSinceISO(receivedAtISO);
      const key = model.trim().toLowerCase();
      const meta = modelMetaMap[key];
      const modelRange = meta?.range ?? "Unknown";
      const functionName = meta?.functionName ?? "Unknown";
      const layout = meta?.layout ?? "Unknown";
      const axle = meta?.axle ?? "Unknown";
      const length = meta?.length ?? "Unknown";
      const height = meta?.height ?? "Unknown";
      return {
        chassis,
        receivedAt: receivedAtISO,
        model,
        customer,
        type: normalizedType,
        daysInYard,
        modelRange,
        functionName,
        layout,
        axle,
        length,
        height,
        wholesalePrice,
      };
    });
  }, [yard, scheduleByChassis, modelMetaMap]);

  // KPI calculations using KPI date range
  const kpiPgiCount = useMemo(
    () =>
      onTheRoadAll.filter(
        (row) =>
          slugifyDealerName(row.dealer) === dealerSlug &&
          isDateWithinRange(parseDDMMYYYY(row.pgidate || null), kpiStartDate, kpiEndDate)
      ).length,
    [onTheRoadAll, dealerSlug, kpiStartDate, kpiEndDate]
  );

  const kpiReceivedCount = useMemo(
    () =>
      yardList.filter((x) =>
        isDateWithinRange(x.receivedAt ? new Date(x.receivedAt) : null, kpiStartDate, kpiEndDate)
      ).length,
    [yardList, kpiStartDate, kpiEndDate]
  );

  const kpiHandoverCount = useMemo(() => {
    const records = Object.entries(handoverAll || {});
    return records.filter(([chassis, rec]) => {
      const slugFromRec = normalizeDealerSlug(rec?.dealerSlug ?? dealerSlug);
      if (slugFromRec !== dealerSlug) return false;
      return isDateWithinRange(parseDDMMYYYY(rec?.handoverAt ?? null), kpiStartDate, kpiEndDate);
    }).length;
  }, [handoverAll, dealerSlug, kpiStartDate, kpiEndDate]);

  const showWholesaleColumn = WHOLESALE_SLUGS.has(dealerSlug);

  const stockUnits = useMemo(() => yardList.filter((row) => row.type === "Stock"), [yardList]);
  const customerUnits = useMemo(() => yardList.filter((row) => row.type === "Customer"), [yardList]);

  const rangeCounts = useMemo(() => {
    const map: Record<string, number> = {};
    stockUnits.forEach((row) => {
      const key = row.modelRange || "Unknown";
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [stockUnits]);
  const functionCounts = useMemo(() => {
    const map: Record<string, number> = {};
    stockUnits.forEach((row) => {
      const key = row.functionName || "Unknown";
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [stockUnits]);
  const layoutCounts = useMemo(() => {
    const map: Record<string, number> = {};
    stockUnits.forEach((row) => {
      const key = row.layout || "Unknown";
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [stockUnits]);
  const axleCounts = useMemo(() => {
    const map: Record<string, number> = {};
    stockUnits.forEach((row) => {
      const key = row.axle || "Unknown";
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [stockUnits]);
  const heightCategories = useMemo(() => {
    const map: Record<string, number> = {};
    stockUnits.forEach((row) => {
      const s = toStr(row.height).toLowerCase();
      const label = !s || s === "unknown" ? "Unknown" : s.includes("pop") ? "Pop-top" : "Full Height";
      map[label] = (map[label] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [stockUnits]);
  const lengthBuckets = useMemo(() => {
    const buckets = [
      { label: "<=5.00m", min: 0, max: 5.0 },
      { label: "5.01–7.00m", min: 5.01, max: 7.0 },
      { label: ">=7.01m", min: 7.01, max: 100 },
    ];
    const counts = buckets.map(() => 0);
    stockUnits.forEach((row) => {
      const num = parseNum(row.length);
      if (num == null || isNaN(num)) return;
      const idx = buckets.findIndex((bb) => num >= bb.min && num <= bb.max);
      if (idx >= 0) counts[idx] += 1;
    });
    return buckets.map((b, idx) => ({ name: b.label, value: counts[idx] }));
  }, [stockUnits]);

  const analysisData = useMemo<AnalysisRow[]>(() => {
    switch (activeCategory) {
      case "range":
        return rangeCounts;
      case "function":
        return functionCounts;
      case "layout":
        return layoutCounts;
      case "axle":
        return axleCounts;
      case "length":
        return lengthBuckets;
      case "height":
        return heightCategories;
      default:
        return rangeCounts;
    }
  }, [activeCategory, rangeCounts, functionCounts, layoutCounts, axleCounts, lengthBuckets, heightCategories]);

  const formatDateOnly = (iso?: string | null) => {
    if (!iso) return "-";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleDateString();
  };

  const formatWholesale = (price: number | null | undefined) => {
    if (price == null) return "-";
    return currencyFormatter.format(price);
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar
        orders={[]}
        selectedDealer="locked"
        onDealerSelect={() => {}}
        hideOtherDealers
        currentDealerName={dealerDisplayName}
        showStats={false}
      />
      <main className="flex-1 p-6 space-y-6 bg-gradient-to-br from-slate-50 via-white to-slate-100">
        <header className="pb-2">
          <h1 className="text-2xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-slate-800 via-blue-700 to-sky-600">
            Yard Inventory & On The Road — {dealerDisplayName}
          </h1>
          <p className="text-muted-foreground mt-1">Manage PGI arrivals and yard inventory for this dealer</p>
        </header>

        {/* On The Road (PGI list) */}
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition">
          <CardHeader className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Truck className="h-5 w-5 text-slate-500" />
                On The Road (PGI)
              </CardTitle>
              <p className="text-sm text-muted-foreground">Recently completed units heading toward this dealer</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={rangeType}
                onChange={(e) => setRangeType(e.target.value as typeof rangeType)}
                className="border border-slate-200 rounded-md px-2 py-1 text-sm"
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="custom">Custom Range</option>
              </select>
              {rangeType === "custom" && (
                <>
                  <Input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="h-8"
                  />
                  <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-8" />
                </>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-semibold">Chassis</TableHead>
                    <TableHead className="font-semibold">PGI Date</TableHead>
                    <TableHead className="font-semibold">Model</TableHead>
                    <TableHead className="font-semibold">Customer</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(pgi || {})
                    .filter(([chassis, rec]) => {
                      const slug = slugifyDealerName(rec?.dealer);
                      if (slug !== dealerSlug) return false;
                      return isDateWithinRange(parseDDMMYYYY(rec?.pgidate || null), startDate, endDate);
                    })
                    .map(([chassis, rec]) => (
                      <TableRow key={chassis}>
                        <TableCell className="font-medium">{chassis}</TableCell>
                        <TableCell>{rec?.pgidate || "-"}</TableCell>
                        <TableCell>{rec?.model || "-"}</TableCell>
                        <TableCell>{rec?.customer || "-"}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* KPI overview */}
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition">
          <CardHeader className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <PackageCheck className="h-5 w-5 text-slate-500" />
                KPI Snapshot
              </CardTitle>
              <p className="text-sm text-muted-foreground">Track PGI arrivals, yard receipts, and handovers</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={kpiRangeType}
                onChange={(e) => setKpiRangeType(e.target.value as typeof kpiRangeType)}
                className="border border-slate-200 rounded-md px-2 py-1 text-sm"
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="custom">Custom Range</option>
              </select>
              {kpiRangeType === "custom" && (
                <>
                  <Input
                    type="date"
                    value={kpiCustomStart}
                    onChange={(e) => setKpiCustomStart(e.target.value)}
                    className="h-8"
                  />
                  <Input
                    type="date"
                    value={kpiCustomEnd}
                    onChange={(e) => setKpiCustomEnd(e.target.value)}
                    className="h-8"
                  />
                </>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="text-sm text-muted-foreground">PGI Units</div>
                <div className="text-2xl font-semibold mt-1">{kpiPgiCount}</div>
                <div className="text-xs text-muted-foreground mt-2">Completed PGI entries for this period</div>
              </div>
              <div className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="text-sm text-muted-foreground">Yard Receipts</div>
                <div className="text-2xl font-semibold mt-1">{kpiReceivedCount}</div>
                <div className="text-xs text-muted-foreground mt-2">Units received into yard during the period</div>
              </div>
              <div className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="text-sm text-muted-foreground">Handovers</div>
                <div className="text-2xl font-semibold mt-1">{kpiHandoverCount}</div>
                <div className="text-xs text-muted-foreground mt-2">Handover submissions logged in this range</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Yard Inventory controls */}
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Warehouse className="h-5 w-5 text-slate-500" />
                  Yard Inventory
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Filter by unit type, age, model range, and category insights
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant={selectedType === "Stock" ? "default" : "outline"}
                    onClick={() => setSelectedType("Stock")}
                  >
                    Stock
                  </Button>
                  <Button
                    size="sm"
                    variant={selectedType === "Customer" ? "default" : "outline"}
                    onClick={() => setSelectedType("Customer")}
                  >
                    Customer
                  </Button>
                  <Button size="sm" variant={selectedType === "All" ? "default" : "outline"} onClick={() => setSelectedType("All")}>
                    All
                  </Button>
                </div>
                <select
                  value={selectedModelRange}
                  onChange={(e) => setSelectedModelRange(e.target.value as typeof selectedModelRange)}
                  className="border border-slate-200 rounded-md px-2 py-1 text-sm"
                >
                  <option value="All">All Ranges</option>
                  {Array.from(new Set(stockUnits.map((row) => row.modelRange).filter(Boolean))).map((range) => (
                    <option key={range} value={range!}>
                      {range}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedFunction}
                  onChange={(e) => setSelectedFunction(e.target.value as typeof selectedFunction)}
                  className="border border-slate-200 rounded-md px-2 py-1 text-sm"
                >
                  <option value="All">All Functions</option>
                  {Array.from(new Set(stockUnits.map((row) => row.functionName).filter(Boolean))).map((fn) => (
                    <option key={fn} value={fn!}>
                      {fn}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedLayout}
                  onChange={(e) => setSelectedLayout(e.target.value as typeof selectedLayout)}
                  className="border border-slate-200 rounded-md px-2 py-1 text-sm"
                >
                  <option value="All">All Layouts</option>
                  {Array.from(new Set(stockUnits.map((row) => row.layout).filter(Boolean))).map((layout) => (
                    <option key={layout} value={layout!}>
                      {layout}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Units by Days in Yard</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedRangeBucket(null)}
                    className="h-7 text-xs"
                  >
                    Reset
                  </Button>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={yardRangeDefs.map((bucket) => {
                      const count = yardList.filter((row) => {
                        if (selectedType !== "All" && row.type !== selectedType) return false;
                        if (selectedModelRange !== "All" && row.modelRange !== selectedModelRange) return false;
                        if (selectedFunction !== "All" && row.functionName !== selectedFunction) return false;
                        if (selectedLayout !== "All" && row.layout !== selectedLayout) return false;
                        return row.daysInYard >= bucket.min && row.daysInYard <= bucket.max;
                      }).length;
                      return { name: bucket.label, value: count };
                    })}
                  >
                    <XAxis dataKey="name" stroke="#64748b" />
                    <YAxis allowDecimals={false} stroke="#64748b" />
                    <ReTooltip />
                    <Bar
                      dataKey="value"
                      fill="#4f46e5"
                      radius={[4, 4, 0, 0]}
                      onClick={(data) => setSelectedRangeBucket(data?.name ?? null)}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Stock Category Breakdown</h3>
                  <div className="flex gap-2">
                    {(["range", "function", "layout", "axle", "length", "height"] as const).map((cat) => (
                      <Button
                        key={cat}
                        size="sm"
                        variant={activeCategory === cat ? "default" : "outline"}
                        className="h-7 text-xs"
                        onClick={() => setActiveCategory(cat)}
                      >
                        {cat[0].toUpperCase() + cat.slice(1)}
                      </Button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={analysisData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label
                    >
                      {analysisData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Stock vs Customer Trend (Last 12 Weeks)</h3>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart
                  data={(() => {
                    const map: Record<string, { date: Date; week: string; stock: number; customer: number }> = {};
                    const now = new Date();
                    const start = addDays(now, -7 * 12);
                    for (let i = 0; i <= 12; i++) {
                      const weekStart = addDays(start, i * 7);
                      const weekKey = weekStart.toISOString();
                      map[weekKey] = { date: weekStart, week: fmtWeekLabel(weekStart), stock: 0, customer: 0 };
                    }
                    yardList.forEach((row) => {
                      if (!row.receivedAt) return;
                      const d = new Date(row.receivedAt);
                      const weekStart = startOfWeekMonday(d);
                      const key = weekStart.toISOString();
                      if (!map[key]) {
                        map[key] = { date: weekStart, week: fmtWeekLabel(weekStart), stock: 0, customer: 0 };
                      }
                      if (row.type === "Stock") map[key].stock += 1;
                      else map[key].customer += 1;
                    });
                    return Object.values(map)
                      .sort((a, b) => a.date.getTime() - b.date.getTime())
                      .map((row) => ({ week: row.week, Stock: row.stock, Customer: row.customer }));
                  })()}
                >
                  <XAxis dataKey="week" stroke="#64748b" />
                  <YAxis allowDecimals={false} stroke="#64748b" />
                  <ReTooltip />
                  <Line type="monotone" dataKey="Stock" stroke="#4f46e5" strokeWidth={2} />
                  <Line type="monotone" dataKey="Customer" stroke="#10b981" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Card className="border-slate-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelectedType("Stock")}>
                      Stock Units ({stockUnits.length})
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    Select any unit to bring up registration or dispatch options.
                  </div>
                </CardContent>
              </Card>
              <Card className="border-slate-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => setSelectedType("Customer")}
                    >
                      Customer Units ({customerUnits.length})
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    Track retail allocations and upcoming handovers for this yard.
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="rounded-lg border bg-white p-4 shadow-sm space-y-4">
              <div className="flex flex-wrap gap-2">
                <Input
                  value={manualChassis}
                  onChange={(e) => setManualChassis(e.target.value)}
                  placeholder="Manual chassis entry"
                  className="w-48"
                />
                <Button
                  onClick={async () => {
                    const chassis = manualChassis.trim();
                    if (!chassis) return;
                    try {
                      await addManualChassisToYard(dealerSlug, chassis);
                      setManualChassis("");
                      setManualStatus({ type: "ok", msg: `Added ${chassis} to yard.` });
                    } catch (err) {
                      console.error(err);
                      setManualStatus({ type: "err", msg: "Failed to add chassis. Try again." });
                    }
                  }}
                >
                  Add Manual Entry
                </Button>
                {manualStatus && (
                  <span className={manualStatus.type === "ok" ? "text-emerald-600 text-sm" : "text-red-600 text-sm"}>
                    {manualStatus.msg}
                  </span>
                )}
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-semibold">Chassis</TableHead>
                      <TableHead className="font-semibold">Received At</TableHead>
                      <TableHead className="font-semibold">Model</TableHead>
                      <TableHead className="font-semibold">Model Range</TableHead>
                      <TableHead className="font-semibold">Customer</TableHead>
                      <TableHead className="font-semibold">Type</TableHead>
                      {showWholesaleColumn && (
                        <TableHead className="font-semibold">Wholesale Price (excl. GST)</TableHead>
                      )}
                      <TableHead className="font-semibold">Days In Yard</TableHead>
                      <TableHead className="font-semibold">Handover</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {yardList
                      .filter((row) => {
                        if (selectedType !== "All" && row.type !== selectedType) return false;
                        if (selectedRangeBucket) {
                          const bucket = yardRangeDefs.find((b) => b.label === selectedRangeBucket);
                          if (bucket && !(row.daysInYard >= bucket.min && row.daysInYard <= bucket.max)) return false;
                        }
                        if (selectedModelRange !== "All" && row.modelRange !== selectedModelRange) return false;
                        if (selectedFunction !== "All" && row.functionName !== selectedFunction) return false;
                        if (selectedLayout !== "All" && row.layout !== selectedLayout) return false;
                        return true;
                      })
                      .map((row) => (
                        <TableRow key={row.chassis}>
                          <TableCell className="font-medium">{row.chassis}</TableCell>
                          <TableCell>{formatDateOnly(row.receivedAt)}</TableCell>
                          <TableCell>{toStr(row.model) || "-"}</TableCell>
                          <TableCell>{toStr(row.modelRange) || "-"}</TableCell>
                          <TableCell>{toStr(row.customer) || "-"}</TableCell>
                          <TableCell>
                            <span className={row.type === "Stock" ? "text-blue-700 font-medium" : "text-emerald-700 font-medium"}>
                              {row.type}
                            </span>
                          </TableCell>
                          {showWholesaleColumn && <TableCell>{formatWholesale(row.wholesalePrice)}</TableCell>}
                          <TableCell>{row.daysInYard}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              className="bg-purple-600 hover:bg-purple-700"
                              onClick={() => {
                                setHandoverData({
                                  chassis: row.chassis,
                                  model: row.model,
                                  dealerName: dealerDisplayName,
                                  dealerSlug,
                                  handoverAt: new Date().toISOString(),
                                });
                                setHandoverOpen(true);
                              }}
                            >
                              Handover
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Handover Modal */}
        <ProductRegistrationForm
          open={handoverOpen}
          onOpenChange={setHandoverOpen}
          initial={handoverData}
          onCompleted={async ({ chassis, dealerSlug: completedSlug }) => {
            const slugToUse = (completedSlug ?? dealerSlug) || "";
            if (!slugToUse) return;
            try {
              await dispatchFromYard(slugToUse, chassis);
            } catch (err) {
              console.error(err);
            }
          }}
        />
      </main>
    </div>
  );
}
