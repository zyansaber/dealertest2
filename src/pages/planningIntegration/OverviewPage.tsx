import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getModelRange } from "@/lib/targetHighlight";
import { milestoneSequence, phaseCardMap } from "./types";
import { parseDateToTimestamp } from "./utils";
import type { Row } from "./types";

type Mode = "customer" | "group" | "modelRange";

export default function OverviewPage({ rows }: { rows: Row[] }) {
  const [selectedStatus, setSelectedStatus] = useState<string>("Melbourn Factory");
  const [mode, setMode] = useState<Mode>("customer");

  const withStatus = useMemo(() => rows.map((r) => {
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
    const group = dealer ? dealer.split(/\s+/)[0].toUpperCase() : "UNKNOWN";
    return { ...r, status, finished, modelRange, isStock, group };
  }), [rows]);

  const melbFactoryRows = withStatus.filter((r) => r.status === "Melbourn Factory" && !r.finished);
  const selectedRows = withStatus.filter((r) => r.status === selectedStatus && (selectedStatus !== "Melbourn Factory" || !r.finished));

  const transitions = milestoneSequence.slice(2).slice(0, -1).map((cur, i) => {
    const next = milestoneSequence.slice(2)[i + 1];
    let sum = 0, count = 0;
    rows.forEach((r) => {
      const a = parseDateToTimestamp(cur.source === "schedule" ? (r.schedule as any)?.[cur.key] : r.dateTrack?.[cur.key]);
      const b = parseDateToTimestamp(next.source === "schedule" ? (r.schedule as any)?.[next.key] : r.dateTrack?.[next.key]);
      if (a == null || b == null) return;
      sum += (b - a) / 86400000;
      count += 1;
    });
    return { title: `${cur.key} → ${next.key}`, value: count ? `${(sum / count).toFixed(1)} days` : "-", sample: count };
  });

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    withStatus.forEach((r) => {
      if (r.status === "Melbourn Factory" && r.finished) return;
      c[r.status] = (c[r.status] ?? 0) + 1;
    });
    return c;
  }, [withStatus]);

  const cardStatuses = ["Melbourn Factory", "not confirmed orders", "Waiting for sending", "Not Start in Longtree", "Chassis welding in Longtree", "Assembly line Longtree", "Finishedin Longtree", "Leaving factory from Longtree", "waiting in port", "On the sea", "Melbourn Port"];

  const analysisRows = useMemo(() => {
    if (mode === "customer") {
      const customer = selectedRows.filter((r) => !r.isStock).length;
      const stock = selectedRows.filter((r) => r.isStock).length;
      const total = Math.max(1, customer + stock);
      return [
        { key: "Customer", count: customer, ratio: `${((customer / total) * 100).toFixed(1)}%` },
        { key: "Stock", count: stock, ratio: `${((stock / total) * 100).toFixed(1)}%` },
      ];
    }

    const map: Record<string, number> = {};
    selectedRows.forEach((r) => {
      const k = mode === "group" ? r.group : r.modelRange;
      map[k] = (map[k] ?? 0) + 1;
    });
    const total = Math.max(1, selectedRows.length);
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count, ratio: `${((count / total) * 100).toFixed(1)}%` }));
  }, [selectedRows, mode]);

  const leftPortLongtreeMonthly = useMemo(() => {
    const from = new Date(new Date().getFullYear() - 1, 5, 1).getTime();
    const monthBuckets: Record<string, { sum: number; count: number }> = {};
    withStatus.forEach((r) => {
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
      if (!monthBuckets[key]) monthBuckets[key] = { sum: 0, count: 0 };
      monthBuckets[key].sum += totalDays;
      monthBuckets[key].count += 1;
    });
    return Object.entries(monthBuckets).sort((a, b) => a[0].localeCompare(b[0])).map(([month, v]) => ({ month, avg: v.count ? v.sum / v.count : 0 }));
  }, [withStatus]);

  const finishedForecastVsPos = useMemo(() => {
    const monthBuckets: Record<string, { sum: number; count: number }> = {};
    withStatus.forEach((r) => {
      if (!r.finished) return;
      const forecast = parseDateToTimestamp((r.schedule as any)?.["Forecast Production Date"]);
      const pos = parseDateToTimestamp((r.schedule as any)?.["Purchase Order Sent"]);
      if (forecast == null || pos == null) return;
      const d = new Date(forecast);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthBuckets[key]) monthBuckets[key] = { sum: 0, count: 0 };
      monthBuckets[key].sum += (forecast - pos) / 86400000;
      monthBuckets[key].count += 1;
    });
    return Object.entries(monthBuckets).sort((a, b) => a[0].localeCompare(b[0])).map(([month, v]) => ({ month, avg: v.count ? v.sum / v.count : 0 }));
  }, [withStatus]);

  const barMax1 = Math.max(1, ...leftPortLongtreeMonthly.map((x) => x.avg));
  const barMax2 = Math.max(1, ...finishedForecastVsPos.map((x) => x.avg));

  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-2xl font-semibold">Planning dashboard</h2><p className="text-sm text-slate-600">Click status cards for deep analysis.</p></div>
      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{transitions.map((c) => <Card key={c.title}><CardHeader className="pb-2"><CardTitle className="text-xs">{c.title}</CardTitle></CardHeader><CardContent><div className="text-xl font-bold">{c.value}</div><p className="text-xs text-slate-500">samples: {c.sample}</p></CardContent></Card>)}</div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cardStatuses.map((status) => (
          <button key={status} type="button" onClick={() => setSelectedStatus(status)} className={`rounded-xl border p-4 text-left shadow-sm ${selectedStatus === status ? "border-slate-900 bg-slate-100" : "border-slate-200 bg-white"}`}>
            <div className="text-sm font-medium">{status}</div>
            <div className="mt-1 text-2xl font-bold">{status === "Melbourn Factory" ? melbFactoryRows.length : statusCounts[status] ?? 0}</div>
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap gap-2 text-xs font-semibold">
        <button className={`rounded-full border px-3 py-1 ${mode === "customer" ? "bg-slate-900 text-white" : "bg-white"}`} onClick={() => setMode("customer")}>by customer ratio</button>
        <button className={`rounded-full border px-3 py-1 ${mode === "group" ? "bg-slate-900 text-white" : "bg-white"}`} onClick={() => setMode("group")}>by group</button>
        <button className={`rounded-full border px-3 py-1 ${mode === "modelRange" ? "bg-slate-900 text-white" : "bg-white"}`} onClick={() => setMode("modelRange")}>by model range</button>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold">Analysis for {selectedStatus}</div>
        {analysisRows.map((r) => <div key={r.key} className="mb-2 flex items-center justify-between text-sm"><span>{r.key}</span><span className="font-semibold">{r.count} ({r.ratio})</span></div>)}
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 text-sm font-semibold">Longtree production time trend by Left Port month (from last June)</div>
        {leftPortLongtreeMonthly.map((x) => <div key={x.month} className="mb-2 flex items-center gap-3"><div className="w-24 text-xs">{x.month}</div><div className="h-4 flex-1 rounded bg-slate-100"><div className="h-4 rounded bg-slate-700" style={{ width: `${(x.avg / barMax1) * 100}%` }} /></div><div className="w-16 text-right text-sm">{x.avg.toFixed(1)}</div></div>)}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 text-sm font-semibold">Finished cars: monthly avg (Forecast Production Date - Purchase Order Sent)</div>
        {finishedForecastVsPos.map((x) => <div key={x.month} className="mb-2 flex items-center gap-3"><div className="w-24 text-xs">{x.month}</div><div className="h-4 flex-1 rounded bg-slate-100"><div className="h-4 rounded bg-emerald-700" style={{ width: `${(x.avg / barMax2) * 100}%` }} /></div><div className="w-16 text-right text-sm">{x.avg.toFixed(1)}</div></div>)}
      </div>
    </>
  );
}
