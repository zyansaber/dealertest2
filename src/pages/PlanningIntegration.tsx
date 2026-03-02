import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, Package } from "lucide-react";
import { NavLink } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { subscribeToDateTrack, subscribeToSchedule } from "@/lib/firebase";
import type { ScheduleItem } from "@/types";

type DateTrackRecord = Record<string, unknown>;

type Row = {
  chassis: string;
  schedule: ScheduleItem;
  dateTrack?: DateTrackRecord;
};

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
    const day = Number(dayText);
    const month = Number(monthText) - 1;
    const year = Number(yearText);
    const parsed = new Date(year, month, day).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  const fallback = new Date(text).getTime();
  return Number.isFinite(fallback) ? fallback : null;
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

const milestoneSequence: Array<{ key: string; source: "schedule" | "dateTrack" }> = [
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
  assemblyLine: "Assembly line  Longtree",
  finishGoods: "Finishedin Longtree",
  leavingFactory: "Leaving factory from Longtree",
  estLeavngPort: "waiting in port",
  "Left Port": "On the sea",
  melbournePortDate: "Melbourn Port",
  "Received in Melbourne": "Melbourn Factory",
};

export default function PlanningIntegration() {
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [dateTrack, setDateTrack] = useState<Record<string, DateTrackRecord>>({});
  const [isLoading, setIsLoading] = useState(true);
  const topScrollerRef = useRef<HTMLDivElement | null>(null);
  const bottomScrollerRef = useRef<HTMLDivElement | null>(null);
  const syncingRef = useRef<"top" | "bottom" | null>(null);

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
        return {
          chassis,
          schedule: item,
          dateTrack: dateTrack[chassis],
        };
      });
  }, [schedule, dateTrack]);

  const averageTransitionCards = useMemo(() => {
    const transitions = milestoneSequence.slice(2);
    return transitions.slice(0, -1).map((current, index) => {
      const next = transitions[index + 1];
      let sumDays = 0;
      let count = 0;

      rows.forEach((row) => {
        const fromValue =
          current.source === "schedule"
            ? (row.schedule as Record<string, unknown>)?.[current.key]
            : row.dateTrack?.[current.key];
        const toValue =
          next.source === "schedule"
            ? (row.schedule as Record<string, unknown>)?.[next.key]
            : row.dateTrack?.[next.key];

        const fromTs = parseDateToTimestamp(fromValue);
        const toTs = parseDateToTimestamp(toValue);
        if (fromTs == null || toTs == null) return;

        sumDays += (toTs - fromTs) / (1000 * 60 * 60 * 24);
        count += 1;
      });

      return {
        title: `${current.key} → ${next.key}`,
        value: count > 0 ? `${(sumDays / count).toFixed(1)} days` : "-",
        sample: count,
      };
    });
  }, [rows]);

  const statusCards = useMemo(() => {
    const counts: Record<string, number> = {};

    rows.forEach((row) => {
      let lastKey = "";

      milestoneSequence.forEach((item) => {
        const rawValue =
          item.source === "schedule"
            ? (row.schedule as Record<string, unknown>)?.[item.key]
            : row.dateTrack?.[item.key];
        if (parseDateToTimestamp(rawValue) != null) {
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

  useEffect(() => {
    const top = topScrollerRef.current;
    const bottom = bottomScrollerRef.current;
    if (!top || !bottom) return;

    const tableWidth = bottom.scrollWidth;
    top.firstElementChild?.setAttribute("style", `width:${tableWidth}px;height:1px;`);
  }, [rows.length]);

  const syncScroll = (source: "top" | "bottom") => {
    const top = topScrollerRef.current;
    const bottom = bottomScrollerRef.current;
    if (!top || !bottom || syncingRef.current) return;

    syncingRef.current = source;
    if (source === "top") {
      bottom.scrollLeft = top.scrollLeft;
    } else {
      top.scrollLeft = bottom.scrollLeft;
    }
    requestAnimationFrame(() => {
      syncingRef.current = null;
    });
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex w-full max-w-[1920px]">
        <aside className="flex h-screen w-72 shrink-0 flex-col border-r border-slate-800 bg-slate-950 text-slate-100">
          <div className="border-b border-slate-800 px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white ring-1 ring-slate-200">
                <img src="/assets/snowy-river-logo.svg" alt="Snowy River Caravans" className="h-9 w-9 object-contain" />
              </div>
              <div className="space-y-1">
                <h1 className="text-base font-semibold leading-tight">Planning Portal</h1>
                <p className="text-sm text-slate-300">Integrated milestones</p>
              </div>
            </div>
          </div>

          <div className="border-b border-slate-800 px-2 py-3">
            <nav className="space-y-1">
              <NavLink to="/planningintegration" end>
                {({ isActive }) => (
                  <div
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                      isActive ? "bg-slate-800 text-white shadow-inner" : "text-slate-200 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <ClipboardList className="h-5 w-5" />
                    <span>planningintegration</span>
                  </div>
                )}
              </NavLink>
            </nav>
          </div>

          <div className="px-4 py-4">
            <Card className="border border-slate-800 bg-slate-900 shadow-inner">
              <CardHeader className="px-4 pb-2 pt-4">
                <CardTitle className="flex items-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
                  <Package className="mr-2 h-3.5 w-3.5" />
                  Total Rows
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-1">
                <div className="text-2xl font-bold text-white">{rows.length}</div>
                <p className="mt-1 text-xs text-slate-400">Non-finished schedules</p>
              </CardContent>
            </Card>
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-6">
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
            <div
              ref={topScrollerRef}
              onScroll={() => syncScroll("top")}
              className="overflow-x-auto overflow-y-hidden border-b border-slate-200"
            >
              <div className="h-px" />
            </div>

            <div
              ref={bottomScrollerRef}
              onScroll={() => syncScroll("bottom")}
              className="max-h-[calc(100vh-520px)] overflow-auto"
            >
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
                      <td colSpan={columns.length} className="px-3 py-8 text-center text-slate-500">
                        Loading planning data...
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length} className="px-3 py-8 text-center text-slate-500">
                        No rows found.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, index) => (
                      <tr key={row.chassis} className={index % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                        {columns.map((column) => {
                          const value =
                            column.source === "schedule"
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
        </main>
      </div>
    </div>
  );
}
