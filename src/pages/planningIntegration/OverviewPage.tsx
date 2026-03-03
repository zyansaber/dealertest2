import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { milestoneSequence, phaseCardMap } from "./types";
import { parseDateToTimestamp } from "./utils";
import type { Row } from "./types";

export default function OverviewPage({ rows }: { rows: Row[] }) {
  const [selectedStatus, setSelectedStatus] = useState<string>("Melbourn Factory");

  const withStatus = useMemo(() => rows.map((r) => {
    let last = "";
    milestoneSequence.forEach((m) => {
      const ts = parseDateToTimestamp(m.source === "schedule" ? (r.schedule as any)?.[m.key] : r.dateTrack?.[m.key]);
      if (ts != null) last = m.key;
    });
    const status = (phaseCardMap[last] ?? last) || "-";
    const finished = ["finished", "finish"].includes(String((r.schedule as any)?.["Regent Production"] ?? "").trim().toLowerCase());
    return { ...r, status, finished };
  }), [rows]);

  const melbFactoryRows = withStatus.filter((r) => r.status === "Melbourn Factory" && !r.finished);
  const selectedRows = withStatus.filter((r) => r.status === selectedStatus && (selectedStatus !== "Melbourn Factory" || !r.finished));

  const modelBreakdown = useMemo(() => {
    const m: Record<string, number> = {};
    selectedRows.forEach((r) => {
      const model = String((r.schedule as any)?.Model ?? "Unknown").trim() || "Unknown";
      m[model] = (m[model] ?? 0) + 1;
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [selectedRows]);

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

  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-2xl font-semibold">Planning dashboard</h2><p className="text-sm text-slate-600">Click status cards for model range analysis.</p></div>
      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{transitions.map((c) => <Card key={c.title}><CardHeader className="pb-2"><CardTitle className="text-xs">{c.title}</CardTitle></CardHeader><CardContent><div className="text-xl font-bold">{c.value}</div><p className="text-xs text-slate-500">samples: {c.sample}</p></CardContent></Card>)}</div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cardStatuses.map((status) => (
          <button key={status} type="button" onClick={() => setSelectedStatus(status)} className={`rounded-xl border p-4 text-left shadow-sm ${selectedStatus === status ? "border-slate-900 bg-slate-100" : "border-slate-200 bg-white"}`}>
            <div className="text-sm font-medium">{status}</div>
            <div className="mt-1 text-2xl font-bold">{status === "Melbourn Factory" ? melbFactoryRows.length : statusCounts[status] ?? 0}</div>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold">Model range analysis: {selectedStatus}</div>
        {modelBreakdown.length === 0 ? <div className="text-sm text-slate-500">No data</div> : modelBreakdown.map(([model, count]) => <div key={model} className="mb-2 flex items-center justify-between text-sm"><span>{model}</span><span className="font-semibold">{count}</span></div>)}
      </div>
    </>
  );
}
