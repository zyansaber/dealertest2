import { useEffect, useMemo, useState } from "react";
import { off, onValue, ref, set } from "firebase/database";

import { database, subscribeToDateTrack, subscribeToSpecPlan } from "@/lib/firebase";
import type { ScheduleItem } from "@/types";

import { milestoneSequence, trackedMilestones } from "./types";
import type { DateTrackRecord, Granularity, Row } from "./types";
import { buildPeriods, extractScheduleRowsById, getDateTrackByChassis, normalizeKey, parseDateToTimestamp } from "./utils";

const normalizeChassis = (value: unknown) => String(value ?? "").trim().toUpperCase();

const buildSpecPlanMaps = (raw: unknown) => {
  const specByChassis: Record<string, string> = {};
  const planByChassis: Record<string, string> = {};

  const put = (chassisRaw: unknown, payload: any) => {
    const chassis = normalizeChassis(chassisRaw);
    if (!chassis || !payload || typeof payload !== "object") return;
    if (typeof payload.spec === "string" && payload.spec.trim()) specByChassis[chassis] = payload.spec;
    if (typeof payload.plan === "string" && payload.plan.trim()) planByChassis[chassis] = payload.plan;
  };

  if (Array.isArray(raw)) {
    raw.forEach((item) => put((item as any)?.Chassis ?? (item as any)?.chassis, item));
    return { specByChassis, planByChassis };
  }

  if (raw && typeof raw === "object") {
    Object.entries(raw as Record<string, any>).forEach(([key, value]) => {
      if (value && typeof value === "object") put((value as any)?.Chassis ?? key, value);
    });
  }

  return { specByChassis, planByChassis };
};


export function usePlanningData(granularity: Granularity) {
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [dateTrack, setDateTrack] = useState<Record<string, DateTrackRecord>>({});
  const [isLoading, setIsLoading] = useState(true);

  const [targets, setTargets] = useState<Record<string, number>>({});
  const [waitingOrderPrices, setWaitingOrderPrices] = useState<Record<string, number>>({});
  const [specByChassis, setSpecByChassis] = useState<Record<string, string>>({});
  const [planByChassis, setPlanByChassis] = useState<Record<string, string>>({});

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

    const unsubSpecPlan = subscribeToSpecPlan((data) => {
      const maps = buildSpecPlanMaps(data);
      setSpecByChassis(maps.specByChassis);
      setPlanByChassis(maps.planByChassis);
    });

    const waitingRef = ref(database, "planningTargets/waitingOrderPrice");
    const waitingHandler = (snapshot: any) => {
      const val = snapshot.val();
      if (val && typeof val === "object") setWaitingOrderPrices(val as Record<string, number>);
      else setWaitingOrderPrices({});
    };
    onValue(waitingRef, waitingHandler);

    return () => {
      off(scheduleRef, "value", handler);
      unsubDateTrack?.();
      off(targetRef, "value", targetHandler);
      off(waitingRef, "value", waitingHandler);
      unsubSpecPlan?.();
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

  const withStatus = useMemo(() => rows.map((r) => {
    let last = "";
    milestoneSequence.forEach((m) => {
      const ts = parseDateToTimestamp(m.source === "schedule" ? (r.schedule as any)?.[m.key] : r.dateTrack?.[m.key]);
      if (ts != null) last = m.key;
    });
    return { ...r, status: last };
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

  const saveWaitingPrice = async (chassis: string, value: number) => {
    const next = { ...waitingOrderPrices, [chassis]: value };
    setWaitingOrderPrices(next);
    await set(ref(database, "planningTargets/waitingOrderPrice"), next);
  };

  return {
    isLoading,
    rows,
    withStatus,
    scheduleRows,
    trend,
    targets,
    saveSharedTarget,
    monthlyActuals,
    monthsForDiff,
    monthsForTargetInput,
    previousMonthEnd,
    waitingOrderPrices,
    saveWaitingPrice,
    specByChassis,
    planByChassis,
  };
}
