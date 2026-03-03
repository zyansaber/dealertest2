import { useMemo, useState } from "react";

import type { Granularity } from "./types";
import { trackedMilestones } from "./types";

export default function LeavingPortPage({
  trend,
  granularity,
  setGranularity,
}: {
  trend: Array<{ label: string; counts: Record<string, number>; increments: Record<string, number | null> }>;
  granularity: Granularity;
  setGranularity: (g: Granularity) => void;
}) {
  const [metric, setMetric] = useState<(typeof trackedMilestones)[number]>("Purchase Order Sent");
  const series = useMemo(() => trend.map((t) => ({ label: t.label, value: t.counts[metric] })), [trend, metric]);
  const max = Math.max(1, ...series.map((s) => s.value));

  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-2xl font-semibold">Leaving port estimation</h2><p className="text-sm text-slate-600">From 2025-06 with week/month filter.</p></div>
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-sm">Period</label>
        <select value={granularity} onChange={(e) => setGranularity(e.target.value as Granularity)} className="rounded border px-2 py-1 text-sm"><option value="week">Week</option><option value="month">Month</option></select>
        <label className="text-sm">Metric</label>
        <select value={metric} onChange={(e) => setMetric(e.target.value as (typeof trackedMilestones)[number])} className="rounded border px-2 py-1 text-sm">{trackedMilestones.map((m) => <option key={m}>{m}</option>)}</select>
      </div>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {series.map((p) => <div key={p.label} className="mb-2 flex items-center gap-3"><div className="w-52 text-xs">{p.label}</div><div className="h-4 flex-1 rounded bg-slate-100"><div className="h-4 rounded bg-slate-700" style={{ width: `${(p.value/max)*100}%`}} /></div><div className="w-10 text-right text-sm font-semibold">{p.value}</div></div>)}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-auto">
        <table className="min-w-[1700px] divide-y divide-slate-200 text-sm"><thead className="bg-slate-100"><tr><th className="px-3 py-3 text-left font-semibold">{granularity === "week" ? "Week" : "Month"}</th>{trackedMilestones.map((m) => <th key={m} className="px-3 py-3 text-left font-semibold">{m} (weekly count / vs last week)</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{trend.map((t, i) => <tr key={`${t.label}-${i}`} className={i%2===0?"bg-white":"bg-slate-50/60"}><td className="whitespace-nowrap px-3 py-2.5">{t.label}</td>{trackedMilestones.map((m)=>{const inc=t.increments[m];const txt=inc==null?"-":inc>=0?`+${inc}`:String(inc);return <td key={`${t.label}-${m}`} className="whitespace-nowrap px-3 py-2.5">{t.counts[m]} <span className="text-xs text-slate-500">({txt})</span></td>})}</tr>)}</tbody></table>
      </div>
    </>
  );
}
