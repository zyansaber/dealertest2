import { useEffect, useMemo, useState } from "react";
import { off, onValue, push, ref, set } from "firebase/database";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";

import { database, storage } from "@/lib/firebase";

import type { PlanningLang } from "./i18n";
import { statusText, tr } from "./i18n";
import { parseDateToTimestamp } from "./utils";

type TicketType = "change-production-date" | "after-signed-off-change";

type ApprovalState = {
  techApproved?: boolean;
  productionApproved?: boolean;
};

type Ticket = {
  id: string;
  type: TicketType;
  chassis: string;
  requestedDate?: string;
  description?: string;
  specUrl?: string;
  planUrl?: string;
  approvals?: ApprovalState;
  status?: "unread" | "approved";
  createdAt: number;
};

const uploadFile = async (file: File, ticketType: string, chassis: string, kind: "spec" | "plan") => {
  const safeChassis = chassis.trim().toUpperCase().replace(/\s+/g, "");
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const fileName = `${Date.now()}_${safeChassis}_${kind}.${ext}`;
  const path = `mes/${ticketType}/${fileName}`;
  const fileRef = storageRef(storage, path);
  await uploadBytes(fileRef, file, { contentType: file.type || "application/octet-stream" });
  return getDownloadURL(fileRef);
};

const ticketTypeLabel = (lang: PlanningLang, type: TicketType) => {
  if (type === "change-production-date") return tr(lang, "Change Production Date", "更改生产日期");
  return tr(lang, "After Signed Off Change", "签字后更改");
};

const normalize = (value: unknown) => String(value ?? "").trim().toUpperCase();

const isTicketFinalApproved = (t: Ticket) => {
  if (t.status === "approved") return true;
  if (t.type === "change-production-date") return Boolean(t.approvals?.productionApproved);
  return Boolean(t.approvals?.techApproved) && Boolean(t.approvals?.productionApproved);
};

const extractScheduleRows = (raw: unknown): any[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((x) => x && typeof x === "object");
  if (typeof raw !== "object") return [];
  const rec = raw as Record<string, unknown>;
  const numericKeys = Object.keys(rec).filter((k) => /^\d+$/.test(k));
  if (numericKeys.length > 0) return numericKeys.sort((a, b) => Number(a) - Number(b)).map((k) => rec[k]).filter((x) => x && typeof x === "object") as any[];
  return Object.values(rec).filter((x) => x && typeof x === "object") as any[];
};

const getCurrentStatus = (schedule: Record<string, any> | undefined, dateTrack: Record<string, any> | undefined) => {
  if (!schedule) return "-";
  if (parseDateToTimestamp(dateTrack?.["Received in Melbourne"]) != null) return "Melbourn Factory";
  if (parseDateToTimestamp(dateTrack?.melbournePortDate) != null) return "Melbourn Port";
  if (parseDateToTimestamp(dateTrack?.["Left Port"]) != null) return "On the sea";
  if (parseDateToTimestamp(dateTrack?.estLeavngPort) != null) return "waiting in port";
  if (parseDateToTimestamp(dateTrack?.leavingFactory) != null) return "Leaving factory from Longtree";
  if (parseDateToTimestamp(dateTrack?.finishGoods) != null) return "Finishedin Longtree";
  if (parseDateToTimestamp(dateTrack?.assemblyLine) != null) return "Assembly line Longtree";
  if (parseDateToTimestamp(dateTrack?.chassisWelding) != null) return "Chassis welding in Longtree";
  if (parseDateToTimestamp(schedule?.["Purchase Order Sent"]) != null) return "Not Start in Longtree";
  if (parseDateToTimestamp(schedule?.["Signed Plans Received"]) != null) return "Waiting for sending";
  if (parseDateToTimestamp(schedule?.["Order Received Date"]) != null) return "not confirmed orders";
  return "-";
};

export default function RequsitionPage({ lang }: { lang: PlanningLang }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [scheduleByChassis, setScheduleByChassis] = useState<Record<string, Record<string, any>>>({});
  const [dateTrackByChassis, setDateTrackByChassis] = useState<Record<string, Record<string, any>>>({});

  const [showNewForm, setShowNewForm] = useState(false);
  const [newType, setNewType] = useState<TicketType | "">("");

  const [cpdChassis, setCpdChassis] = useState("");
  const [cpdDate, setCpdDate] = useState("");

  const [ascChassis, setAscChassis] = useState("");
  const [ascDesc, setAscDesc] = useState("");
  const [ascSpec, setAscSpec] = useState<File | null>(null);
  const [ascPlan, setAscPlan] = useState<File | null>(null);

  useEffect(() => {
    const r = ref(database, "mes/requisitionTickets");
    const handler = (snap: any) => {
      const val = snap.val() || {};
      const list: Ticket[] = Object.entries(val)
        .map(([id, item]: any) => ({ id, ...(item || {}) }))
        .sort((a, b) => b.createdAt - a.createdAt);
      setTickets(list);
    };
    onValue(r, handler);
    return () => off(r, "value", handler);
  }, []);

  useEffect(() => {
    const scheduleRef = ref(database, "planningintegration/schedule");
    const scheduleHandler = (snap: any) => {
      const rows = extractScheduleRows(snap.val());
      const map: Record<string, Record<string, any>> = {};
      rows.forEach((row) => {
        const ch = normalize((row as any)?.Chassis);
        if (ch) map[ch] = row as Record<string, any>;
      });
      setScheduleByChassis(map);
    };
    onValue(scheduleRef, scheduleHandler);

    const dtRef = ref(database, "planningintegration/dateTrack");
    const dtHandler = (snap: any) => {
      const raw = snap.val() || {};
      const map: Record<string, Record<string, any>> = {};
      Object.entries(raw).forEach(([k, v]: any) => {
        if (!v || typeof v !== "object") return;
        const ch = normalize(v?.["Chassis Number"] ?? k);
        if (ch) map[ch] = v;
      });
      setDateTrackByChassis(map);
    };
    onValue(dtRef, dtHandler);

    return () => {
      off(scheduleRef, "value", scheduleHandler);
      off(dtRef, "value", dtHandler);
    };
  }, []);

  const resetNewForm = () => {
    setShowNewForm(false);
    setNewType("");
    setCpdChassis("");
    setCpdDate("");
    setAscChassis("");
    setAscDesc("");
    setAscSpec(null);
    setAscPlan(null);
  };

  const submitChangeProduction = async () => {
    if (!cpdChassis.trim() || !cpdDate) return;
    const p = push(ref(database, "mes/requisitionTickets"));
    await set(p, {
      type: "change-production-date",
      chassis: cpdChassis.trim().toUpperCase(),
      requestedDate: cpdDate,
      approvals: { productionApproved: false },
      createdAt: Date.now(),
    });
    resetNewForm();
  };

  const submitAfterSigned = async () => {
    if (!ascChassis.trim()) return;
    const chassis = ascChassis.trim().toUpperCase();
    const specUrl = ascSpec ? await uploadFile(ascSpec, "after-signed-off-change", chassis, "spec") : "";
    const planUrl = ascPlan ? await uploadFile(ascPlan, "after-signed-off-change", chassis, "plan") : "";

    const p = push(ref(database, "mes/requisitionTickets"));
    await set(p, {
      type: "after-signed-off-change",
      chassis,
      description: ascDesc,
      specUrl,
      planUrl,
      approvals: { techApproved: false, productionApproved: false },
      createdAt: Date.now(),
    });

    resetNewForm();
  };

  const updateApproval = async (id: string, current: Ticket, patch: Partial<ApprovalState>) => {
    const next: Ticket = { ...current, approvals: { ...(current.approvals || {}), ...patch } };
    await set(ref(database, `mes/requisitionTickets/${id}`), next);
  };

  const pendingTickets = useMemo(() => tickets.filter((t) => !isTicketFinalApproved(t)), [tickets]);
  const approvedTickets = useMemo(() => tickets.filter((t) => isTicketFinalApproved(t)), [tickets]);

  const renderRows = (list: Ticket[]) => {
    if (list.length === 0) {
      return (
        <tr>
          <td colSpan={10} className="px-4 py-10 text-center text-slate-500">{tr(lang, "No tickets", "暂无 ticket")}</td>
        </tr>
      );
    }

    return list.map((t) => {
      const ch = normalize(t.chassis);
      const schedule = scheduleByChassis[ch];
      const poSent = String(schedule?.["Purchase Order Sent"] ?? "-").trim() || "-";
      const status = getCurrentStatus(schedule, dateTrackByChassis[ch]);
      const reqDate = t.createdAt ? new Date(t.createdAt).toLocaleDateString("en-GB") : "-";
      const techDone = Boolean(t.approvals?.techApproved);
      const prodDone = Boolean(t.approvals?.productionApproved);

      return (
        <tr key={t.id} className="border-t border-slate-100 align-top">
          <td className="px-3 py-2">{ticketTypeLabel(lang, t.type)}</td>
          <td className="px-3 py-2 font-medium">{t.chassis}</td>
          <td className="px-3 py-2">{poSent}</td>
          <td className="px-3 py-2">{reqDate}</td>
          <td className="px-3 py-2">{statusText(lang, status)}</td>
          <td className="px-3 py-2">{t.requestedDate || "-"}</td>
          <td className="px-3 py-2">{t.description || "-"}</td>
          <td className="px-3 py-2">{t.specUrl ? <button type="button" onClick={() => window.open(t.specUrl, "_blank")} className="rounded border px-2 py-1 text-xs">{tr(lang, "Open", "打开")}</button> : "-"}</td>
          <td className="px-3 py-2">{t.planUrl ? <button type="button" onClick={() => window.open(t.planUrl, "_blank")} className="rounded border px-2 py-1 text-xs">{tr(lang, "Open", "打开")}</button> : "-"}</td>
          <td className="px-3 py-2">
            {t.type === "after-signed-off-change" ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={techDone} onClick={() => updateApproval(t.id, t, { techApproved: true })} className="rounded border px-2 py-1 text-xs disabled:opacity-40">
                  {techDone ? tr(lang, "Tech Approved", "技术部已批准") : tr(lang, "Tech Approve", "技术部批准")}
                </button>
                <button type="button" disabled={prodDone} onClick={() => updateApproval(t.id, t, { productionApproved: true })} className="rounded border px-2 py-1 text-xs disabled:opacity-40">
                  {prodDone ? tr(lang, "Longtree Approved", "Longtree 生产已批准") : tr(lang, "Longtree Approve", "Longtree 生产批准")}
                </button>
              </div>
            ) : (
              <button type="button" disabled={prodDone} onClick={() => updateApproval(t.id, t, { productionApproved: true })} className="rounded border px-2 py-1 text-xs disabled:opacity-40">
                {prodDone ? tr(lang, "Production Approved", "生产已批准") : tr(lang, "Production Approve", "生产批准")}
              </button>
            )}
          </td>
        </tr>
      );
    });
  };

  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold">{tr(lang, "Requisition", "计划请求")}</h2>
          <button type="button" onClick={() => setShowNewForm((prev) => !prev)} className="rounded-md border border-slate-300 bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
            {showNewForm ? tr(lang, "Close", "关闭") : tr(lang, "New", "新建")}
          </button>
        </div>
      </div>

      {showNewForm ? (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-semibold">{tr(lang, "Add ticket", "添加 ticket")}</div>
          <div className="grid gap-3 md:grid-cols-2">
            <button type="button" onClick={() => setNewType("change-production-date")} className={`rounded border px-3 py-2 text-left text-sm ${newType === "change-production-date" ? "border-slate-800 bg-slate-100" : "border-slate-300"}`}>
              {tr(lang, "Change Production Date", "更改生产日期")}
            </button>
            <button type="button" onClick={() => setNewType("after-signed-off-change")} className={`rounded border px-3 py-2 text-left text-sm ${newType === "after-signed-off-change" ? "border-slate-800 bg-slate-100" : "border-slate-300"}`}>
              {tr(lang, "After Signed Off Change", "签字后更改")}
            </button>
          </div>

          {newType === "change-production-date" ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-sm">{tr(lang, "Chassis", "底盘号")}<input value={cpdChassis} onChange={(e) => setCpdChassis(e.target.value.toUpperCase())} className="mt-1 w-full rounded border px-2 py-1.5" /></label>
              <label className="text-sm">{tr(lang, "Requested Production Date", "申请生产日期")}<input type="date" value={cpdDate} onChange={(e) => setCpdDate(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5" /></label>
              <div className="md:col-span-2"><button type="button" onClick={submitChangeProduction} className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">{tr(lang, "Submit", "提交")}</button></div>
            </div>
          ) : null}

          {newType === "after-signed-off-change" ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-sm">{tr(lang, "Chassis", "底盘号")}<input value={ascChassis} onChange={(e) => setAscChassis(e.target.value.toUpperCase())} className="mt-1 w-full rounded border px-2 py-1.5" /></label>
              <label className="text-sm">{tr(lang, "Description", "描述")}<input value={ascDesc} onChange={(e) => setAscDesc(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5" /></label>
              <label className="text-sm">Spec<input type="file" onChange={(e) => setAscSpec(e.target.files?.[0] ?? null)} className="mt-1 w-full rounded border px-2 py-1.5" /></label>
              <label className="text-sm">Plan<input type="file" onChange={(e) => setAscPlan(e.target.files?.[0] ?? null)} className="mt-1 w-full rounded border px-2 py-1.5" /></label>
              <div className="md:col-span-2"><button type="button" onClick={submitAfterSigned} className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">{tr(lang, "Submit", "提交")}</button></div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold">{tr(lang, "Pending", "待处理")}</div>
        <div className="overflow-auto">
          <table className="min-w-[1300px] text-sm">
            <thead className="bg-slate-100">
              <tr>
                {[tr(lang, "Type", "类型"), tr(lang, "Chassis", "底盘号"), tr(lang, "PO Sent", "采购订单发送日期"), tr(lang, "Request Date", "需求申请日期"), tr(lang, "Current Status", "当前状态"), tr(lang, "Requested Date", "申请日期"), tr(lang, "Description", "描述"), "Spec", "Plan", tr(lang, "Actions", "操作")].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}
              </tr>
            </thead>
            <tbody>{renderRows(pendingTickets)}</tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold">{tr(lang, "Approved", "已批准")}</div>
        <div className="overflow-auto">
          <table className="min-w-[1300px] text-sm">
            <thead className="bg-slate-100">
              <tr>
                {[tr(lang, "Type", "类型"), tr(lang, "Chassis", "底盘号"), tr(lang, "PO Sent", "采购订单发送日期"), tr(lang, "Request Date", "需求申请日期"), tr(lang, "Current Status", "当前状态"), tr(lang, "Requested Date", "申请日期"), tr(lang, "Description", "描述"), "Spec", "Plan", tr(lang, "Actions", "操作")].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}
              </tr>
            </thead>
            <tbody>{renderRows(approvedTickets)}</tbody>
          </table>
        </div>
      </div>
    </>
  );
}
