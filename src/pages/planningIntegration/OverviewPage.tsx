import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { milestoneSequence, phaseCardMap } from "./types";
import { parseDateToTimestamp } from "./utils";
import type { Row } from "./types";

export default function OverviewPage({ rows }: { rows: Row[] }) {
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

  const counts: Record<string, number> = {};
  rows.forEach((r) => {
    let last = "";
    milestoneSequence.forEach((m) => {
      const ts = parseDateToTimestamp(m.source === "schedule" ? (r.schedule as any)?.[m.key] : r.dateTrack?.[m.key]);
      if (ts != null) last = m.key;
    });
    if (last) counts[last] = (counts[last] ?? 0) + 1;
  });

  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-2xl font-semibold">Planning Integration</h2></div>
      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{transitions.map((c) => <Card key={c.title}><CardHeader className="pb-2"><CardTitle className="text-xs">{c.title}</CardTitle></CardHeader><CardContent><div className="text-xl font-bold">{c.value}</div><p className="text-xs text-slate-500">samples: {c.sample}</p></CardContent></Card>)}</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{milestoneSequence.map((m) => <Card key={m.key}><CardHeader className="pb-2"><CardTitle className="text-xs">{m.key}</CardTitle></CardHeader><CardContent><div className="text-sm">{phaseCardMap[m.key] ?? m.key}</div><p className="mt-1 text-2xl font-bold">{counts[m.key] ?? 0}</p></CardContent></Card>)}</div>
    </>
  );
}
