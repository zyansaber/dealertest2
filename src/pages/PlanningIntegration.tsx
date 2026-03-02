import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    const unsubSchedule = subscribeToSchedule(
      (data) => setSchedule(Array.isArray(data) ? data : []),
      { includeFinished: true, includeNoCustomer: true, includeNoChassis: false }
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
      .filter((item) => normalizeKey(item?.Chassis))
      .map((item) => {
        const chassis = normalizeKey(item?.Chassis);
        return {
          chassis,
          schedule: item,
          dateTrack: dateTrack[chassis],
        };
      });
  }, [schedule, dateTrack]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex w-full max-w-[1800px] border-x border-slate-200 bg-white">
        <aside className="w-60 border-r border-slate-200 p-4">
          <h1 className="mb-4 text-lg font-semibold">Planning</h1>
          <nav>
            <NavLink
              to="/planningintegration"
              className="block rounded px-2 py-1 text-sm text-blue-700 underline"
            >
              planningintegration
            </NavLink>
          </nav>
        </aside>

        <main className="min-w-0 flex-1 p-4">
          <h2 className="mb-4 text-xl font-semibold">Planning Integration</h2>
          <div className="overflow-auto border border-slate-200">
            <table className="min-w-[1600px] divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-100">
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} className="whitespace-nowrap px-3 py-2 text-left font-semibold text-slate-700">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.chassis} className="hover:bg-slate-50">
                    {columns.map((column) => {
                      const value =
                        column.source === "schedule"
                          ? (row.schedule as Record<string, unknown>)?.[column.key]
                          : row.dateTrack?.[column.key];
                      return (
                        <td key={`${row.chassis}-${column.key}`} className="whitespace-nowrap px-3 py-2">
                          {displayValue(value)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
}
