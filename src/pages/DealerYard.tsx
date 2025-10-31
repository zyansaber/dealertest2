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

  // Classification analysis (always Stock)
  const [classMap, setClassMap] = useState<Record<string, string>>({});
  const [hidePie, setHidePie] = useState(false);
  const [hideDetails, setHideDetails] = useState(false);
  const [hideRanges, setHideRanges] = useState(false);
  const [hiddenClasses, setHiddenClasses] = useState<Set<string>>(new Set());

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
    // Load classification mapping from Excel (public asset)
    (async () => {
      try {
        const resp = await fetch("/assets/data/caravan_classification_3.xlsx");
        const buf = await resp.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const first = wb.Sheets[wb.SheetNames[0]];
        const json: any[] = XLSX.utils.sheet_to_json(first);
        const map: Record<string, string> = {};
        json.forEach((row) => {
          const model = toStr(row.Model || row.model || row["MODEL"]).trim().toLowerCase();
          const cls = toStr(row.Classification || row.classification || row["CLASSIFICATION"]).trim();
          if (model) map[model] = cls || "Unknown";
        });
        setClassMap(map);
      } catch (e) {
        console.warn("Failed to load classification excel:", e);
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
    return entries
      .map(([chassis, rec]) => ({ chassis, ...rec }));
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

  // Classification analysis (Stock only)
  const classificationCounts = useMemo(() => {
    const list = yardList.filter((x) => x.type === "Stock");
    const counts: Record<string, number> = {};
    list.forEach((x) => {
      const key = classMap[toStr(x.model).trim().toLowerCase()] || "Unknown";
      counts[key] = (counts[key] || 0) + 1;
    });
    const entries = Object.entries(counts)
      .filter(([k]) => !hiddenClasses.has(k))
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    return entries;
  }, [yardList, classMap, hiddenClasses]);

  const top10 = useMemo(() => classificationCounts.slice(0, 10), [classificationCounts]);

  const toggleHiddenClass = (name: string) => {
    setHiddenClasses((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const COLORS = ["#38bdf8", "#0ea5e9", "#6366f1", "#22c55e", "#ef4444", "#f59e0b", "#8b5cf6", "#14b8a6", "#84cc16", "#eab308", "#f97316", "#a3e635"];

  // Range buckets by days in yard
  const rangeBuckets = useMemo(() => {
    const ranges = [
      { label: "0–7d", min: 0, max: 7 },
      { label: "8–14d", min: 8, max: 14 },
      { label: "15–30d", min: 15, max: 30 },
      { label: "31–60d", min: 31, max: 60 },
      { label: "61–90d", min: 61, max: 90 },
      { label: ">90d", min: 91, max: Infinity },
    ];
    const items = ranges.map((r) => ({
      label: r.label,
      count: yardList.filter((x) => x.daysInYard >= r.min && x.daysInYard <= r.max).length,
    }));
    return items;
  }, [yardList]);

  const openHandover = async (row: { chassis: string; model?: string | null }) => {
    // Immediately remove the unit from Yard table
    try {
      await dispatchFromYard(dealerSlug, row.chassis);
    } catch (e) {
      console.error("Failed to remove from yard immediately:", e);
    }
    setHandoverData({
      chassis: row.chassis,
      model: row.model,
      dealerName: dealerDisplayName,
      dealerSlug,
      handoverAt: new Date().toISOString(),
    });
    setHandoverOpen(true);
  };

  const formatDateOnly = (iso?: string | null) => {
    if (!iso) return "-";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleDateString();
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

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="backdrop-blur-sm bg-white/70 border-slate-200 shadow-sm hover:shadow-md transition">
            <CardHeader><CardTitle className="text-sm">Yard Inventory Total</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{yardTotal}</div></CardContent>
          </Card>
          <Card className="backdrop-blur-sm bg-white/70 border-slate-200 shadow-sm hover:shadow-md transition">
            <CardHeader><CardTitle className="text-sm">Factory PGI (received in Yard)</CardTitle></CardHeader>
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

        {/* Classification Analysis (Stock only) */}
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Classification Analysis — Stock</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" className="!bg-transparent !hover:bg-transparent" onClick={() => setHidePie((v) => !v)}>
                {hidePie ? "Show Pie" : "Hide Pie"}
              </Button>
              <Button variant="outline" className="!bg-transparent !hover:bg-transparent" onClick={() => setHideDetails((v) => !v)}>
                {hideDetails ? "Show Details" : "Hide Details"}
              </Button>
              <Button variant="outline" className="!bg-transparent !hover:bg-transparent" onClick={() => setHideRanges((v) => !v)}>
                {hideRanges ? "Show Ranges Chart" : "Hide Ranges Chart"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {!hidePie && (
                <div className="h-56 rounded-lg border bg-white/70">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={classificationCounts}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={90}
                        paddingAngle={3}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {classificationCounts.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <ReTooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              {!hideDetails && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Top 10</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {top10.map((t, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded border px-2 py-1">
                        <span className="text-sm">{t.name}</span>
                        <span className="text-sm font-semibold">{t.value}</span>
                      </div>
                    ))}
                  </div>

                  <div className="text-sm font-medium mt-2">Hide/Show Classifications</div>
                  <div className="flex flex-wrap gap-2">
                    {classificationCounts.map((c, idx) => (
                      <Button
                        key={idx}
                        size="sm"
                        variant={hiddenClasses.has(c.name) ? "secondary" : "outline"}
                        className={hiddenClasses.has(c.name) ? "" : "!bg-transparent !hover:bg-transparent"}
                        onClick={() => toggleHiddenClass(c.name)}
                      >
                        {hiddenClasses.has(c.name) ? `Show ${c.name}` : `Hide ${c.name}`}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {!hideRanges && (
              <div className="h-40 rounded-lg border bg-white/70">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rangeBuckets}>
                    <XAxis dataKey="label" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#6366f1" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
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
                          <Button size="sm" className="bg-purple-600 hover:bg-purple-700" onClick={() => openHandover({ chassis: row.chassis, model: row.model })}>
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
