import { useEffect, useMemo, useState } from "react";
import { get, off, onValue, ref, set } from "firebase/database";
import { toast } from "sonner";

import { database, subscribeToSpecPlan } from "@/lib/firebase";
import type { CampervanScheduleItem, ScheduleItem } from "@/types";
import type { PlanningLang } from "./i18n";
import { tr } from "./i18n";
import { getPlanningOrderType, planningOrderTypeLabel, type PlanningOrderType } from "./orderType";
import { formatDate, parseDateToTimestamp } from "./utils";

type UploadRow = {
  chassis?: string;
  Chassis?: string;
  plannedChassisWelding?: string;
  plannedFinishgoods?: string;
};

type MonthlyUpload = {
  rows?: UploadRow[];
  en?: UploadRow[];
  zh?: UploadRow[];
};

type UploadCollection = Record<string, MonthlyUpload>;

type OrderFilter = "all" | "stock" | "customer" | "srv-srm";

type UnscheduledRow = {
  source: "trailer" | "campervan";
  chassis: string;
  customer: string;
  dealer: string;
  model: string;
  signedOff: string;
  requestDeliveryDate: string;
  latestExFactoryDate: string;
  recommendedWelding: string;
  recommendedWeldingTs: number | null;
  highlightRecommendedWelding: boolean;
  orderType: PlanningOrderType;
};

const normalizeChassis = (value: unknown) => String(value ?? "").trim().toUpperCase();
const normalizeText = (value: unknown) => String(value ?? "").trim().toUpperCase();

const plusDays = (dateTs: number, days: number) => {
  const d = new Date(dateTs);
  d.setDate(d.getDate() + days);
  return d.getTime();
};

const isNoSignedOff = (value: string) => value.trim().toUpperCase() === "NO";

const parseDdMmYyyyToUtc = (value: unknown) => {
  const text = String(value ?? "").trim();
  const [ddRaw, mmRaw, yyyyRaw] = text.split("/");
  const dd = Number(ddRaw);
  const mm = Number(mmRaw);
  const yyyy = Number(yyyyRaw);
  if (!dd || !mm || !yyyy) return null;
  const dt = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
};

const formatUtcToDdMmYyyy = (dt: Date) => {
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = dt.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const buildLatestExFactoryDate = (requestDeliveryDate: unknown, signedPlansReceived: unknown) => {
  const requestDate = parseDdMmYyyyToUtc(requestDeliveryDate);
  if (requestDate) {
    requestDate.setUTCDate(requestDate.getUTCDate() - 70);
    return requestDate;
  }
  const signedDate = parseDdMmYyyyToUtc(signedPlansReceived);
  if (!signedDate) return null;
  signedDate.setUTCDate(signedDate.getUTCDate() + 140);
  return signedDate;
};

const buildRecommendedWelding = (requestDeliveryDate: string, signedOff: string) => {
  const requestDate = parseDdMmYyyyToUtc(requestDeliveryDate);
  if (requestDate) {
    requestDate.setUTCDate(requestDate.getUTCDate() - 125);
    return {
      text: formatUtcToDdMmYyyy(requestDate),
      ts: requestDate.getTime(),
      highlight: true,
    };
  }

  const signedTs = parseDateToTimestamp(signedOff);
  if (signedTs != null) {
    const nextTs = plusDays(signedTs, 15);
    return {
      text: formatDate(nextTs),
      ts: nextTs,
      highlight: false,
    };
  }

  return { text: "", ts: null, highlight: false };
};

const isSrvSrmModel = (model: string) => {
  const text = normalizeText(model);
  return text.includes("SRV") || text.includes("SRM");
};

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

interface UnscheduledOrdersPageProps {
  lang: PlanningLang;
}

export default function UnscheduledOrdersPage({ lang }: UnscheduledOrdersPageProps) {
  const [scheduleRows, setScheduleRows] = useState<ScheduleItem[]>([]);
  const [campervanRows, setCampervanRows] = useState<CampervanScheduleItem[]>([]);
  const [allUploads, setAllUploads] = useState<UploadCollection>({});
  const [specByChassis, setSpecByChassis] = useState<Record<string, string>>({});
  const [planByChassis, setPlanByChassis] = useState<Record<string, string>>({});
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("all");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [savingChassis, setSavingChassis] = useState<string | null>(null);

  useEffect(() => {
    const scheduleRef = ref(database, "schedule");
    const campervanRef = ref(database, "campervanSchedule");
    const uploadRootRef = ref(database, "planningTargets/uploadedScheduleBilingual");

    const scheduleHandler = (snapshot: any) => {
      const raw = snapshot.val() || {};
      const rows = Object.values(raw)
        .map((item) => (item && typeof item === "object" ? item : null))
        .filter(Boolean) as ScheduleItem[];
      setScheduleRows(rows);
    };

    const campervanHandler = (snapshot: any) => {
      const raw = snapshot.val() || {};
      const rows = Object.values(raw)
        .map((item) => (item && typeof item === "object" ? item : null))
        .filter(Boolean) as CampervanScheduleItem[];
      setCampervanRows(rows);
    };

    const uploadHandler = (snapshot: any) => {
      setAllUploads((snapshot.val() as UploadCollection) || {});
    };

    onValue(scheduleRef, scheduleHandler);
    onValue(campervanRef, campervanHandler);
    onValue(uploadRootRef, uploadHandler);
    const unsubSpecPlan = subscribeToSpecPlan((data) => {
      const maps = buildSpecPlanMaps(data);
      setSpecByChassis(maps.specByChassis);
      setPlanByChassis(maps.planByChassis);
    });

    return () => {
      off(scheduleRef, "value", scheduleHandler);
      off(campervanRef, "value", campervanHandler);
      off(uploadRootRef, "value", uploadHandler);
      unsubSpecPlan?.();
    };
  }, []);

  const uploadedChassisSet = useMemo(() => {
    const set = new Set<string>();
    const collect = (rows: UploadRow[] = []) => {
      rows.forEach((row) => {
        const ch = normalizeChassis(row?.chassis ?? row?.Chassis);
        if (ch) set.add(ch);
      });
    };

    Object.values(allUploads).forEach((upload) => {
      collect(upload?.rows);
      collect(upload?.en);
      collect(upload?.zh);
    });

    return set;
  }, [allUploads]);

  const unscheduledRows = useMemo<UnscheduledRow[]>(() => {
    const out: UnscheduledRow[] = [];

    scheduleRows.forEach((row) => {
      const chassis = normalizeChassis(row?.Chassis);
      if (!chassis || uploadedChassisSet.has(chassis)) return;

      const regentProductionRaw = row?.["Regent Production"];
      const regentProduction = String(regentProductionRaw ?? "").trim();
      if (!(regentProductionRaw == null || regentProduction === "")) return;

      const customer = String(row?.Customer ?? "").trim();
      const signedOff = String(row?.["Signed Plans Received"] ?? "").trim();
      if (isNoSignedOff(signedOff)) return;
      const requestDeliveryDate = String(row?.["Request Delivery Date"] ?? "").trim();
      const latestExFactoryDate = buildLatestExFactoryDate(requestDeliveryDate, signedOff);
      const recommended = buildRecommendedWelding(requestDeliveryDate, signedOff);

      out.push({
        source: "trailer",
        chassis,
        customer,
        dealer: String(row?.Dealer ?? "").trim(),
        model: String(row?.Model ?? "").trim(),
        signedOff,
        requestDeliveryDate,
        latestExFactoryDate: latestExFactoryDate ? formatUtcToDdMmYyyy(latestExFactoryDate) : "",
        recommendedWelding: recommended.text,
        recommendedWeldingTs: recommended.ts,
        highlightRecommendedWelding: recommended.highlight,
        orderType: getPlanningOrderType(customer),
      });
    });

    campervanRows.forEach((row) => {
      const chassis = normalizeChassis(row?.chassisNumber ?? row?.vinNumber);
      if (!chassis || uploadedChassisSet.has(chassis)) return;

      const customer = String(row?.customer ?? "").trim();
      const signedOff = String(row?.signedOrderReceived ?? "").trim();
      if (isNoSignedOff(signedOff)) return;
      const requestDeliveryDate = String(row?.vehiclePlannedEta ?? "").trim();
      const latestExFactoryDate = buildLatestExFactoryDate(requestDeliveryDate, signedOff);
      const recommended = buildRecommendedWelding(requestDeliveryDate, signedOff);

      out.push({
        source: "campervan",
        chassis,
        customer,
        dealer: String(row?.dealer ?? "").trim(),
        model: String(row?.model ?? row?.vehicle ?? "").trim(),
        signedOff,
        requestDeliveryDate,
        latestExFactoryDate: latestExFactoryDate ? formatUtcToDdMmYyyy(latestExFactoryDate) : "",
        recommendedWelding: recommended.text,
        recommendedWeldingTs: recommended.ts,
        highlightRecommendedWelding: recommended.highlight,
        orderType: getPlanningOrderType(customer),
      });
    });

    return out.sort((a, b) => {
      if (a.recommendedWeldingTs != null && b.recommendedWeldingTs != null) {
        return a.recommendedWeldingTs - b.recommendedWeldingTs || a.chassis.localeCompare(b.chassis);
      }
      if (a.recommendedWeldingTs != null) return -1;
      if (b.recommendedWeldingTs != null) return 1;
      return a.chassis.localeCompare(b.chassis);
    });
  }, [scheduleRows, campervanRows, uploadedChassisSet]);

  const filteredRows = useMemo(() => {
    if (orderFilter === "all") return unscheduledRows;
    if (orderFilter === "srv-srm") return unscheduledRows.filter((row) => isSrvSrmModel(row.model));
    return unscheduledRows.filter((row) => row.orderType === orderFilter && !isSrvSrmModel(row.model));
  }, [orderFilter, unscheduledRows]);

  const openUrl = (url?: string) => {
    if (!url) return;
    window.open(url, "_blank");
  };

  const addToPlanning = async (row: UnscheduledRow) => {
    try {
      setSavingChassis(row.chassis);
      const targetRef = ref(database, `planningTargets/uploadedScheduleBilingual/${selectedMonth}`);
      const snap = await get(targetRef);
      const current = (snap.val() as MonthlyUpload | null) || {};
      const existingRows = Array.isArray(current.rows) ? current.rows : [];
      const exists = existingRows.some((item) => normalizeChassis(item?.chassis ?? item?.Chassis) === row.chassis);
      if (exists) {
        toast.error(tr(lang, "This chassis is already in the selected planning month.", "这个 chassis 已经在所选排产月份里。"));
        return;
      }

      const nextRows: UploadRow[] = [
        ...existingRows,
        {
          chassis: row.chassis,
          plannedChassisWelding: row.recommendedWelding,
          plannedFinishgoods: "",
        },
      ];

      await set(targetRef, {
        ...current,
        rows: nextRows,
        updatedAt: new Date().toISOString(),
      });
      toast.success(tr(lang, "Added to planning successfully.", "已成功加入排产。"));
    } catch {
      toast.error(tr(lang, "Failed to add to planning.", "加入排产失败。"));
    } finally {
      setSavingChassis(null);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">{tr(lang, "Unscheduled Orders (New Orders)", "未排产订单（新订单）")}</h2>
        <p className="mt-1 text-sm text-slate-600">
          {tr(
            lang,
            "Show chassis from trailer/campervan schedule but not in any uploaded planning month. Trailer rows only appear when Regent Production is blank or missing. Recommended Planned chassisWelding = Request Delivery Date - 125 days; if Request Delivery Date is empty, fallback to Signed off + 15 days.",
            "显示在拖挂式/自行式排产中，但不在任何已上传月份排产里的 chassis。拖挂式只有在 Regent Production 为空白或不存在时才显示。推荐 Planned chassisWelding = Request Delivery Date - 125 天；如果没有 Request Delivery Date，则回退为 Signed off + 15 天。"
          )}
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-600">
          {tr(lang, "Uploaded months compared", "已比对上传月份数")}: <span className="font-semibold text-slate-900">{Object.keys(allUploads).length}</span>
        </p>
        <p className="mt-2 text-sm text-slate-600">
          {tr(lang, "Unscheduled count", "未排产数量")}: <span className="font-semibold text-slate-900">{filteredRows.length}</span>
        </p>
        <div className="mt-3 max-w-xs">
          <label className="text-sm font-medium text-slate-700">
            {tr(lang, "Planning month for add", "加入排产的月份")}
            <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {([
            ["all", tr(lang, "All", "全部")],
            ["stock", tr(lang, "Stock", "管理订单")],
            ["customer", tr(lang, "Customer", "客户订单")],
            ["srv-srm", "SRV / SRM"],
          ] as Array<[OrderFilter, string]>).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setOrderFilter(key)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${orderFilter === key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left text-slate-700">
              <tr>
                {["Source", "Chassis", "Order Type", "Customer", "Dealer", "Model", "Signed off", "Request Delivery Date", "Latest Ex Factory Date", "Recommended Planned chassisWelding", "Spec", "Plan", "Add to planning"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={`${row.source}-${row.chassis}`} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-3 py-2">{row.source === "trailer" ? tr(lang, "Trailer", "拖挂式") : tr(lang, "Campervan", "自行式")}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium">{row.chassis}</td>
                  <td className="whitespace-nowrap px-3 py-2">{planningOrderTypeLabel(lang, row.orderType)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{row.customer || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2">{row.dealer || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2">{row.model || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2">{row.signedOff || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2">{row.requestDeliveryDate || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2">{row.latestExFactoryDate || "-"}</td>
                  <td className={`whitespace-nowrap px-3 py-2 ${row.highlightRecommendedWelding ? "font-semibold text-rose-600" : ""}`}>{row.recommendedWelding || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2"><button type="button" onClick={() => openUrl(specByChassis[row.chassis])} disabled={!specByChassis[row.chassis]} className="rounded border px-2 py-1 disabled:opacity-40">{tr(lang, "Download", "下载")}</button></td>
                  <td className="whitespace-nowrap px-3 py-2"><button type="button" onClick={() => openUrl(planByChassis[row.chassis])} disabled={!planByChassis[row.chassis]} className="rounded border px-2 py-1 disabled:opacity-40">{tr(lang, "Download", "下载")}</button></td>
                  <td className="whitespace-nowrap px-3 py-2"><button type="button" onClick={() => addToPlanning(row)} disabled={savingChassis === row.chassis} className="rounded bg-slate-900 px-3 py-1 text-white hover:bg-slate-800 disabled:opacity-50">{savingChassis === row.chassis ? tr(lang, "Adding...", "加入中...") : tr(lang, "Add", "加入排产")}</button></td>
                </tr>
              ))}
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-3 py-8 text-center text-slate-500">
                    {tr(lang, "No unscheduled orders for this filter.", "当前筛选下没有未排产新订单。")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
