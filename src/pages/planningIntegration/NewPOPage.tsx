import { useMemo, useState } from "react";

import type { Row } from "./types";
import type { PlanningLang } from "./i18n";
import { tr } from "./i18n";
import { parseDateToTimestamp, displayValue } from "./utils";

export default function NewPOPage({ rows, specByChassis, planByChassis, lang }: { rows: Row[]; specByChassis: Record<string, string>; planByChassis: Record<string, string>; lang: PlanningLang }) {
  const [period, setPeriod] = useState<"week" | "month">("week");

  const data = useMemo(() => {
    const now = Date.now();
    const range = period === "week" ? 7 : 30;
    const from = now - range * 86400000;
    return rows
      .map((r) => {
        const posTs = parseDateToTimestamp((r.schedule as any)?.["Purchase Order Sent"]);
        return { ...r, posTs };
      })
      .filter((r) => r.posTs != null && (r.posTs as number) >= from && (r.posTs as number) <= now)
      .sort((a, b) => Number(b.posTs) - Number(a.posTs));
  }, [rows, period]);

  const openUrl = (url?: string) => {
    if (!url) return;
    window.open(url, "_blank");
  };

  const downloadAll = () => {
    const urls = data.flatMap((r) => [specByChassis[r.chassis], planByChassis[r.chassis]]).filter(Boolean) as string[];
    urls.forEach((u, i) => setTimeout(() => window.open(u, "_blank"), i * 80));
  };

  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold">{tr(lang, "New PO", "新下 PO")}</h2>
          <div className="flex items-center gap-2">
            <select value={period} onChange={(e) => setPeriod(e.target.value as "week" | "month")} className="rounded border px-2 py-1 text-sm">
              <option value="week">{tr(lang, "Within 1 week", "一周内")}</option>
              <option value="month">{tr(lang, "Within 1 month", "一个月内")}</option>
            </select>
            <button type="button" onClick={downloadAll} className="rounded-md border border-slate-300 bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
              {tr(lang, "Download all spec & plan", "批量下载 spec & plan")}
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[1200px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-3 py-3 text-left">{tr(lang, "Chassis", "底盘号")}</th>
              <th className="px-3 py-3 text-left">{tr(lang, "Model", "车型")}</th>
              <th className="px-3 py-3 text-left">{tr(lang, "Purchase Order Sent", "采购单发送")}</th>
              <th className="px-3 py-3 text-left">{tr(lang, "Spec", "Spec")}</th>
              <th className="px-3 py-3 text-left">{tr(lang, "Plan", "Plan")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((r) => (
              <tr key={`newpo-${r.chassis}`}>
                <td className="px-3 py-2.5">{displayValue((r.schedule as any)?.Chassis ?? r.chassis)}</td>
                <td className="px-3 py-2.5">{displayValue((r.schedule as any)?.Model)}</td>
                <td className="px-3 py-2.5">{displayValue((r.schedule as any)?.["Purchase Order Sent"])}</td>
                <td className="px-3 py-2.5"><button type="button" onClick={() => openUrl(specByChassis[r.chassis])} disabled={!specByChassis[r.chassis]} className="rounded border px-2 py-1 disabled:opacity-40">{tr(lang, "Download", "下载")}</button></td>
                <td className="px-3 py-2.5"><button type="button" onClick={() => openUrl(planByChassis[r.chassis])} disabled={!planByChassis[r.chassis]} className="rounded border px-2 py-1 disabled:opacity-40">{tr(lang, "Download", "下载")}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
