import { useEffect, useMemo, useState } from "react";
import { off, onValue, ref } from "firebase/database";

import { database } from "@/lib/firebase";
import type { CampervanScheduleItem, ScheduleItem } from "@/types";
import type { PlanningLang } from "./i18n";
import { tr } from "./i18n";
import { formatDate, parseDateToTimestamp } from "./utils";

type UploadRow = {
  chassis?: string;
  Chassis?: string;
};

type MonthlyUpload = {
  rows?: UploadRow[];
  en?: UploadRow[];
  zh?: UploadRow[];
};

type UploadCollection = Record<string, MonthlyUpload>;

type UnscheduledRow = {
  source: "trailer" | "campervan";
  chassis: string;
  customer: string;
  dealer: string;
  model: string;
  signedOff: string;
  recommendedWelding: string;
};

const normalizeChassis = (value: unknown) => String(value ?? "").trim().toUpperCase();

const plusDays = (dateTs: number, days: number) => {
  const d = new Date(dateTs);
  d.setDate(d.getDate() + days);
  return d.getTime();
};

interface UnscheduledOrdersPageProps {
  lang: PlanningLang;
}

export default function UnscheduledOrdersPage({ lang }: UnscheduledOrdersPageProps) {
  const [scheduleRows, setScheduleRows] = useState<ScheduleItem[]>([]);
  const [campervanRows, setCampervanRows] = useState<CampervanScheduleItem[]>([]);
  const [allUploads, setAllUploads] = useState<UploadCollection>({});

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

    return () => {
      off(scheduleRef, "value", scheduleHandler);
      off(campervanRef, "value", campervanHandler);
      off(uploadRootRef, "value", uploadHandler);
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

      const signedOff = String(row?.["Signed Plans Received"] ?? "").trim();
      const signedTs = parseDateToTimestamp(signedOff);
      const recommendedWelding = signedTs != null ? formatDate(plusDays(signedTs, 15)) : "";

      out.push({
        source: "trailer",
        chassis,
        customer: String(row?.Customer ?? "").trim(),
        dealer: String(row?.Dealer ?? "").trim(),
        model: String(row?.Model ?? "").trim(),
        signedOff,
        recommendedWelding,
      });
    });

    campervanRows.forEach((row) => {
      const chassis = normalizeChassis(row?.chassisNumber ?? row?.vinNumber);
      if (!chassis || uploadedChassisSet.has(chassis)) return;

      const signedOff = String(row?.signedOrderReceived ?? "").trim();
      const signedTs = parseDateToTimestamp(signedOff);
      const recommendedWelding = signedTs != null ? formatDate(plusDays(signedTs, 15)) : "";

      out.push({
        source: "campervan",
        chassis,
        customer: String(row?.customer ?? "").trim(),
        dealer: String(row?.dealer ?? "").trim(),
        model: String(row?.model ?? row?.vehicle ?? "").trim(),
        signedOff,
        recommendedWelding,
      });
    });

    return out.sort((a, b) => a.chassis.localeCompare(b.chassis));
  }, [scheduleRows, campervanRows, uploadedChassisSet]);

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">{tr(lang, "Unscheduled Orders (New Orders)", "未排产订单（新订单）")}</h2>
        <p className="mt-1 text-sm text-slate-600">
          {tr(
            lang,
            "Show chassis from trailer/campervan schedule but not in any uploaded planning month. Trailer rows only appear when Regent Production is blank or missing. Recommended Planned chassisWelding = Signed off + 15 days.",
            "显示在拖挂式/自行式排产中，但不在任何已上传月份排产里的 chassis。拖挂式只有在 Regent Production 为空白或不存在时才显示。推荐 Planned chassisWelding = Signed off + 15 天。"
          )}
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-600">
          {tr(lang, "Uploaded months compared", "已比对上传月份数")}: <span className="font-semibold text-slate-900">{Object.keys(allUploads).length}</span>
        </p>
        <p className="mt-2 text-sm text-slate-600">
          {tr(lang, "Unscheduled count", "未排产数量")}: <span className="font-semibold text-slate-900">{unscheduledRows.length}</span>
        </p>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left text-slate-700">
              <tr>
                {["Source", "Chassis", "Customer", "Dealer", "Model", "Signed off", "Recommended Planned chassisWelding"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {unscheduledRows.map((row) => (
                <tr key={`${row.source}-${row.chassis}`} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-3 py-2">{row.source === "trailer" ? tr(lang, "Trailer", "拖挂式") : tr(lang, "Campervan", "自行式")}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium">{row.chassis}</td>
                  <td className="whitespace-nowrap px-3 py-2">{row.customer || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2">{row.dealer || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2">{row.model || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2">{row.signedOff || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2">{row.recommendedWelding || "-"}</td>
                </tr>
              ))}
              {unscheduledRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    {tr(lang, "No unscheduled orders.", "没有未排产新订单。")}
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
