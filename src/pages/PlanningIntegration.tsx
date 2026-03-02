import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import PlanningIntegrationSidebar from "@/components/PlanningIntegrationSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { subscribeToDateTrack, subscribeToSchedule } from "@/lib/firebase";
import type { ScheduleItem } from "@/types";

type DateTrackRecord = Record<string, unknown>;
type PlanningTab = "planningintegration" | "leaving-port-estimation" | "report";
type Granularity = "week" | "month";

type Row = {
  chassis: string;
  schedule: ScheduleItem;
  dateTrack?: DateTrackRecord;
};

type Milestone = { key: string; source: "schedule" | "dateTrack" };

type Period = { start: number; end: number; label: string };

const normalizeKey = (value: unknown) => String(value ?? "").trim().toUpperCase();

const parseDateToTimestamp = (value: unknown) => {
  if (value == null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value < 1e12 ? value * 1000 : value;
  }

  const text = String(value).trim();
  if (!text || text === "-") return null;

  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric > 0) return numeric < 1e12 ? numeric * 1000 : numeric;

  const [dayText, monthText, yearText] = text.split("/");
  if (dayText && monthText && yearText) {
    const parsed = new Date(Number(yearText), Number(monthText) - 1, Number(dayText)).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  const fallback = new Date(text).getTime();
  return Number.isFinite(fallback) ? fallback : null;
};

const formatDate = (timestamp: number) => {
  const date = new Date(timestamp);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
};

const getDateTrackByChassis = (raw: unknown) => {
  const map: Record<string, DateTrackRecord> = {};
  if (!raw || typeof raw !== "object") return map;

  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    if (!value || typeof value !== "object") return;
    const record = value as DateTrackRecord;
    const chassisFromData = normalizeKey((record["Chassis Number"] as string | undefined) ?? key);
    if (!chassisFromData) return;
    map[chassisFromData] = record;
  });

  return map;
};

const displayValue = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text || "-";
};

const columns: Array<{ label: string; key: string; source: "schedule" | "dateTrack" }> = [
  { label: "Forecast Production Date", key: "Forecast Production Date", source: "schedule" },
  { label: "Chassis", key: "Chassis", source: "schedule" },
  { label: "Customer", key: "Customer", source: "schedule" },
  { label: "Dealer", key: "Dealer", source: "schedule" },
  { label: "Model", key: "Model", source: "schedule" },
  { label: "Model Year", key: "Model Year", source: "schedule" },
  { label: "Order Received Date", key: "Order Received Date", source: "schedule" },
  { label: "Signed Plans Received", key: "Signed Plans Received", source: "schedule" },
  { label: "Purchase Order Sent", key: "Purchase Order Sent", source: "schedule" },
  { label: "Index1", key: "Index1", source: "schedule" },
  { label: "chassisWelding", key: "chassisWelding", source: "dateTrack" },
  { label: "assemblyLine", key: "assemblyLine", source: "dateTrack" },
  { label: "finishGoods", key: "finishGoods", source: "dateTrack" },
  { label: "leavingFactory", key: "leavingFactory", source: "dateTrack" },
  { label: "estLeavngPort", key: "estLeavngPort", source: "dateTrack" },
  { label: "Left Port", key: "Left Port", source: "dateTrack" },
  { label: "melbournePortDate", key: "melbournePortDate", source: "dateTrack" },
  { label: "Received in Melbourne", key: "Received in Melbourne", source: "dateTrack" },
];

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

const trackedMilestonesForWeekly = [
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

const getValueByMilestone = (row: Row, milestone: Milestone) =>
  milestone.source === "schedule"
    ? (row.schedule as Record<string, unknown>)?.[milestone.key]
    : row.dateTrack?.[milestone.key];

const buildPeriods = (granularity: Granularity, fromTs: number, toTs: number): Period[] => {
  const periods: Period[] = [];
  const cursor = new Date(fromTs);
  cursor.setHours(0, 0, 0, 0);

  if (granularity === "month") {
    cursor.setDate(1);
    while (cursor.getTime() <= toTs) {
      const start = cursor.getTime();
      const next = new Date(cursor);
      next.setMonth(next.getMonth() + 1);
      const end = Math.min(next.getTime() - 1, toTs);
      periods.push({
        start,
        end,
        label: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else {
    while (cursor.getTime() <= toTs) {
      const start = cursor.getTime();
      const end = Math.min(start + 7 * 24 * 60 * 60 * 1000 - 1, toTs);
      periods.push({ start, end, label: `${formatDate(start)} ~ ${formatDate(end)}` });
      cursor.setDate(cursor.getDate() + 7);
    }
  }

  return periods;
};

export default function PlanningIntegration() {
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [dateTrack, setDateTrack] = useState<Record<string, DateTrackRecord>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const [granularity, setGranularity] = useState<Granularity>("week");
  const [selectedMilestone, setSelectedMilestone] = useState<(typeof trackedMilestonesForWeekly)[number]>("Purchase Order Sent");

  const topScrollerRef = useRef<HTMLDivElement | null>(null);
  const bottomScrollerRef = useRef<HTMLDivElement | null>(null);
  const syncingRef = useRef<"top" | "bottom" | null>(null);

  const activeTab = (searchParams.get("tab") as PlanningTab) || "planningintegration";

  useEffect(() => {
    const unsubSchedule = subscribeToSchedule(
      (data) => {
        setSchedule(Array.isArray(data) ? data : []);
        setIsLoading(false);
      },
      { includeFinished: true, includeNoCustomer: true, includeNoChassis: false }
    );
    const unsubDateTrack = subscribeToDateTrack((data) => setDateTrack(getDateTrackByChassis(data)));
    return () => {
      unsubSchedule?.();
      unsubDateTrack?.();
    };
  }, []);

  const rows = useMemo<Row[]>(() => {
    return schedule
      .filter((item) => normalizeKey(item?.Chassis))
      .map((item) => {
        const chassis = normalizeKey(item?.Chassis);
        return { chassis, schedule: item, dateTrack: dateTrack[chassis] };
      });
  }, [schedule, dateTrack]);

  const sortedTableRows = useMemo(() => {
    const toIndex = (v: unknown) => {
      const n = Number(String(v ?? "").trim());
      return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
    };
    return [...rows].sort((a, b) => {
      const idx = toIndex(a.schedule.Index1) - toIndex(b.schedule.Index1);
      if (idx !== 0) return idx;
      return (parseDateToTimestamp(a.schedule["Forecast Production Date"]) ?? Number.POSITIVE_INFINITY) -
        (parseDateToTimestamp(b.schedule["Forecast Production Date"]) ?? Number.POSITIVE_INFINITY);
    });
  }, [rows]);

  const averageTransitionCards = useMemo(() => {
    const transitions = milestoneSequence.slice(2);
    return transitions.slice(0, -1).map((current, index) => {
      const next = transitions[index + 1];
      let sumDays = 0;
      let count = 0;
      rows.forEach((row) => {
        const fromTs = parseDateToTimestamp(getValueByMilestone(row, current));
        const toTs = parseDateToTimestamp(getValueByMilestone(row, next));
        if (fromTs == null || toTs == null) return;
        sumDays += (toTs - fromTs) / (1000 * 60 * 60 * 24);
        count += 1;
      });
      return { title: `${current.key} → ${next.key}`, value: count ? `${(sumDays / count).toFixed(1)} days` : "-", sample: count };
    });
  }, [rows]);

  const statusCards = useMemo(() => {
    const counts: Record<string, number> = {};
    rows.forEach((row) => {
      let lastKey = "";
      milestoneSequence.forEach((m) => {
        if (parseDateToTimestamp(getValueByMilestone(row, m)) != null) lastKey = m.key;
      });
      if (lastKey) counts[lastKey] = (counts[lastKey] ?? 0) + 1;
    });
    return milestoneSequence.map((m) => ({ milestone: m.key, label: phaseCardMap[m.key] ?? m.key, count: counts[m.key] ?? 0 }));
  }, [rows]);

  const weeklyNodeTrend = useMemo(() => {
    const fromTs = new Date(2025, 5, 1).getTime(); // 2025-06-01
    const toTs = Date.now();
    const periods = buildPeriods(granularity, fromTs, toTs);

    return periods.map((period, idx) => {
      const counts: Record<string, number> = {};
      trackedMilestonesForWeekly.forEach((k) => (counts[k] = 0));

      rows.forEach((row) => {
        trackedMilestonesForWeekly.forEach((key) => {
          const milestone = milestoneSequence.find((item) => item.key === key);
          if (!milestone) return;
          const ts = parseDateToTimestamp(getValueByMilestone(row, milestone));
          if (ts != null && ts >= period.start && ts <= period.end) counts[key] += 1;
        });
      });

      const prev = idx > 0 ? periods[idx - 1] : null;
      const prevCounts: Record<string, number> = {};
      trackedMilestonesForWeekly.forEach((k) => (prevCounts[k] = 0));

      if (prev) {
        rows.forEach((row) => {
          trackedMilestonesForWeekly.forEach((key) => {
            const milestone = milestoneSequence.find((item) => item.key === key);
            if (!milestone) return;
            const ts = parseDateToTimestamp(getValueByMilestone(row, milestone));
            if (ts != null && ts >= prev.start && ts <= prev.end) prevCounts[key] += 1;
          });
        });
      }

      const increments: Record<string, number | null> = {};
      trackedMilestonesForWeekly.forEach((k) => {
        increments[k] = prev ? counts[k] - prevCounts[k] : null;
      });

      return { label: period.label, counts, increments };
    });
  }, [rows, granularity]);

  const selectedSeries = useMemo(() => weeklyNodeTrend.map((p) => ({ label: p.label, value: p.counts[selectedMilestone] })), [weeklyNodeTrend, selectedMilestone]);
  const maxBarValue = useMemo(() => Math.max(1, ...selectedSeries.map((s) => s.value)), [selectedSeries]);

  const weeklyCurrentCards = useMemo(() => {
    const latest = weeklyNodeTrend[weeklyNodeTrend.length - 1];
    return trackedMilestonesForWeekly.map((k) => ({ key: k, label: phaseCardMap[k] ?? k, count: latest ? latest.counts[k] : 0 }));
  }, [weeklyNodeTrend]);

  useEffect(() => {
    const top = topScrollerRef.current;
    const bottom = bottomScrollerRef.current;
    if (!top || !bottom) return;
    top.firstElementChild?.setAttribute("style", `width:${bottom.scrollWidth}px;height:1px;`);
  }, [sortedTableRows.length, activeTab]);

  const syncScroll = (source: "top" | "bottom") => {
    const top = topScrollerRef.current;
    const bottom = bottomScrollerRef.current;
    if (!top || !bottom || syncingRef.current) return;
    syncingRef.current = source;
    if (source === "top") bottom.scrollLeft = top.scrollLeft;
    else top.scrollLeft = bottom.scrollLeft;
    requestAnimationFrame(() => {
      syncingRef.current = null;
    });
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <PlanningIntegrationSidebar activeTab={activeTab} onTabChange={(tab) => setSearchParams({ tab })} totalRows={rows.length} />

      <main className="ml-72 min-w-0 p-6">
        {activeTab === "planningintegration" && (
          <>
            <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-2xl font-semibold tracking-tight">Planning Integration</h2>
              <p className="mt-1 text-sm text-slate-600">Cards and metrics now use all data (including finished).</p>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {averageTransitionCards.map((card) => (
                <Card key={card.title} className="border-slate-200"><CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-slate-600">{card.title}</CardTitle></CardHeader><CardContent><div className="text-xl font-bold text-slate-900">{card.value}</div><p className="text-xs text-slate-500">samples: {card.sample}</p></CardContent></Card>
              ))}
            </div>

            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {statusCards.map((card) => (
                <Card key={card.milestone} className="border-slate-200"><CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-slate-500">{card.milestone}</CardTitle></CardHeader><CardContent><div className="text-base font-semibold text-slate-900">{card.label}</div><p className="mt-1 text-2xl font-bold text-slate-900">{card.count}</p></CardContent></Card>
              ))}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div ref={topScrollerRef} onScroll={() => syncScroll("top")} className="overflow-x-auto overflow-y-hidden border-b border-slate-200"><div className="h-px" /></div>
              <div ref={bottomScrollerRef} onScroll={() => syncScroll("bottom")} className="max-h-[calc(100vh-520px)] overflow-auto">
                <table className="min-w-[2100px] divide-y divide-slate-200 text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-100"><tr>{columns.map((c) => <th key={c.key} className="whitespace-nowrap px-3 py-3 text-left font-semibold text-slate-700">{c.label}</th>)}</tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {isLoading ? <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-slate-500">Loading planning data...</td></tr> : sortedTableRows.map((row, idx) => (
                      <tr key={`${row.chassis}-${idx}`} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                        {columns.map((c) => {
                          const value = c.source === "schedule" ? (row.schedule as Record<string, unknown>)?.[c.key] : row.dateTrack?.[c.key];
                          return <td key={`${row.chassis}-${c.key}-${idx}`} className="whitespace-nowrap px-3 py-2.5 text-slate-700">{displayValue(value)}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {activeTab === "leaving-port-estimation" && (
          <>
            <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-2xl font-semibold tracking-tight">Leaving port estimation</h2>
              <p className="mt-1 text-sm text-slate-600">Weekly/Monthly milestone events from 2025-06 onward (all data).</p>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <label className="text-sm font-medium text-slate-700">Period</label>
              <select value={granularity} onChange={(e) => setGranularity(e.target.value as Granularity)} className="rounded border px-2 py-1 text-sm">
                <option value="week">Week</option>
                <option value="month">Month</option>
              </select>
              <label className="ml-4 text-sm font-medium text-slate-700">Metric</label>
              <select value={selectedMilestone} onChange={(e) => setSelectedMilestone(e.target.value as (typeof trackedMilestonesForWeekly)[number])} className="rounded border px-2 py-1 text-sm">
                {trackedMilestonesForWeekly.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>

            <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 text-sm font-semibold text-slate-700">{selectedMilestone} ({granularity})</div>
              <div className="space-y-2">
                {selectedSeries.map((point) => (
                  <div key={point.label} className="flex items-center gap-3">
                    <div className="w-52 shrink-0 text-xs text-slate-600">{point.label}</div>
                    <div className="h-4 flex-1 rounded bg-slate-100">
                      <div className="h-4 rounded bg-slate-700" style={{ width: `${(point.value / maxBarValue) * 100}%` }} />
                    </div>
                    <div className="w-10 text-right text-sm font-semibold text-slate-700">{point.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {weeklyCurrentCards.map((card) => (
                <Card key={card.key} className="border-slate-200"><CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-slate-500">{card.key}</CardTitle></CardHeader><CardContent><div className="text-sm font-semibold text-slate-700">{card.label}</div><p className="mt-1 text-2xl font-bold text-slate-900">{card.count}</p></CardContent></Card>
              ))}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-auto">
              <table className="min-w-[1700px] divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-100"><tr><th className="px-3 py-3 text-left font-semibold text-slate-700">{granularity === "week" ? "Week" : "Month"}</th>{trackedMilestonesForWeekly.map((k) => <th key={k} className="px-3 py-3 text-left font-semibold text-slate-700">{k} (weekly count / vs last week)</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {weeklyNodeTrend.map((p, idx) => (
                    <tr key={`${p.label}-${idx}`} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                      <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-800">{p.label}</td>
                      {trackedMilestonesForWeekly.map((k) => {
                        const inc = p.increments[k];
                        const incText = inc == null ? "-" : inc >= 0 ? `+${inc}` : String(inc);
                        return <td key={`${p.label}-${k}`} className="whitespace-nowrap px-3 py-2.5 text-slate-700">{p.counts[k]} <span className="text-xs text-slate-500">({incText})</span></td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === "report" && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm text-sm text-slate-600">
            Report tab retained. Use Leaving port estimation for weekly/monthly milestone event trends and chart switch.
          </div>
        )}
      </main>
    </div>
  );
}
