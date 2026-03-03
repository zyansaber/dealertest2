import { useMemo, useRef } from "react";
import type { Row } from "./types";
import { displayValue, parseDateToTimestamp } from "./utils";
import { milestoneSequence, phaseCardMap } from "./types";

const columns: Array<{ label: string; key: string; source: "schedule" | "dateTrack"; className?: string }> = [
  { label: "Current Status", key: "_status", source: "schedule" },
  { label: "Aging Days", key: "_aging", source: "schedule" },
  { label: "Forecast Production Date", key: "Forecast Production Date", source: "schedule" },
  { label: "Chassis", key: "Chassis", source: "schedule" },
  { label: "Customer", key: "Customer", source: "schedule", className: "max-w-[120px] truncate" },
  { label: "Dealer", key: "Dealer", source: "schedule" },
  { label: "Purchase Order Sent", key: "Purchase Order Sent", source: "schedule" },
  { label: "Left Port", key: "Left Port", source: "dateTrack" },
  { label: "melbournePortDate", key: "melbournePortDate", source: "dateTrack" },
];

export default function SchedulePage({ rows }: { rows: Row[] }) {
  const top = useRef<HTMLDivElement | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);

  const enriched = useMemo(() => rows.map((r) => {
    let last = "";
    milestoneSequence.forEach((m) => {
      const ts = parseDateToTimestamp(m.source === "schedule" ? (r.schedule as any)?.[m.key] : r.dateTrack?.[m.key]);
      if (ts != null) last = m.key;
    });
    const posTs = parseDateToTimestamp((r.schedule as any)?.["Purchase Order Sent"]);
    const leftTs = parseDateToTimestamp(r.dateTrack?.["Left Port"]);
    const end = leftTs ?? Date.now();
    const aging = posTs == null ? "-" : Math.max(0, Math.floor((end - posTs) / 86400000)).toString();
    return { ...r, currentStatus: (phaseCardMap[last] ?? last) || "-", aging };
  }), [rows]);

  const noLeftPort = useMemo(() => enriched.filter((r) => !parseDateToTimestamp(r.dateTrack?.["Left Port"])), [enriched]);
  const buckets = useMemo(() => {
    const b = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    noLeftPort.forEach((r) => {
      const d = Number(r.aging);
      if (!Number.isFinite(d)) return;
      if (d <= 30) b["0-30"] += 1; else if (d <= 60) b["31-60"] += 1; else if (d <= 90) b["61-90"] += 1; else b["90+"] += 1;
    });
    return b;
  }, [noLeftPort]);

  const max = Math.max(1, ...Object.values(buckets));

  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-2xl font-semibold">schedule</h2><p className="text-sm text-slate-600">Finished hidden only in this page.</p></div>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 text-sm font-semibold">Aging bar chart (no Left Port yet)</div>
        {Object.entries(buckets).map(([k,v]) => <div key={k} className="mb-2 flex items-center gap-3"><div className="w-20 text-xs">{k}</div><div className="h-4 flex-1 rounded bg-slate-100"><div className="h-4 rounded bg-slate-700" style={{width:`${(v/max)*100}%`}} /></div><div className="w-8 text-right text-sm">{v}</div></div>)}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div ref={top} className="overflow-x-auto overflow-y-hidden border-b border-slate-200" onScroll={() => { if (bottom.current && top.current) bottom.current.scrollLeft = top.current.scrollLeft; }}><div style={{ width: 1700, height: 1 }} /></div>
        <div ref={bottom} className="max-h-[calc(100vh-360px)] overflow-auto" onScroll={() => { if (top.current && bottom.current) top.current.scrollLeft = bottom.current.scrollLeft; }}>
          <table className="min-w-[1700px] divide-y divide-slate-200 text-sm">
            <thead className="sticky top-0 bg-slate-100"><tr>{columns.map((c) => <th key={c.key} className="px-3 py-3 text-left font-semibold">{c.label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {enriched.map((r, i) => <tr key={`${r.chassis}-${i}`} className={i%2===0?"bg-white":"bg-slate-50/60"}>{columns.map((c) => {
                let v: unknown;
                if (c.key === "_status") v = r.currentStatus;
                else if (c.key === "_aging") v = r.aging;
                else v = c.source === "schedule" ? (r.schedule as any)?.[c.key] : r.dateTrack?.[c.key];
                return <td key={`${r.chassis}-${c.key}-${i}`} className={`whitespace-nowrap px-3 py-2.5 ${c.className ?? ""}`}>{displayValue(v)}</td>;
              })}</tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
