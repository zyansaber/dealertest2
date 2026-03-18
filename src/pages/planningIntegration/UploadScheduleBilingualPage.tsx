import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { off, onValue, ref, set } from "firebase/database";

import { database } from "@/lib/firebase";
import type { ScheduleItem } from "@/types";
import type { PlanningLang } from "./i18n";
import { tr } from "./i18n";
import { getPlanningOrderType, isPlanningCustomerOrder } from "./orderType";

type UploadRow = {
  chassis: string;
  plannedChassisWelding: string;
  plannedFinishgoods: string;
};

type StoredMonthlyUpload = {
  rows?: UploadRow[];
  en?: UploadRow[];
  zh?: UploadRow[];
  updatedAt?: string;
};

interface UploadScheduleBilingualPageProps {
  lang: PlanningLang;
}

const normalizeHeader = (value: string) => value.toLowerCase().replace(/\s+/g, "").replace(/_/g, "");
const normalizeChassis = (value: unknown) => String(value ?? "").trim().toUpperCase();
const pad2 = (n: number) => String(n).padStart(2, "0");

const toDmy = (year: number, month: number, day: number) => `${pad2(day)}/${pad2(month)}/${year}`;

const parseDmy = (value: string) => {
  const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ts = new Date(year, month - 1, day).getTime();
  return Number.isNaN(ts) ? null : ts;
};

const valueToText = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d) {
      return toDmy(parsed.y, parsed.m, parsed.d);
    }
    return String(value);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toDmy(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  return String(value ?? "").trim();
};

const parseDateTs = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const dmyTs = parseDmy(trimmed);
  if (dmyTs != null) return dmyTs;
  const ts = Date.parse(trimmed);
  return Number.isNaN(ts) ? null : ts;
};

const parseExcel = async (file: File): Promise<UploadRow[]> => {
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(ab, { type: "array" });
  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  if (!firstSheet) return [];

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
  if (!rows.length) return [];

  const data: UploadRow[] = [];
  rows.forEach((row) => {
    const keyMap = new Map<string, unknown>();
    Object.entries(row).forEach(([k, v]) => keyMap.set(normalizeHeader(k), v));

    const chassis = normalizeChassis(keyMap.get("chassis") ?? keyMap.get("车架号"));
    const plannedChassisWelding = valueToText(keyMap.get("plannedchassiswelding"));
    const plannedFinishgoods = valueToText(keyMap.get("plannedfinishgoods"));

    if (!chassis) return;
    data.push({ chassis, plannedChassisWelding, plannedFinishgoods });
  });

  return data;
};

export default function UploadScheduleBilingualPage({ lang }: UploadScheduleBilingualPageProps) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [monthlyUpload, setMonthlyUpload] = useState<StoredMonthlyUpload>({});
  const [scheduleRows, setScheduleRows] = useState<ScheduleItem[]>([]);

  useEffect(() => {
    const uploadRef = ref(database, `planningTargets/uploadedScheduleBilingual/${month}`);
    const scheduleRef = ref(database, "schedule");

    const uploadHandler = (snapshot: any) => {
      setMonthlyUpload((snapshot.val() as StoredMonthlyUpload) || {});
    };
    const scheduleHandler = (snapshot: any) => {
      const raw = snapshot.val() || {};
      const rows = Object.values(raw)
        .map((item) => (item && typeof item === "object" ? item : null))
        .filter(Boolean) as ScheduleItem[];
      setScheduleRows(rows);
    };

    onValue(uploadRef, uploadHandler);
    onValue(scheduleRef, scheduleHandler);
    return () => {
      off(uploadRef, "value", uploadHandler);
      off(scheduleRef, "value", scheduleHandler);
    };
  }, [month]);

  const mergedTable = useMemo(() => {
    const byChassis = new Map<string, UploadRow>();
    const load = (rows: UploadRow[] = []) => {
      rows.forEach((row) => {
        const current = byChassis.get(row.chassis);
        byChassis.set(row.chassis, {
          chassis: row.chassis,
          plannedChassisWelding: row.plannedChassisWelding || current?.plannedChassisWelding || "",
          plannedFinishgoods: row.plannedFinishgoods || current?.plannedFinishgoods || "",
        });
      });
    };

    load(monthlyUpload.rows);
    load(monthlyUpload.en);
    load(monthlyUpload.zh);

    const scheduleByChassis = new Map<string, ScheduleItem>();
    scheduleRows.forEach((row) => {
      const key = normalizeChassis(row?.Chassis);
      if (key && !scheduleByChassis.has(key)) scheduleByChassis.set(key, row);
    });

    return Array.from(byChassis.values()).map((row) => {
      const schedule = scheduleByChassis.get(row.chassis);
      return {
        ...row,
        forecastProductionDate: schedule?.["Forecast Production Date"] || "",
        requestDeliveryDate: schedule?.["Request Delivery Date"] || "",
        customer: schedule?.Customer || "",
        dealer: schedule?.Dealer || "",
        model: schedule?.Model || "",
        orderReceivedDate: schedule?.["Order Received Date"] || "",
      };
    });
  }, [monthlyUpload, scheduleRows]);

  const analysis = useMemo(() => {
    const customerRows = mergedTable.filter((row) => isPlanningCustomerOrder(getPlanningOrderType(row.customer)));

    let validDurationCount = 0;
    let totalDurationDays = 0;

    const customerRowsWithDays = customerRows.map((row) => {
      const weldingTs = parseDateTs(row.plannedChassisWelding);
      const finishTs = parseDateTs(row.plannedFinishgoods);
      const completionDays = weldingTs != null && finishTs != null ? Math.round((finishTs - weldingTs) / (1000 * 60 * 60 * 24)) : null;

      if (completionDays != null) {
        validDurationCount += 1;
        totalDurationDays += completionDays;
      }

      return { ...row, completionDays };
    });

    return {
      total: mergedTable.length,
      customerCount: customerRows.length,
      customerRatio: mergedTable.length > 0 ? (customerRows.length / mergedTable.length) * 100 : 0,
      avgCompletionDays: validDurationCount > 0 ? totalDurationDays / validDurationCount : null,
      customerRowsWithDays,
    };
  }, [mergedTable]);

  const onSave = async () => {
    setError("");
    setMessage("");

    if (!uploadFile) {
      setError(tr(lang, "Please upload one Excel file.", "请上传一份 Excel 文件。"));
      return;
    }

    try {
      setIsSaving(true);
      const rows = await parseExcel(uploadFile);

      await set(ref(database, `planningTargets/uploadedScheduleBilingual/${month}`), {
        rows,
        updatedAt: new Date().toISOString(),
      });

      setMessage(tr(lang, "Uploaded and saved to Firebase.", "已上传并保存到 Firebase。"));
    } catch (e: any) {
      setError(tr(lang, "Upload failed", "上传失败") + `: ${e?.message || "unknown error"}`);
    } finally {
      setIsSaving(false);
    }
  };

  const downloadTemplate = () => {
    const templateRows = [
      {
        chassis: "EXAMPLE123",
        "planned chassisWelding": "20/03/2026",
        "planned finishgoods": "05/04/2026",
      },
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(templateRows);
    XLSX.utils.book_append_sheet(wb, ws, "upload_template");
    XLSX.writeFile(wb, "planning-upload-template.xlsx");
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">{tr(lang, "Upload Scheduling (EN/CN)", "上传排产中英文")}</h2>
        <p className="mt-1 text-sm text-slate-600">
          {tr(lang, "Upload one Excel file, pick month, auto-link by chassis. Date format: dd/mm/yyyy.", "上传一份 Excel，选择月份，并按车架号自动关联。日期格式：dd/mm/yyyy。")}
        </p>
      </header>

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          {tr(lang, "Month", "月份")}
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>

        <label className="text-sm font-medium text-slate-700">
          {tr(lang, "Upload Excel", "上传 Excel")}
          <input type="file" accept=".xlsx,.xls" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} className="mt-1 block w-full text-sm" />
        </label>

        <div className="md:col-span-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={downloadTemplate} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-slate-800 hover:bg-slate-50">
            {tr(lang, "Download Template", "下载模板")}
          </button>
          <button type="button" onClick={onSave} disabled={isSaving} className="rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-800 disabled:opacity-60">
            {isSaving ? tr(lang, "Saving...", "保存中...") : tr(lang, "Upload to Firebase", "上传到 Firebase")}
          </button>
          {message ? <p className="mt-2 text-sm text-emerald-700">{message}</p> : null}
          {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left text-slate-700">
              <tr>
                {["Chassis", "Planned chassisWelding", "Planned finishgoods", "Forecast Production Date", "Request Delivery Date", "Customer", "Dealer", "Model", "Order Received Date"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mergedTable.map((row) => (
                <tr key={row.chassis} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-3 py-2 font-medium">{row.chassis}</td>
                  <td className="whitespace-nowrap px-3 py-2">{row.plannedChassisWelding}</td>
                  <td className="whitespace-nowrap px-3 py-2">{row.plannedFinishgoods}</td>
                  <td className="whitespace-nowrap px-3 py-2">{row.forecastProductionDate}</td>
                  <td className="whitespace-nowrap px-3 py-2">{row.requestDeliveryDate}</td>
                  <td className="whitespace-nowrap px-3 py-2">{row.customer}</td>
                  <td className="whitespace-nowrap px-3 py-2">{row.dealer}</td>
                  <td className="whitespace-nowrap px-3 py-2">{row.model}</td>
                  <td className="whitespace-nowrap px-3 py-2">{row.orderReceivedDate}</td>
                </tr>
              ))}
              {mergedTable.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                    {tr(lang, "No uploaded data for this month.", "该月份暂无上传数据。")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-lg font-semibold">{tr(lang, "Monthly Upload Analysis", "当月上传分析")}</h3>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">{tr(lang, "Uploaded units", "上传总台数")}</p>
            <p className="text-xl font-semibold text-slate-900">{analysis.total}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">{tr(lang, "Customer units", "客户订单台数")}</p>
            <p className="text-xl font-semibold text-slate-900">{analysis.customerCount}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">{tr(lang, "Customer ratio", "客户订单占比")}</p>
            <p className="text-xl font-semibold text-slate-900">{analysis.customerRatio.toFixed(1)}%</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">{tr(lang, "Avg completion days", "平均完成天数")}</p>
            <p className="text-xl font-semibold text-slate-900">
              {analysis.avgCompletionDays == null ? "-" : analysis.avgCompletionDays.toFixed(1)}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-left text-slate-700">
              <tr>
                {["Chassis", "Customer", "Planned chassisWelding", "Planned finishgoods", "Completion days"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {analysis.customerRowsWithDays.map((row) => (
                <tr key={`analysis-${row.chassis}`} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-3 py-2 font-medium">{row.chassis}</td>
                  <td className="whitespace-nowrap px-3 py-2">{row.customer || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2">{row.plannedChassisWelding || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2">{row.plannedFinishgoods || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2">{row.completionDays == null ? "-" : row.completionDays}</td>
                </tr>
              ))}
              {analysis.customerRowsWithDays.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    {tr(lang, "No customer orders in this month upload.", "该月份上传数据中暂无客户订单。")}
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
