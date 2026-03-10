import { useEffect, useMemo, useRef, useState } from "react";
import type { Row } from "./types";
import { displayValue, parseDateToTimestamp } from "./utils";
import { milestoneSequence, phaseCardMap } from "./types";
import type { PlanningLang } from "./i18n";
import { statusText, tr } from "./i18n";
import { database } from "@/lib/firebase";
import { off, onValue, ref } from "firebase/database";

const columns: Array<{ label: string; zhLabel: string; key: string; source: "schedule" | "dateTrack"; className?: string }> = [
  { label: "Current Status", zhLabel: "当前状态", key: "_status", source: "schedule" },
  { label: "Aging Days", zhLabel: "滞留天数", key: "_aging", source: "schedule" },
  { label: "Waiting for ordering", zhLabel: "待下单价格", key: "_wfo", source: "schedule" },
  { label: "Forecast Production Date", zhLabel: "预测生产日期", key: "Forecast Production Date", source: "schedule" },
  { label: "Chassis", zhLabel: "底盘号", key: "Chassis", source: "schedule" },
  { label: "Customer", zhLabel: "客户", key: "Customer", source: "schedule", className: "max-w-[110px] truncate" },
  { label: "Dealer", zhLabel: "经销商", key: "Dealer", source: "schedule" },
  { label: "Model", zhLabel: "车型", key: "Model", source: "schedule" },
  { label: "Model Year", zhLabel: "年款", key: "Model Year", source: "schedule" },
  { label: "Order Received Date", zhLabel: "接单日期", key: "Order Received Date", source: "schedule" },
  { label: "Signed Plans Received", zhLabel: "签图回收", key: "Signed Plans Received", source: "schedule" },
  { label: "Purchase Order Sent", zhLabel: "采购单发送", key: "Purchase Order Sent", source: "schedule" },
  { label: "chassisWelding", zhLabel: "底盘焊接", key: "chassisWelding", source: "dateTrack" },
  { label: "assemblyLine", zhLabel: "总装线", key: "assemblyLine", source: "dateTrack" },
  { label: "finishGoods", zhLabel: "完工入库", key: "finishGoods", source: "dateTrack" },
  { label: "leavingFactory", zhLabel: "离开工厂", key: "leavingFactory", source: "dateTrack" },
  { label: "estLeavngPort", zhLabel: "预计离港", key: "estLeavngPort", source: "dateTrack" },
  { label: "Left Port", zhLabel: "已离港", key: "Left Port", source: "dateTrack" },
  { label: "melbournePortDate", zhLabel: "墨尔本港到港", key: "melbournePortDate", source: "dateTrack" },
  { label: "Received in Melbourne", zhLabel: "墨尔本工厂接收", key: "Received in Melbourne", source: "dateTrack" },
];

const statusGroup = {
  "Melbourn Factory": ["Melbourn Factory"],
  "Order Processing": ["not confirmed orders", "Waiting for sending"],
  "Longtree Factory": ["Not Start in Longtree", "Chassis welding in Longtree", "Assembly line Longtree", "Finishedin Longtree"],
  "on the transit": ["Leaving factory from Longtree", "waiting in port", "On the sea", "Melbourn Port"],
} as const;

const statusClass: Record<string, string> = {
  "Melbourn Factory": "bg-emerald-100",
  "not confirmed orders": "bg-amber-100",
  "Waiting for sending": "bg-yellow-100",
  "Not Start in Longtree": "bg-sky-100",
  "Chassis welding in Longtree": "bg-blue-100",
  "Assembly line Longtree": "bg-indigo-100",
  "Finishedin Longtree": "bg-violet-100",
  "Leaving factory from Longtree": "bg-orange-100",
  "waiting in port": "bg-pink-100",
  "On the sea": "bg-cyan-100",
  "Melbourn Port": "bg-lime-100",
};

const PAGE_SIZE = 80;

type TicketType = "change-production-date" | "after-signed-off-change";

type RequisitionTicket = {
  type?: TicketType;
  chassis?: string;
  approvals?: {
    techApproved?: boolean;
    productionApproved?: boolean;
  };
  status?: "unread" | "approved";
};

const normalize = (value: unknown) => String(value ?? "").trim().toUpperCase();

const isTicketFinalApproved = (ticket: RequisitionTicket) => {
  if (ticket.status === "approved") return true;
  if (ticket.type === "change-production-date") return Boolean(ticket.approvals?.productionApproved);
  if (ticket.type === "after-signed-off-change") return Boolean(ticket.approvals?.techApproved) && Boolean(ticket.approvals?.productionApproved);
  return false;
};


export default function SchedulePage({ rows, waitingOrderPrices, lang }: { rows: Row[]; waitingOrderPrices: Record<string, number>; lang: PlanningLang }) {
  const top = useRef<HTMLDivElement | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);

  const [agingFilter, setAgingFilter] = useState<"all" | "0-30" | "31-60" | "61-90" | "90+">("all");
  const [groupFilter, setGroupFilter] = useState<keyof typeof statusGroup | "all">("all");
  const [page, setPage] = useState(1);
  const [approvedChangeChassisSet, setApprovedChangeChassisSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    const ticketsRef = ref(database, "mes/requisitionTickets");
    const handler = (snap: any) => {
      const raw = snap.val() || {};
      const approved = new Set<string>();
      Object.values(raw).forEach((item: any) => {
        const ticket: RequisitionTicket = item || {};
        const chassis = normalize(ticket.chassis);
        if (!chassis) return;
        if (isTicketFinalApproved(ticket)) approved.add(chassis);
      });
      setApprovedChangeChassisSet(approved);
    };
    onValue(ticketsRef, handler);
    return () => off(ticketsRef, "value", handler);
  }, []);


  const enriched = useMemo(
    () =>
      rows.map((r) => {
        let last = "";
        milestoneSequence.forEach((m) => {
          const ts = parseDateToTimestamp(m.source === "schedule" ? (r.schedule as any)?.[m.key] : r.dateTrack?.[m.key]);
          if (ts != null) last = m.key;
        });
        const posTs = parseDateToTimestamp((r.schedule as any)?.["Purchase Order Sent"]);
        const leftTs = parseDateToTimestamp(r.dateTrack?.["Left Port"]);
        const end = leftTs ?? Date.now();
        const agingNum = posTs == null ? null : Math.max(0, Math.floor((end - posTs) / 86400000));
        const currentStatus = (phaseCardMap[last] ?? last) || "-";
        return { ...r, currentStatus, aging: agingNum == null ? "-" : String(agingNum), agingNum };
      }),
    [rows]
  );

  const filtered = useMemo(() => {
    return enriched.filter((r) => {
      if (groupFilter !== "all" && !statusGroup[groupFilter].includes(r.currentStatus as any)) return false;
      if (agingFilter === "all") return true;
      if (r.agingNum == null) return false;
      if (agingFilter === "0-30") return r.agingNum <= 30;
      if (agingFilter === "31-60") return r.agingNum >= 31 && r.agingNum <= 60;
      if (agingFilter === "61-90") return r.agingNum >= 61 && r.agingNum <= 90;
      return r.agingNum > 90;
    });
  }, [enriched, groupFilter, agingFilter]);

  const noLeftPort = useMemo(() => enriched.filter((r) => !parseDateToTimestamp(r.dateTrack?.["Left Port"])), [enriched]);
  const buckets = useMemo(() => {
    const b = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    noLeftPort.forEach((r) => {
      const d = r.agingNum;
      if (d == null) return;
      if (d <= 30) b["0-30"] += 1;
      else if (d <= 60) b["31-60"] += 1;
      else if (d <= 90) b["61-90"] += 1;
      else b["90+"] += 1;
    });
    return b;
  }, [noLeftPort]);

  const groupCards = useMemo(() => {
    const mk = (k: keyof typeof statusGroup) => ({ key: k, count: enriched.filter((r) => statusGroup[k].includes(r.currentStatus as any)).length });
    return [mk("Melbourn Factory"), mk("Order Processing"), mk("Longtree Factory"), mk("on the transit")];
  }, [enriched]);

  const max = Math.max(1, ...Object.values(buckets));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagedRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-semibold">{tr(lang, "schedule", "排产表")}</h2>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {groupCards.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => {
              setGroupFilter((prev) => (prev === c.key ? "all" : c.key));
              setPage(1);
            }}
            className={`rounded-xl border p-4 text-left shadow-sm transition ${groupFilter === c.key ? "border-slate-900 bg-slate-100" : "border-slate-200 bg-white"}`}
          >
            <div className="text-sm font-semibold text-slate-700">{c.key === "Melbourn Factory" ? tr(lang, "Melbourn Factory", "墨尔本工厂") : c.key === "Order Processing" ? tr(lang, "Order Processing", "订单处理中") : c.key === "Longtree Factory" ? tr(lang, "Longtree Factory", "Longtree 工厂") : tr(lang, "on the transit", "在途运输")}</div>
            <div className="mt-1 text-3xl font-bold text-slate-900">{c.count}</div>
          </button>
        ))}
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 text-sm font-semibold">{tr(lang, "Aging bar chart (no Left Port yet) — click to filter", "滞留分布图（尚未 Left Port）— 点击筛选")}</div>
        {Object.entries(buckets).map(([k, v]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setAgingFilter((prev) => (prev === k ? "all" : (k as any)));
              setPage(1);
            }}
            className={`mb-2 flex w-full items-center gap-3 rounded px-1 py-1 text-left ${agingFilter === k ? "bg-slate-100" : ""}`}
          >
            <div className="w-20 text-xs">{k}</div>
            <div className="h-4 flex-1 rounded bg-slate-100">
              <div className="h-4 rounded bg-slate-700" style={{ width: `${(v / max) * 100}%` }} />
            </div>
            <div className="w-8 text-right text-sm">{v}</div>
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center justify-between text-sm text-slate-600">
        <div>{tr(lang, "Filtered rows", "筛选后行数")}: {filtered.length}</div>
        <div className="flex items-center gap-2">
          <button type="button" disabled={page <= 1} className="rounded border px-2 py-1 disabled:opacity-50" onClick={() => setPage((p) => Math.max(1, p - 1))}>{tr(lang, "Prev", "上一页")}</button>
          <span>{tr(lang, "Page", "页")} {page}/{totalPages}</span>
          <button type="button" disabled={page >= totalPages} className="rounded border px-2 py-1 disabled:opacity-50" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>{tr(lang, "Next", "下一页")}</button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div
          ref={top}
          className="overflow-x-auto overflow-y-hidden border-b border-slate-200"
          onScroll={() => {
            if (bottom.current && top.current) bottom.current.scrollLeft = top.current.scrollLeft;
          }}
        >
          <div style={{ width: 2600, height: 1 }} />
        </div>
        <div
          ref={bottom}
          className="max-h-[calc(100vh-420px)] overflow-auto"
          onScroll={() => {
            if (top.current && bottom.current) top.current.scrollLeft = bottom.current.scrollLeft;
          }}
        >
          <table className="min-w-[2600px] divide-y divide-slate-200 text-sm">
            <thead className="sticky top-0 bg-slate-100">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className="px-3 py-3 text-left font-semibold">
                    {lang === "zh" ? c.zhLabel : c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedRows.map((r, i) => (
                <tr key={`${r.chassis}-${i}`} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                  {columns.map((c) => {
                    let v: unknown;
                    if (c.key === "_status") v = r.currentStatus;
                    else if (c.key === "_aging") v = r.aging;
                else if (c.key === "_wfo") v = Number.isFinite(Number(waitingOrderPrices[r.chassis])) ? `AUD ${waitingOrderPrices[r.chassis]}` : "-";
                    else v = c.source === "schedule" ? (r.schedule as any)?.[c.key] : r.dateTrack?.[c.key];

                    if (c.key === "_status") {
                      return (
                        <td key={`${r.chassis}-${c.key}-${i}`} className="whitespace-nowrap px-3 py-2.5">
                          <span className={`rounded px-2 py-1 text-xs ${statusClass[String(v)] ?? "bg-slate-100"}`}>{statusText(lang, displayValue(v))}</span>
                        </td>
                      );
                    }

                    const chassisKey = normalize(r.chassis);
                    const hasApprovedChange = c.key === "Chassis" && approvedChangeChassisSet.has(chassisKey);

                    return (
                      <td key={`${r.chassis}-${c.key}-${i}`} className={`whitespace-nowrap px-3 py-2.5 ${c.className ?? ""}`}>
                        {displayValue(v)}
                        {hasApprovedChange ? (
                          <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-800">
                            {tr(lang, "change", "改")}
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
