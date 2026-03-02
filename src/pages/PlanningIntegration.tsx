import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import PlanningIntegrationSidebar from "@/components/PlanningIntegrationSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { subscribeToDateTrack, subscribeToSchedule } from "@/lib/firebase";
import type { ScheduleItem } from "@/types";

type DateTrackRecord = Record<string, unknown>;
type PlanningTab = "planningintegration" | "leaving-port-estimation" | "report";

type Row = {
  chassis: string;
  schedule: ScheduleItem;
  dateTrack?: DateTrackRecord;
};

type Milestone = { key: string; source: "schedule" | "dateTrack" };

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
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric < 1e12 ? numeric * 1000 : numeric;
  }

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
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const formatWeekLabel = (start: number, end: number) => `${formatDate(start)} ~ ${formatDate(end)}`;

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
  { label: "Chassis", key: "Chassis", source: "schedule" },
  { label: "Customer", key: "Customer", source: "schedule" },
  { label: "Dealer", key: "Dealer", source: "schedule" },
  { label: "Model", key: "Model", source: "schedule" },
  { label: "Model Year", key: "Model Year", source: "schedule" },
  { label: "Order Received Date", key: "Order Received Date", source: "schedule" },
  { label: "Signed Plans Received", key: "Signed Plans Received", source: "schedule" },
  { label: "Purchase Order Sent", key: "Purchase Order Sent", source: "schedule" },
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

const getValueByMilestone = (row: Row, milestone: Milestone) => {
  return milestone.source === "schedule"
    ? (row.schedule as Record<string, unknown>)?.[milestone.key]
    : row.dateTrack?.[milestone.key];
};

const getWeekStart = (timestamp: number) => {
  const date = new Date(timestamp);
  const day = date.getDay();
  const shift = day === 0 ? -6 : 1 - day;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + shift);
  return date.getTime();
};

export default function PlanningIntegration() {
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [dateTrack, setDateTrack] = useState<Record<string, DateTrackRecord>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();

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
      { includeFinished: false, includeNoCustomer: true, includeNoChassis: false }
    );

    const unsubDateTrack = subscribeToDateTrack((data) => {
      setDateTrack(getDateTrackByChassis(data));
    });

    return () => {
      unsubSchedule?.();
      unsubDateTrack?.();
    };
  }, []);

  const rows = useMemo<Row[]>(() => {
    return schedule
      .filter((item) => {
        const chassis = normalizeKey(item?.Chassis);
        if (!chassis) return false;
        const production = String(item?.["Regent Production"] ?? "").trim().toLowerCase();
        return production !== "finished" && production !== "finish";
      })
      .sort(
        (a, b) =>
          (parseDateToTimestamp(a?.["Forecast Production Date"]) ?? Number.POSITIVE_INFINITY) -
          (parseDateToTimestamp(b?.["Forecast Production Date"]) ?? Number.POSITIVE_INFINITY)
      )
      .map((item) => {
        const chassis = normalizeKey(item?.Chassis);
        return { chassis, schedule: item, dateTrack: dateTrack[chassis] };
      });
  }, [schedule, dateTrack]);

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

      return {
        from: current.key,
        to: next.key,
        title: `${current.key} → ${next.key}`,
        value: count > 0 ? `${(sumDays / count).toFixed(1)} days` : "-",
        avg: count > 0 ? sumDays / count : null,
        sample: count,
      };
    });
  }, [rows]);

  const statusCards = useMemo(() => {
    const counts: Record<string, number> = {};

    rows.forEach((row) => {
      let lastKey = "";
      milestoneSequence.forEach((item) => {
        if (parseDateToTimestamp(getValueByMilestone(row, item)) != null) {
          lastKey = item.key;
        }
      });
      if (!lastKey) return;
      counts[lastKey] = (counts[lastKey] ?? 0) + 1;
    });

    return milestoneSequence.map((item) => ({
      milestone: item.key,
      label: phaseCardMap[item.key] ?? item.key,
      count: counts[item.key] ?? 0,
    }));
  }, [rows]);

  const weeklyNodeTrend = useMemo(() => {
    const now = Date.now();
    const currentWeekStart = getWeekStart(now);

    const weeks = Array.from({ length: 10 }).map((_, idx) => {
      const start = currentWeekStart - (9 - idx) * 7 * 24 * 60 * 60 * 1000;
      const end = start + 7 * 24 * 60 * 60 * 1000 - 1;
      return { start, end, label: formatWeekLabel(start, end) };
    });

    const weekSnapshots = weeks.map((week) => {
      const counts: Record<string, number> = {};
      trackedMilestonesForWeekly.forEach((k) => {
        counts[k] = 0;
      });

      rows.forEach((row) => {
        let lastKey = "";
        milestoneSequence.forEach((item) => {
          const ts = parseDateToTimestamp(getValueByMilestone(row, item));
          if (ts != null && ts <= week.end) {
            lastKey = item.key;
          }
        });
        if (trackedMilestonesForWeekly.includes(lastKey as (typeof trackedMilestonesForWeekly)[number])) {
          counts[lastKey] += 1;
        }
      });

      return { week, counts };
    });

    return weekSnapshots.map((snapshot, index) => {
      const prev = index > 0 ? weekSnapshots[index - 1] : null;
      const increments: Record<string, number | null> = {};

      trackedMilestonesForWeekly.forEach((key) => {
        increments[key] = prev ? snapshot.counts[key] - prev.counts[key] : null;
      });

      return {
        weekLabel: snapshot.week.label,
        counts: snapshot.counts,
        increments,
      };
    });
  }, [rows]);

  const weeklyCurrentCards = useMemo(() => {
    const latest = weeklyNodeTrend[weeklyNodeTrend.length - 1];
    return trackedMilestonesForWeekly.map((key) => ({
      key,
      label: phaseCardMap[key] ?? key,
      count: latest ? latest.counts[key] : 0,
    }));
  }, [weeklyNodeTrend]);

  const reportMonthlyAverages = useMemo(() => {
    const buckets: Record<string, Record<string, { sum: number; count: number }>> = {};

    rows.forEach((row) => {
      const forecastTs = parseDateToTimestamp(row.schedule["Forecast Production Date"]);
      if (forecastTs == null) return;
      const d = new Date(forecastTs);
      const bucket = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!buckets[bucket]) buckets[bucket] = {};

      averageTransitionCards.forEach((transition) => {
        const from = milestoneSequence.find((m) => m.key === transition.from);
        const to = milestoneSequence.find((m) => m.key === transition.to);
        if (!from || !to) return;
        const fromTs = parseDateToTimestamp(getValueByMilestone(row, from));
        const toTs = parseDateToTimestamp(getValueByMilestone(row, to));
        if (fromTs == null || toTs == null) return;

        const key = transition.title;
        if (!buckets[bucket][key]) buckets[bucket][key] = { sum: 0, count: 0 };
        buckets[bucket][key].sum += (toTs - fromTs) / (1000 * 60 * 60 * 24);
        buckets[bucket][key].count += 1;
      });
    });

    return Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => ({
        month,
        averages: Object.entries(value)
          .map(([name, item]) => ({ name, avg: item.count > 0 ? item.sum / item.count : 0, count: item.count }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [rows, averageTransitionCards]);

  const top10NodeCounts = useMemo(() => {
    return [...statusCards].sort((a, b) => b.count - a.count).slice(0, 10);
  }, [statusCards]);

  useEffect(() => {
    const top = topScrollerRef.current;
    const bottom = bottomScrollerRef.current;
    if (!top || !bottom) return;
    top.firstElementChild?.setAttribute("style", `width:${bottom.scrollWidth}px;height:1px;`);
  }, [rows.length, activeTab]);

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

  const setTab = (tab: PlanningTab) => {
    setSearchParams({ tab });
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <PlanningIntegrationSidebar activeTab={activeTab} onTabChange={setTab} totalRows={rows.length} />

      <main className="ml-72 min-w-0 p-6">
        {activeTab === "planningintegration" && (
          <>
            <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-2xl font-semibold tracking-tight">Planning Integration</h2>
              <p className="mt-1 text-sm text-slate-600">Sorted by Forecast Production Date (ascending).</p>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {averageTransitionCards.map((card) => (
                <Card key={card.title} className="border-slate-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-semibold text-slate-600">{card.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold text-slate-900">{card.value}</div>
                    <p className="text-xs text-slate-500">samples: {card.sample}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {statusCards.map((card) => (
                <Card key={card.milestone} className="border-slate-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-semibold text-slate-500">{card.milestone}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-base font-semibold text-slate-900">{card.label}</div>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{card.count}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div ref={topScrollerRef} onScroll={() => syncScroll("top")} className="overflow-x-auto overflow-y-hidden border-b border-slate-200">
                <div className="h-px" />
              </div>

              <div ref={bottomScrollerRef} onScroll={() => syncScroll("bottom")} className="max-h-[calc(100vh-520px)] overflow-auto">
                <table className="min-w-[1900px] divide-y divide-slate-200 text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-100">
                    <tr>
                      {columns.map((column) => (
                        <th key={column.key} className="whitespace-nowrap px-3 py-3 text-left font-semibold text-slate-700">
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {isLoading ? (
                      <tr>
                        <td colSpan={columns.length} className="px-3 py-8 text-center text-slate-500">Loading planning data...</td>
                      </tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td colSpan={columns.length} className="px-3 py-8 text-center text-slate-500">No rows found.</td>
                      </tr>
                    ) : (
                      rows.map((row, index) => (
                        <tr key={row.chassis} className={index % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                          {columns.map((column) => {
                            const value = column.source === "schedule"
                              ? (row.schedule as Record<string, unknown>)?.[column.key]
                              : row.dateTrack?.[column.key];
                            return (
                              <td key={`${row.chassis}-${column.key}`} className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                                {displayValue(value)}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
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
              <p className="mt-1 text-sm text-slate-600">
                Last 10-week trend and week-over-week increments for milestone nodes from Purchase Order Sent to melbournePortDate.
              </p>
            </div>

            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {weeklyCurrentCards.map((card) => (
                <Card key={card.key} className="border-slate-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-semibold text-slate-500">{card.key}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm font-semibold text-slate-700">{card.label}</div>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{card.count}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-auto">
              <table className="min-w-[1600px] divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-3 py-3 text-left font-semibold text-slate-700">Week</th>
                    {trackedMilestonesForWeekly.map((key) => (
                      <th key={key} className="px-3 py-3 text-left font-semibold text-slate-700">{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {weeklyNodeTrend.map((week, rowIndex) => (
                    <tr key={week.weekLabel} className={rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                      <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-800">{week.weekLabel}</td>
                      {trackedMilestonesForWeekly.map((key) => {
                        const inc = week.increments[key];
                        const incText = inc == null ? "-" : inc >= 0 ? `+${inc}` : String(inc);
                        return (
                          <td key={`${week.weekLabel}-${key}`} className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                            {week.counts[key]} <span className="text-xs text-slate-500">({incText})</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === "report" && (
          <>
            <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-2xl font-semibold tracking-tight">Report</h2>
              <p className="mt-1 text-sm text-slate-600">Average transition trend over time + top 10 node counts.</p>
            </div>

            <div className="mb-4 rounded-xl border border-slate-200 bg-white shadow-sm overflow-auto">
              <div className="border-b border-slate-200 px-4 py-3 font-semibold">Average transition days by Forecast month</div>
              <div className="p-4 space-y-3">
                {reportMonthlyAverages.map((monthBlock) => (
                  <div key={monthBlock.month} className="rounded-lg border border-slate-200">
                    <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold bg-slate-50">{monthBlock.month}</div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-slate-600">
                          <th className="px-3 py-2 text-left">Transition</th>
                          <th className="px-3 py-2 text-left">Average Days</th>
                          <th className="px-3 py-2 text-left">Samples</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthBlock.averages.map((item) => (
                          <tr key={`${monthBlock.month}-${item.name}`} className="border-t border-slate-100">
                            <td className="px-3 py-2">{item.name}</td>
                            <td className="px-3 py-2">{item.avg.toFixed(1)}</td>
                            <td className="px-3 py-2">{item.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-auto">
              <div className="border-b border-slate-200 px-4 py-3 font-semibold">Top 10 milestone node counts</div>
              <table className="min-w-[700px] w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Milestone</th>
                    <th className="px-3 py-2 text-left">Card</th>
                    <th className="px-3 py-2 text-left">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {top10NodeCounts.map((item) => (
                    <tr key={item.milestone} className="border-t border-slate-100">
                      <td className="px-3 py-2">{item.milestone}</td>
                      <td className="px-3 py-2">{item.label}</td>
                      <td className="px-3 py-2 font-semibold">{item.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
