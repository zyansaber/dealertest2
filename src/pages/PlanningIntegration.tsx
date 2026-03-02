import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { off, onValue, ref } from "firebase/database";

import PlanningIntegrationSidebar from "@/components/PlanningIntegrationSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { database, subscribeToDateTrack } from "@/lib/firebase";
import type { ScheduleItem } from "@/types";

type DateTrackRecord = Record<string, unknown>;
type PlanningTab = "planningintegration" | "leaving-port-estimation" | "target" | "report";
type Granularity = "week" | "month";
type Row = { chassis: string; schedule: ScheduleItem; dateTrack?: DateTrackRecord };
type Milestone = { key: string; source: "schedule" | "dateTrack" };
type Period = { start: number; end: number; label: string };

type Targets = Record<string, number>;

const trackedMilestones = [
  "Purchase Order Sent",
  "chassisWelding",
  "assemblyLine",
  "finishGoods",
  "leavingFactory",
  "estLeavngPort",
  "Left Port",
  "melbournePortDate",
] as const;

const phaseCardMap: Record<string, string> = {
  "Order Received Date": "not confirmed orders",
  "Signed Plans Received": "Waiting for sending",
  "Purchase Order Sent": "Not Start in Longtree",
  chassisWelding: "Chassis welding in Longtree",
  assemblyLine: "Assembly line Longtree",
  finishGoods: "Finishedin Longtree",
  leavingFactory: "Leaving factory from Longtree",
  estLeavngPort: "waiting in port",
  "Left Port": "On the sea",
  melbournePortDate: "Melbourn Port",
  "Received in Melbourne": "Melbourn Factory",
};

const milestoneSequence: Milestone[] = [
  { key: "Order Received Date", source: "schedule" },
  { key: "Signed Plans Received", source: "schedule" },
  { key: "Purchase Order Sent", source: "schedule" },
  { key: "chassisWelding", source: "dateTrack" },
  { key: "assemblyLine", source: "dateTrack" },
  { key: "finishGoods", source: "dateTrack" },
  { key: "leavingFactory", source: "dateTrack" },
  { key: "estLeavngPort", source: "dateTrack" },
  { key: "Left Port", source: "dateTrack" },
  { key: "melbournePortDate", source: "dateTrack" },
  { key: "Received in Melbourne", source: "dateTrack" },
];

const columns: Array<{ label: string; key: string; source: "schedule" | "dateTrack" }> = [
  { label: "Forecast Production Date", key: "Forecast Production Date", source: "schedule" },
  { label: "Chassis", key: "Chassis", source: "schedule" },
  { label: "Customer", key: "Customer", source: "schedule" },
  { label: "Dealer", key: "Dealer", source: "schedule" },
  { label: "Model", key: "Model", source: "schedule" },
  { label: "Model Year", key: "Model Year", source: "schedule" },
  { label: "Purchase Order Sent", key: "Purchase Order Sent", source: "schedule" },
  { label: "chassisWelding", key: "chassisWelding", source: "dateTrack" },
  { label: "assemblyLine", key: "assemblyLine", source: "dateTrack" },
  { label: "finishGoods", key: "finishGoods", source: "dateTrack" },
  { label: "leavingFactory", key: "leavingFactory", source: "dateTrack" },
  { label: "estLeavngPort", key: "estLeavngPort", source: "dateTrack" },
  { label: "Left Port", key: "Left Port", source: "dateTrack" },
  { label: "melbournePortDate", key: "melbournePortDate", source: "dateTrack" },
];

const normalizeKey = (value: unknown) => String(value ?? "").trim().toUpperCase();
const displayValue = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text || "-";
};

const parseDateToTimestamp = (value: unknown) => {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? (value < 1e12 ? value * 1000 : value) : null;
  const text = String(value).trim();
  if (!text || text === "-") return null;
  const num = Number(text);
  if (Number.isFinite(num) && num > 0) return num < 1e12 ? num * 1000 : num;
  const [dd, mm, yyyy] = text.split("/");
  if (dd && mm && yyyy) {
    const parsed = new Date(Number(yyyy), Number(mm) - 1, Number(dd)).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  const fallback = new Date(text).getTime();
  return Number.isFinite(fallback) ? fallback : null;
};

const formatDate = (timestamp: number) => {
  const d = new Date(timestamp);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

const getDateTrackByChassis = (raw: unknown) => {
  const map: Record<string, DateTrackRecord> = {};
  if (!raw || typeof raw !== "object") return map;
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    if (!value || typeof value !== "object") return;
    const record = value as DateTrackRecord;
    const chassis = normalizeKey((record["Chassis Number"] as string | undefined) ?? key);
    if (chassis) map[chassis] = record;
  });
  return map;
};

const extractScheduleRowsById = (raw: unknown): ScheduleItem[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((x) => x && typeof x === "object") as ScheduleItem[];
  if (typeof raw !== "object") return [];

  const rec = raw as Record<string, unknown>;

  // If data shape is { "2": {...row}, "3": {...row} }
  const numericKeys = Object.keys(rec).filter((k) => /^\d+$/.test(k));
  if (numericKeys.length > 0) {
    return numericKeys
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => rec[k])
      .filter((x) => x && typeof x === "object") as ScheduleItem[];
  }

  // fallback upload shape
  if (Array.isArray((rec as any).data)) {
    return ((rec as any).data as unknown[]).filter((x) => x && typeof x === "object") as ScheduleItem[];
  }

  return Object.values(rec).filter((x) => x && typeof x === "object") as ScheduleItem[];
};

const buildPeriods = (granularity: Granularity, fromTs: number, toTs: number): Period[] => {
  const out: Period[] = [];
  const cursor = new Date(fromTs);
  cursor.setHours(0, 0, 0, 0);
  if (granularity === "month") {
    cursor.setDate(1);
    while (cursor.getTime() <= toTs) {
      const start = cursor.getTime();
      const next = new Date(cursor);
      next.setMonth(next.getMonth() + 1);
      out.push({ start, end: Math.min(next.getTime() - 1, toTs), label: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}` });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else {
    while (cursor.getTime() <= toTs) {
      const start = cursor.getTime();
      const end = Math.min(start + 7 * 24 * 60 * 60 * 1000 - 1, toTs);
      out.push({ start, end, label: `${formatDate(start)} ~ ${formatDate(end)}` });
      cursor.setDate(cursor.getDate() + 7);
    }
  }
  return out;
};

const getValueByMilestone = (row: Row, m: Milestone) =>
  m.source === "schedule" ? (row.schedule as Record<string, unknown>)?.[m.key] : row.dateTrack?.[m.key];

export default function PlanningIntegration() {
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [dateTrack, setDateTrack] = useState<Record<string, DateTrackRecord>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const [granularity, setGranularity] = useState<Granularity>("week");
  const [selectedMilestone, setSelectedMilestone] = useState<(typeof trackedMilestones)[number]>("Purchase Order Sent");
  const [targetMetric, setTargetMetric] = useState<(typeof trackedMilestones)[number]>("Purchase Order Sent");
  const [targets, setTargets] = useState<Targets>({});

  const topScrollerRef = useRef<HTMLDivElement | null>(null);
  const bottomScrollerRef = useRef<HTMLDivElement | null>(null);
  const syncingRef = useRef<"top" | "bottom" | null>(null);

  const activeTab = (searchParams.get("tab") as PlanningTab) || "planningintegration";

  useEffect(() => {
    const key = "planningTargets-v1";
    const saved = localStorage.getItem(key);
    if (saved) {
      try { setTargets(JSON.parse(saved)); } catch {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("planningTargets-v1", JSON.stringify(targets));
  }, [targets]);

  useEffect(() => {
    const scheduleRef = ref(database, "schedule");
    const handler = (snapshot: any) => {
      setSchedule(extractScheduleRowsById(snapshot.val()));
      setIsLoading(false);
    };
    onValue(scheduleRef, handler);

    const unsubDateTrack = subscribeToDateTrack((data) => setDateTrack(getDateTrackByChassis(data)));

    return () => {
      off(scheduleRef, "value", handler);
      unsubDateTrack?.();
    };
  }, []);

  const rows = useMemo<Row[]>(() =>
    schedule.filter((item) => normalizeKey(item?.Chassis)).map((item) => {
      const chassis = normalizeKey(item?.Chassis);
      return { chassis, schedule: item, dateTrack: dateTrack[chassis] };
    }), [schedule, dateTrack]);

  const averageCards = useMemo(() => {
    const transitions = milestoneSequence.slice(2);
    return transitions.slice(0, -1).map((cur, i) => {
      const next = transitions[i + 1];
      let sum = 0, count = 0;
      rows.forEach((r) => {
        const a = parseDateToTimestamp(getValueByMilestone(r, cur));
        const b = parseDateToTimestamp(getValueByMilestone(r, next));
        if (a == null || b == null) return;
        sum += (b - a) / 86400000;
        count += 1;
      });
      return { title: `${cur.key} → ${next.key}`, value: count ? `${(sum / count).toFixed(1)} days` : "-", sample: count };
    });
  }, [rows]);

  const statusCards = useMemo(() => {
    const counts: Record<string, number> = {};
    rows.forEach((r) => {
      let last = "";
      milestoneSequence.forEach((m) => {
        if (parseDateToTimestamp(getValueByMilestone(r, m)) != null) last = m.key;
      });
      if (last) counts[last] = (counts[last] ?? 0) + 1;
    });
    return milestoneSequence.map((m) => ({ milestone: m.key, label: phaseCardMap[m.key] ?? m.key, count: counts[m.key] ?? 0 }));
  }, [rows]);

  const fromTs = new Date(2025, 5, 1).getTime();
  const periods = useMemo(() => buildPeriods(granularity, fromTs, Date.now()), [granularity]);
  const months = useMemo(() => buildPeriods("month", fromTs, Date.now()).map((p) => p.label), []);

  const trend = useMemo(() => {
    return periods.map((p, idx) => {
      const counts: Record<string, number> = {};
      trackedMilestones.forEach((m) => counts[m] = 0);
      rows.forEach((r) => {
        trackedMilestones.forEach((m) => {
          const mm = milestoneSequence.find((x) => x.key === m);
          if (!mm) return;
          const ts = parseDateToTimestamp(getValueByMilestone(r, mm));
          if (ts != null && ts >= p.start && ts <= p.end) counts[m] += 1;
        });
      });
      const prev = idx > 0 ? periods[idx - 1] : null;
      const prevCounts: Record<string, number> = {};
      trackedMilestones.forEach((m) => prevCounts[m] = 0);
      if (prev) {
        rows.forEach((r) => {
          trackedMilestones.forEach((m) => {
            const mm = milestoneSequence.find((x) => x.key === m);
            if (!mm) return;
            const ts = parseDateToTimestamp(getValueByMilestone(r, mm));
            if (ts != null && ts >= prev.start && ts <= prev.end) prevCounts[m] += 1;
          });
        });
      }
      const increments: Record<string, number | null> = {};
      trackedMilestones.forEach((m) => increments[m] = prev ? counts[m] - prevCounts[m] : null);
      return { label: p.label, counts, increments };
    });
  }, [periods, rows]);

  const selectedSeries = useMemo(() => trend.map((t) => ({ label: t.label, value: t.counts[selectedMilestone] })), [trend, selectedMilestone]);
  const maxBar = useMemo(() => Math.max(1, ...selectedSeries.map((s) => s.value)), [selectedSeries]);

  const monthlyActuals = useMemo(() => {
    const monthPeriods = buildPeriods("month", fromTs, Date.now());
    const out: Record<string, Record<string, number>> = {};
    trackedMilestones.forEach((m) => { out[m] = {}; monthPeriods.forEach((mp) => out[m][mp.label] = 0); });
    monthPeriods.forEach((mp) => {
      rows.forEach((r) => {
        trackedMilestones.forEach((m) => {
          const mm = milestoneSequence.find((x) => x.key === m);
          if (!mm) return;
          const ts = parseDateToTimestamp(getValueByMilestone(r, mm));
          if (ts != null && ts >= mp.start && ts <= mp.end) out[m][mp.label] += 1;
        });
      });
    });
    return out;
  }, [rows]);

  const differences = useMemo(() => {
    const out: Record<string, Record<string, number>> = {};
    trackedMilestones.forEach((m) => {
      out[m] = {};
      months.forEach((month) => {
        const actual = monthlyActuals[m]?.[month] ?? 0;
        const target = targets[month] ?? 0;
        out[m][month] = actual - target;
      });
    });
    return out;
  }, [months, monthlyActuals, targets]);

  const totalDifference = useMemo(() => {
    let sum = 0;
    trackedMilestones.forEach((m) => months.forEach((month) => { sum += differences[m][month] ?? 0; }));
    return sum;
  }, [differences, months]);

  const targetSeries = useMemo(() => months.map((month) => ({ month, value: differences[targetMetric]?.[month] ?? 0 })), [months, differences, targetMetric]);
  const targetMaxAbs = useMemo(() => Math.max(1, ...targetSeries.map((x) => Math.abs(x.value))), [targetSeries]);

  const setTarget = (month: string, value: string) => {
    const parsed = Number(value);
    setTargets((prev) => ({ ...prev, [month]: Number.isFinite(parsed) ? parsed : 0 }));
  };

  useEffect(() => {
    const top = topScrollerRef.current;
    const bottom = bottomScrollerRef.current;
    if (!top || !bottom) return;
    top.firstElementChild?.setAttribute("style", `width:${bottom.scrollWidth}px;height:1px;`);
  }, [rows.length]);

  const syncScroll = (source: "top" | "bottom") => {
    const top = topScrollerRef.current;
    const bottom = bottomScrollerRef.current;
    if (!top || !bottom || syncingRef.current) return;
    syncingRef.current = source;
    if (source === "top") bottom.scrollLeft = top.scrollLeft; else top.scrollLeft = bottom.scrollLeft;
    requestAnimationFrame(() => { syncingRef.current = null; });
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <PlanningIntegrationSidebar activeTab={activeTab} onTabChange={(tab) => setSearchParams({ tab })} totalRows={rows.length} />
      <main className="ml-72 min-w-0 p-6">
        {activeTab === "planningintegration" && (
          <>
            <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-2xl font-semibold tracking-tight">Planning Integration</h2><p className="mt-1 text-sm text-slate-600">Data source sorting: /schedule by ID order (e.g. 2, 3, 4...).</p></div>
            <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{averageCards.map((c) => <Card key={c.title}><CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-slate-600">{c.title}</CardTitle></CardHeader><CardContent><div className="text-xl font-bold">{c.value}</div><p className="text-xs text-slate-500">samples: {c.sample}</p></CardContent></Card>)}</div>
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{statusCards.map((c) => <Card key={c.milestone}><CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-slate-500">{c.milestone}</CardTitle></CardHeader><CardContent><div className="text-sm font-semibold">{c.label}</div><p className="mt-1 text-2xl font-bold">{c.count}</p></CardContent></Card>)}</div>
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div ref={topScrollerRef} onScroll={() => syncScroll("top")} className="overflow-x-auto overflow-y-hidden border-b border-slate-200"><div className="h-px" /></div>
              <div ref={bottomScrollerRef} onScroll={() => syncScroll("bottom")} className="max-h-[calc(100vh-520px)] overflow-auto">
                <table className="min-w-[1850px] divide-y divide-slate-200 text-sm"><thead className="sticky top-0 z-10 bg-slate-100"><tr>{columns.map((c) => <th key={c.key} className="whitespace-nowrap px-3 py-3 text-left font-semibold text-slate-700">{c.label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{isLoading ? <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-slate-500">Loading...</td></tr> : rows.map((r, i) => <tr key={`${r.chassis}-${i}`} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>{columns.map((c) => { const v = c.source === "schedule" ? (r.schedule as Record<string, unknown>)?.[c.key] : r.dateTrack?.[c.key]; return <td key={`${r.chassis}-${c.key}-${i}`} className="whitespace-nowrap px-3 py-2.5">{displayValue(v)}</td>; })}</tr>)}</tbody></table>
              </div>
            </div>
          </>
        )}

        {activeTab === "leaving-port-estimation" && (
          <>
            <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-2xl font-semibold tracking-tight">Leaving port estimation</h2><p className="mt-1 text-sm text-slate-600">From 2025-06. Switch weekly/monthly and metric.</p></div>
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <label className="text-sm font-medium">Period</label>
              <select value={granularity} onChange={(e) => setGranularity(e.target.value as Granularity)} className="rounded border px-2 py-1 text-sm"><option value="week">Week</option><option value="month">Month</option></select>
              <label className="ml-4 text-sm font-medium">Metric</label>
              <select value={selectedMilestone} onChange={(e) => setSelectedMilestone(e.target.value as (typeof trackedMilestones)[number])} className="rounded border px-2 py-1 text-sm">{trackedMilestones.map((m) => <option key={m} value={m}>{m}</option>)}</select>
            </div>
            <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 text-sm font-semibold">{selectedMilestone}</div><div className="space-y-2">{selectedSeries.map((p) => <div key={p.label} className="flex items-center gap-3"><div className="w-52 shrink-0 text-xs text-slate-600">{p.label}</div><div className="h-4 flex-1 rounded bg-slate-100"><div className="h-4 rounded bg-slate-700" style={{ width: `${(p.value / maxBar) * 100}%` }} /></div><div className="w-10 text-right text-sm font-semibold">{p.value}</div></div>)}</div></div>
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-auto">
              <table className="min-w-[1700px] divide-y divide-slate-200 text-sm"><thead className="bg-slate-100"><tr><th className="px-3 py-3 text-left font-semibold">{granularity === "week" ? "Week" : "Month"}</th>{trackedMilestones.map((m) => <th key={m} className="px-3 py-3 text-left font-semibold">{m} (weekly count / vs last week)</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{trend.map((t, i) => <tr key={`${t.label}-${i}`} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}><td className="whitespace-nowrap px-3 py-2.5 font-medium">{t.label}</td>{trackedMilestones.map((m) => { const inc=t.increments[m]; const txt=inc==null?"-":inc>=0?`+${inc}`:String(inc); return <td key={`${t.label}-${m}`} className="whitespace-nowrap px-3 py-2.5">{t.counts[m]} <span className="text-xs text-slate-500">({txt})</span></td>; })}</tr>)}</tbody></table>
            </div>
          </>
        )}

        {activeTab === "target" && (
          <>
            <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-2xl font-semibold tracking-tight">Target</h2><p className="mt-1 text-sm text-slate-600">Set one monthly target (shared by all metrics) from 2025-06 and compare Actual - Target.</p></div>
            <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm overflow-auto">
              <table className="min-w-[1000px] text-sm"><thead><tr><th className="px-2 py-2 text-left">Shared Target</th>{months.map((m) => <th key={m} className="px-2 py-2 text-left">{m}</th>)}</tr></thead><tbody><tr className="border-t"><td className="px-2 py-2 font-medium">All Metrics</td>{months.map((month) => <td key={`shared-${month}`} className="px-2 py-2"><input type="number" className="w-24 rounded border px-2 py-1" value={targets[month] ?? 0} onChange={(e) => setTarget(month, e.target.value)} /></td>)}</tr></tbody></table>
            </div>
            <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card><CardHeader><CardTitle className="text-sm">Total Difference (Actual - Shared Target)</CardTitle></CardHeader><CardContent><p className={`text-3xl font-bold ${totalDifference >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{totalDifference}</p></CardContent></Card>
              <Card><CardHeader><CardTitle className="text-sm">Difference Metric</CardTitle></CardHeader><CardContent><select value={targetMetric} onChange={(e) => setTargetMetric(e.target.value as (typeof trackedMilestones)[number])} className="rounded border px-2 py-1 text-sm">{trackedMilestones.map((m) => <option key={m} value={m}>{m}</option>)}</select></CardContent></Card>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 text-sm font-semibold">Difference Bar Chart: {targetMetric} (Actual - Shared Target)</div>
              <div className="space-y-2">{targetSeries.map((p) => <div key={p.month} className="flex items-center gap-3"><div className="w-28 text-xs text-slate-600">{p.month}</div><div className="h-4 flex-1 rounded bg-slate-100 relative"><div className={`absolute h-4 rounded ${p.value >= 0 ? "bg-emerald-600" : "bg-rose-600"}`} style={{ width: `${(Math.abs(p.value) / targetMaxAbs) * 100}%` }} /></div><div className="w-16 text-right text-sm font-semibold">{p.value}</div></div>)}</div>
            </div>
          </>
        )}

        {activeTab === "report" && <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm text-sm text-slate-600">Use target tab for monthly shared-target difference and total difference.</div>}
      </main>
    </div>
  );
}
