import { useMemo, type Dispatch, type SetStateAction, useState } from "react";

import type { Granularity } from "./types";
import { trackedMilestones } from "./types";

type TrendPoint = {
  label: string;
  counts: Record<string, number>;
};

function BarChart({ points }: { points: Array<{ label: string; value: number }> }) {
  const width = 1100;
  const height = 300;
  const pad = 28;
  const max = Math.max(1, ...points.map((p) => p.value));
  const barArea = width - pad * 2;
  const barGap = points.length > 0 ? Math.min(14, barArea / (points.length * 4)) : 8;
  const barWidth = points.length > 0 ? (barArea - barGap * (points.length - 1)) / points.length : 20;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-72 w-full">
      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#cbd5e1" />
      {points.map((p, i) => {
        const h = (p.value / max) * (height - pad * 2);
        const x = pad + i * (barWidth + barGap);
        const y = height - pad - h;
        return (
          <g key={p.label}>
            <rect x={x} y={y} width={Math.max(6, barWidth)} height={h} rx="4" fill="#334155" />
            <text x={x + barWidth / 2} y={y - 8} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0f172a">{p.value}</text>
            <text x={x + barWidth / 2} y={height - 8} textAnchor="middle" fontSize="9" fill="#64748b">{p.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function ReportPage({ trend, granularity, setGranularity }: { trend: TrendPoint[]; granularity: Granularity; setGranularity: Dispatch<SetStateAction<Granularity>> }) {
  const [metric, setMetric] = useState<(typeof trackedMilestones)[number]>("Left Port");

  const series = useMemo(() => trend.map((t) => ({ label: t.label, value: t.counts[metric] ?? 0 })), [trend, metric]);

  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-semibold">report</h2>
        <p className="text-sm text-slate-600">Weekly/monthly trend from 2025-06 for each milestone.</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-sm">Period</label>
        <select value={granularity} onChange={(e) => setGranularity(e.target.value as Granularity)} className="rounded border px-2 py-1 text-sm">
          <option value="week">Week</option>
          <option value="month">Month</option>
        </select>
        <label className="text-sm">Metric</label>
        <select value={metric} onChange={(e) => setMetric(e.target.value as (typeof trackedMilestones)[number])} className="rounded border px-2 py-1 text-sm">
          {trackedMilestones.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <BarChart points={series} />
      </div>

      <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[1400px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-3 py-3 text-left font-semibold">{granularity === "week" ? "Week" : "Month"}</th>
              {trackedMilestones.map((m) => (
                <th key={m} className="px-3 py-3 text-left font-semibold">{m} count</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {trend.map((t, i) => (
              <tr key={`${t.label}-${i}`} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                <td className="whitespace-nowrap px-3 py-2.5">{t.label}</td>
                {trackedMilestones.map((m) => (
                  <td key={`${t.label}-${m}`} className="whitespace-nowrap px-3 py-2.5">{t.counts[m]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
