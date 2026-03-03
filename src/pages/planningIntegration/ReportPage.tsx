import { useMemo, type Dispatch, type SetStateAction, useState } from "react";

import type { Granularity } from "./types";
import { trackedMilestones } from "./types";

type TrendPoint = {
  label: string;
  counts: Record<string, number>;
  increments: Record<string, number | null>;
};

function TrendLine({ points }: { points: Array<{ label: string; value: number }> }) {
  const width = 1100;
  const height = 240;
  const pad = 32;
  const max = Math.max(1, ...points.map((p) => p.value));
  const coords = points.map((p, i) => {
    const x = pad + (i * (width - pad * 2)) / Math.max(1, points.length - 1);
    const y = height - pad - (p.value / max) * (height - pad * 2);
    return { ...p, x, y };
  });

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full min-w-[1000px]">
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#cbd5e1" />
        <polyline fill="none" stroke="#334155" strokeWidth="3" points={coords.map((c) => `${c.x},${c.y}`).join(" ")} />
        {coords.map((c) => (
          <g key={c.label}>
            <circle cx={c.x} cy={c.y} r="3" fill="#334155" />
            <text x={c.x} y={c.y - 8} textAnchor="middle" fontSize="10" fill="#0f172a">{c.value}</text>
            <text x={c.x} y={height - 8} textAnchor="middle" fontSize="9" fill="#64748b">{c.label}</text>
          </g>
        ))}
      </svg>
    </div>
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
        <TrendLine points={series} />
      </div>

      <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[1700px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-3 py-3 text-left font-semibold">{granularity === "week" ? "Week" : "Month"}</th>
              {trackedMilestones.map((m) => (
                <th key={m} className="px-3 py-3 text-left font-semibold">{m} (count / vs last)</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {trend.map((t, i) => (
              <tr key={`${t.label}-${i}`} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                <td className="whitespace-nowrap px-3 py-2.5">{t.label}</td>
                {trackedMilestones.map((m) => {
                  const inc = t.increments[m];
                  const txt = inc == null ? "-" : inc >= 0 ? `+${inc}` : String(inc);
                  return (
                    <td key={`${t.label}-${m}`} className="whitespace-nowrap px-3 py-2.5">
                      {t.counts[m]} <span className="text-xs text-slate-500">({txt})</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
