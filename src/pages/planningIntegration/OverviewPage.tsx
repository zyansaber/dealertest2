import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getModelRange } from "@/lib/targetHighlight";
import { milestoneSequence, phaseCardMap } from "./types";
import { parseDateToTimestamp } from "./utils";
import type { Row } from "./types";
import type { PlanningLang } from "./i18n";
import { statusText, tr } from "./i18n";

type Mode = "customer" | "group" | "modelRange";

const FACTORY_DEALER_NAMES = ["Frankston", "Launceston", "ST James", "Traralgon", "Geelong"];
const GREEN_RV_NAMES = ["Green Show", "Slacks Creek", "Forest Glen"];
const NEW_ZEALAND_NAMES = ["Christchurch", "CMG Campers", "Marsden Point"];
const JV_NAMES = ["Heatherbrae", "Gympie", "Toowoomba", "Bundaberg", "Townsville"];

const normalize = (v: string) => v.trim().toLowerCase();

const resolveDealerGroup = (dealer: string) => {
  const value = normalize(dealer);
  if (!value) return "EXTERNAL DEALERS";
  if (FACTORY_DEALER_NAMES.some((name) => value.includes(normalize(name)))) return "FACTORY DEALER";
  if (GREEN_RV_NAMES.some((name) => value.includes(normalize(name)))) return "GREEN RV";
  if (NEW_ZEALAND_NAMES.some((name) => value.includes(normalize(name)))) return "NEW ZEALAND";
  if (JV_NAMES.some((name) => value.includes(normalize(name)))) return "JV";
  return "EXTERNAL DEALERS";
};

function LineChart({ points, color }: { points: Array<{ label: string; value: number }>; color: string }) {
  const width = 980;
  const height = 280;
  const pad = 24;
  const max = Math.max(1, ...points.map((p) => p.value));
  const min = Math.min(0, ...points.map((p) => p.value));
  const span = Math.max(1, max - min);

  const coords = points.map((p, i) => {
    const x = pad + (i * (width - pad * 2)) / Math.max(1, points.length - 1);
    const y = height - pad - ((p.value - min) / span) * (height - pad * 2);
    return { ...p, x, y };
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-72 w-full">
      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#cbd5e1" />
      <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="#cbd5e1" />
      <polyline fill="none" stroke={color} strokeWidth="3" points={coords.map((c) => `${c.x},${c.y}`).join(" ")} />
      {coords.map((c) => (
        <g key={c.label}>
          <circle cx={c.x} cy={c.y} r="4" fill={color} />
          <text x={c.x} y={c.y - 10} textAnchor="middle" fontSize="12" fontWeight="700" fill="#0f172a">{c.value.toFixed(1)}</text>
          <text x={c.x} y={height - 6} textAnchor="middle" fontSize="10" fill="#64748b">{c.label}</text>
        </g>
      ))}
    </svg>
  );
}

export default function OverviewPage({ rows, lang }: { rows: Row[]; lang: PlanningLang }) {
  const [selectedStatus, setSelectedStatus] = useState<string>("Melbourn Factory");
  const [mode, setMode] = useState<Mode>("customer");
  const [modelRangeFilter, setModelRangeFilter] = useState<string>("all");

  const withStatus = useMemo(
    () =>
      rows.map((r) => {
        let last = "";
        milestoneSequence.forEach((m) => {
          const ts = parseDateToTimestamp(m.source === "schedule" ? (r.schedule as any)?.[m.key] : r.dateTrack?.[m.key]);
          if (ts != null) last = m.key;
        });
        const status = (phaseCardMap[last] ?? last) || "-";
        const finished = ["finished", "finish"].includes(String((r.schedule as any)?.["Regent Production"] ?? "").trim().toLowerCase());
        const modelRange = getModelRange(String((r.schedule as any)?.Model ?? ""), String((r.schedule as any)?.Chassis ?? ""));
        const customer = String((r.schedule as any)?.Customer ?? "").trim();
        const isStock = customer.toLowerCase().endsWith("stock");
        const dealer = String((r.schedule as any)?.Dealer ?? "").trim();
        const group = resolveDealerGroup(dealer);
        return { ...r, status, finished, modelRange, isStock, group };
      }),
    [rows]
  );

  const filteredByModel = useMemo(
    () => withStatus.filter((r) => modelRangeFilter === "all" || r.modelRange === modelRangeFilter),
    [withStatus, modelRangeFilter]
  );

  const modelRangeOptions = useMemo(() => Array.from(new Set(withStatus.map((r) => r.modelRange))).filter(Boolean).sort(), [withStatus]);

  const melbFactoryRows = filteredByModel.filter((r) => r.status === "Melbourn Factory" && !r.finished);
  const selectedRows = filteredByModel.filter((r) => r.status === selectedStatus && (selectedStatus !== "Melbourn Factory" || !r.finished));

  const transitionCards = useMemo(() => {
    const keys: Array<{ from: string; to: string; fromSource: "schedule" | "dateTrack"; toSource: "schedule" | "dateTrack" }> = [
      { from: "Purchase Order Sent", to: "chassisWelding", fromSource: "schedule", toSource: "dateTrack" },
      { from: "chassisWelding", to: "assemblyLine", fromSource: "dateTrack", toSource: "dateTrack" },
      { from: "assemblyLine", to: "finishGoods", fromSource: "dateTrack", toSource: "dateTrack" },
      { from: "finishGoods", to: "leavingFactory", fromSource: "dateTrack", toSource: "dateTrack" },
      { from: "leavingFactory", to: "Received in Melbourne", fromSource: "dateTrack", toSource: "dateTrack" },
    ];

    return keys.map((k) => {
      let sum = 0;
      let count = 0;
      filteredByModel.forEach((r) => {
        const a = parseDateToTimestamp(k.fromSource === "schedule" ? (r.schedule as any)?.[k.from] : r.dateTrack?.[k.from]);
        const b = parseDateToTimestamp(k.toSource === "schedule" ? (r.schedule as any)?.[k.to] : r.dateTrack?.[k.to]);
        if (a == null || b == null) return;
        sum += (b - a) / 86400000;
        count += 1;
      });
      return { title: `${k.from} → ${k.to}`, value: count ? `${(sum / count).toFixed(1)} days` : "-", sample: count };
    });
  }, [filteredByModel]);

  const groupCards = useMemo(() => {
    const sumAvg = (pairs: Array<{ from: string; to: string; fromSource: "schedule" | "dateTrack"; toSource: "schedule" | "dateTrack" }>) => {
      let sum = 0;
      let count = 0;
      filteredByModel.forEach((r) => {
        let total = 0;
        let ok = true;
        pairs.forEach((p) => {
          const a = parseDateToTimestamp(p.fromSource === "schedule" ? (r.schedule as any)?.[p.from] : r.dateTrack?.[p.from]);
          const b = parseDateToTimestamp(p.toSource === "schedule" ? (r.schedule as any)?.[p.to] : r.dateTrack?.[p.to]);
          if (a == null || b == null) ok = false;
          else total += (b - a) / 86400000;
        });
        if (!ok) return;
        sum += total;
        count += 1;
      });
      return { value: count ? `${(sum / count).toFixed(1)} days` : "-", sample: count };
    };

    const longtree = sumAvg([
      { from: "Purchase Order Sent", to: "chassisWelding", fromSource: "schedule", toSource: "dateTrack" },
      { from: "chassisWelding", to: "assemblyLine", fromSource: "dateTrack", toSource: "dateTrack" },
      { from: "assemblyLine", to: "finishGoods", fromSource: "dateTrack", toSource: "dateTrack" },
      { from: "finishGoods", to: "leavingFactory", fromSource: "dateTrack", toSource: "dateTrack" },
    ]);

    const transit = sumAvg([{ from: "leavingFactory", to: "Received in Melbourne", fromSource: "dateTrack", toSource: "dateTrack" }]);

    return {
      longtree,
      transit,
    };
  }, [filteredByModel]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    filteredByModel.forEach((r) => {
      if (r.status === "Melbourn Factory" && r.finished) return;
      c[r.status] = (c[r.status] ?? 0) + 1;
    });
    return c;
  }, [filteredByModel]);

  const analysisRows = useMemo(() => {
    if (mode === "customer") {
      const customer = selectedRows.filter((r) => !r.isStock).length;
      const stock = selectedRows.filter((r) => r.isStock).length;
      const total = Math.max(1, customer + stock);
      return [
        { key: tr(lang, "Customer", "客户"), count: customer, ratio: `${((customer / total) * 100).toFixed(1)}%` },
        { key: tr(lang, "Stock", "库存"), count: stock, ratio: `${((stock / total) * 100).toFixed(1)}%` },
      ];
    }

    const map: Record<string, number> = {};
    selectedRows.forEach((r) => {
      const k = mode === "group" ? r.group : r.modelRange;
      map[k] = (map[k] ?? 0) + 1;
    });

    const total = Math.max(1, selectedRows.length);
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ key, count, ratio: `${((count / total) * 100).toFixed(1)}%` }));
  }, [selectedRows, mode, lang]);

  const leftPortLongtreeMonthly = useMemo(() => {
    const from = new Date(new Date().getFullYear() - 1, 5, 1).getTime();
    const buckets: Record<string, { sum: number; count: number }> = {};

    filteredByModel.forEach((r) => {
      const m = (name: string, src: "schedule" | "dateTrack") => parseDateToTimestamp(src === "schedule" ? (r.schedule as any)?.[name] : r.dateTrack?.[name]);
      const pos = m("Purchase Order Sent", "schedule");
      const cw = m("chassisWelding", "dateTrack");
      const al = m("assemblyLine", "dateTrack");
      const fg = m("finishGoods", "dateTrack");
      const lf = m("leavingFactory", "dateTrack");
      const ep = m("estLeavngPort", "dateTrack");
      const lp = m("Left Port", "dateTrack");

      if ([pos, cw, al, fg, lf, ep, lp].some((x) => x == null)) return;
      if ((lp as number) < from) return;

      const totalDays = ((cw! - pos!) + (al! - cw!) + (fg! - al!) + (lf! - fg!) + (ep! - lf!) + (lp! - ep!)) / 86400000;
      const d = new Date(lp!);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!buckets[key]) buckets[key] = { sum: 0, count: 0 };
      buckets[key].sum += totalDays;
      buckets[key].count += 1;
    });

    return Object.entries(buckets)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .filter(([month]) => !month.endsWith("-06"))
      .map(([month, v]) => ({ label: month, value: v.count ? Number((v.sum / v.count).toFixed(2)) : 0 }));
  }, [filteredByModel]);

  const forecastVsSignedMonthlyWithMelbourneDays = useMemo(() => {
    const now = new Date();
    const nowMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const buckets: Record<string, { sum: number; count: number }> = {};

    filteredByModel.forEach((r) => {
      const forecast = parseDateToTimestamp((r.schedule as any)?.["Forecast Production Date"]);
      const signed = parseDateToTimestamp((r.schedule as any)?.["Signed Plans Received"]);
      if (forecast == null || signed == null || forecast < nowMonthStart) return;

      const d = new Date(forecast);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!buckets[key]) buckets[key] = { sum: 0, count: 0 };
      buckets[key].sum += (forecast - signed) / 86400000 + 25;
      buckets[key].count += 1;
    });

    return Object.entries(buckets)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => ({ label: month, value: v.count ? Number((v.sum / v.count).toFixed(2)) : 0 }));
  }, [filteredByModel]);

  const cardStatuses = [
    "Melbourn Factory",
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
  ];

  const maxAnalysis = Math.max(1, ...analysisRows.map((r) => r.count));

  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold">{tr(lang, "Planning dashboard", "计划总览")}</h2>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">{tr(lang, "Model Range", "车型段")}</label>
            <select value={modelRangeFilter} onChange={(e) => setModelRangeFilter(e.target.value)} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value="all">{tr(lang, "All", "全部")}</option>
              {modelRangeOptions.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mb-4 grid gap-3 xl:grid-cols-[280px_1fr]">
        <div className="space-y-3">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">{tr(lang, "Longtree Planning and Production Days", "Longtree 计划与生产天数")}</div>
            <div className="mt-2 text-2xl font-bold text-blue-900">{groupCards.longtree.value}</div>
            <div className="text-xs text-blue-700">{tr(lang, "samples", "样本")}: {groupCards.longtree.sample}</div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{tr(lang, "Transit Dates", "运输周期")}</div>
            <div className="mt-2 text-2xl font-bold text-emerald-900">{groupCards.transit.value}</div>
            <div className="text-xs text-emerald-700">{tr(lang, "samples", "样本")}: {groupCards.transit.sample}</div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {transitionCards.map((c) => (
            <Card key={c.title}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs">{c.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{c.value}</div>
                <p className="text-xs text-slate-500">{tr(lang, "samples", "样本")}: {c.sample}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cardStatuses.map((status) => (
          <button key={status} type="button" onClick={() => setSelectedStatus(status)} className={`rounded-xl border p-4 text-left shadow-sm ${selectedStatus === status ? "border-slate-900 bg-slate-100" : "border-slate-200 bg-white"}`}>
            <div className="text-sm font-medium">{statusText(lang, status)}</div>
            <div className="mt-1 text-2xl font-bold">{status === "Melbourn Factory" ? melbFactoryRows.length : statusCounts[status] ?? 0}</div>
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap gap-2 text-xs font-semibold">
        <button className={`rounded-full border px-3 py-1 ${mode === "customer" ? "bg-slate-900 text-white" : "bg-white"}`} onClick={() => setMode("customer")}>{tr(lang, "by customer ratio", "按客户比例")}</button>
        <button className={`rounded-full border px-3 py-1 ${mode === "group" ? "bg-slate-900 text-white" : "bg-white"}`} onClick={() => setMode("group")}>{tr(lang, "by group", "按集团")}</button>
        <button className={`rounded-full border px-3 py-1 ${mode === "modelRange" ? "bg-slate-900 text-white" : "bg-white"}`} onClick={() => setMode("modelRange")}>{tr(lang, "by model range", "按车型段")}</button>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold">{tr(lang, "Analysis for", "分析：")} {statusText(lang, selectedStatus)}</div>
        {analysisRows.map((r) => (
          <div key={r.key} className="mb-2.5">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span>{statusText(lang, r.key)}</span>
              <span className="font-semibold">{r.count} ({r.ratio})</span>
            </div>
            <div className="h-2 rounded bg-slate-100">
              <div className="h-2 rounded bg-slate-700" style={{ width: `${(r.count / maxAnalysis) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-sm font-semibold">{tr(lang, "Longtree production time trend by Left Port month (from last June)", "按 Left Port 月份的 Longtree 生产时长趋势（去年六月起）")}</div>
          {leftPortLongtreeMonthly.length === 0 ? <div className="text-sm text-slate-500">{tr(lang, "No enough data.", "数据不足。")}</div> : <LineChart points={leftPortLongtreeMonthly} color="#334155" />}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-sm font-semibold">{tr(lang, "Monthly avg (Forecast Production Date - Signed Plans Received) + 25 days (Melbourne Factory)", "月均（Forecast Production Date - Signed Plans Received）+25天（墨尔本工厂）")}</div>
          {forecastVsSignedMonthlyWithMelbourneDays.length === 0 ? <div className="text-sm text-slate-500">{tr(lang, "No rows from current month onward.", "当前月起暂无可用数据。")}</div> : <LineChart points={forecastVsSignedMonthlyWithMelbourneDays} color="#047857" />}
        </div>
      </div>
    </>
  );
}
