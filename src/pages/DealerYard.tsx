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
} from "@/lib/firebase";
import type { ScheduleItem } from "@/types";
import ProductRegistrationForm from "@/components/ProductRegistrationForm";
import * as XLSX from "xlsx";
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip,
} from "recharts";

const toStr = (v: any) => String(v ?? "");
const lower = (v: any) => toStr(v).toLowerCase();

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
  } catch {}
  return null;
}
function daysSinceISO(iso?: string | null): number {
  if (!iso) return 0;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 0;
  const ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}
function isWithinDays(dateStr?: string | null, days: number = 7): boolean {
  const d = parseDDMMYYYY(dateStr);
  if (!d) return false;
  const ms = Date.now() - d.getTime();
  const diffDays = Math.floor(ms / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= days;
}

type PGIRecord = {
  pgidate?: string | null;
  dealer?: string | null;
  model?: string | null;
  customer?: string | null;
};

type TrendPoint = { label: string; count: number };

function makeWeeklyBuckets(weeks: number = 12): Date[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  const diffToMonday = (day + 6) % 7;
  start.setDate(start.getDate() - diffToMonday);
  const buckets: Date[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
      const d = new Date(start);
      d.setDate(start.getDate() - i * 7);
      buckets.push(d);
  }
  return buckets;
}
function formatWeekLabel(d: Date): string {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${m}/${day}`;
}
function groupCountsByWeek(dates: Date[], values: Date[]): TrendPoint[] {
  const points: TrendPoint[] = dates.map((d) => ({ label: formatWeekLabel(d), count: 0 }));
  for (const v of values) {
    for (let i = 0; i < dates.length; i++) {
      const start = dates[i];
      const end = i + 1 < dates.length ? dates[i + 1] : new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
      if (v >= start && v < end) {
        points[i].count += 1;
        break;
      }
    }
  }
  return points;
}

function makeMonthBucketsCurrentYear(): Date[] {
  const y = new Date().getFullYear();
  const arr: Date[] = [];
  for (let m = 0; m < 12; m++) {
    arr.push(new Date(y, m, 1));
  }
  return arr;
}
function monthLabel(d: Date): string {
  return d.toLocaleString("en-US", { month: "short" });
}
function groupCountsByMonth(months: Date[], values: Date[]): TrendPoint[] {
  const points: TrendPoint[] = months.map((m) => ({ label: monthLabel(m), count: 0 }));
  for (const v of values) {
    for (let i = 0; i < months.length; i++) {
      const start = months[i];
      const end = i + 1 < months.length ? months[i + 1] : new Date(start.getFullYear() + 1, 0, 1);
      if (v >= start && v < end) {
        points[i].count += 1;
        break;
      }
    }
  }
  return points;
}

function WeeklyBarChart({ points }: { points: TrendPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <div className="flex items-end gap-3 h-28">
      {points.map((p, idx) => (
        <div key={idx} className="flex flex-col items-center h-full">
          <div className="text-[11px] text-slate-600 mb-1">{p.count}</div>
          <div
            className="w-4 rounded-sm bg-gradient-to-b from-violet-400 via-indigo-600 to-blue-700 shadow-[0_4px_12px_rgba(79,70,229,0.35)]"
            style={{ height: `${Math.round((p.count / max) * 100)}%`, minHeight: p.count > 0 ? "6px" : "0px" }}
            title={`${p.label}: ${p.count}`}
          />
          <div className="text-[10px] mt-1 text-slate-500">{p.label}</div>
        </div>
      ))}
    </div>
  );
}
function MonthlyBarChart({ points }: { points: TrendPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <div className="flex items-end gap-3 h-28">
      {points.map((p, idx) => (
        <div key={idx} className="flex flex-col items-center h-full">
          <div className="text-[11px] text-slate-600 mb-1">{p.count}</div>
          <div
            className="w-4 rounded-sm bg-gradient-to-b from-cyan-400 via-blue-600 to-indigo-700 shadow-[0_4px_12px_rgba(56,189,248,0.35)]"
            style={{ height: `${Math.round((p.count / max) * 100)}%`, minHeight: p.count > 0 ? "6px" : "0px" }}
            title={`${p.label}: ${p.count}`}
          />
          <div className="text-[10px] mt-1 text-slate-500">{p.label}</div>
        </div>
      ))}
    </div>
  );
}

// Icons
const IconClipboard = () => <img src="/assets/icons/clipboard.png" alt="clip" className="w-5 h-5" />;
const IconRuler = () => (<svg className="w-5 h-5 text-slate-700" viewBox="0 0 24 24" fill="none"><path d="M3 8l5-5 13 13-5 5L3 8z" stroke="currentColor" strokeWidth="2"/></svg>);
const IconCog = () => (<svg className="w-5 h-5 text-slate-700" viewBox="0 0 24 24" fill="none"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="2"/><path d="M19.4 15a7.97 7.97 0 00.4-3 7.97 7.97 0 00-.4-3l2.1-1.6-2-3.4-2.6 1A8.09 8.09 0 0014 1.6L13 0h-2l-1 1.6A8.09 8.09 0 007.1 2.6l-2.6-1-2 3.4L4.6 6a7.97 7.97 0 00-.4 3 7.97 7.97 0 00.4 3L2.5 16.6l2 3.4 2.6-1A8.09 8.09 0 0010 22.4l1 1.6h2l1-1.6a8.09 8.09 0 002.9-1l2.6 1 2-3.4L19.4 15z" stroke="currentColor" strokeWidth="2"/></svg>);
const IconLayout = () => (<svg className="w-5 h-5 text-slate-700" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" stroke="currentColor" strokeWidth="2"/><path d="M3 9h18M9 21V9" stroke="currentColor" strokeWidth="2"/></svg>);
const IconCar = () => (<svg className="w-5 h-5 text-slate-700" viewBox="0 0 24 24" fill="none"><path d="M3 16l2-6 3-3h8l3 3 2 6H3z" stroke="currentColor" strokeWidth="2"/><circle cx="7" cy="17" r="2" stroke="currentColor" strokeWidth="2"/><circle cx="17" cy="17" r="2" stroke="currentColor" strokeWidth="2"/></svg>);

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

function bucketNumber(value: number | null | undefined, buckets: { label: string; min: number; max: number }[]) {
  if (value == null || isNaN(value)) return null;
  for (const b of buckets) {
    if (value >= b.min && value <= b.max) return b.label;
  }
  return null;
}
function parseNum(val: any): number | null {
  if (val == null) return null;
  const s = String(val).replace(/[^\d\.]/g, "");
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

// Custom Legend for Pie to show name and count
function PieLegend({ payload }: { payload?: any[] }) {
  if (!payload) return null;
  return (
    <ul className="flex flex-wrap gap-2 text-xs">
      {payload.map((entry, idx) => (
        <li key={idx} className="flex items-center gap-1 rounded border px-2 py-1 bg-white/70">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: entry.color }} />
          <span className="font-medium text-slate-700">{entry.value}</span>
          <span className="text-slate-500">({entry.payload?.value ?? 0})</span>
        </li>
      ))}
    </ul>
  );
}

export default function DealerYard() {
  const { dealerSlug: rawDealerSlug } = useParams<{ dealerSlug: string }>();
  const dealerSlug = useMemo(() => normalizeDealerSlug(rawDealerSlug), [rawDealerSlug]);

  const [pgi, setPgi] = useState<Record<string, PGIRecord>>({});
  const [yard, setYard] = useState<Record<string, any>>({});
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);

  // Modal: Product Registration
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [handoverData, setHandoverData] = useState<null | { chassis: string; model?: string | null; dealerName?: string | null; dealerSlug?: string | null; handoverAt: string }>(null);

  // Manual add chassis
  const [manualChassis, setManualChassis] = useState("");
  const [manualStatus, setManualStatus] = useState<null | { type: "ok" | "err"; msg: string }>(null);

  // Excel insights
  const [excelRows, setExcelRows] = useState<ExcelRow[]>([]);
  // Collapsible sections default hidden
  const [showRange, setShowRange] = useState(false);
  const [showFunction, setShowFunction] = useState(false);
  const [showLayout, setShowLayout] = useState(false);
  const [showHeight, setShowHeight] = useState(false);
  const [showLength, setShowLength] = useState(false);
  const [showAxle, setShowAxle] = useState(false);

  useEffect(() => {
    const unsubPGI = subscribeToPGIRecords((data) => setPgi(data || {}));
    const unsubSched = subscribeToSchedule((data) => setSchedule(Array.isArray(data) ? data : []), {
      includeNoChassis: true,
      includeNoCustomer: true,
      includeFinished: true,
    });
    let unsubYard: (() => void) | undefined;
    if (dealerSlug) {
      unsubYard = subscribeToYardStock(dealerSlug, (data) => setYard(data || {}));
    }
    return () => {
      unsubPGI?.();
      unsubYard?.();
      unsubSched?.();
    };
  }, [dealerSlug]);

  useEffect(() => {
    // Load latest Excel uploaded asset for insights
    (async () => {
      try {
        const resp = await fetch("/assets/data/caravan_classification_3.xlsx");
        const buf = await resp.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const first = wb.Sheets[wb.SheetNames[0]];
        const json: ExcelRow[] = XLSX.utils.sheet_to_json(first);
        setExcelRows(json || []);
      } catch (e) {
        console.warn("Failed to load excel(3) for insights:", e);
      }
    })();
  }, []);

  const scheduleByChassis = useMemo(() => {
    const map: Record<string, ScheduleItem> = {};
    for (const item of schedule) {
      const ch = toStr((item as any)?.Chassis);
      if (ch) map[ch] = item;
    }
    return map;
  }, [schedule]);

  const onTheRoadAll = useMemo(() => {
    const entries = Object.entries(pgi || {});
    return entries.map(([chassis, rec]) => ({ chassis, ...rec }));
  }, [pgi]);

  const onTheRoadWeekly = useMemo(() => onTheRoadAll.filter((row) => isWithinDays(row.pgidate, 7)), [onTheRoadAll]);

  const yardList = useMemo(() => {
    const entries = Object.entries(yard || {});
    return entries.map(([chassis, rec]) => {
      const sch = scheduleByChassis[chassis];
      const customer = toStr(sch?.Customer || rec?.customer);
      const type = customer.toLowerCase().endsWith("stock") ? "Stock" : "Customer";
      const model = toStr(sch?.Model || rec?.model);
      const receivedAtISO = rec?.receivedAt ?? null;
      const daysInYard = daysSinceISO(receivedAtISO);
      return { chassis, receivedAt: receivedAtISO, model, customer, type, daysInYard };
    });
  }, [yard, scheduleByChassis]);

  const dealerDisplayName = useMemo(() => prettifyDealerName(dealerSlug), [dealerSlug]);

  const handleReceive = async (chassis: string, rec: PGIRecord) => {
    try {
      await receiveChassisToYard(dealerSlug, chassis, rec);
    } catch (e) {
      console.error("receive failed", e);
    }
  };

  const handleAddManual = async () => {
    const ch = manualChassis.trim().toUpperCase();
    if (!ch) {
      setManualStatus({ type: "err", msg: "Please enter chassis number" });
      return;
    }
    try {
      await addManualChassisToYard(dealerSlug, ch);
      setManualStatus({ type: "ok", msg: `Added ${ch} to Yard` });
      setManualChassis("");
    } catch (e) {
      console.error(e);
      setManualStatus({ type: "err", msg: "Failed to add. Please try again." });
    }
  };

  // KPI cards
  const yardTotal = yardList.length;
  // Factory PGI (received in Yard): count all pgirecord with dealer Frankston
  const factoryPGIReceived = useMemo(() => {
    const FRANKSTON_SLUG = "frankston";
    return onTheRoadAll.filter((x) => slugifyDealerName(x.dealer) === FRANKSTON_SLUG).length;
  }, [onTheRoadAll]);
  const yardStockCount = yardList.filter((x) => x.type === "Stock").length;
  const yardCustomerCount = yardList.filter((x) => x.type === "Customer").length;

  // Trends
  const weekBuckets = useMemo(() => makeWeeklyBuckets(12), []);
  const yardDates = useMemo(() => {
    return yardList
      .map((x) => {
        const d = x.receivedAt ? new Date(x.receivedAt) : null;
        if (!d || isNaN(d.getTime())) return null;
        d.setHours(0, 0, 0, 0);
        return d;
      })
      .filter(Boolean) as Date[];
  }, [yardList]);
  const yardTrend = useMemo(() => groupCountsByWeek(weekBuckets, yardDates), [weekBuckets, yardDates]);

  const monthBuckets = useMemo(() => makeMonthBucketsCurrentYear(), []);
  const pgiDates = useMemo(() => {
    return onTheRoadAll
      .map((x) => {
        const d = parseDDMMYYYY(x.pgidate);
        if (!d) return null;
        d.setHours(0, 0, 0, 0);
        return d;
      })
      .filter(Boolean) as Date[];
  }, [onTheRoadAll]);
  const pgiMonthlyTrend = useMemo(() => groupCountsByMonth(monthBuckets, pgiDates), [monthBuckets, pgiDates]);

  // Excel insights data
  const rangeCounts = useMemo(() => countBy(excelRows, "Model Range"), [excelRows]);
  const functionCounts = useMemo(() => countBy(excelRows, "Function"), [excelRows]);
  const layoutCounts = useMemo(() => countBy(excelRows, "Layout"), [excelRows]);
  const axleCounts = useMemo(() => countBy(excelRows, "Axle"), [excelRows]);

  const heightBuckets = useMemo(() => {
    const buckets = [
      { label: "<=2.70m", min: 0, max: 2.7 },
      { label: "2.71–3.00m", min: 2.71, max: 3.0 },
      { label: ">=3.01m", min: 3.01, max: 100 },
    ];
    const map: Record<string, number> = {};
    excelRows.forEach((r) => {
      const num = parseNum(r.Height);
      const b = bucketNumber(num, buckets);
      if (!b) return;
      map[b] = (map[b] || 0) + 1;
    });
    return buckets.map((b) => ({ label: b.label, count: map[b.label] || 0 }));
  }, [excelRows]);

  const lengthBuckets = useMemo(() => {
    const buckets = [
      { label: "<=5.00m", min: 0, max: 5.0 },
      { label: "5.01–7.00m", min: 5.01, max: 7.0 },
      { label: ">=7.01m", min: 7.01, max: 100 },
    ];
    const map: Record<string, number> = {};
    excelRows.forEach((r) => {
      const num = parseNum(r.Length);
      const b = bucketNumber(num, buckets);
      if (!b) return;
      map[b] = (map[b] || 0) + 1;
    });
    return buckets.map((b) => ({ label: b.label, count: map[b.label] || 0 }));
  }, [excelRows]);

  const top15Count = useMemo(() => countTop15(excelRows), [excelRows]);

  const formatDateOnly = (iso?: string | null) => {
    if (!iso) return "-";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleDateString();
  };

  const COLORS = ["#0ea5e9", "#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#84cc16", "#eab308", "#f97316", "#06b6d4", "#a855f7", "#10b981", "#3b82f6", "#64748b"];

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

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="backdrop-blur-sm bg-white/70 border-slate-200 shadow-sm hover:shadow-md transition">
            <CardHeader><CardTitle className="text-sm">Yard Inventory Total</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{yardTotal}</div></CardContent>
          </Card>
          <Card className="backdrop-blur-sm bg-white/70 border-slate-200 shadow-sm hover:shadow-md transition">
            <CardHeader><CardTitle className="text-sm">Factory PGI (Frankston)</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{factoryPGIReceived}</div></CardContent>
          </Card>
          <Card className="backdrop-blur-sm bg-white/70 border-slate-200 shadow-sm hover:shadow-md transition">
            <CardHeader><CardTitle className="text-sm">Inventory: Stock</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-blue-700">{yardStockCount}</div></CardContent>
          </Card>
          <Card className="backdrop-blur-sm bg-white/70 border-slate-200 shadow-sm hover:shadow-md transition">
            <CardHeader><CardTitle className="text-sm">Inventory: Customer</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-emerald-700">{yardCustomerCount}</div></CardContent>
          </Card>
        </div>

        {/* Stock Analysis */}
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition">
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <IconClipboard /> Stock Analysis
              <span className="ml-2 text-xs font-medium text-slate-500 rounded-full border px-2 py-0.5 bg-white/70">
                Top 15 Count: {top15Count}
              </span>
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="!bg-transparent !hover:bg-transparent" onClick={() => setShowRange((v) => !v)}>{showRange ? "Hide Range" : "Show Range"}</Button>
              <Button variant="outline" className="!bg-transparent !hover:bg-transparent" onClick={() => setShowFunction((v) => !v)}>{showFunction ? "Hide Function" : "Show Function"}</Button>
              <Button variant="outline" className="!bg-transparent !hover:bg-transparent" onClick={() => setShowLayout((v) => !v)}>{showLayout ? "Hide Layout" : "Show Layout"}</Button>
              <Button variant="outline" className="!bg-transparent !hover:bg-transparent" onClick={() => setShowAxle((v) => !v)}>{showAxle ? "Hide Axle" : "Show Axle"}</Button>
              <Button variant="outline" className="!bg-transparent !hover:bg-transparent" onClick={() => setShowLength((v) => !v)}>{showLength ? "Hide Length" : "Show Length"}</Button>
              <Button variant="outline" className="!bg-transparent !hover:bg-transparent" onClick={() => setShowHeight((v) => !v)}>{showHeight ? "Hide Height" : "Show Height"}</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {showRange && (
                <Card className="border-slate-200 bg-white/70">
                  <CardHeader className="flex items-center gap-2"><IconRuler /><CardTitle className="text-sm">Model Range</CardTitle></CardHeader>
                  <CardContent className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={rangeCounts} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} label={false} />
                        <ReTooltip />
                        <Legend content={<PieLegend />} />
                        {rangeCounts.map((_, i) => <Cell key={`range-${i}`} fill={COLORS[i % COLORS.length]} />)}
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {showFunction && (
                <Card className="border-slate-200 bg-white/70">
                  <CardHeader className="flex items-center gap-2"><IconCog /><CardTitle className="text-sm">Function</CardTitle></CardHeader>
                  <CardContent className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={functionCounts} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} label={false} />
                        <ReTooltip />
                        <Legend content={<PieLegend />} />
                        {functionCounts.map((_, i) => <Cell key={`func-${i}`} fill={COLORS[i % COLORS.length]} />)}
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {showLayout && (
                <Card className="border-slate-200 bg-white/70">
                  <CardHeader className="flex items-center gap-2"><IconLayout /><CardTitle className="text-sm">Layout</CardTitle></CardHeader>
                  <CardContent className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={layoutCounts} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} label={false} />
                        <ReTooltip />
                        <Legend content={<PieLegend />} />
                        {layoutCounts.map((_, i) => <Cell key={`layout-${i}`} fill={COLORS[i % COLORS.length]} />)}
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {showAxle && (
                <Card className="border-slate-200 bg-white/70">
                  <CardHeader className="flex items-center gap-2"><IconCar /><CardTitle className="text-sm">Axle</CardTitle></CardHeader>
                  <CardContent className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={axleCounts} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} label={false} />
                        <ReTooltip />
                        <Legend content={<PieLegend />} />
                        {axleCounts.map((_, i) => <Cell key={`axle-${i}`} fill={COLORS[i % COLORS.length]} />)}
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {showHeight && (
                <Card className="border-slate-200 bg-white/70">
                  <CardHeader className="flex items-center gap-2"><IconRuler /><CardTitle className="text-sm">Height</CardTitle></CardHeader>
                  <CardContent className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={heightBuckets}>
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#6366f1" radius={[4,4,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {showLength && (
                <Card className="border-slate-200 bg-white/70">
                  <CardHeader className="flex items-center gap-2"><IconRuler /><CardTitle className="text-sm">Length</CardTitle></CardHeader>
                  <CardContent className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={lengthBuckets}>
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#0ea5e9" radius={[4,4,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </div>
          </CardContent>
        </Card>

        {/* On The Road - last 7 days only */}
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition">
          <CardHeader>
            <CardTitle>On The Road (PGI) — Last 7 Days</CardTitle>
          </CardHeader>
          <CardContent>
            {onTheRoadWeekly.length === 0 ? (
              <div className="text-sm text-slate-500">No PGI records in the last 7 days.</div>
            ) : (
              <div className="rounded-lg border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-semibold">Chassis</TableHead>
                      <TableHead className="font-semibold">PGI Date</TableHead>
                      <TableHead className="font-semibold">Dealer</TableHead>
                      <TableHead className="font-semibold">Model</TableHead>
                      <TableHead className="font-semibold">Customer</TableHead>
                      <TableHead className="font-semibold">Days Since PGI</TableHead>
                      <TableHead className="font-semibold">Received</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {onTheRoadWeekly.map((row) => (
                      <TableRow key={row.chassis}>
                        <TableCell className="font-medium">{row.chassis}</TableCell>
                        <TableCell>{toStr(row.pgidate) || "-"}</TableCell>
                        <TableCell>{toStr(row.dealer) || "-"}</TableCell>
                        <TableCell>{toStr(row.model) || "-"}</TableCell>
                        <TableCell>{toStr(row.customer) || "-"}</TableCell>
                        <TableCell>{isWithinDays(row.pgidate, 365) ? Math.floor((Date.now() - (parseDDMMYYYY(row.pgidate)?.getTime() || Date.now())) / (1000 * 60 * 60 * 24)) : 0}</TableCell>
                        <TableCell>
                          <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleReceive(row.chassis, row)}>
                            Receive
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Yard Inventory */}
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition">
          <CardHeader>
            <CardTitle>Yard Inventory</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
              <Input
                placeholder="Enter chassis number manually"
                value={manualChassis}
                onChange={(e) => setManualChassis(e.target.value)}
              />
              <Button onClick={handleAddManual} className="bg-sky-600 hover:bg-sky-700">
                Add to Yard
              </Button>
              {manualStatus && (
                <div className={`text-sm ${manualStatus.type === "ok" ? "text-emerald-600" : "text-red-600"}`}>
                  {manualStatus.msg}
                </div>
              )}
            </div>

            {yardList.length === 0 ? (
              <div className="text-sm text-slate-500">No units in yard inventory.</div>
            ) : (
              <div className="rounded-lg border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-semibold">Chassis</TableHead>
                      <TableHead className="font-semibold">Received At</TableHead>
                      <TableHead className="font-semibold">Model</TableHead>
                      <TableHead className="font-semibold">Customer</TableHead>
                      <TableHead className="font-semibold">Type</TableHead>
                      <TableHead className="font-semibold">Days In Yard</TableHead>
                      <TableHead className="font-semibold">Handover</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {yardList.map((row) => (
                      <TableRow key={row.chassis}>
                        <TableCell className="font-medium">{row.chassis}</TableCell>
                        <TableCell>{formatDateOnly(row.receivedAt)}</TableCell>
                        <TableCell>{toStr(row.model) || "-"}</TableCell>
                        <TableCell>{toStr(row.customer) || "-"}</TableCell>
                        <TableCell>
                          <span className={row.type === "Stock" ? "text-blue-700 font-medium" : "text-emerald-700 font-medium"}>
                            {row.type}
                          </span>
                        </TableCell>
                        <TableCell>{row.daysInYard}</TableCell>
                        <TableCell>
                          <Button size="sm" className="bg-purple-600 hover:bg-purple-700" onClick={() => {
                            // Immediately remove then open handover modal
                            (async () => {
                              try { await dispatchFromYard(dealerSlug, row.chassis); } catch (e) { console.error(e); }
                              setHandoverData({
                                chassis: row.chassis,
                                model: row.model,
                                dealerName: dealerDisplayName,
                                dealerSlug,
                                handoverAt: new Date().toISOString(),
                              });
                              setHandoverOpen(true);
                            })();
                          }}>
                            Handover
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Trends */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-slate-200 shadow-sm hover:shadow-md transition">
            <CardHeader><CardTitle className="text-sm">Inventory Trend (Weekly)</CardTitle></CardHeader>
            <CardContent><WeeklyBarChart points={yardTrend} /></CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm hover:shadow-md transition">
            <CardHeader><CardTitle className="text-sm">PGI Trend (Monthly, This Year)</CardTitle></CardHeader>
            <CardContent><MonthlyBarChart points={pgiMonthlyTrend} /></CardContent>
          </Card>
        </div>

        {/* Handover Modal */}
        <ProductRegistrationForm open={handoverOpen} onOpenChange={setHandoverOpen} initial={handoverData} />
      </main>
    </div>
  );
}
