import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trackedMilestones } from "./types";

export default function TargetPage({
  monthsForTargetInput,
  monthsForDiff,
  targets,
  saveSharedTarget,
  monthlyActuals,
}: {
  monthsForTargetInput: string[];
  monthsForDiff: string[];
  targets: Record<string, number>;
  saveSharedTarget: (month: string, value: number) => Promise<void>;
  monthlyActuals: Record<string, Record<string, number>>;
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

  const totalDifference = useMemo(() => trackedMilestones.reduce((sum, m) => sum + monthsForDiff.reduce((s, month) => s + (differences[m][month] ?? 0), 0), 0), [differences, monthsForDiff]);
  const series = monthsForDiff.map((month) => ({ month, value: differences[metric][month] ?? 0 }));
  const maxAbs = Math.max(1, ...series.map((s) => Math.abs(s.value)));

  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-2xl font-semibold">Target</h2><p className="text-sm text-slate-600">Shared target saved to database. Input allowed until 2026-12.</p></div>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm overflow-auto">
        <table className="min-w-[1000px] text-sm"><thead><tr><th className="px-2 py-2 text-left">Shared Target</th>{monthsForTargetInput.map((m)=><th key={m} className="px-2 py-2 text-left">{m}</th>)}</tr></thead><tbody><tr className="border-t"><td className="px-2 py-2 font-medium">All Metrics</td>{monthsForTargetInput.map((month)=><td key={month} className="px-2 py-2"><input type="number" className="w-24 rounded border px-2 py-1" value={targets[month] ?? 0} onChange={(e)=>saveSharedTarget(month, Number(e.target.value || 0))} /></td>)}</tr></tbody></table>
      </div>
      <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card><CardHeader><CardTitle className="text-sm">Total Difference (Actual - Shared Target)</CardTitle></CardHeader><CardContent><p className={`text-3xl font-bold ${totalDifference>=0?"text-emerald-700":"text-rose-700"}`}>{totalDifference}</p><p className="text-xs text-slate-500">Range: 2025-06 to previous month</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Difference Metric</CardTitle></CardHeader><CardContent><select value={metric} onChange={(e)=>setMetric(e.target.value as (typeof trackedMilestones)[number])} className="rounded border px-2 py-1 text-sm">{trackedMilestones.map((m)=><option key={m} value={m}>{m}</option>)}</select></CardContent></Card>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold">Difference Bar Chart: {metric} (Actual - Shared Target)</div>
        {series.map((s)=><div key={s.month} className="mb-2 flex items-center gap-3"><div className="w-28 text-xs">{s.month}</div><div className="h-4 flex-1 rounded bg-slate-100"><div className={`h-4 rounded ${s.value>=0?"bg-emerald-600":"bg-rose-600"}`} style={{width:`${(Math.abs(s.value)/maxAbs)*100}%`}} /></div><div className="w-16 text-right text-sm font-semibold">{s.value}</div></div>)}
      </div>
    </>
  );
}
