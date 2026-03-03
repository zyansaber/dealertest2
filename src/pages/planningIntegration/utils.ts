import type { ScheduleItem } from "@/types";
import type { DateTrackRecord, Granularity, Period } from "./types";

export const normalizeKey = (value: unknown) => String(value ?? "").trim().toUpperCase();

export const parseDateToTimestamp = (value: unknown) => {
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

export const formatDate = (timestamp: number) => {
  const d = new Date(timestamp);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

export const displayValue = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text || "-";
};

export const getDateTrackByChassis = (raw: unknown) => {
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

export const extractScheduleRowsById = (raw: unknown): ScheduleItem[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((x) => x && typeof x === "object") as ScheduleItem[];
  if (typeof raw !== "object") return [];
  const rec = raw as Record<string, unknown>;
  const numericKeys = Object.keys(rec).filter((k) => /^\d+$/.test(k));
  if (numericKeys.length > 0) {
    return numericKeys.sort((a, b) => Number(a) - Number(b)).map((k) => rec[k]).filter((x) => x && typeof x === "object") as ScheduleItem[];
  }
  if (Array.isArray((rec as any).data)) return ((rec as any).data as any[]).filter((x) => x && typeof x === "object") as ScheduleItem[];
  return Object.values(rec).filter((x) => x && typeof x === "object") as ScheduleItem[];
};

export const buildPeriods = (granularity: Granularity, fromTs: number, toTs: number): Period[] => {
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
