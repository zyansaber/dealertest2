import { useMemo, type Dispatch, type SetStateAction, useState } from "react";

import type { Granularity } from "./types";
import { trackedMilestones } from "./types";
import type { PlanningLang } from "./i18n";
import { metricText, tr } from "./i18n";
import { parseDateToTimestamp } from "./utils";
import type { Row } from "./types";

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

type LeadTimePoint = {
  month: string;
  customerDays: number | null;
  stockDays: number | null;
};

function LeadTimeLineChart({ points }: { points: LeadTimePoint[] }) {
  const width = 1100;
  const height = 320;
  const padLeft = 44;
  const padRight = 20;
  const padTop = 22;
  const padBottom = 44;

  const values = points.flatMap((p) => [p.customerDays, p.stockDays]).filter((v): v is number => v != null);
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);

  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;
  const x = (idx: number) => padLeft + (points.length <= 1 ? innerW / 2 : (idx / (points.length - 1)) * innerW);
  const y = (value: number) => padTop + (1 - (value - min) / Math.max(1, max - min)) * innerH;

  const buildPath = (selector: (p: LeadTimePoint) => number | null) => {
    let path = "";
    points.forEach((p, idx) => {
      const v = selector(p);
      if (v == null) return;
      path += `${path ? " L" : "M"}${x(idx)} ${y(v)}`;
    });
    return path;
  };

  const customerPath = buildPath((p) => p.customerDays);
  const stockPath = buildPath((p) => p.stockDays);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-80 w-full">
      <line x1={padLeft} y1={height - padBottom} x2={width - padRight} y2={height - padBottom} stroke="#cbd5e1" />
      <line x1={padLeft} y1={padTop} x2={padLeft} y2={height - padBottom} stroke="#cbd5e1" />

      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const value = min + (max - min) * ratio;
        const yPos = y(value);
        return (
          <g key={ratio}>
            <line x1={padLeft} y1={yPos} x2={width - padRight} y2={yPos} stroke="#e2e8f0" strokeDasharray="4 4" />
            <text x={padLeft - 8} y={yPos + 4} textAnchor="end" fontSize="10" fill="#64748b">{Math.round(value)}</text>
          </g>
        );
      })}

      {customerPath ? <path d={customerPath} fill="none" stroke="#2563eb" strokeWidth="2.5" /> : null}
      {stockPath ? <path d={stockPath} fill="none" stroke="#16a34a" strokeWidth="2.5" /> : null}

      {points.map((p, idx) => (
        <g key={p.month}>
          <text x={x(idx)} y={height - 12} textAnchor="middle" fontSize="9" fill="#64748b">{p.month.slice(5)}</text>
          {p.customerDays != null ? <circle cx={x(idx)} cy={y(p.customerDays)} r="3.5" fill="#2563eb" /> : null}
          {p.stockDays != null ? <circle cx={x(idx)} cy={y(p.stockDays)} r="3.5" fill="#16a34a" /> : null}
        </g>
      ))}
    </svg>
  );
}

export default function ReportPage({ trend, rows, granularity, setGranularity, lang }: { trend: TrendPoint[]; rows: Row[]; granularity: Granularity; setGranularity: Dispatch<SetStateAction<Granularity>>; lang: PlanningLang }) {
  const [metric, setMetric] = useState<(typeof trackedMilestones)[number]>("Left Port");

  const series = useMemo(() => trend.map((t) => ({ label: t.label, value: t.counts[metric] ?? 0 })), [trend, metric]);

  const leadTimeTrendByLeftPortMonth = useMemo<LeadTimePoint[]>(() => {
    const from = new Date(new Date().getFullYear() - 1, 5, 1).getTime();
    const now = Date.now();
    const monthMap = new Map<string, { customer: number[]; stock: number[] }>();

    rows.forEach((row) => {
      const leftPortTs = parseDateToTimestamp(row.dateTrack?.["Left Port"]);
      const signedTs = parseDateToTimestamp((row.schedule as any)?.["Signed Plans Received"]);
      const forecastTs = parseDateToTimestamp((row.schedule as any)?.["Forecast Production Date"]);
      if (leftPortTs == null || signedTs == null || forecastTs == null) return;
      if (leftPortTs < from || leftPortTs > now) return;

      const productionDays = (forecastTs - signedTs) / (24 * 60 * 60 * 1000);
      if (!Number.isFinite(productionDays) || productionDays <= 0) return;

      const melbourneFactoryLeadDays = productionDays + 25;
      const month = `${new Date(leftPortTs).getFullYear()}-${String(new Date(leftPortTs).getMonth() + 1).padStart(2, "0")}`;
      const customerRaw = String((row.schedule as any)?.Customer ?? "").trim().toLowerCase();
      const isStock = customerRaw.endsWith("stock");

      if (!monthMap.has(month)) monthMap.set(month, { customer: [], stock: [] });
      const bucket = monthMap.get(month)!;
      if (isStock) bucket.stock.push(melbourneFactoryLeadDays);
      else bucket.customer.push(melbourneFactoryLeadDays);
    });

    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, values]) => ({
        month,
        customerDays: values.customer.length ? values.customer.reduce((sum, v) => sum + v, 0) / values.customer.length : null,
        stockDays: values.stock.length ? values.stock.reduce((sum, v) => sum + v, 0) / values.stock.length : null,
      }));
  }, [rows]);

  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-semibold">{tr(lang, "report", "报表")}</h2>
        <p className="text-sm text-slate-600">{tr(lang, "Weekly/monthly trend from 2025-06 for each milestone.", "从 2025-06 起按周/月查看各节点趋势。")}</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-sm">{tr(lang, "Period", "周期")}</label>
        <select value={granularity} onChange={(e) => setGranularity(e.target.value as Granularity)} className="rounded border px-2 py-1 text-sm">
          <option value="week">{tr(lang, "Week", "周")}</option>
          <option value="month">{tr(lang, "Month", "月")}</option>
        </select>
        <label className="text-sm">{tr(lang, "Metric", "指标")}</label>
        <select value={metric} onChange={(e) => setMetric(e.target.value as (typeof trackedMilestones)[number])} className="rounded border px-2 py-1 text-sm">
          {trackedMilestones.map((m) => (
            <option key={m} value={m}>{metricText(lang, m)}</option>
          ))}
        </select>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <BarChart points={series} />
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">
          {tr(lang, "Longtree production duration trend by Left Port month", "按 Left Port 月份统计的 Longtree 生产时长趋势")}
        </h3>
        <p className="mb-2 text-xs text-slate-600">
          {tr(
            lang,
            "From last June, metric = monthly avg(Forecast Production Date - Signed Plans Received) + 25 days (Melbourne factory), split by customer and stock orders.",
            "从去年 6 月起，按月计算 (Forecast Production Date - Signed Plans Received) 平均值 + 25 天（墨尔本工厂），并区分 customer 与 stock。",
          )}
        </p>
        <div className="mb-2 flex items-center gap-4 text-xs">
          <span className="inline-flex items-center gap-1 text-blue-700"><span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-600" />customer</span>
          <span className="inline-flex items-center gap-1 text-green-700"><span className="inline-block h-2.5 w-2.5 rounded-full bg-green-600" />stock</span>
        </div>
        {leadTimeTrendByLeftPortMonth.length > 0 ? (
          <LeadTimeLineChart points={leadTimeTrendByLeftPortMonth} />
        ) : (
          <p className="text-sm text-slate-500">{tr(lang, "No data in selected range.", "所选范围暂无数据。")}</p>
        )}
      </div>

      <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[1400px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-3 py-3 text-left font-semibold">{granularity === "week" ? tr(lang, "Week", "周") : tr(lang, "Month", "月")}</th>
              {trackedMilestones.map((m) => (
                <th key={metricText(lang, m)} className="px-3 py-3 text-left font-semibold">{metricText(lang, m)} {tr(lang, "count", "数量")}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {trend.map((t, i) => (
              <tr key={`${t.label}-${i}`} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                <td className="whitespace-nowrap px-3 py-2.5">{t.label}</td>
                {trackedMilestones.map((m) => (
                  <td key={`${t.label}-${metricText(lang, m)}`} className="whitespace-nowrap px-3 py-2.5">{t.counts[m]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
