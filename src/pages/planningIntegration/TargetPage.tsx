import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trackedMilestones } from "./types";
import type { PlanningLang } from "./i18n";
import { metricText, tr } from "./i18n";

export default function TargetPage({
  monthsForTargetInput,
  monthsForDiff,
  targets,
  saveSharedTarget,
  monthlyActuals,
  lang,
}: {
  monthsForTargetInput: string[];
  monthsForDiff: string[];
  targets: Record<string, number>;
  saveSharedTarget: (month: string, value: number) => Promise<void>;
  monthlyActuals: Record<string, Record<string, number>>;
  lang: PlanningLang;
}) {
  const [metric, setMetric] = useState<(typeof trackedMilestones)[number]>("leavingFactory");

  const differences = useMemo(() => {
    const out: Record<string, Record<string, number>> = {};
    trackedMilestones.forEach((m) => {
      out[m] = {};
      monthsForDiff.forEach((month) => {
        out[m][month] = (monthlyActuals[m]?.[month] ?? 0) - (targets[month] ?? 0);
      });
    });
    return out;
  }, [monthsForDiff, monthlyActuals, targets]);

  const series = monthsForDiff.map((month) => ({ month, value: differences[metric][month] ?? 0 }));
  const totalDifference = useMemo(() => series.reduce((sum, x) => sum + x.value, 0), [series]);
  const maxAbs = Math.max(1, ...series.map((s) => Math.abs(s.value)));

  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-semibold">{tr(lang, "Target", "目标")}</h2>
        <p className="text-sm text-slate-600">{tr(lang, "Shared monthly target saved to Firebase (2025-06 ~ 2026-12).", "共享月度目标已保存到 Firebase（2025-06 ~ 2026-12）。")}</p>
      </div>

      <div className="mb-4 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[1400px] text-sm">
          <thead className="bg-slate-900 text-white">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-900 px-4 py-3 text-left font-semibold">{tr(lang, "Shared Target", "共享目标")}</th>
              {monthsForTargetInput.map((m) => (
                <th key={metricText(lang, m)} className="px-3 py-3 text-left font-semibold">{metricText(lang, m)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-200 bg-white">
              <td className="sticky left-0 bg-white px-4 py-3 font-medium">{tr(lang, "All Metrics", "全部指标")}</td>
              {monthsForTargetInput.map((month) => (
                <td key={month} className="px-3 py-2">
                  <input
                    type="number"
                    className="w-24 rounded-md border border-slate-300 bg-slate-50 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
                    value={targets[month] ?? 0}
                    onChange={(e) => saveSharedTarget(month, Number(e.target.value || 0))}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-sm">Total Difference (Actual - {tr(lang, "Shared Target", "共享目标")})</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-4xl font-bold tracking-tight ${totalDifference >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{totalDifference}</p>
            <p className="text-xs text-slate-500">{tr(lang, "Selected metric only · 2025-06 to previous month", "仅当前指标 · 2025-06 至上月")}</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-sm">{tr(lang, "Difference Metric", "差值指标")}</CardTitle>
          </CardHeader>
          <CardContent>
            <select value={metric} onChange={(e) => setMetric(e.target.value as (typeof trackedMilestones)[number])} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm">
              {trackedMilestones.map((m) => (
                <option key={m} value={m}>{metricText(lang, m)}</option>
              ))}
            </select>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold">Difference Bar Chart: {metric} (Actual - {tr(lang, "Shared Target", "共享目标")})</div>
        {series.map((s) => (
          <div key={s.month} className="mb-2 flex items-center gap-3">
            <div className="w-28 text-xs text-slate-600">{s.month}</div>
            <div className="h-4 flex-1 rounded bg-slate-100">
              <div
                className={`h-4 rounded ${s.value >= 0 ? "bg-emerald-500" : "bg-rose-500"}`}
                style={{ width: `${(Math.abs(s.value) / maxAbs) * 100}%` }}
              />
            </div>
            <div className={`w-16 text-right text-sm font-semibold ${s.value >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{s.value}</div>
          </div>
        ))}
      </div>
    </>
  );
}
