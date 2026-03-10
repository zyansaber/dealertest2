import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";

import type { PlanningLang } from "./i18n";
import { statusText, tr } from "./i18n";
import { milestoneSequence, phaseCardMap } from "./types";
import type { Row } from "./types";
import { parseDateToTimestamp } from "./utils";

const normalizeChassis = (value: string) => value.trim().toUpperCase();

const formatDate = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text || "-";
};

const parseBatchInput = (value: string) => Array.from(
  new Set(
    value
      .split(/[\s,;\t\n]+/)
      .map((item) => normalizeChassis(item))
      .filter(Boolean),
  ),
);

const statusClass: Record<string, string> = {
  "Melbourn Factory": "bg-emerald-100 text-emerald-800 ring-emerald-200",
  "not confirmed orders": "bg-amber-100 text-amber-800 ring-amber-200",
  "Waiting for sending": "bg-yellow-100 text-yellow-800 ring-yellow-200",
  "Not Start in Longtree": "bg-sky-100 text-sky-800 ring-sky-200",
  "Chassis welding in Longtree": "bg-blue-100 text-blue-800 ring-blue-200",
  "Assembly line Longtree": "bg-indigo-100 text-indigo-800 ring-indigo-200",
  "Finishedin Longtree": "bg-violet-100 text-violet-800 ring-violet-200",
  "Leaving factory from Longtree": "bg-orange-100 text-orange-800 ring-orange-200",
  "waiting in port": "bg-pink-100 text-pink-800 ring-pink-200",
  "On the sea": "bg-cyan-100 text-cyan-800 ring-cyan-200",
  "Melbourn Port": "bg-lime-100 text-lime-800 ring-lime-200",
};

const orderedStatusKeys = [
  "not confirmed orders",
  "Waiting for sending",
  "Not Start in Longtree",
  "Chassis welding in Longtree",
  "Assembly line Longtree",
  "Finishedin Longtree",
  "Leaving factory from Longtree",
  "waiting in port",
  "On the sea",
  "Melbourn Port",
  "Melbourn Factory",
] as const;

const openUrl = (url?: string) => {
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
};

export default function VehicleSearchPage({
  rows,
  specByChassis,
  planByChassis,
  lang,
}: {
  rows: Row[];
  specByChassis: Record<string, string>;
  planByChassis: Record<string, string>;
  lang: PlanningLang;
}) {
  const [batchInput, setBatchInput] = useState("");

  const chassisList = useMemo(() => parseBatchInput(batchInput), [batchInput]);
  const rowByChassis = useMemo(() => new Map(rows.map((row) => [normalizeChassis(row.chassis), row])), [rows]);
  const specByNormalizedChassis = useMemo(
    () => new Map(Object.entries(specByChassis).map(([key, value]) => [normalizeChassis(key), value])),
    [specByChassis],
  );
  const planByNormalizedChassis = useMemo(
    () => new Map(Object.entries(planByChassis).map(([key, value]) => [normalizeChassis(key), value])),
    [planByChassis],
  );

  const results = useMemo(() => chassisList.map((chassis) => {
    const row = rowByChassis.get(chassis);
    if (!row) return { chassis, found: false as const };

    let lastMilestone = "";
    milestoneSequence.forEach((milestone) => {
      const sourceValue = milestone.source === "schedule"
        ? (row.schedule as Record<string, unknown>)?.[milestone.key]
        : row.dateTrack?.[milestone.key];
      if (parseDateToTimestamp(sourceValue) != null) lastMilestone = milestone.key;
    });

    const statusKey = (phaseCardMap[lastMilestone] ?? lastMilestone) || "-";
    const poTs = parseDateToTimestamp(row.schedule["Purchase Order Sent"]);
    const poDays = poTs == null ? "-" : `${Math.max(0, Math.floor((Date.now() - poTs) / 86400000))}`;

    return {
      chassis,
      found: true as const,
      statusKey,
      statusLabel: statusText(lang, statusKey),
      poSentDays: poDays,
      poSent: formatDate(row.schedule["Purchase Order Sent"]),
      chassisWelding: formatDate(row.dateTrack?.chassisWelding),
      assemblyLine: formatDate(row.dateTrack?.assemblyLine),
      finishGoods: formatDate(row.dateTrack?.finishGoods),
      leavingFactory: formatDate(row.dateTrack?.leavingFactory),
      specUrl: specByNormalizedChassis.get(chassis),
      planUrl: planByNormalizedChassis.get(chassis),
      customer: formatDate(row.schedule.Customer),
      dealer: formatDate(row.schedule.Dealer),
      model: formatDate(row.schedule.Model),
      forecastProductionDate: formatDate(row.schedule["Forecast Production Date"]),
    };
  }), [chassisList, rowByChassis, lang, specByNormalizedChassis, planByNormalizedChassis]);

  return (
    <>
      <div className="mb-4 rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-lg bg-slate-900 p-2 text-white"><Search className="h-4 w-4" /></div>
          <h2 className="text-2xl font-semibold">{tr(lang, "Vehicle Status Search", "车辆情况搜索")}</h2>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {tr(lang, "Paste chassis numbers in batch (supports line break / comma / tab).", "支持批量粘贴车架号（换行、逗号、Tab、空格都可）。")}
        </p>
        <textarea
          value={batchInput}
          onChange={(e) => setBatchInput(e.target.value)}
          rows={4}
          placeholder={tr(lang, "Paste chassis numbers here...", "请在这里批量粘贴车架号...")}
          className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-inner focus:border-slate-500 focus:outline-none"
        />
        <p className="mt-2 text-xs text-slate-500">
          {tr(lang, "Total chassis in input", "输入车架号总数")}: <span className="font-semibold text-slate-700">{chassisList.length}</span>
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {orderedStatusKeys.map((key) => (
            <span key={key} className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${statusClass[key] ?? "bg-slate-100 text-slate-700 ring-slate-200"}`}>
              {statusText(lang, key)}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[1450px] divide-y divide-slate-200 text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100">
            <tr>
              {[tr(lang, "Chassis Number", "车架号"), tr(lang, "Current Status", "当前状态"), tr(lang, "PO Sent Days", "PO 发送天数"), tr(lang, "Purchase Order Sent", "采购订单发送"), tr(lang, "chassisWelding", "车架焊接"), tr(lang, "assemblyLine", "总装"), tr(lang, "finishGoods", "完工入库"), tr(lang, "leavingFactory", "离厂"), tr(lang, "spec", "配置表"), tr(lang, "plan", "布局图"), tr(lang, "Customer", "客户"), tr(lang, "Dealer", "经销商"), tr(lang, "Model", "车型"), tr(lang, "Forecast Production Date", "预计生产日期")].map((head) => (
                <th key={head} className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-700">{head}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {results.length === 0 ? (
              <tr>
                <td colSpan={14} className="px-3 py-8 text-center text-slate-500">
                  {tr(lang, "No chassis pasted yet.", "暂未粘贴车架号")}
                </td>
              </tr>
            ) : results.map((item, idx) => (
              <tr key={item.chassis} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-900">{item.chassis}</td>
                {!item.found ? (
                  <>
                    <td className="px-3 py-2 text-rose-600">{tr(lang, "Not found", "未找到")}</td>
                    {Array.from({ length: 12 }).map((_, i) => <td key={`${item.chassis}-missing-${i}`} className="px-3 py-2 text-slate-400">-</td>)}
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${statusClass[item.statusKey] ?? "bg-slate-100 text-slate-700 ring-slate-200"}`}>
                        {item.statusLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-700">{item.poSentDays}</td>
                    <td className="px-3 py-2">{item.poSent}</td>
                    <td className="px-3 py-2">{item.chassisWelding}</td>
                    <td className="px-3 py-2">{item.assemblyLine}</td>
                    <td className="px-3 py-2">{item.finishGoods}</td>
                    <td className="px-3 py-2">{item.leavingFactory}</td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => openUrl(item.specUrl)} disabled={!item.specUrl} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40">
                        <Download className="h-3.5 w-3.5" /> {tr(lang, "Download", "下载")}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => openUrl(item.planUrl)} disabled={!item.planUrl} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40">
                        <Download className="h-3.5 w-3.5" /> {tr(lang, "Download", "下载")}
                      </button>
                    </td>
                    <td className="px-3 py-2">{item.customer}</td>
                    <td className="px-3 py-2">{item.dealer}</td>
                    <td className="px-3 py-2">{item.model}</td>
                    <td className="px-3 py-2">{item.forecastProductionDate}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
