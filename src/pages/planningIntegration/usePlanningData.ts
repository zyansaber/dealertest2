import { useEffect, useMemo, useState } from "react";
import { off, onValue, ref, set } from "firebase/database";

import { database, subscribeToDateTrack } from "@/lib/firebase";
import type { ScheduleItem } from "@/types";

import { milestoneSequence, trackedMilestones } from "./types";
import type { DateTrackRecord, Granularity, Row } from "./types";
import { buildPeriods, extractScheduleRowsById, getDateTrackByChassis, normalizeKey, parseDateToTimestamp } from "./utils";

export function usePlanningData(granularity: Granularity) {
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [dateTrack, setDateTrack] = useState<Record<string, DateTrackRecord>>({});
  const [isLoading, setIsLoading] = useState(true);

  const [targets, setTargets] = useState<Record<string, number>>({});

  useEffect(() => {
    const scheduleRef = ref(database, "schedule");
    const handler = (snapshot: any) => {
      setSchedule(extractScheduleRowsById(snapshot.val()));
      setIsLoading(false);
    };
    onValue(scheduleRef, handler);
    const unsubDateTrack = subscribeToDateTrack((data) => setDateTrack(getDateTrackByChassis(data)));

    const targetRef = ref(database, "planningTargets/sharedMonthly");
    const targetHandler = (snapshot: any) => {
      const val = snapshot.val();
      if (val && typeof val === "object") setTargets(val as Record<string, number>);
      else setTargets({});
    };
    onValue(targetRef, targetHandler);

    return () => {
      off(scheduleRef, "value", handler);
      unsubDateTrack?.();
      off(targetRef, "value", targetHandler);
    };
  }, []);

  const rows = useMemo<Row[]>(() =>
    schedule.filter((item) => normalizeKey(item?.Chassis)).map((item) => {
      const chassis = normalizeKey(item?.Chassis);
      return { chassis, schedule: item, dateTrack: dateTrack[chassis] };
    }), [schedule, dateTrack]);

  const scheduleRows = useMemo(() => rows.filter((r) => {
    const rp = String(r.schedule?.["Regent Production"] ?? "").trim().toLowerCase();
    return rp !== "finished" && rp !== "finish";
  }), [rows]);

  const fromTs = new Date(2025, 5, 1).getTime();
  const now = Date.now();
  const previousMonthEnd = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() - 1;

  const periods = useMemo(() => buildPeriods(granularity, fromTs, now), [granularity, now]);
  const monthsForDiff = useMemo(() => buildPeriods("month", fromTs, previousMonthEnd).map((p) => p.label), [previousMonthEnd]);
  const monthsForTargetInput = useMemo(() => buildPeriods("month", fromTs, new Date(2026, 11, 31).getTime()).map((p) => p.label), []);

  const trend = useMemo(() => periods.map((p, idx) => {
    const counts: Record<string, number> = {};
    trackedMilestones.forEach((m) => counts[m] = 0);
    rows.forEach((r) => {
      trackedMilestones.forEach((m) => {
        const mm = milestoneSequence.find((x) => x.key === m);
        if (!mm) return;
        const ts = parseDateToTimestamp(mm.source === "schedule" ? (r.schedule as any)?.[mm.key] : r.dateTrack?.[mm.key]);
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
          const ts = parseDateToTimestamp(mm.source === "schedule" ? (r.schedule as any)?.[mm.key] : r.dateTrack?.[mm.key]);
          if (ts != null && ts >= prev.start && ts <= prev.end) prevCounts[m] += 1;
        });
      });
    }
    const increments: Record<string, number | null> = {};
    trackedMilestones.forEach((m) => increments[m] = prev ? counts[m] - prevCounts[m] : null);
    return { label: p.label, counts, increments };
  }), [periods, rows]);

  const monthlyActuals = useMemo(() => {
    const monthPeriods = buildPeriods("month", fromTs, previousMonthEnd);
    const out: Record<string, Record<string, number>> = {};
    trackedMilestones.forEach((m) => { out[m] = {}; monthPeriods.forEach((mp) => out[m][mp.label] = 0); });
    monthPeriods.forEach((mp) => {
      rows.forEach((r) => {
        trackedMilestones.forEach((m) => {
          const mm = milestoneSequence.find((x) => x.key === m);
          if (!mm) return;
          const ts = parseDateToTimestamp(mm.source === "schedule" ? (r.schedule as any)?.[mm.key] : r.dateTrack?.[mm.key]);
          if (ts != null && ts >= mp.start && ts <= mp.end) out[m][mp.label] += 1;
        });
      });
    });
    return out;
  }, [rows, previousMonthEnd]);

  const saveSharedTarget = async (month: string, value: number) => {
    const next = { ...targets, [month]: value };
    setTargets(next);
    await set(ref(database, "planningTargets/sharedMonthly"), next);
  };

  return {
    isLoading,
    rows,
    scheduleRows,
    trend,
    targets,
    saveSharedTarget,
    monthlyActuals,
    monthsForDiff,
    monthsForTargetInput,
    previousMonthEnd,
  };
}
