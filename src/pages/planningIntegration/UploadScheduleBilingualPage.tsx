import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { off, onValue, ref, set } from "firebase/database";

import { database } from "@/lib/firebase";
import type { ScheduleItem } from "@/types";
import type { PlanningLang } from "./i18n";
import { tr } from "./i18n";

type UploadRow = {
  chassis: string;
  plannedChassisWelding: string;
  plannedFinishgoods: string;
};

type StoredMonthlyUpload = {
  en?: UploadRow[];
  zh?: UploadRow[];
  updatedAt?: string;
};

interface UploadScheduleBilingualPageProps {
  lang: PlanningLang;
}

const normalizeHeader = (value: string) => value.toLowerCase().replace(/\s+/g, "").replace(/_/g, "");
const normalizeChassis = (value: unknown) => String(value ?? "").trim().toUpperCase();
const valueToText = (value: unknown) => String(value ?? "").trim();

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
  const [englishFile, setEnglishFile] = useState<File | null>(null);
  const [chineseFile, setChineseFile] = useState<File | null>(null);
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

  const onSave = async () => {
    setError("");
    setMessage("");

    if (!englishFile || !chineseFile) {
      setError(tr(lang, "Please upload both English and Chinese files.", "请同时上传英文和中文文件。"));
      return;
    }

    try {
      setIsSaving(true);
      const [enRows, zhRows] = await Promise.all([parseExcel(englishFile), parseExcel(chineseFile)]);

      await set(ref(database, `planningTargets/uploadedScheduleBilingual/${month}`), {
        en: enRows,
        zh: zhRows,
        updatedAt: new Date().toISOString(),
      });

      setMessage(tr(lang, "Uploaded and saved to Firebase.", "已上传并保存到 Firebase。"));
    } catch (e: any) {
      setError(tr(lang, "Upload failed", "上传失败") + `: ${e?.message || "unknown error"}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">{tr(lang, "Upload Scheduling (EN/CN)", "上传排产中英文")}</h2>
        <p className="mt-1 text-sm text-slate-600">
          {tr(lang, "Upload two Excel files, pick month, and auto-link by chassis.", "上传两个 Excel，选择月份，并按车架号自动关联。")}
        </p>
      </header>

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
        <label className="text-sm font-medium text-slate-700">
          {tr(lang, "Month", "月份")}
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>

        <label className="text-sm font-medium text-slate-700">
          {tr(lang, "English Excel", "英文 Excel")}
          <input type="file" accept=".xlsx,.xls" onChange={(e) => setEnglishFile(e.target.files?.[0] || null)} className="mt-1 block w-full text-sm" />
        </label>

        <label className="text-sm font-medium text-slate-700">
          {tr(lang, "Chinese Excel", "中文 Excel")}
          <input type="file" accept=".xlsx,.xls" onChange={(e) => setChineseFile(e.target.files?.[0] || null)} className="mt-1 block w-full text-sm" />
        </label>

        <div className="md:col-span-3">
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
    </div>
  );
}
