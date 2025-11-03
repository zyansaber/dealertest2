// src/pages/DealerGroupYard.tsx
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
  subscribeDealerConfig,
  subscribeAllDealerConfigs,
  addManualChassisToYard,
  dispatchFromYard,
} from "@/lib/firebase";
import type { ScheduleItem } from "@/types";
import { isDealerGroup } from "@/types/dealer";
import ProductRegistrationForm from "@/components/ProductRegistrationForm";
import * as XLSX from "xlsx";
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, LabelList,
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

function ensureDates(arr: (Date | null | undefined)[]): Date[] {
  return arr.filter((d) => d instanceof Date && !isNaN((d as Date).getTime())) as Date[];
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

// Custom Legend for Pie to show name and count (right-side vertical)
function PieLegend({ payload }: { payload?: any[] }) {
  if (!payload) return null;
  return (
    <ul className="flex flex-col gap-2 text-xs max-h-56 overflow-auto">
      {payload.map((entry, idx) => (
        <li key={idx} className="flex items-center gap-2 rounded border px-2 py-1 bg-white/70">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: entry.color }} />
          <span className="font-medium text-slate-700">{entry.value}</span>
          <span className="text-slate-500">({entry.payload?.value ?? 0})</span>
        </li>
      ))}
    </ul>
  );
}

export default function DealerGroupYard() {
  const { dealerSlug: rawDealerSlug, selectedDealerSlug } = useParams<{ dealerSlug: string; selectedDealerSlug?: string }>();
  const navigate = useNavigate();
  const groupSlug = useMemo(() => normalizeDealerSlug(rawDealerSlug), [rawDealerSlug]);

  const [dealerConfig, setDealerConfig] = useState<any>(null);
  const [allDealerConfigs, setAllDealerConfigs] = useState<any>({});
  const [configLoading, setConfigLoading] = useState(true);

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
  // Stock Analysis active category (show one at a time, default Range)
  const [activeCategory, setActiveCategory] = useState<"range" | "function" | "layout" | "axle" | "length" | "height">("range");

  // Days in Yard filter (0–90, 91–180, 180+)
  const yardRangeDefs = useMemo(() => ([
    { label: "0–90", min: 0, max: 90 },
    { label: "91–180", min: 91, max: 180 },
    { label: "180+", min: 181, max: 9999 },
  ]), []);
  const [selectedRange, setSelectedRange] = useState<string | null>(null);

  useEffect(() => {
    const unsubConfig = subscribeDealerConfig(groupSlug, (cfg) => {
      setDealerConfig(cfg);
      setConfigLoading(false);
    });
    const unsubAll = subscribeAllDealerConfigs((data) => setAllDealerConfigs(data || {}));
    const unsubPGI = subscribeToPGIRecords((data) => setPgi(data || {}));
    const unsubSched = subscribeToSchedule((data) => setSchedule(Array.isArray(data) ? data : []), {
      includeNoChassis: true,
      includeNoCustomer: true,
      includeFinished: true,
    });
    return () => {
      unsubConfig?.();
      unsubAll?.();
      unsubPGI?.();
      unsubSched?.();
    };
  }, [groupSlug]);

  const includedDealerSlugs = useMemo(() => {
    if (!dealerConfig || !isDealerGroup(dealerConfig)) return [groupSlug];
    return dealerConfig.includedDealers || [];
  }, [dealerConfig, groupSlug]);

  useEffect(() => {
    if (!configLoading && dealerConfig && isDealerGroup(dealerConfig) && !selectedDealerSlug) {
      const first = includedDealerSlugs[0];
      if (first) navigate(`/dealergroup/${rawDealerSlug}/${first}/yard`, { replace: true });
    }
  }, [configLoading, dealerConfig, selectedDealerSlug, includedDealerSlugs, rawDealerSlug, navigate]);

  const currentDealerSlug = selectedDealerSlug || includedDealerSlugs[0] || groupSlug;

  useEffect(() => {
    if (!currentDealerSlug) return;
    const unsubYard = subscribeToYardStock(currentDealerSlug, (data) => setYard(data || {}));
    return () => unsubYard?.();
  }, [currentDealerSlug]);

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

  // Only current dealer's PGI in last 7 days and for monthly trend
  const onTheRoadWeekly = useMemo(
    () => onTheRoadAll.filter((row) => isWithinDays(row.pgidate, 7) && slugifyDealerName(row.dealer) === slugifyDealerName(currentDealerSlug)),
    [onTheRoadAll, currentDealerSlug]
  );
  const onTheRoadDealerAll = useMemo(
    () => onTheRoadAll.filter((row) => slugifyDealerName(row.dealer) === slugifyDealerName(currentDealerSlug)),
    [onTheRoadAll, currentDealerSlug]
  );

  const yardList = useMemo(() => {
    const entries = Object.entries(yard || {});
    return entries.map(([chassis, rec]) => {
      const sch = scheduleByChassis[chassis];
      const customer = toStr(sch?.Customer || rec?.customer);
      const type = customer.toLowerCase().endsWith("stock") ? "Stock" : "Customer";
      const model = toStr(sch?.Model || rec?.model);
      const receivedAtISO = rec?.receivedAt ?? null;
      const daysInYard = daysSinceISO(receivedAtISO);
      const fromPGI = Boolean(rec?.from_pgidate);
      return { chassis, receivedAt: receivedAtISO, model, customer, type, daysInYard, fromPGI };
    });
  }, [yard, scheduleByChassis]);

  const includedDealerNames = useMemo(() => {
    if (!dealerConfig || !isDealerGroup(dealerConfig)) return null;
    return includedDealerSlugs.map((slug: string) => {
      const cfg = allDealerConfigs[slug];
      return { slug, name: cfg?.name || prettifyDealerName(slug) };
    });
  }, [dealerConfig, includedDealerSlugs, allDealerConfigs]);

  const dealerDisplayName = useMemo(() => {
    if (selectedDealerSlug) {
      const selectedConfig = allDealerConfigs[selectedDealerSlug];
      if (selectedConfig?.name) return selectedConfig.name;
      return prettifyDealerName(selectedDealerSlug);
    }
    if (dealerConfig?.name) return dealerConfig.name;
    return prettifyDealerName(groupSlug);
  }, [selectedDealerSlug, allDealerConfigs, dealerConfig, groupSlug]);

  const handleReceive = async (chassis: string, rec: PGIRecord) => {
    try {
      await receiveChassisToYard(currentDealerSlug, chassis, rec);
    } catch (e) {
      console.error("receive failed", e);
    }
  };

  const handleAddManual = async () => {
    const ch = manualChassis.trim().toUpperCase();
    if (!ch) {
      setManualStatus({ type: "err", msg: "请输入车架号" });
      return;
    }
    try {
      await addManualChassisToYard(currentDealerSlug, ch);
      setManualStatus({ type: "ok", msg: `已添加 ${ch} 到 Yard` });
      setManualChassis("");
    } catch (e) {
      console.error(e);
      setManualStatus({ type: "err", msg: "添加失败，请重试。" });
    }
  };

  // KPI cards
  const yardTotal = yardList.length;
  const factoryPGIReceived = useMemo(() => {
    const FRANKSTON_SLUG = "frankston";
    return onTheRoadAll.filter((x) => slugifyDealerName(x.dealer) === FRANKSTON_SLUG).length;
  }, [onTheRoadAll]);
  const yardStockCount = yardList.filter((x) => x.type === "Stock").length;
  const yardCustomerCount = yardList.filter((x) => x.type === "Customer").length;

  // Stock Analysis data
  const rangeCounts = useMemo(() => countBy(excelRows, "Model Range"), [excelRows]);
  const functionCounts = useMemo(() => countBy(excelRows, "Function"), [excelRows]);
  const layoutCounts = useMemo(() => countBy(excelRows, "Layout"), [excelRows]);
  const axleCounts = useMemo(() => countBy(excelRows, "Axle"), [excelRows]);

  // Height: Full Height vs Pop-top
  const heightCategories = useMemo(() => {
    const map: Record<string, number> = { "Full Height": 0, "Pop-top": 0 };
    excelRows.forEach((r) => {
      const s = toStr(r.Height).toLowerCase();
      if (!s) return;
      if (s.includes("pop")) map["Pop-top"] += 1;
      else map["Full Height"] += 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [excelRows]);

  // Length buckets
  const lengthBuckets = useMemo(() => {
    const buckets = [
      { label: "<=5.00m", min: 0, max: 5.0 },
      { label: "5.01–7.00m", min: 5.01, max: 7.0 },
      { label: ">=7.01m", min: 7.01, max: 100 },
    ];
    const map: Record<string, number> = {};
    excelRows.forEach((r) => {
      const num = parseNum(r.Length);
      const b = buckets.find((bb) => num != null && !isNaN(num) && num >= bb.min && num <= bb.max);
      if (!b) return;
      map[b.label] = (map[b.label] || 0) + 1;
    });
    return buckets.map((b) => ({ label: b.label, count: map[b.label] || 0 }));
  }, [excelRows]);

  const top15Count = useMemo(() => countTop15(excelRows), [excelRows]);

  // Days In Yard distribution & filter
  const yardRangeBuckets = useMemo(() => {
    const defs = yardRangeDefs;
    return defs.map(({ label, min, max }) => ({
      label,
      count: yardList.filter((x) => x.daysInYard >= min && x.daysInYard <= max).length,
    }));
  }, [yardRangeDefs, yardList]);
  const yardListDisplay = useMemo(() => {
    if (!selectedRange) return yardList;
    const def = yardRangeDefs.find((d) => d.label === selectedRange);
    if (!def) return yardList;
    return yardList.filter((x) => x.daysInYard >= def.min && x.daysInYard <= def.max);
  }, [selectedRange, yardRangeDefs, yardList]);

  const formatDateOnly = (iso?: string | null) => {
    if (!iso) return "-";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleDateString();
  };

  const COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#84cc16", "#eab308", "#f97316", "#06b6d4", "#a855f7", "#3b82f6", "#64748b"];
  const cycleNextCategory = () => {
    const order: Array<typeof activeCategory> = ["range", "function", "layout", "axle", "length", "height"];
    const idx = order.indexOf(activeCategory);
    const next = order[(idx + 1) % order.length];
    setActiveCategory(next);
  };

  // Monthly PGI trend only for current dealer
  const monthBuckets = useMemo(() => makeMonthBucketsCurrentYear(), []);
  const pgiDatesDealer = useMemo(() => {
    return onTheRoadDealerAll
      .map((x) => {
        const d = parseDDMMYYYY(x.pgidate);
        if (!d) return null;
        d.setHours(0, 0, 0, 0);
        return d;
      })
      .filter((d): d is Date => !!d) as Date[];
  }, [onTheRoadDealerAll]);
  const pgiMonthlyTrendDealer = useMemo(() => groupCountsByMonth(monthBuckets, pgiDatesDealer), [monthBuckets, pgiDatesDealer]);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        orders={[]}
        selectedDealer="locked"
        onDealerSelect={() => {}}
        hideOtherDealers
        currentDealerName={dealerDisplayName}
        showStats={false}
        isGroup={isDealerGroup(dealerConfig)}
        includedDealers={includedDealerNames}
      />
      <main className="flex-1 p-6 space-y-6 bg-gradient-to-br from-slate-50 via-white to-slate-100">
        <header className="pb-2">
          <h1 className="text-2xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-slate-800 via-blue-700 to-sky-600">
            Yard Inventory & On The Road — {dealerDisplayName}
          </h1>
          <p className="text-muted-foreground mt-1">Manage PGI arrivals and yard inventory for the selected dealer</p>
        </header>

        {/* Top grid: Left = Days In Yard Distribution, Right = Stock Analysis */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Days In Yard Distribution (left half) */}
          <Card className="border-slate-200 shadow-sm hover:shadow-md transition">
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-sm">Days In Yard — Distribution</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" className="!bg-transparent !hover:bg-transparent" onClick={() => setSelectedRange(null)}>
                  Clear Filter
                </Button>
              </div>
            </CardHeader>
            <CardContent className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yardRangeBuckets}>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    fill="#14b8a6"
                    radius={[6,6,0,0]}
                    onClick={(_, idx: number) => {
                      const label = yardRangeBuckets[idx]?.label;
                      if (label) setSelectedRange(label);
                    }}
                  >
                    <LabelList dataKey="count" position="top" className="fill-slate-700" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
            {selectedRange && (
              <div className="px-6 pb-4 text-xs text-slate-600">
                Filtered by range: <span className="font-semibold text-teal-700">{selectedRange} days</span>
              </div>
            )}
          </Card>

          {/* Stock Analysis (right half) */}
          <Card className="border-slate-200 shadow-sm hover:shadow-md transition">
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-sm">Stock Analysis</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="!bg-transparent !hover:bg-transparent" onClick={cycleNextCategory}>
                  Next
                </Button>
                <div className="flex flex-wrap gap-1">
                  <Button variant={activeCategory === "range" ? "default" : "outline"} className={activeCategory === "range" ? "" : "!bg-transparent !hover:bg-transparent"} onClick={() => setActiveCategory("range")}>Range</Button>
                  <Button variant={activeCategory === "function" ? "default" : "outline"} className={activeCategory === "function" ? "" : "!bg-transparent !hover:bg-transparent"} onClick={() => setActiveCategory("function")}>Function</Button>
                  <Button variant={activeCategory === "layout" ? "default" : "outline"} className={activeCategory === "layout" ? "" : "!bg-transparent !hover:bg-transparent"} onClick={() => setActiveCategory("layout")}>Layout</Button>
                  <Button variant={activeCategory === "axle" ? "default" : "outline"} className={activeCategory === "axle" ? "" : "!bg-transparent !hover:bg-transparent"} onClick={() => setActiveCategory("axle")}>Axle</Button>
                  <Button variant={activeCategory === "length" ? "default" : "outline"} className={activeCategory === "length" ? "" : "!bg-transparent !hover:bg-transparent"} onClick={() => setActiveCategory("length")}>Length</Button>
                  <Button variant={activeCategory === "height" ? "default" : "outline"} className={activeCategory === "height" ? "" : "!bg-transparent !hover:bg-transparent"} onClick={() => setActiveCategory("height")}>Height</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="h-60">
              <div className="w-full h-full">
                {activeCategory === "range" && (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={rangeCounts} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2} label={false}>
                        {rangeCounts.map((_, i) => <Cell key={`range-${i}`} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <ReTooltip />
                      <Legend layout="vertical" align="right" verticalAlign="middle" content={<PieLegend />} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
                {activeCategory === "function" && (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={functionCounts} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2} label={false}>
                        {functionCounts.map((_, i) => <Cell key={`func-${i}`} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <ReTooltip />
                      <Legend layout="vertical" align="right" verticalAlign="middle" content={<PieLegend />} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
                {activeCategory === "layout" && (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={layoutCounts} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2} label={false}>
                        {layoutCounts.map((_, i) => <Cell key={`layout-${i}`} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <ReTooltip />
                      <Legend layout="vertical" align="right" verticalAlign="middle" content={<PieLegend />} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
                {activeCategory === "axle" && (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={axleCounts} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2} label={false}>
                        {axleCounts.map((_, i) => <Cell key={`axle-${i}`} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <ReTooltip />
                      <Legend layout="vertical" align="right" verticalAlign="middle" content={<PieLegend />} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
                {activeCategory === "length" && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={lengthBuckets}>
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#0ea5e9" radius={[6,6,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
                {activeCategory === "height" && (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={heightCategories} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2} label={false}>
                        {heightCategories.map((_, i) => <Cell key={`height-${i}`} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <ReTooltip />
                      <Legend layout="vertical" align="right" verticalAlign="middle" content={<PieLegend />} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
            <div className="px-6 pb-4 text-xs text-slate-600">Top 15 Count: <span className="font-semibold">{top15Count}</span></div>
          </Card>
        </div>

        {/* On The Road - last 7 days only (current dealer only, no Dealer column) */}
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
              <Button onClick={async () => {
                const ch = manualChassis.trim().toUpperCase();
                if (!ch) {
                  setManualStatus({ type: "err", msg: "请输入车架号" });
                  return;
                }
                try {
                  await addManualChassisToYard(currentDealerSlug, ch);
                  setManualStatus({ type: "ok", msg: `已添加 ${ch} 到 Yard` });
                  setManualChassis("");
                } catch (e) {
                  console.error(e);
                  setManualStatus({ type: "err", msg: "添加失败，请重试。" });
                }
              }} className="bg-sky-600 hover:bg-sky-700">
                Add to Yard
              </Button>
              {manualStatus && (
                <div className={`text-sm ${manualStatus.type === "ok" ? "text-emerald-600" : "text-red-600"}`}>
                  {manualStatus.msg}
                </div>
              )}
            </div>

            {/* Days In Yard filtered table */}
            {yardListDisplay.length === 0 ? (
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
                    {yardListDisplay.map((row) => (
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
                          <Button size="sm" className="bg-purple-600 hover:bg-purple-700" onClick={async () => {
                            try { await dispatchFromYard(currentDealerSlug, row.chassis); } catch (e) { console.error(e); }
                            setHandoverData({
                              chassis: row.chassis,
                              model: row.model,
                              dealerName: dealerDisplayName,
                              dealerSlug: currentDealerSlug,
                              handoverAt: new Date().toISOString(),
                            });
                            setHandoverOpen(true);
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
            <CardContent>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={groupCountsByWeek(makeWeeklyBuckets(12), ensureDates(yardList.map(x => x.receivedAt ? new Date(x.receivedAt) : null)))}>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#6366f1" radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm hover:shadow-md transition">
            <CardHeader><CardTitle className="text-sm">PGI Trend (Monthly, This Year)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={groupCountsByMonth(makeMonthBucketsCurrentYear(), ensureDates(onTheRoadDealerAll.map(x => { const d = parseDDMMYYYY(x.pgidate); return d ? (d.setHours(0,0,0,0), d) : null; })) )}>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#0ea5e9" radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Handover Modal */}
        <ProductRegistrationForm open={handoverOpen} onOpenChange={setHandoverOpen} initial={handoverData} />
      </main>
    </div>
  );
}
