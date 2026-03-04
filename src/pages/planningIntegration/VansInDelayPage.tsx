import { useMemo } from "react";

import { getModelRange } from "@/lib/targetHighlight";

import { milestoneSequence, phaseCardMap } from "./types";
import { parseDateToTimestamp } from "./utils";
import type { Row } from "./types";
import type { PlanningLang } from "./i18n";
import { tr } from "./i18n";

const focusRanges = ["SRH", "SRC", "SRT", "SRP"];

const statusGroup = {
  melbourneFactory: ["Melbourn Factory"],
  orderProcessing: ["not confirmed orders", "Waiting for sending"],
  longtreeFactory: ["Not Start in Longtree", "Chassis welding in Longtree", "Assembly line Longtree", "Finishedin Longtree"],
  onTransit: ["Leaving factory from Longtree", "waiting in port", "On the sea", "Melbourn Port"],
} as const;

const normalizeModelRange = (model: string, chassis: string) => {
  const m = model.trim().toUpperCase();
  const c = chassis.trim().toUpperCase();
  const base = getModelRange(m, c);
  if (["19", "20", "21", "22", "23"].some((p) => m.startsWith(p) || c.startsWith(p))) return "SRL";
  if (["NG1", "NG2", "NGB", "NGC"].some((p) => m.startsWith(p) || c.startsWith(p) || base.startsWith(p)) || base.startsWith("NG")) return "NG";
  return base;
};

export default function VansInDelayPage({ rows, lang }: { rows: Row[]; lang: PlanningLang }) {
  const enriched = useMemo(
    () =>
      rows.map((r) => {
        let last = "";
        milestoneSequence.forEach((m) => {
          const ts = parseDateToTimestamp(m.source === "schedule" ? (r.schedule as any)?.[m.key] : r.dateTrack?.[m.key]);
          if (ts != null) last = m.key;
        });
        const currentStatus = (phaseCardMap[last] ?? last) || "-";
        const posTs = parseDateToTimestamp((r.schedule as any)?.["Purchase Order Sent"]);
        const leftPortTs = parseDateToTimestamp(r.dateTrack?.["Left Port"]);
        const agingDays = posTs == null ? null : Math.max(0, Math.floor((Date.now() - posTs) / 86400000));
        const customer = String((r.schedule as any)?.Customer ?? "").trim();
        const dealer = String((r.schedule as any)?.Dealer ?? "").trim();
        const modelRange = normalizeModelRange(String((r.schedule as any)?.Model ?? ""), String((r.schedule as any)?.Chassis ?? ""));
        return {
          ...r,
          currentStatus,
          leftPortTs,
          agingDays,
          customer,
          dealer,
          modelRange,
          isStock: customer.toLowerCase().endsWith("stock"),
        };
      }),
    [rows]
  );

  const delayedRows = useMemo(() => enriched.filter((r) => r.leftPortTs == null && (r.agingDays ?? -1) > 90), [enriched]);

  const result = useMemo(
    () =>
      focusRanges.map((range) => {
        const delayedInRange = delayedRows.filter((r) => r.modelRange === range);
        const customerCount = delayedInRange.filter((r) => !r.isStock).length;

        const dealerCount: Record<string, number> = {};
        delayedInRange.forEach((r) => {
          const key = r.dealer || "-";
          dealerCount[key] = (dealerCount[key] ?? 0) + 1;
        });
        const top5 = Object.entries(dealerCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([dealer, count]) => `${dealer} (${count})`)
          .join(", ");

        const inRange = enriched.filter((r) => r.modelRange === range);
        const melbourneFactory = inRange.filter((r) => statusGroup.melbourneFactory.includes(r.currentStatus as any)).length;
        const orderProcessing = inRange.filter((r) => statusGroup.orderProcessing.includes(r.currentStatus as any)).length;
        const longtreeFactory = inRange.filter((r) => statusGroup.longtreeFactory.includes(r.currentStatus as any)).length;
        const onTransit = inRange.filter((r) => statusGroup.onTransit.includes(r.currentStatus as any)).length;

        return {
          range,
          delayed: delayedInRange.length,
          customerCount,
          top5,
          melbourneFactory,
          longtreeFactory,
          onTransit,
          orderProcessing,
        };
      }),
    [delayedRows, enriched]
  );

  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-semibold">{tr(lang, "Vans in Delay", "延误车辆")}</h2>
        <p className="text-sm text-slate-600">{tr(lang, "No Left Port yet and over 90 days from Purchase Order Sent.", "尚未 Left Port 且自 Purchase Order Sent 起超过 90 天。")}</p>
      </div>

      <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[1400px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-3 py-3 text-left font-semibold">{tr(lang, "Model Range", "车型段")}</th>
              <th className="px-3 py-3 text-left font-semibold">{tr(lang, "Delay Qty", "延误数量")}</th>
              <th className="px-3 py-3 text-left font-semibold">{tr(lang, "Customer Qty (non-stock)", "客户数量（非 stock）")}</th>
              <th className="px-3 py-3 text-left font-semibold">{tr(lang, "Top 5 Dealers", "Top5 经销商")}</th>
              <th className="px-3 py-3 text-left font-semibold">{tr(lang, "Melbourne Factory", "Melbourne Factory")}</th>
              <th className="px-3 py-3 text-left font-semibold">{tr(lang, "Longtree Factory", "Longtree Factory")}</th>
              <th className="px-3 py-3 text-left font-semibold">{tr(lang, "On transit", "On transit")}</th>
              <th className="px-3 py-3 text-left font-semibold">{tr(lang, "Order Processing", "Order Processing")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {result.map((r, i) => (
              <tr key={r.range} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                <td className="whitespace-nowrap px-3 py-2.5 font-semibold">{r.range}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{r.delayed}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{r.customerCount}</td>
                <td className="px-3 py-2.5">{r.top5 || "-"}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{r.melbourneFactory}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{r.longtreeFactory}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{r.onTransit}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{r.orderProcessing}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
