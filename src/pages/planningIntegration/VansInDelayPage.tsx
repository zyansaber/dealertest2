import { useMemo, useState } from "react";

import { getModelRange } from "@/lib/targetHighlight";

import { milestoneSequence, phaseCardMap } from "./types";
import { parseDateToTimestamp } from "./utils";
import type { Row } from "./types";
import type { PlanningLang } from "./i18n";
import { tr } from "./i18n";
import { getPlanningOrderType, planningOrderTypeLabel } from "./orderType";

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

function MiniBars({ values }: { values: Array<{ label: string; value: number; color: string }> }) {
  const max = Math.max(1, ...values.map((v) => v.value));
  return (
    <div className="space-y-2">
      {values.map((v) => (
        <div key={v.label} className="flex items-center gap-2 text-xs">
          <div className="w-28 text-slate-600">{v.label}</div>
          <div className="h-3 flex-1 rounded bg-slate-100">
            <div className={`h-3 rounded ${v.color}`} style={{ width: `${(v.value / max) * 100}%` }} />
          </div>
          <div className="w-8 text-right font-semibold text-slate-700">{v.value}</div>
        </div>
      ))}
    </div>
  );
}

export default function VansInDelayPage({ rows, lang }: { rows: Row[]; lang: PlanningLang }) {
  const [delayDays, setDelayDays] = useState(90);

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
        const finished = ["finished", "finish"].includes(String((r.schedule as any)?.["Regent Production"] ?? "").trim().toLowerCase());
        return {
          ...r,
          currentStatus,
          leftPortTs,
          agingDays,
          customer,
          dealer,
          modelRange,
          finished,
          orderType: getPlanningOrderType(customer),
        };
      }),
    [rows]
  );

  const delayedRows = useMemo(() => enriched.filter((r) => r.leftPortTs == null && (r.agingDays ?? -1) > delayDays), [enriched, delayDays]);

  const result = useMemo(
    () =>
      focusRanges.map((range) => {
        const delayedInRange = delayedRows.filter((r) => r.modelRange === range);
        const customerCount = delayedInRange.filter((r) => r.orderType === "customer").length;
        const prototypeCount = delayedInRange.filter((r) => r.orderType === "prototype").length;

        const dealerCount: Record<string, number> = {};
        delayedInRange.forEach((r) => {
          const key = r.dealer || "-";
          dealerCount[key] = (dealerCount[key] ?? 0) + 1;
        });

        const top5Dealers = Object.entries(dealerCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([dealer, count]) => ({ dealer, count }));

        const inRange = enriched.filter((r) => r.modelRange === range);
        const melbourneFactory = inRange.filter((r) => statusGroup.melbourneFactory.includes(r.currentStatus as any) && !r.finished).length;
        const orderProcessing = inRange.filter((r) => statusGroup.orderProcessing.includes(r.currentStatus as any)).length;
        const longtreeFactory = inRange.filter((r) => statusGroup.longtreeFactory.includes(r.currentStatus as any)).length;
        const onTransit = inRange.filter((r) => statusGroup.onTransit.includes(r.currentStatus as any)).length;

        return {
          range,
          delayed: delayedInRange.length,
          customerCount,
          prototypeCount,
          top5Dealers,
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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">{tr(lang, "Vans in Delay", "延误车辆")}</h2>
            <p className="text-sm text-slate-600">{tr(lang, "No Left Port yet and over selected days from Purchase Order Sent.", "尚未 Left Port 且自 Purchase Order Sent 起超过所选天数。")}</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{tr(lang, "Delay threshold (days)", "延误阈值（天）")}</label>
            <input
              type="number"
              min={1}
              value={delayDays}
              onChange={(e) => setDelayDays(Math.max(1, Number(e.target.value || 90)))}
              className="w-32 rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {result.map((r) => (
          <div key={r.range} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 text-lg font-semibold text-slate-900">{r.range}</div>

            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-rose-700">{tr(lang, "Delay Qty", "延误数量")}</div>
                <div className="mt-1 text-3xl font-bold text-rose-900">{r.delayed}</div>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">{tr(lang, "Customer Qty", "客户订单数量")}</div>
                <div className="mt-1 text-3xl font-bold text-blue-900">{r.customerCount}</div>
              </div>
              <div className="rounded-lg border border-fuchsia-200 bg-fuchsia-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-fuchsia-700">{planningOrderTypeLabel(lang, "prototype")}</div>
                <div className="mt-1 text-3xl font-bold text-fuchsia-900">{r.prototypeCount}</div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 text-sm font-semibold">{tr(lang, "Top 5 Dealers", "Top5 经销商")}</div>
                <MiniBars values={(r.top5Dealers.length ? r.top5Dealers : [{ dealer: "-", count: 0 }]).map((d) => ({ label: d.dealer, value: d.count, color: "bg-slate-700" }))} />
              </div>

              <div className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 text-sm font-semibold">{tr(lang, "Status group totals", "状态分组总数")}</div>
                <MiniBars
                  values={[
                    { label: tr(lang, "Melbourne Factory", "Melbourne Factory"), value: r.melbourneFactory, color: "bg-emerald-600" },
                    { label: tr(lang, "Longtree Factory", "Longtree 工厂"), value: r.longtreeFactory, color: "bg-sky-600" },
                    { label: tr(lang, "On transit", "On transit"), value: r.onTransit, color: "bg-amber-500" },
                    { label: tr(lang, "Order Processing", "订单处理中"), value: r.orderProcessing, color: "bg-violet-600" },
                  ]}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
