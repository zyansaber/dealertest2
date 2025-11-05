import React, { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  subscribeDealerConfig,
  subscribeToPGIRecords,
  subscribeToYardStock,
  subscribeToHandoverForDealers,  // <— 需要在 lib/firebase.ts 提供
  receiveChassisToYard,
  dispatchFromYard,
} from "@/lib/firebase";
import ProductRegistrationForm from "@/components/ProductRegistrationForm";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, LabelList, ResponsiveContainer,
} from "recharts";

/* utils */
const toStr = (v: any) => String(v ?? "");
const lower = (v: any) => toStr(v).toLowerCase();
const toSlug = (s: string) => lower(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
function normalizeDealerSlug(raw?: string): string {
  const slug = lower(raw);
  const m = slug?.match(/^(.*?)-([a-z0-9]{6})$/);
  return m ? m[1] : slug;
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
function parseDateFlexible(v?: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const s = String(v);
  const iso = Date.parse(s);
  if (!Number.isNaN(iso)) return new Date(iso);
  return parseDDMMYYYY(s);
}
function inRange(d: Date | null, s: Date, e: Date) {
  if (!d) return false;
  const t = d.getTime();
  return t >= s.getTime() && t <= (e.getTime() + 24 * 3600 * 1000 - 1);
}
function isWithinDaysDDMMYYYY(dateStr?: string | null, days: number = 7): boolean {
  const d = parseDDMMYYYY(dateStr);
  if (!d) return false;
  const ms = Date.now() - d.getTime();
  const diffDays = Math.floor(ms / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= days;
}

/* charts helpers */
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
  for (let m = 0; m < 12; m++) arr.push(new Date(y, m, 1));
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

/* component */
export default function DealerGroupYard() {
  const { dealerSlug: rawDealerSlug } = useParams<{ dealerSlug: string }>();
  const groupSlug = useMemo(() => normalizeDealerSlug(rawDealerSlug), [rawDealerSlug]);
  const groupName = useMemo(() => prettifyDealerName(groupSlug), [groupSlug]);

  const [groupConfig, setGroupConfig] = useState<any>(null);
  const [pgi, setPgi] = useState<Record<string, any>>({});
  const [yardsByDealer, setYardsByDealer] = useState<Record<string, Record<string, any>>>({});
  const [handoverAll, setHandoverAll] = useState<Record<string, Record<string, any>>>({});

  const [handoverOpen, setHandoverOpen] = useState(false);
  const [handoverData, setHandoverData] = useState<null | {
    chassis: string; model?: string | null; dealerName?: string | null; dealerSlug?: string | null; handoverAt: string;
  }>(null);
  const [selectedRange, setSelectedRange] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState<string | null>(null);

  // KPI 日期范围（默认最近7天）
  const [range, setRange] = useState(() => {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6);
    const toInput = (d: Date) => d.toISOString().slice(0, 10);
    return { startDate: toInput(start), endDate: toInput(end) };
  });
  const rangeDates = useMemo(() => {
    const s = new Date(range.startDate + "T00:00:00");
    const e = new Date(range.endDate + "T00:00:00");
    return { s, e };
  }, [range]);

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    unsubs.push(subscribeDealerConfig(groupSlug, (cfg: any) => setGroupConfig(cfg || null)));
    unsubs.push(subscribeToPGIRecords((data) => setPgi(data || {})));
    return () => unsubs.forEach((fn) => fn());
  }, [groupSlug]);

  // 订阅 includedDealers 的 yardstock & handover
  useEffect(() => {
    if (!groupConfig?.isGroup) return;
    const slugs: string[] = (groupConfig?.includedDealers || []).map((s: string) => toSlug(s));
    const unsubs: Array<() => void> = [];

    // yardstock
    slugs.forEach((slug) => {
      const unsub = subscribeToYardStock(slug, (data: Record<string, any>) => {
        setYardsByDealer((prev) => ({ ...prev, [slug]: data || {} }));
      });
      unsubs.push(unsub);
    });

    // handover
    const unsubH = subscribeToHandoverForDealers(slugs, (all: any) => setHandoverAll(all || {}));
    unsubs.push(unsubH);

    return () => unsubs.forEach((fn) => fn());
  }, [groupConfig]);

  const includedSlugs: string[] = useMemo(() => {
    if (!groupConfig?.isGroup) return [];
    return (groupConfig?.includedDealers || []).map((s: string) => toSlug(s));
  }, [groupConfig]);

  // On the Road（聚合）
  const onTheRoadAll = useMemo(() => {
    return Object.entries(pgi || {}).map(([chassis, rec]: any) => ({ chassis, ...rec }));
  }, [pgi]);
  const onTheRoadWeekly = useMemo(() => {
    return onTheRoadAll.filter((row) => {
      const rowSlug = toSlug(row?.dealer || row?.Dealer || "");
      return includedSlugs.includes(rowSlug) && isWithinDaysDDMMYYYY(row.pgidate, 7);
    });
  }, [onTheRoadAll, includedSlugs]);

  // Yard 列表（聚合）
  type YardRow = { chassis: string; dealerSlug: string; dealerName: string; receivedAt: string | null; model?: string; customer?: string; type: "Stock" | "Customer"; daysInYard: number; };
  const yardList: YardRow[] = useMemo(() => {
    const out: YardRow[] = [];
    includedSlugs.forEach((slug) => {
      const ys = yardsByDealer[slug] || {};
      Object.entries(ys).forEach(([ch, rec]: any) => {
        const customer = toStr(rec?.customer);
        const type = customer.toLowerCase().endsWith("stock") ? "Stock" : "Customer";
        const model = toStr(rec?.model);
        const receivedAtISO = rec?.receivedAt ?? null;
        const days = receivedAtISO ? Math.max(0, Math.floor((Date.now() - new Date(receivedAtISO).getTime()) / (1000*60*60*24))) : 0;
        out.push({ chassis: ch, dealerSlug: slug, dealerName: prettifyDealerName(slug), receivedAt: receivedAtISO, model, customer, type, daysInYard: days });
      });
    });
    return out;
  }, [yardsByDealer, includedSlugs]);

  /* KPI */
  const counts = useMemo(() => {
    const { s, e } = rangeDates;

    // 1) PGI → Dealer
    let cPGI = 0;
    onTheRoadAll.forEach((row: any) => {
      const rowSlug = toSlug(row?.dealer || row?.Dealer || "");
      const d = parseDDMMYYYY(row?.pgidate);
      if (includedSlugs.includes(rowSlug) && inRange(d, s, e)) cPGI += 1;
    });

    // 2) Received
    let cRecv = 0;
    includedSlugs.forEach((slug) => {
      const ys = yardsByDealer[slug] || {};
      Object.values(ys).forEach((row: any) => {
        const d = parseDateFlexible(row?.receivedAt);
        if (inRange(d, s, e)) cRecv += 1;
      });
    });

    // 3) Handover
    let cHd = 0;
    includedSlugs.forEach((slug) => {
      const hv = handoverAll[slug] || {};
      Object.values(hv).forEach((row: any) => {
        const d = parseDateFlexible(row?.handoverAt);
        if (inRange(d, s, e)) cHd += 1;
      });
    });

    // 4) Yard Now
    let nowStock = 0, nowCustomer = 0;
    includedSlugs.forEach((slug) => {
      const ys = yardsByDealer[slug] || {};
      Object.values(ys).forEach((row: any) => {
        const isStock = String(row?.customer || row?.Customer || "").toLowerCase() === "stock";
        if (isStock) nowStock += 1; else nowCustomer += 1;
      });
    });

    return { pgiToDealer: cPGI, received: cRecv, handover: cHd, yardNow: { stock: nowStock, customer: nowCustomer } };
  }, [rangeDates, includedSlugs, onTheRoadAll, yardsByDealer, handoverAll]);

  /* 趋势（聚合） */
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
  const yardWeeklyTrend = useMemo(() => groupCountsByWeek(weekBuckets, yardDates), [weekBuckets, yardDates]);

  const monthBuckets = useMemo(() => makeMonthBucketsCurrentYear(), []);
  const pgiDatesGroup = useMemo(() => {
    const arr: Date[] = [];
    onTheRoadAll.forEach((x) => {
      const rowSlug = toSlug(x?.dealer || x?.Dealer || "");
      if (!includedSlugs.includes(rowSlug)) return;
      const d = parseDDMMYYYY(x.pgidate);
      if (d) { d.setHours(0, 0, 0, 0); arr.push(d); }
    });
    return arr;
  }, [onTheRoadAll, includedSlugs]);
  const pgiMonthlyTrendGroup = useMemo(() => groupCountsByMonth(monthBuckets, pgiDatesGroup), [monthBuckets, pgiDatesGroup]);

  /* Days in Yard 过滤 */
  const yardRangeDefs = [
    { label: "0–90", min: 0, max: 90 },
    { label: "91–180", min: 91, max: 180 },
    { label: "180+", min: 181, max: 9999 },
  ];
  const yardRangeBuckets = useMemo(() => {
    return yardRangeDefs.map(({ label, min, max }) => ({
      label,
      count: yardList.filter((x) => x.daysInYard >= min && x.daysInYard <= max).length,
    }));
  }, [yardList]);
  const yardListByRange = useMemo(() => {
    if (!selectedRange) return yardList;
    const def = yardRangeDefs.find((d) => d.label === selectedRange);
    if (!def) return yardList;
    return yardList.filter((x) => x.daysInYard >= def.min && x.daysInYard <= def.max);
  }, [selectedRange, yardList]);

  /* Stock Analysis 交互表（聚合） */
  type RowAgg = { model: string; stock: number; customer: number; total: number };
  const stockAnalysisRows = useMemo<RowAgg[]>(() => {
    const map = new Map<string, { stock: number; customer: number }>();
    yardList.forEach((it) => {
      const model = (it.model || "Unknown").trim();
      const isStock = String(it.customer || "").toLowerCase() === "stock";
      const prev = map.get(model) || { stock: 0, customer: 0 };
      if (isStock) prev.stock += 1; else prev.customer += 1;
      map.set(model, prev);
    });
    const out: RowAgg[] = [];
    map.forEach((v, k) => out.push({ model: k, stock: v.stock, customer: v.customer, total: v.stock + v.customer }));
    out.sort((a, b) => b.total - a.total);
    return out;
  }, [yardList]);
  const filteredByModel = useMemo(() => {
    const base = yardListByRange;
    if (!activeModel) return base;
    return base.filter((x) => (x.model || "Unknown") === activeModel);
  }, [yardListByRange, activeModel]);

  /* Actions */
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
        currentDealerName={`${groupName} (Group)`}
        showStats={false}
      />
      <main className="flex-1 p-6 space-y-6 bg-gradient-to-br from-slate-50 via-white to-slate-100">
        <header className="pb-2">
          <h1 className="text-2xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-slate-800 via-blue-700 to-sky-600">
            Dealer Group Yard — {groupName}
          </h1>
          <p className="text-muted-foreground mt-1">Aggregate PGI and yard inventory across included dealers</p>
        </header>

        {/* 1) On The Road（最近7天，含 Dealer 列） */}
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition">
          <CardHeader><CardTitle>On The Road (PGI) — Last 7 Days</CardTitle></CardHeader>
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
                      <TableHead className="font-semibold">Dealer</TableHead>
                      <TableHead className="font-semibold">Days Since PGI</TableHead>
                      <TableHead className="font-semibold">Receive</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {onTheRoadWeekly.map((row: any) => {
                      const rowSlug = toSlug(row?.dealer || row?.Dealer || "");
                      return (
                        <TableRow key={row.chassis}>
                          <TableCell className="font-medium">{row.chassis}</TableCell>
                          <TableCell>{toStr(row.pgidate) || "-"}</TableCell>
                          <TableCell>{toStr(row.model) || "-"}</TableCell>
                          <TableCell>{toStr(row.customer) || "-"}</TableCell>
                          <TableCell>{prettifyDealerName(rowSlug)}</TableCell>
                          <TableCell>
                            {isWithinDaysDDMMYYYY(row.pgidate, 365)
                              ? Math.floor((Date.now() - (parseDDMMYYYY(row.pgidate)?.getTime() || Date.now())) / (1000 * 60 * 60 * 24))
                              : 0}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => (async () => { try { await receiveChassisToYard(rowSlug, row.chassis, row); } catch {} })()}
                            >
                              Receive
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 2) KPI Cards（可选日期） */}
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-end gap-3">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-muted-foreground mb-1">From</label>
                <input type="date" className="w-full border rounded-lg px-3 py-2"
                  value={range.startDate} onChange={(e) => setRange((r) => ({ ...r, startDate: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">To</label>
                <input type="date" className="w-full border rounded-lg px-3 py-2"
                  value={range.endDate} onChange={(e) => setRange((r) => ({ ...r, endDate: e.target.value }))} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Factory PGI → Dealers</CardTitle></CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{counts.pgiToDealer}</div>
                <p className="text-xs text-muted-foreground mt-1">PGI records within range</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Received Vans</CardTitle></CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{counts.received}</div>
                <p className="text-xs text-muted-foreground mt-1">Yard receivedAt within range</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Handover</CardTitle></CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{counts.handover}</div>
                <p className="text-xs text-muted-foreground mt-1">Handovers within range</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Yard Stock (Now)</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-3">
                  <div className="text-3xl font-bold">{counts.yardNow.stock + counts.yardNow.customer}</div>
                  <div className="text-sm text-muted-foreground">
                    <span className="mr-2">Stock: <span className="font-semibold">{counts.yardNow.stock}</span></span>
                    <span>Customer: <span className="font-semibold">{counts.yardNow.customer}</span></span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Current entries across /yardstock</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* 3) 两个图表（聚合） */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-slate-200 shadow-sm hover:shadow-md transition">
            <CardHeader><CardTitle className="text-sm">Inventory Trend (Weekly)</CardTitle></CardHeader>
            <CardContent className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yardWeeklyTrend}>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#14b8a6" radius={[6,6,0,0]}>
                    <LabelList dataKey="count" position="top" className="fill-slate-700" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm hover:shadow-md transition">
            <CardHeader><CardTitle className="text-sm">PGI Trend (Monthly, This Year)</CardTitle></CardHeader>
            <CardContent className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={makeMonthBucketsCurrentYear().map((m, i) => ({ label: monthLabel(m), count: pgiMonthlyTrendGroup[i]?.count ?? 0 }))}>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#0ea5e9" radius={[6,6,0,0]}>
                    <LabelList dataKey="count" position="top" className="fill-slate-700" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* 4) Yard Inventory（聚合，支持 Days & Model 过滤） */}
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition">
          <CardHeader><CardTitle>Yard Inventory</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {selectedRange && (
              <div className="text-xs text-slate-600">
                Filtered by Days in Yard: <span className="font-semibold">{selectedRange}</span>
                <Button variant="outline" size="sm" className="ml-2" onClick={() => setSelectedRange(null)}>Clear</Button>
              </div>
            )}
            {activeModel && (
              <div className="text-xs text-slate-600">
                Filtered by Model: <span className="font-semibold">{activeModel}</span>
                <Button variant="outline" size="sm" className="ml-2" onClick={() => setActiveModel(null)}>Clear</Button>
              </div>
            )}

            {filteredByModel.length === 0 ? (
              <div className="text-sm text-slate-500">No units in yard inventory.</div>
            ) : (
              <div className="rounded-lg border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-semibold">Chassis</TableHead>
                      <TableHead className="font-semibold">Dealer</TableHead>
                      <TableHead className="font-semibold">Received At</TableHead>
                      <TableHead className="font-semibold">Model</TableHead>
                      <TableHead className="font-semibold">Customer</TableHead>
                      <TableHead className="font-semibold">Type</TableHead>
                      <TableHead className="font-semibold">Days In Yard</TableHead>
                      <TableHead className="font-semibold">Handover</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredByModel.map((row) => (
                      <TableRow key={`${row.dealerSlug}-${row.chassis}`}>
                        <TableCell className="font-medium">{row.chassis}</TableCell>
                        <TableCell>{row.dealerName}</TableCell>
                        <TableCell>{formatDateOnly(row.receivedAt)}</TableCell>
                        <TableCell>{toStr(row.model) || "-"}</TableCell>
                        <TableCell>{toStr(row.customer) || "-"}</TableCell>
                        <TableCell>
                          <span className={row.type === "Stock" ? "text-blue-700 font-medium" : "text-emerald-700 font-medium"}>{row.type}</span>
                        </TableCell>
                        <TableCell>{row.daysInYard}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            className="bg-purple-600 hover:bg-purple-700"
                            onClick={() => {
                              (async () => {
                                try { await dispatchFromYard(row.dealerSlug, row.chassis); } catch {}
                                setHandoverData({
                                  chassis: row.chassis,
                                  model: row.model,
                                  dealerName: row.dealerName,
                                  dealerSlug: row.dealerSlug,
                                  handoverAt: new Date().toISOString(),
                                });
                                setHandoverOpen(true);
                              })();
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
            )}
          </CardContent>
        </Card>

        {/* 5) Stock Analysis — 交互表 */}
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition">
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="text-sm">Stock Analysis (Interactive)</CardTitle>
          </CardHeader>
          <CardContent className="w-full overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr className="[&>th]:py-2 [&>th]:px-2 border-b">
                  <th className="text-left">Model</th>
                  <th className="text-right">Stock</th>
                  <th className="text-right">Customer</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {stockAnalysisRows.map((r) => {
                  const active = activeModel === r.model;
                  return (
                    <tr
                      key={r.model}
                      className={`border-b hover:bg-muted/40 cursor-pointer ${active ? "bg-muted" : ""}`}
                      onClick={() => setActiveModel(active ? null : r.model)}
                      title="Click to filter inventory list by this model"
                    >
                      <td className="py-2 px-2 font-medium">{r.model}</td>
                      <td className="py-2 px-2 text-right">{r.stock}</td>
                      <td className="py-2 px-2 text-right">{r.customer}</td>
                      <td className="py-2 px-2 text-right">{r.total}</td>
                    </tr>
                  );
                })}
                {stockAnalysisRows.length === 0 && (
                  <tr><td colSpan={4}
