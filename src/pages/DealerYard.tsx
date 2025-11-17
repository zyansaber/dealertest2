// src/pages/DealerYard.tsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  subscribeToPGIRecords,
  subscribeToYardStock,
  receiveChassisToYard,
  subscribeToSchedule,
  addManualChassisToYard,
  dispatchFromYard,
  subscribeToHandover,
} from "@/lib/firebase";
import type { ScheduleItem } from "@/types";
import ProductRegistrationForm from "@/components/ProductRegistrationForm";
import { Truck, PackageCheck, Handshake, Warehouse } from "lucide-react";
import * as XLSX from "xlsx";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import emailjs from "emailjs-com";
import { toast } from "sonner";

type PGIRec = {
  pgidate?: string | null;
  dealer?: string | null;
  model?: string | null;
  customer?: string | null;
  wholesalepo?: string | number | null;
  vinnumber?: string | null;
  VinNumber?: string | null;
  vinNumber?: string | null;
  VINNumber?: string | null;
  chassis?: {
    vinNumber?: string | null;
    VinNumber?: string | null;
    vinnumber?: string | null;
    VINNumber?: string | null;
    [key: string]: any;
  } | null;
  [key: string]: any;
};
type YardRec = {
  receivedAt?: string | null;
  model?: string | null;
  customer?: string | null;
  type?: string | null;
  Type?: string | null;
  vinnumber?: string | null;
  VinNumber?: string | null;
  vinNumber?: string | null;
  VINNumber?: string | null;
  chassis?: {
    vinNumber?: string | null;
    VinNumber?: string | null;
    vinnumber?: string | null;
    VINNumber?: string | null;
    [key: string]: any;
  } | null;
  [key: string]: any;
};
type HandoverRec = {
  handoverAt?: string | null;
  createdAt?: string | null;
  dealerSlug?: string | null;
  dealerName?: string | null;
};

const PRICE_ENABLED_DEALERS = new Set(["frankston", "geelong", "launceston", "st-james", "traralgon"]);

const toStr = (v: unknown) => String(v ?? "");
const lower = (v: unknown) => toStr(v).toLowerCase();
const cleanLabel = (v: unknown, fallback = "Unknown") => {
  const str = toStr(v).trim();
  if (!str) return fallback;
  return str;
};

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
  } catch (e) {
    console.warn("parseDDMMYYYY failed:", e);
  }
  return null;
}
function daysSinceISO(iso?: string | null): number {
  if (!iso) return 0;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 0;
  const ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}
function isDateWithinRange(d: Date | null, start: Date | null, end: Date | null): boolean {
  if (!d) return false;
  const t = d.getTime();
  const s = start ? start.getTime() : -Infinity;
  const e = end ? end.getTime() : Infinity;
  return t >= s && t <= e;
}
function startOfWeekMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0-6 Sun-Sat
  const diff = (day + 6) % 7; // Monday=0
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function fmtMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function fmtMonthLabel(d: Date): string {
  return d.toLocaleString(undefined, { month: "short", year: "numeric" });
}
function fmtWeekLabel(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}
function isSecondhandChassis(chassis?: string | null): boolean {
  if (!chassis) return false;
  const c = String(chassis).toUpperCase();
  // Three letters, first is L/N/S, followed by 23/24/25, then digits
  return /^[LNS][A-Z]{2}(?:23|24|25)\d+$/.test(c);
}

const currencyFormatter = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
});

const REPORT_EMAIL_SERVICE = "service_d39k2lv";
const REPORT_EMAIL_TEMPLATE = "template_jp0j1s4";
const REPORT_EMAIL_PUBLIC_KEY = "Ox1_IwykSClDMOhqz";

const extractVin = (source: any): string | null => {
  if (source == null) return null;
  if (typeof source !== "object") {
    const str = String(source).trim();
    return str ? str : null;
  }

  const directCandidates = [
    source.vinNumber,
    source.VinNumber,
    source.vinnumber,
    source.VINNumber,
    source.vin,
    source.VIN,
  ];
  for (const candidate of directCandidates) {
    if (candidate != null) {
      const str = String(candidate).trim();
      if (str) return str;
    }
  }

  const nestedSources = [source.chassis, source.Chassis, source.vehicle, source.Vehicle];
  for (const nested of nestedSources) {
    const vin = extractVin(nested);
    if (vin) return vin;
  }

  return null;
};

function parseWholesale(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === "number" && !isNaN(val)) return val;
  const str = String(val).replace(/[^\d.-]/g, "");
  if (!str) return null;
  const num = Number(str);
  return Number.isFinite(num) ? num : null;
}

type WholesaleCandidate = { price: number; ts: number; order: number };

function collectWholesaleCandidates(source: any, out: WholesaleCandidate[], orderRef: { value: number }) {
  if (source == null) return;

  if (Array.isArray(source)) {
    source.forEach((entry) => collectWholesaleCandidates(entry, out, orderRef));
    return;
  }

  if (typeof source !== "object") {
    const direct = parseWholesale(source);
    if (direct != null) {
      out.push({ price: direct, ts: -Infinity, order: orderRef.value++ });
    }
    return;
  }

  const candidate = parseWholesale(
    (source as any)?.wholesalepo ??
      (source as any)?.wholesalePo ??
      (source as any)?.wholesalePO ??
      (source as any)?.price ??
      (source as any)?.amount
  );
  if (candidate != null) {
    const tsCandidates = [
      (source as any)?.updatedAt,
      (source as any)?.createdAt,
      (source as any)?.handoverAt,
      (source as any)?.timestamp,
    ];
    const tsValue = tsCandidates
      .map((t) => (t ? Date.parse(String(t)) : NaN))
      .find((t) => !Number.isNaN(t));
    out.push({ price: candidate, ts: Number.isFinite(tsValue ?? NaN) ? (tsValue as number) : -Infinity, order: orderRef.value++ });
  }

  Object.values(source).forEach((value) => collectWholesaleCandidates(value, out, orderRef));
}

function extractLatestWholesale(record: any): number | null {
  if (!record) return null;

  const candidates: WholesaleCandidate[] = [];
  collectWholesaleCandidates(record, candidates, { value: 0 });

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    if (a.ts === b.ts) return b.order - a.order;
    return b.ts - a.ts;
  });

  return candidates[0]?.price ?? null;
}

// Excel rows type
type ExcelRow = {
  Model?: string;
  "Model Range"?: string;
  Function?: string;
  Layout?: string;
  Height?: string | number;
  Length?: string | number;
  Axle?: string | number;
  "TOP 10"?: string | number;
  "TOP 15"?: string | number;
  "Top 15"?: string | number;
  "TOP15"?: string | number;
  "Top15"?: string | number;
};

function parseNum(val: unknown): number | null {
  if (val == null) return null;
  const s = String(val).replace(/[^\d.]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
function countBy(rows: ExcelRow[], key: keyof ExcelRow) {
  const map: Record<string, number> = {};
  rows.forEach((r) => {
    const raw = r[key];
    const k = toStr(raw).trim();
    if (!k) return;
    map[k] = (map[k] || 0) + 1;
  });
  return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}
function countTop15(rows: ExcelRow[]) {
  let cnt = 0;
  for (const r of rows) {
    const cands = [r["TOP 15"], r["Top 15"], r["TOP15"], r["Top15"], r["TOP 10"]];
    const v = cands.find((x) => x != null && String(x).trim() !== "");
    if (v == null) continue;
    const s = String(v).trim();
    if (/^\d+$/.test(s)) {
      const num = parseInt(s, 10);
      if (!isNaN(num) && num <= 15) cnt++;
    } else {
      const ls = s.toLowerCase();
      if (ls.includes("yes") || ls === "y" || ls.includes("top")) cnt++;
    }
  }
  return cnt;
}

// Days in Yard buckets (updated as requested)
const yardRangeDefs = [
  { label: "0–30", min: 0, max: 30 },
  { label: "31–90", min: 31, max: 90 },
  { label: "91–180", min: 91, max: 180 },
  { label: "180+", min: 181, max: 9999 },
];

// Colors
const PIE_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16", "#d946ef", "#0ea5e9", "#14b8a6"];

export default function DealerYard() {
  const { dealerSlug: rawDealerSlug } = useParams<{ dealerSlug: string }>();
  const dealerSlug = useMemo(() => normalizeDealerSlug(rawDealerSlug), [rawDealerSlug]);

  const location = useLocation();
  const [pgi, setPgi] = useState<Record<string, PGIRec>>({});
  const [yard, setYard] = useState<Record<string, YardRec>>({});
  const [handover, setHandover] = useState<Record<string, HandoverRec>>({});
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);

  // On The Road date range (PGI list controls)
  const [rangeType, setRangeType] = useState<"7d" | "30d" | "90d" | "custom">("7d");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  // KPI date range (independent from PGI list)
  const [kpiRangeType, setKpiRangeType] = useState<"7d" | "30d" | "90d" | "custom">("7d");
  const [kpiCustomStart, setKpiCustomStart] = useState<string>("");
  const [kpiCustomEnd, setKpiCustomEnd] = useState<string>("");

   // Modal: Product Registration
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [handoverData, setHandoverData] = useState<
    | null
    | {
        chassis: string;
        model?: string | null;
        dealerName?: string | null;
        dealerSlug?: string | null;
        handoverAt: string;
        vinnumber?: string | null;
      }
  >(null);

  // Manual add chassis
  const [manualChassis, setManualChassis] = useState("");
  const [manualStatus, setManualStatus] = useState<null | { type: "ok" | "err"; msg: string }>(null);
  const [pendingAiReceive, setPendingAiReceive] = useState<string | null>(null);
  const [handledAiState, setHandledAiState] = useState(false);

  // Excel insights
  const [excelRows, setExcelRows] = useState<ExcelRow[]>([]);
  const [activeCategory, setActiveCategory] = useState<"range" | "function" | "layout" | "axle" | "length" | "height">("range");

  // Yard Inventory filters (controlled only via charts)
  const [selectedRangeBucket, setSelectedRangeBucket] = useState<string | null>(null);
  const [selectedModelRange, setSelectedModelRange] = useState<string | "All">("All");
  const [selectedType, setSelectedType] = useState<"All" | "Stock" | "Customer">("All");

  useEffect(() => {
    const unsubPGI = subscribeToPGIRecords((data) => setPgi(data || {}));
    const unsubSched = subscribeToSchedule((data) => setSchedule(Array.isArray(data) ? data : []), {
      includeNoChassis: true,
      includeNoCustomer: true,
      includeFinished: true,
    });
    let unsubYard: (() => void) | undefined;
    let unsubHandover: (() => void) | undefined;
    if (dealerSlug) {
      unsubYard = subscribeToYardStock(dealerSlug, (data) => setYard(data || {}));
      unsubHandover = subscribeToHandover(dealerSlug, (data) => setHandover(data || {}));
    }
    return () => {
      unsubPGI?.();
      unsubYard?.();
      unsubSched?.();
      unsubHandover?.();
    };
  }, [dealerSlug]);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("/assets/data/caravan_classification_3.xlsx");
        const buf = await resp.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const first = wb.Sheets[wb.SheetNames[0]];
        const json: ExcelRow[] = XLSX.utils.sheet_to_json(first);
        setExcelRows(json || []);
      } catch (e) {
        console.warn("Failed to load excel(3) for insights:", e);
      }
    })();
  }, []);

  type Sched = Partial<ScheduleItem> & { Chassis?: string; Customer?: string; Model?: string };
  const scheduleByChassis = useMemo(() => {
    const map: Record<string, Sched> = {};
    for (const item of schedule) {
      const sch = (item as unknown) as Sched;
      const ch = toStr(sch.Chassis);
      if (ch) map[ch] = sch;
    }
    return map;
  }, [schedule]);

  const onTheRoadAll = useMemo(() => {
    const entries = Object.entries(pgi || {});
    return entries.map(([chassis, rec]) => ({ chassis, ...rec }));
  }, [pgi]);

  // PGI list date range
  const [startDate, endDate] = useMemo(() => {
    if (rangeType === "custom" && kpiCustomStart && kpiCustomEnd) {
      const s = new Date(customStart);
      const e = new Date(customEnd);
      e.setHours(23, 59, 59, 999);
      return [s, e] as [Date, Date];
    }
    const mapDays: Record<typeof rangeType, number> = { "7d": 7, "30d": 30, "90d": 90, custom: 7 };
    const days = mapDays[rangeType];
    const e = new Date();
    e.setHours(23, 59, 59, 999);
    const s = new Date();
    s.setDate(e.getDate() - (days - 1));
    s.setHours(0, 0, 0, 0);
    return [s, e] as [Date, Date];
  }, [rangeType, customStart, customEnd]);

  const onTheRoadInRange = useMemo(
    () =>
      onTheRoadAll.filter(
        (row) =>
          slugifyDealerName(row.dealer) === dealerSlug &&
          isDateWithinRange(parseDDMMYYYY(row.pgidate || null), startDate, endDate)
      ),
    [onTheRoadAll, dealerSlug, startDate, endDate]
  );

  // KPI date range separate
  const [kpiStartDate, kpiEndDate] = useMemo(() => {
    if (kpiRangeType === "custom" && kpiCustomStart && kpiCustomEnd) {
      const s = new Date(kpiCustomStart);
      const e = new Date(kpiCustomEnd);
      e.setHours(23, 59, 59, 999);
      return [s, e] as [Date, Date];
    }
    const mapDays: Record<typeof kpiRangeType, number> = { "7d": 7, "30d": 30, "90d": 90, custom: 7 };
    const days = mapDays[kpiRangeType];
    const e = new Date();
    e.setHours(23, 59, 59, 999);
    const s = new Date();
    s.setDate(e.getDate() - (days - 1));
    s.setHours(0, 0, 0, 0);
    return [s, e] as [Date, Date];
  }, [kpiRangeType, kpiCustomStart, kpiCustomEnd]);

  // Yard list
  const modelMetaMap = useMemo(() => {
    const map: Record<
      string,
      {
        range: string;
        functionName: string;
        layout: string;
        axle: string;
        length: string;
        height: string;
      }
    > = {};
    excelRows.forEach((r) => {
      const mdl = toStr(r.Model).trim().toLowerCase();
      if (!mdl) return;
      map[mdl] = {
        range: cleanLabel(r["Model Range"]),
        functionName: cleanLabel(r.Function),
        layout: cleanLabel(r.Layout),
        axle: cleanLabel(r.Axle),
        length: cleanLabel(r.Length),
        height: cleanLabel(r.Height),
      };
    });
    return map;
  }, [excelRows]);

  const yardList = useMemo(() => {
    const dealerChassisRecords =
      (yard && typeof yard === "object" && (yard as any)["dealer-chassis"]) ||
      (yard && typeof yard === "object" && (yard as any).dealerChassis) ||
      {};
    const entries = Object.entries(yard || {}).filter(([chassis]) => chassis !== "dealer-chassis");
    return entries.map(([chassis, rec]) => {
      const sch = scheduleByChassis[chassis];
      const customer = toStr(sch?.Customer ?? rec?.customer);
      const rawType = toStr(rec?.type ?? rec?.Type).trim().toLowerCase();
      const normalizedType = (() => {
        if (!rawType) {
          if (/stock$/i.test(customer)) return "Stock";
          return "Customer";
        }
        if (rawType === "stock" || rawType.includes("stock")) return "Stock";
        if (rawType === "customer" || rawType === "retail" || rawType.includes("customer")) return "Customer";
        if (rawType) return cleanLabel(rec?.type ?? rec?.Type);
        return "Customer";
      })();
      const model = toStr(sch?.Model ?? rec?.model);
      const receivedAtISO = rec?.receivedAt ?? null;
      const daysInYard = daysSinceISO(receivedAtISO);
      const key = model.trim().toLowerCase();
      const meta = modelMetaMap[key];
      const modelRange = meta?.range ?? "Unknown";
      const functionName = meta?.functionName ?? "Unknown";
      const layout = meta?.layout ?? "Unknown";
      const axle = meta?.axle ?? "Unknown";
      const length = meta?.length ?? "Unknown";
      const height = meta?.height ?? "Unknown";
      const wholesalePoRecord = (dealerChassisRecords as Record<string, any>)[chassis];
      const wholesalePoValue =
        extractLatestWholesale(wholesalePoRecord) ??
        parseWholesale(
          rec?.wholesalepo ?? rec?.wholesalePo ?? rec?.wholesalePO ?? rec?.price ?? rec?.amount
        );
      const wholesaleDisplay =
        wholesalePoValue == null ? "-" : currencyFormatter.format(wholesalePoValue);
      const vinRaw = extractVin(rec);
      return {
        chassis,
        vinnumber: vinRaw,
        receivedAt: receivedAtISO,
        model,
        customer,
        type: normalizedType,
        daysInYard,
        modelRange,
        functionName,
        layout,
        axle,
        length,
        height,
        wholesalePo: wholesalePoValue,
        wholesaleDisplay,
      };
    });
  }, [yard, scheduleByChassis, modelMetaMap]);

  // KPI calculations using KPI date range
  const kpiPgiCount = useMemo(
    () =>
      onTheRoadAll.filter(
        (row) =>
          slugifyDealerName(row.dealer) === dealerSlug &&
          isDateWithinRange(parseDDMMYYYY(row.pgidate || null), kpiStartDate, kpiEndDate)
      ).length,
    [onTheRoadAll, dealerSlug, kpiStartDate, kpiEndDate]
  );

  const kpiReceivedCount = useMemo(
    () =>
      yardList.filter((x) =>
        isDateWithinRange(x.receivedAt ? new Date(x.receivedAt) : null, kpiStartDate, kpiEndDate)
      ).length,
    [yardList, kpiStartDate, kpiEndDate]
  );

  const handoverList = useMemo(() => {
    const entries = Object.entries(handover || {});
    return entries.map(([chassis, rec]) => {
      const hand: HandoverRec = rec || {};
      const handoverAt = hand?.handoverAt ?? hand?.createdAt ?? null;
      const dealerSlugFromRec = slugifyDealerName(hand?.dealerSlug || hand?.dealerName || "");
      return { chassis, handoverAt, dealerSlugFromRec };
    });
  }, [handover]);

  const kpiHandoverCount = useMemo(
    () =>
      handoverList.filter(
        (x) =>
          dealerSlug === x.dealerSlugFromRec &&
          isDateWithinRange(x.handoverAt ? new Date(x.handoverAt) : null, kpiStartDate, kpiEndDate)
      ).length,
    [handoverList, dealerSlug, kpiStartDate, kpiEndDate]
  );

  const kpiSecondhandCount = useMemo(
    () =>
      handoverList.filter(
        (x) =>
          dealerSlug === x.dealerSlugFromRec &&
          isDateWithinRange(x.handoverAt ? new Date(x.handoverAt) : null, kpiStartDate, kpiEndDate) &&
          isSecondhandChassis(x.chassis)
      ).length,
    [handoverList, dealerSlug, kpiStartDate, kpiEndDate]
  );

  const kpiYardStockCurrent = useMemo(() => {
    const stock = yardList.filter((x) => x.type === "Stock").length;
    const customer = yardList.filter((x) => x.type === "Customer").length;
    return { stock, customer, total: yardList.length };
  }, [yardList]);

  // Yard Range buckets
  const yardRangeBuckets = useMemo(() => {
    return yardRangeDefs.map(({ label, min, max }) => ({
      label,
      count: yardList.filter((x) => x.daysInYard >= min && x.daysInYard <= max).length,
    }));
  }, [yardList]);

  // Yard Inventory display with filters driven by charts only
  const yardListDisplay = useMemo(() => {
    let list = yardList;
    if (selectedRangeBucket) {
      const def = yardRangeDefs.find((d) => d.label === selectedRangeBucket);
      if (def) list = list.filter((x) => x.daysInYard >= def.min && x.daysInYard <= def.max);
    }
    if (selectedModelRange && selectedModelRange !== "All") {
      list = list.filter((x) => x.modelRange === selectedModelRange);
    }
    if (selectedType !== "All") {
      list = list.filter((x) => x.type === selectedType);
    }
    return list;
  }, [yardList, selectedRangeBucket, selectedModelRange, selectedType]);

  // Monthly charts data within KPI range
  const receivedMonthlyData = useMemo(() => {
    const map: Record<string, { key: string; label: string; count: number }> = {};
    yardList.forEach((x) => {
      const d = x.receivedAt ? new Date(x.receivedAt) : null;
      if (!d || !isDateWithinRange(d, kpiStartDate, kpiEndDate)) return;
      const key = fmtMonthKey(d);
      const label = fmtMonthLabel(new Date(d.getFullYear(), d.getMonth(), 1));
      if (!map[key]) map[key] = { key, label, count: 0 };
      map[key].count += 1;
    });
    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key));
  }, [yardList, kpiStartDate, kpiEndDate]);

  const handoversMonthlyData = useMemo(() => {
    const map: Record<string, { key: string; label: string; count: number }> = {};
    handoverList.forEach((x) => {
      const d = x.handoverAt ? new Date(x.handoverAt) : null;
      if (!d) return;
      if (dealerSlug !== x.dealerSlugFromRec || !isDateWithinRange(d, kpiStartDate, kpiEndDate)) return;
      const key = fmtMonthKey(d);
      const label = fmtMonthLabel(new Date(d.getFullYear(), d.getMonth(), 1));
      if (!map[key]) map[key] = { key, label, count: 0 };
      map[key].count += 1;
    });
    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key));
  }, [handoverList, dealerSlug, kpiStartDate, kpiEndDate]);

  // 10-week stock level reverse projection (received=in, handover=out)
  const stockLevel10Weeks = useMemo(() => {
    const now = new Date();
    const latestStart = startOfWeekMonday(now);
    const starts: Date[] = [];
    for (let i = 9; i >= 0; i--) {
      const d = addDays(latestStart, -7 * i);
      starts.push(d);
    }
    const nextStarts = starts.map((s) => addDays(s, 7));

    const receivedByWeek: number[] = starts.map((s, i) => {
      const e = nextStarts[i];
      return yardList.filter((x) => {
        const d = x.receivedAt ? new Date(x.receivedAt) : null;
        return d && d >= s && d < e;
      }).length;
    });

    const handoversByWeek: number[] = starts.map((s, i) => {
      const e = nextStarts[i];
      return handoverList.filter((x) => {
        const d = x.handoverAt ? new Date(x.handoverAt) : null;
        return d && d >= s && d < e && x.dealerSlugFromRec === dealerSlug;
      }).length;
    });

    const netByWeek = starts.map((_, i) => receivedByWeek[i] - handoversByWeek[i]);
    const current = kpiYardStockCurrent.total; // using current yard stock as baseline

    // stock at end of each week in ascending order
    const levels: number[] = starts.map((_, i) => {
      let sumLater = 0;
      for (let j = i + 1; j < netByWeek.length; j++) sumLater += netByWeek[j];
      return Math.max(0, current - sumLater);
    });

    return starts.map((s, i) => ({ week: fmtWeekLabel(s), level: levels[i] }));
  }, [yardList, handoverList, dealerSlug, kpiYardStockCurrent.total]);

  const dealerDisplayName = useMemo(() => prettifyDealerName(dealerSlug), [dealerSlug]);
  const showPriceColumn = PRICE_ENABLED_DEALERS.has(dealerSlug);
  const yardActionsEnabled = !PRICE_ENABLED_DEALERS.has(dealerSlug);

  const handleReceive = async (chassis: string, rec: PGIRec) => {
    try {
      await receiveChassisToYard(dealerSlug, chassis, rec);
    } catch (e) {
      console.error("receive failed", e);
    }
  };

  const handleAddManual = async () => {
    const ch = manualChassis.trim().toUpperCase();
    if (!ch) {
      setManualStatus({ type: "err", msg: "请输入车架号" });
      return;
    }
    try {
      await addManualChassisToYard(dealerSlug, ch);
      setManualStatus({ type: "ok", msg: `已添加 ${ch} 到 Yard` });
      setManualChassis("");
    } catch (e) {
      console.error(e);
      setManualStatus({ type: "err", msg: "添加失败，请重试。" });
    }
  };

  const handleReportIssue = async (row: { chassis: string; model?: string | null }) => {
    if (!REPORT_EMAIL_SERVICE || !REPORT_EMAIL_PUBLIC_KEY || !REPORT_EMAIL_TEMPLATE) {
      toast.error("Reporting configuration is missing.");
      return;
    }

    try {
      await emailjs.send(
        REPORT_EMAIL_SERVICE,
        REPORT_EMAIL_TEMPLATE,
        {
          dealer_slug: dealerSlug,
          chassis: row.chassis,
          model: toStr(row.model) || "-",
        },
        REPORT_EMAIL_PUBLIC_KEY
      );
      toast.success("Report sent successfully.");
    } catch (error) {
      console.error("Failed to send report", error);
      toast.error("Failed to send report. Please try again.");
    }
  };

  useEffect(() => {
    if (handledAiState) return;
    const state = (location.state || {}) as any;
    const chassis = state?.aiPrefillChassis ? String(state.aiPrefillChassis).toUpperCase() : null;
    if (!chassis) return;

    setManualChassis(chassis);
    if (state.aiAction === "receive") {
      setManualStatus({ type: "ok", msg: `已预填 ${chassis}，正在添加...` });
      setPendingAiReceive(chassis);
    }
    if (state.aiAction === "handover") {
      setHandoverData({
        chassis,
        model: null,
        vinnumber: null,
        dealerName: dealerDisplayName,
        dealerSlug,
        handoverAt: new Date().toISOString(),
      });
      setHandoverOpen(true);
    }
    setHandledAiState(true);
  }, [location.state, handledAiState, dealerDisplayName, dealerSlug]);

  useEffect(() => {
    if (!pendingAiReceive) return;
    if (manualChassis.trim().toUpperCase() !== pendingAiReceive) return;
    handleAddManual();
    setPendingAiReceive(null);
  }, [pendingAiReceive, manualChassis, handleAddManual]);

  // Stock Analysis data by category (Stock-only units)
  type AnalysisRow = { name: string; value: number };
  const stockUnits = useMemo(() => yardList.filter((row) => row.type === "Stock"), [yardList]);
  const rangeCounts = useMemo(() => {
    const map: Record<string, number> = {};
    stockUnits.forEach((row) => {
      const key = cleanLabel(row.modelRange);
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [stockUnits]);
  const functionCounts = useMemo(() => {
    const map: Record<string, number> = {};
    stockUnits.forEach((row) => {
      const key = cleanLabel(row.functionName);
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [stockUnits]);
  const layoutCounts = useMemo(() => {
    const map: Record<string, number> = {};
    stockUnits.forEach((row) => {
      const key = cleanLabel(row.layout);
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [stockUnits]);
  const axleCounts = useMemo(() => {
    const map: Record<string, number> = {};
    stockUnits.forEach((row) => {
      const key = cleanLabel(row.axle);
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [stockUnits]);
  const heightCategories = useMemo(() => {
    const map: Record<string, number> = {};
    stockUnits.forEach((row) => {
      const s = toStr(row.height).toLowerCase();
      const label = !s || s === "unknown" ? "Unknown" : s.includes("pop") ? "Pop-top" : "Full Height";
      map[label] = (map[label] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [stockUnits]);
  const lengthBuckets = useMemo(() => {
    const buckets = [
      { label: "<=5.00m", min: 0, max: 5.0 },
      { label: "5.01–7.00m", min: 5.01, max: 7.0 },
      { label: ">=7.01m", min: 7.01, max: 100 },
    ];
    const counts = buckets.map(() => 0);
    stockUnits.forEach((row) => {
      const num = parseNum(row.length);
      if (num == null || isNaN(num)) return;
      const idx = buckets.findIndex((bb) => num >= bb.min && num <= bb.max);
      if (idx >= 0) counts[idx] += 1;
    });
    return buckets.map((b, idx) => ({ name: b.label, value: counts[idx] }));
  }, [stockUnits]);

  const analysisData = useMemo<AnalysisRow[]>(() => {
    switch (activeCategory) {
      case "range":
        return rangeCounts;
      case "function":
        return functionCounts;
      case "layout":
        return layoutCounts;
      case "axle":
        return axleCounts;
      case "length":
        return lengthBuckets;
      case "height":
        return heightCategories;
      default:
        return rangeCounts;
    }
  }, [activeCategory, rangeCounts, functionCounts, layoutCounts, axleCounts, lengthBuckets, heightCategories]);

  const formatDateOnly = (iso?: string | null) => {
    if (!iso) return "-";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleDateString();
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar
        orders={[]}
        selectedDealer="locked"
        onDealerSelect={() => {}}
        hideOtherDealers
        currentDealerName={dealerDisplayName}
        showStats={false}
      />
      <main className="flex-1 p-6 space-y-6 bg-gradient-to-br from-slate-50 via-white to-slate-100">
        <header className="pb-2">
          <h1 className="text-2xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-slate-800 via-blue-700 to-sky-600">
            Yard Inventory & On The Road — {dealerDisplayName}
          </h1>
          <p className="text-muted-foreground mt-1">Manage PGI arrivals and yard inventory for this dealer</p>
        </header>

        {/* On The Road (PGI list) */}
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>On The Road (PGI)</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-9 rounded-md border px-2 text-sm"
                value={rangeType}
                onChange={(e) => setRangeType(e.target.value as typeof rangeType)}
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="custom">Custom</option>
              </select>
              {rangeType === "custom" && (
                <>
                  <Input type="date" className="h-9 w-[160px]" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                  <Input type="date" className="h-9 w-[160px]" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
                </>
              )}
              <div className="text-xs text-slate-500">
                Range: {startDate.toLocaleDateString()} ~ {endDate.toLocaleDateString()}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {onTheRoadInRange.length === 0 ? (
              <div className="text-sm text-slate-500">No PGI records in the selected range.</div>
            ) : (
              <div className="rounded-lg border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-semibold">Chassis</TableHead>
                      <TableHead className="font-semibold">VIN Number</TableHead>
                      <TableHead className="font-semibold">PGI Date</TableHead>
                      <TableHead className="font-semibold">Model</TableHead>
                      <TableHead className="font-semibold">Customer</TableHead>
                      <TableHead className="font-semibold">Days Since PGI</TableHead>
                      <TableHead className="font-semibold">Received</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {onTheRoadInRange.map((row) => {
                      const vin = extractVin(row);
                      return (
                        <TableRow key={row.chassis}>
                          <TableCell className="font-medium">{row.chassis}</TableCell>
                          <TableCell>{vin || "-"}</TableCell>
                          <TableCell>{toStr(row.pgidate) || "-"}</TableCell>
                          <TableCell>{toStr(row.model) || "-"}</TableCell>
                          <TableCell>{toStr(row.customer) || "-"}</TableCell>
                          <TableCell>
                            {(() => {
                              const d = parseDDMMYYYY(row.pgidate);
                              if (!d) return 0;
                              const diff = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
                              return diff < 0 ? 0 : diff;
                            })()}
                          </TableCell>
                          <TableCell>
                            {yardActionsEnabled ? (
                              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleReceive(row.chassis, row)}>
                                Receive
                              </Button>
                            ) : (
                              <span className="text-xs uppercase tracking-wide text-slate-400">Unavailable</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* KPI Cards with independent range */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="text-sm">KPI Overview</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-9 rounded-md border px-2 text-sm"
                value={kpiRangeType}
                onChange={(e) => setKpiRangeType(e.target.value as typeof kpiRangeType)}
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="custom">Custom</option>
              </select>
              {kpiRangeType === "custom" && (
                <>
                  <Input type="date" className="h-9 w-[160px]" value={kpiCustomStart} onChange={(e) => setKpiCustomStart(e.target.value)} />
                  <Input type="date" className="h-9 w-[160px]" value={kpiCustomEnd} onChange={(e) => setKpiCustomEnd(e.target.value)} />
                </>
              )}
              <div className="text-xs text-slate-500">
                Range: {kpiStartDate.toLocaleDateString()} ~ {kpiEndDate.toLocaleDateString()}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">Factory PGI to Dealer</div>
                    <div className="text-2xl font-semibold">{kpiPgiCount}</div>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Truck className="w-5 h-5 text-blue-600" />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">Received Vans</div>
                    <div className="text-2xl font-semibold">{kpiReceivedCount}</div>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <PackageCheck className="w-5 h-5 text-emerald-600" />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">Handovers</div>
                    <div className="text-2xl font-semibold">{kpiHandoverCount}</div>
                    <div className="text-xs text-slate-500 mt-1">Secondhand: <span className="font-medium">{kpiSecondhandCount}</span></div>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
                    <Handshake className="w-5 h-5 text-purple-600" />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">Current Yard Stock</div>
                    <div className="text-2xl font-semibold">{kpiYardStockCurrent.total}</div>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center">
                    <Warehouse className="w-5 h-5 text-slate-700" />
                  </div>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Stock: <span className="text-blue-700 font-medium">{kpiYardStockCurrent.stock}</span> · Customer:{" "}
                  <span className="text-emerald-700 font-medium">{kpiYardStockCurrent.customer}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Received / Monthly Handovers / 10-Week Stock Level */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="border-slate-200 shadow-sm hover:shadow-md transition">
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-sm">Received Vans (Monthly)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={receivedMonthlyData}>
                  <XAxis dataKey="label" />
                  <YAxis allowDecimals={false} />
                  <ReTooltip />
                  <Bar dataKey="count" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm hover:shadow-md transition">
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-sm">Handovers (Monthly)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={handoversMonthlyData}>
                  <XAxis dataKey="label" />
                  <YAxis allowDecimals={false} />
                  <ReTooltip />
                  <Bar dataKey="count" fill="#8b5cf6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm hover:shadow-md transition">
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-sm">Stock Level (Last 10 Weeks)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={stockLevel10Weeks}>
                  <XAxis dataKey="week" />
                  <YAxis allowDecimals={false} />
                  <ReTooltip />
                  <Line type="monotone" dataKey="level" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Side-by-side: Days In Yard (left) + Stock Analysis (right) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Days In Yard Buckets (Left) */}
          <Card className="border-slate-200 shadow-sm hover:shadow-md transition">
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-sm">Days In Yard</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant={selectedRangeBucket === null ? "default" : "outline"}
                  className={selectedRangeBucket === null ? "" : "!bg-transparent !hover:bg-transparent"}
                  onClick={() => setSelectedRangeBucket(null)}
                  title="Clear Days In Yard filter"
                >
                  All
                </Button>
                {yardRangeDefs.map((b) => (
                  <Button
                    key={b.label}
                    variant={selectedRangeBucket === b.label ? "default" : "outline"}
                    className={selectedRangeBucket === b.label ? "" : "!bg-transparent !hover:bg-transparent"}
                    onClick={() => setSelectedRangeBucket((prev) => (prev === b.label ? null : b.label))}
                  >
                    {b.label}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={yardRangeBuckets}>
                  <XAxis dataKey="label" />
                  <YAxis allowDecimals={false} />
                  <ReTooltip />
                  <Bar
                    dataKey="count"
                    fill="#6366f1"
                    onClick={(_, idx: number) => {
                      const label = yardRangeBuckets[idx]?.label;
                      if (label) setSelectedRangeBucket(label);
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Stock Analysis (Right) */}
          <Card className="border-slate-200 shadow-sm hover:shadow-md transition">
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-sm">Stock Analysis</CardTitle>
              <div className="flex flex-wrap gap-2 items-center">
                <div className="flex flex-wrap gap-1">
                  <Button variant={activeCategory === "range" ? "default" : "outline"} className={activeCategory === "range" ? "" : "!bg-transparent !hover:bg-transparent"} onClick={() => setActiveCategory("range")}>Range</Button>
                  <Button variant={activeCategory === "function" ? "default" : "outline"} className={activeCategory === "function" ? "" : "!bg-transparent !hover:bg-transparent"} onClick={() => setActiveCategory("function")}>Function</Button>
                  <Button variant={activeCategory === "layout" ? "default" : "outline"} className={activeCategory === "layout" ? "" : "!bg-transparent !hover:bg-transparent"} onClick={() => setActiveCategory("layout")}>Layout</Button>
                  <Button variant={activeCategory === "axle" ? "default" : "outline"} className={activeCategory === "axle" ? "" : "!bg-transparent !hover:bg-transparent"} onClick={() => setActiveCategory("axle")}>Axle</Button>
                  <Button variant={activeCategory === "length" ? "default" : "outline"} className={activeCategory === "length" ? "" : "!bg-transparent !hover:bg-transparent"} onClick={() => setActiveCategory("length")}>Length</Button>
                  <Button variant={activeCategory === "height" ? "default" : "outline"} className={activeCategory === "height" ? "" : "!bg-transparent !hover:bg-transparent"} onClick={() => setActiveCategory("height")}>Height</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <ResponsiveContainer width="100%" height={220}>
                {activeCategory === "length" ? (
                  <BarChart data={analysisData.map((x) => ({ label: x.name, count: x.value }))}>
                    <XAxis dataKey="label" />
                    <YAxis allowDecimals={false} />
                    <ReTooltip />
                    <Bar dataKey="count" fill="#0ea5e9" />
                  </BarChart>
                ) : (
                  <PieChart>
                    <Pie
                      data={analysisData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      innerRadius={50}
                      onClick={(data: any) => {
                        if (activeCategory === "range" && data?.name) {
                          setSelectedModelRange(String(data.name));
                          setSelectedType("Stock");
                        }
                      }}
                    >
                      {analysisData.map((entry, index) => (
                        <Cell key={`cell-${entry.name}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend />
                    <ReTooltip />
                  </PieChart>
                )}
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Yard Inventory */}
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition">
          <CardHeader className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle>Yard Inventory</CardTitle>
            <div className="flex w-full md:w-auto items-stretch md:items-center gap-2">
              {/* Manual entry on the left */}
              <Input
                placeholder="Enter chassis number manually"
                value={manualChassis}
                onChange={(e) => setManualChassis(e.target.value)}
                className="md:min-w-[240px]"
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
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-600">Type:</span>
              {(["All", "Stock", "Customer"] as const).map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={selectedType === option ? "default" : "outline"}
                  className={selectedType === option ? "" : "!bg-transparent !hover:bg-transparent"}
                  onClick={() => setSelectedType(option)}
                >
                  {option}
                </Button>
              ))}
            </div>
            {yardListDisplay.length === 0 ? (
              <div className="text-sm text-slate-500">No units in yard inventory.</div>
            ) : (
              <div className="rounded-lg border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-semibold">Chassis</TableHead>
                      <TableHead className="font-semibold">VIN Number</TableHead>
                      <TableHead className="font-semibold">Received At</TableHead>
                      <TableHead className="font-semibold">Model</TableHead>
                      {showPriceColumn && <TableHead className="font-semibold">AUD Price (excl. GST)</TableHead>}
                      <TableHead className="font-semibold">Customer</TableHead>
                      <TableHead className="font-semibold">Type</TableHead>
                      <TableHead className="font-semibold">Days In Yard</TableHead>
                      <TableHead className="font-semibold">Report invalid stock</TableHead>
                      <TableHead className="font-semibold">Handover</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {yardListDisplay.map((row) => (
                      <TableRow key={row.chassis}>
                        <TableCell className="font-medium">{row.chassis}</TableCell>
                        <TableCell>{row.vinnumber || "-"}</TableCell>
                        <TableCell>{formatDateOnly(row.receivedAt)}</TableCell>
                        <TableCell>{toStr(row.model) || "-"}</TableCell>
                        {showPriceColumn && <TableCell>{row.wholesaleDisplay}</TableCell>}
                        <TableCell>{toStr(row.customer) || "-"}</TableCell>
                        <TableCell>
                          <span className={row.type === "Stock" ? "text-blue-700 font-medium" : "text-emerald-700 font-medium"}>
                            {row.type}
                          </span>
                        </TableCell>
                        <TableCell>{row.daysInYard}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-amber-500 text-amber-700 hover:bg-amber-50"
                            onClick={() => handleReportIssue(row)}
                          >
                            Report
                          </Button>
                        </TableCell>
                        <TableCell>
                          {yardActionsEnabled ? (
                            <Button
                              size="sm"
                              className="bg-purple-600 hover:bg-purple-700"
                              onClick={() => {
                                setHandoverData({
                                  chassis: row.chassis,
                                  model: row.model,
                                  vinnumber: row.vinnumber ? String(row.vinnumber) : null,
                                  dealerName: dealerDisplayName,
                                  dealerSlug,
                                  handoverAt: new Date().toISOString(),
                                });
                                setHandoverOpen(true);
                              }}
                            >
                              Handover
                            </Button>
                          ) : (
                            <span className="text-xs uppercase tracking-wide text-slate-400">Unavailable</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Handover Modal */}
                <ProductRegistrationForm
          open={handoverOpen}
          onOpenChange={(open) => {
            setHandoverOpen(open);
            if (!open) {
              setHandoverData(null);
            }
          }}
          initial={handoverData}
          onCompleted={async ({ chassis, dealerSlug: slugFromForm }) => {
            const targetSlug = slugFromForm ?? dealerSlug;
            if (!targetSlug || !chassis) return;
            try {
              await dispatchFromYard(targetSlug, chassis);
            } catch (err) {
              console.error("Failed to dispatch from yard after handover:", err);
            } finally {
              setHandoverData(null);
            }
          }}
        />
      </main>
    </div>
  );
}
