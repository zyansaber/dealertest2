import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink } from "react-router-dom";

import { subscribeToDateTrack, subscribeToSchedule } from "@/lib/firebase";
import type { ScheduleItem } from "@/types";

type DateTrackRecord = Record<string, unknown>;

type Row = {
  chassis: string;
  schedule: ScheduleItem;
  dateTrack?: DateTrackRecord;
};

const normalizeKey = (value: unknown) => String(value ?? "").trim().toUpperCase();

const parseDDMMYYYY = (value: unknown) => {
  const text = String(value ?? "").trim();
  if (!text) return Number.POSITIVE_INFINITY;
  const [dayText, monthText, yearText] = text.split("/");
  const day = Number(dayText);
  const month = Number(monthText) - 1;
  const year = Number(yearText);
  const date = new Date(year, month, day);
  const time = date.getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
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
      .sort((a, b) => parseDDMMYYYY(a?.["Forecast Production Date"]) - parseDDMMYYYY(b?.["Forecast Production Date"]))
      .map((item) => {
        const chassis = normalizeKey(item?.Chassis);
        return {
          chassis,
          schedule: item,
          dateTrack: dateTrack[chassis],
        };
      });
  }, [schedule, dateTrack]);

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
        <aside className="sticky top-0 h-screen w-64 border-r border-slate-200 bg-white/95 p-5 shadow-sm backdrop-blur">
          <h1 className="mb-4 text-lg font-semibold tracking-tight">Planning</h1>
          <nav>
            <NavLink
              to="/planningintegration"
              className="block rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
            >
              planningintegration
            </NavLink>
          </nav>
        </aside>

        <main className="min-w-0 flex-1 p-6">
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-2xl font-semibold tracking-tight">Planning Integration</h2>
            <p className="mt-1 text-sm text-slate-600">
              Showing all non-finished schedules sorted by Forecast Production Date (ascending).
            </p>
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
              className="max-h-[calc(100vh-240px)] overflow-auto"
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
