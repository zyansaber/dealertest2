import { useMemo, useState } from "react";

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

    const statusKey = phaseCardMap[lastMilestone] ?? lastMilestone ?? "Unknown";

    return {
      chassis,
      found: true as const,
      status: statusText(lang, statusKey),
      poSent: formatDate(row.schedule["Purchase Order Sent"]),
      chassisWelding: formatDate(row.dateTrack?.chassisWelding),
      assemblyLine: formatDate(row.dateTrack?.assemblyLine),
      finishGoods: formatDate(row.dateTrack?.finishGoods),
      leavingFactory: formatDate(row.dateTrack?.leavingFactory),
      spec: specByChassis[chassis] ?? "-",
      plan: planByChassis[chassis] ?? "-",
      customer: formatDate(row.schedule.Customer),
      dealer: formatDate(row.schedule.Dealer),
      model: formatDate(row.schedule.Model),
      forecastProductionDate: formatDate(row.schedule["Forecast Production Date"]),
    };
  }), [chassisList, rowByChassis, lang, specByChassis, planByChassis]);

  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-semibold">{tr(lang, "Vehicle Status Search", "车辆情况搜索")}</h2>
        <p className="mt-2 text-sm text-slate-600">
          {tr(lang, "Paste chassis numbers in batch (supports line break / comma / tab).", "支持批量粘贴车架号（换行、逗号、Tab 都可）。")}
        </p>
        <textarea
          value={batchInput}
          onChange={(e) => setBatchInput(e.target.value)}
          rows={5}
          placeholder={tr(lang, "Paste chassis numbers here...", "请在这里粘贴车架号...")}
          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <p className="mt-2 text-xs text-slate-500">
          {tr(lang, "Total chassis in input", "输入车架号总数")}：{chassisList.length}
        </p>
      </div>

      <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[1700px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-100">
            <tr>
              {[
                tr(lang, "Chassis Number", "车架号"),
                tr(lang, "Current Status", "当前状态"),
                "Purchase Order Sent",
                "chassisWelding",
                "assemblyLine",
                "finishGoods",
                "leavingFactory",
                "spec",
                "plan",
                tr(lang, "Customer", "客户"),
                tr(lang, "Dealer", "经销商"),
                tr(lang, "Model", "车型"),
                tr(lang, "Forecast Production Date", "预测生产日期"),
              ].map((head) => (
                <th key={head} className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-700">{head}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {results.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-3 py-8 text-center text-slate-500">
                  {tr(lang, "No chassis pasted yet.", "暂未粘贴车架号")}
                </td>
              </tr>
            ) : results.map((item) => (
              <tr key={item.chassis} className="hover:bg-slate-50">
                <td className="px-3 py-2 font-medium text-slate-900">{item.chassis}</td>
                {!item.found ? (
                  <>
                    <td className="px-3 py-2 text-rose-600">{tr(lang, "Not found", "未找到")}</td>
                    {Array.from({ length: 11 }).map((_, i) => <td key={`${item.chassis}-missing-${i}`} className="px-3 py-2 text-slate-400">-</td>)}
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2">{item.status}</td>
                    <td className="px-3 py-2">{item.poSent}</td>
                    <td className="px-3 py-2">{item.chassisWelding}</td>
                    <td className="px-3 py-2">{item.assemblyLine}</td>
                    <td className="px-3 py-2">{item.finishGoods}</td>
                    <td className="px-3 py-2">{item.leavingFactory}</td>
                    <td className="px-3 py-2 break-all text-xs text-blue-700">{item.spec}</td>
                    <td className="px-3 py-2 break-all text-xs text-blue-700">{item.plan}</td>
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
