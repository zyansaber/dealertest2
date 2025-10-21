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
  dispatchFromYard,
  subscribeToSchedule,
  subscribeDealerConfig,
  subscribeAllDealerConfigs,
  addManualChassisToYard,
} from "@/lib/firebase";
import type { ScheduleItem } from "@/types";
import { isDealerGroup } from "@/types/dealer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

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
function daysSince(dateStr?: string | null): number {
  const d = parseDDMMYYYY(dateStr);
  if (!d) return 0;
  const ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}
function isWithinDays(dateStr?: string | null, days: number = 7): boolean {
  const d = parseDDMMYYYY(dateStr);
  if (!d) return false;
  const diffDays = daysSince(dateStr);
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

function MiniBarChart({ points }: { points: TrendPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <div className="flex items-end gap-2 h-24">
      {points.map((p, idx) => (
        <div key={idx} className="flex flex-col items-center">
          <div
            className="w-4 bg-blue-600 rounded-sm"
            style={{ height: `${Math.round((p.count / max) * 100)}%` }}
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
    <div className="flex items-end gap-3 h-32">
      {points.map((p, idx) => (
        <div key={idx} className="flex flex-col items-center">
          <div className="text-[11px] text-slate-600 mb-1">{p.count}</div>
          <div
            className="w-5 rounded-sm bg-gradient-to-b from-cyan-400 via-blue-600 to-indigo-700 shadow-[0_4px_12px_rgba(56,189,248,0.35)]"
            style={{ height: `${Math.round((p.count / max) * 100)}%` }}
            title={`${p.label}: ${p.count}`}
          />
          <div className="text-[10px] mt-1 text-slate-500">{p.label}</div>
        </div>
      ))}
    </div>
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

  // Modal for new PGI
  const [showNewPgiDialog, setShowNewPgiDialog] = useState(false);
  const [newPgiList, setNewPgiList] = useState<Array<{ chassis: string; pgidate?: string | null; model?: string | null; customer?: string | null }>>([]);

  // Manual add chassis
  const [manualChassis, setManualChassis] = useState("");
  const [manualStatus, setManualStatus] = useState<null | { type: "ok" | "err"; msg: string }>(null);

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
      .filter(([chassis, rec]) => slugifyDealerName(rec?.dealer || "") === currentDealerSlug)
      .map(([chassis, rec]) => ({ chassis, ...rec }));
  }, [pgi, currentDealerSlug]);

  const onTheRoadWeekly = useMemo(() => {
    return onTheRoadAll.filter((row) => isWithinDays(row.pgidate, 7));
  }, [onTheRoadAll]);

  // detect new PGI within last 7 days and not dismissed yet
  useEffect(() => {
    if (!currentDealerSlug) return;
    const dismissedKey = `pgiDismissed:${currentDealerSlug}`;
    const dismissed: string[] = JSON.parse(localStorage.getItem(dismissedKey) || "[]");
    const newcomers = onTheRoadWeekly.filter((row) => !dismissed.includes(row.chassis));
    if (newcomers.length > 0) {
      setNewPgiList(
        newcomers.map((row) => ({
          chassis: row.chassis,
          pgidate: row.pgidate,
          model: row.model,
          customer: row.customer,
        }))
      );
      setShowNewPgiDialog(true);
    }
  }, [onTheRoadWeekly, currentDealerSlug]);

  const yardList = useMemo(() => {
    const entries = Object.entries(yard || {});
    return entries.map(([chassis, rec]) => {
      const sch = scheduleByChassis[chassis];
      const customer = toStr(sch?.Customer || rec?.customer);
      const type = customer.toLowerCase().endsWith("stock") ? "Stock" : "Customer";
      return {
        chassis,
        receivedAt: rec?.receivedAt,
        model: toStr(sch?.Model || rec?.model),
        customer,
        type,
      };
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
      const any = onTheRoadAll.find(Boolean);
      return any?.dealer || prettifyDealerName(selectedDealerSlug);
    }
    if (dealerConfig?.name) return dealerConfig.name;
    return prettifyDealerName(groupSlug);
  }, [selectedDealerSlug, allDealerConfigs, onTheRoadAll, dealerConfig, groupSlug]);

  const handleReceive = async (chassis: string, rec: PGIRecord) => {
    try {
      await receiveChassisToYard(currentDealerSlug, chassis, rec);
      const key = `pgiDismissed:${currentDealerSlug}`;
      const dismissed: string[] = JSON.parse(localStorage.getItem(key) || "[]");
      if (!dismissed.includes(chassis)) {
        dismissed.push(chassis);
        localStorage.setItem(key, JSON.stringify(dismissed));
      }
    } catch (e) {
      console.error("receive failed", e);
    }
  };

  const handleDispatch = async (chassis: string) => {
    try {
      await dispatchFromYard(currentDealerSlug, chassis);
    } catch (e) {
      console.error("dispatch failed", e);
    }
  };

  const dismissAllNewPgi = () => {
    const key = `pgiDismissed:${currentDealerSlug}`;
    const dismissed: string[] = JSON.parse(localStorage.getItem(key) || "[]");
    const merged = Array.from(new Set([...dismissed, ...newPgiList.map((n) => n.chassis)]));
    localStorage.setItem(key, JSON.stringify(merged));
    setShowNewPgiDialog(false);
    setNewPgiList([]);
  };

  const handleAddManual = async () => {
    const ch = manualChassis.trim().toUpperCase();
    if (!ch) {
      setManualStatus({ type: "err", msg: "Please enter chassis number" });
      return;
    }
    try {
      await addManualChassisToYard(currentDealerSlug, ch);
      setManualStatus({ type: "ok", msg: `Added ${ch} to Yard` });
      setManualChassis("");
    } catch (e) {
      console.error(e);
      setManualStatus({ type: "err", msg: "Failed to add. Please try again." });
    }
  };

  // KPI cards
  const yardTotal = yardList.length;
  const yearPGICount = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return onTheRoadAll.filter((row) => {
      const d = parseDDMMYYYY(row.pgidate);
      return d && d.getFullYear() === currentYear;
    }).length;
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

  // PGI monthly trend for current year
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

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="backdrop-blur-sm bg-white/70 border-slate-200 shadow-sm hover:shadow-md transition">
            <CardHeader><CardTitle className="text-sm">Yard Inventory Total</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{yardTotal}</div></CardContent>
          </Card>
          <Card className="backdrop-blur-sm bg-white/70 border-slate-200 shadow-sm hover:shadow-md transition">
            <CardHeader><CardTitle className="text-sm">PGI This Year</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{yearPGICount}</div></CardContent>
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

        {/* On The Road - last 7 days only */}
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition">
          <CardHeader>
            <CardTitle>On The Road (PGI) — Last 7 Days</CardTitle>
          </CardHeader>
          <CardContent>
            {onTheRoadWeekly.length === 0 ? (
              <div className="text-sm text-slate-500">No PGI records in the last 7 days for this dealer.</div>
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
                        <TableCell>{daysSince(row.pgidate)}</TableCell>
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

        {/* Yard Inventory - manual add */}
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
                      <TableHead className="font-semibold">Dispatch</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {yardList.map((row) => (
                      <TableRow key={row.chassis}>
                        <TableCell className="font-medium">{row.chassis}</TableCell>
                        <TableCell>{toStr(row.receivedAt).replace("T", " ").replace("Z", "")}</TableCell>
                        <TableCell>{toStr(row.model) || "-"}</TableCell>
                        <TableCell>{toStr(row.customer) || "-"}</TableCell>
                        <TableCell>
                          <span className={row.type === "Stock" ? "text-blue-700 font-medium" : "text-emerald-700 font-medium"}>
                            {row.type}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="destructive" onClick={() => handleDispatch(row.chassis)}>
                            Dispatch
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
            <CardContent><MiniBarChart points={yardTrend} /></CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm hover:shadow-md transition">
            <CardHeader><CardTitle className="text-sm">PGI Trend (Monthly, This Year)</CardTitle></CardHeader>
            <CardContent><MonthlyBarChart points={pgiMonthlyTrend} /></CardContent>
          </Card>
        </div>

        {/* New PGI Dialog */}
        <Dialog open={showNewPgiDialog} onOpenChange={setShowNewPgiDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New PGI Arrivals</DialogTitle>
            </DialogHeader>
            {newPgiList.length === 0 ? (
              <div className="text-sm text-slate-500">No new PGI records.</div>
            ) : (
              <div className="space-y-2">
                <div className="text-sm text-slate-600">You have {newPgiList.length} new PGI in the last 7 days:</div>
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Chassis</TableHead>
                        <TableHead>PGI Date</TableHead>
                        <TableHead>Model</TableHead>
                        <TableHead>Customer</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {newPgiList.map((item) => (
                        <TableRow key={item.chassis}>
                          <TableCell className="font-medium">{item.chassis}</TableCell>
                          <TableCell>{toStr(item.pgidate) || "-"}</TableCell>
                          <TableCell>{toStr(item.model) || "-"}</TableCell>
                          <TableCell>{toStr(item.customer) || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="secondary" onClick={() => setShowNewPgiDialog(false)}>Close</Button>
              <Button onClick={dismissAllNewPgi}>Dismiss All</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
