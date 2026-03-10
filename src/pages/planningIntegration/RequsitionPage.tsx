import { useEffect, useMemo, useState } from "react";
import { off, onValue, push, ref, set } from "firebase/database";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";

import { database, storage } from "@/lib/firebase";

import type { PlanningLang } from "./i18n";
import { tr } from "./i18n";

type TicketType = "change-production-date" | "after-signed-off-change";
type TicketStatus = "unread" | "approved";

type Ticket = {
  id: string;
  type: TicketType;
  chassis: string;
  requestedDate?: string;
  description?: string;
  specUrl?: string;
  planUrl?: string;
  status: TicketStatus;
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

export default function RequsitionPage({ lang }: { lang: PlanningLang }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);

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
        .map(([id, item]: any) => {
          const rawStatus = item?.status;
          const status: TicketStatus = rawStatus === "approved" || rawStatus === "resolved" ? "approved" : "unread";
          return { id, ...(item || {}), status };
        })
        .sort((a, b) => b.createdAt - a.createdAt);
      setTickets(list);
    };
    onValue(r, handler);
    return () => off(r, "value", handler);
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
      status: "unread",
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
      status: "unread",
      createdAt: Date.now(),
    });

    resetNewForm();
  };

  const markApproved = async (id: string, current: Ticket) => {
    await set(ref(database, `mes/requisitionTickets/${id}`), { ...current, status: "approved" });
  };

  const unreadTickets = useMemo(() => tickets.filter((t) => t.status === "unread"), [tickets]);
  const approvedTickets = useMemo(() => tickets.filter((t) => t.status === "approved"), [tickets]);

  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold">{tr(lang, "Requisition", "计划请求")}</h2>
          <button
            type="button"
            onClick={() => setShowNewForm((prev) => !prev)}
            className="rounded-md border border-slate-300 bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            {showNewForm ? tr(lang, "Close", "关闭") : tr(lang, "New", "新建")}
          </button>
        </div>
      </div>

      {showNewForm ? (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-semibold">{tr(lang, "Add ticket", "添加 ticket")}</div>
          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setNewType("change-production-date")}
              className={`rounded border px-3 py-2 text-left text-sm ${newType === "change-production-date" ? "border-slate-800 bg-slate-100" : "border-slate-300"}`}
            >
              {tr(lang, "Change Production Date", "更改生产日期")}
            </button>
            <button
              type="button"
              onClick={() => setNewType("after-signed-off-change")}
              className={`rounded border px-3 py-2 text-left text-sm ${newType === "after-signed-off-change" ? "border-slate-800 bg-slate-100" : "border-slate-300"}`}
            >
              {tr(lang, "After Signed Off Change", "签字后更改")}
            </button>
          </div>

          {newType === "change-production-date" ? (
            <div className="mt-4 space-y-2 border-t pt-4">
              <input
                className="w-full rounded border px-3 py-2 text-sm"
                placeholder={tr(lang, "Chassis", "车架号")}
                value={cpdChassis}
                onChange={(e) => setCpdChassis(e.target.value)}
              />
              <input type="date" className="w-full rounded border px-3 py-2 text-sm" value={cpdDate} onChange={(e) => setCpdDate(e.target.value)} />
              <button type="button" onClick={submitChangeProduction} className="rounded bg-slate-900 px-3 py-2 text-sm text-white">
                {tr(lang, "Submit", "提交")}
              </button>
            </div>
          ) : null}

          {newType === "after-signed-off-change" ? (
            <div className="mt-4 space-y-2 border-t pt-4">
              <input
                className="w-full rounded border px-3 py-2 text-sm"
                placeholder={tr(lang, "Chassis", "车架号")}
                value={ascChassis}
                onChange={(e) => setAscChassis(e.target.value)}
              />
              <textarea
                className="w-full rounded border px-3 py-2 text-sm"
                placeholder={tr(lang, "Description", "描述")}
                value={ascDesc}
                onChange={(e) => setAscDesc(e.target.value)}
              />
              <input type="file" onChange={(e) => setAscSpec(e.target.files?.[0] ?? null)} />
              <input type="file" onChange={(e) => setAscPlan(e.target.files?.[0] ?? null)} />
              <button type="button" onClick={submitAfterSigned} className="rounded bg-slate-900 px-3 py-2 text-sm text-white">
                {tr(lang, "Submit", "提交")}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-1 text-sm font-semibold">{tr(lang, "Unread cards", "未读 cards")}</div>
          <div className="text-3xl font-bold">{unreadTickets.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-1 text-sm font-semibold">{tr(lang, "Approved cards", "已批准 cards")}</div>
          <div className="text-3xl font-bold">{approvedTickets.length}</div>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[1000px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-3 py-3 text-left">{tr(lang, "Type", "类型")}</th>
              <th className="px-3 py-3 text-left">{tr(lang, "Chassis", "车架号")}</th>
              <th className="px-3 py-3 text-left">{tr(lang, "Requested date", "需求日期")}</th>
              <th className="px-3 py-3 text-left">{tr(lang, "Description", "描述")}</th>
              <th className="px-3 py-3 text-left">Spec</th>
              <th className="px-3 py-3 text-left">Plan</th>
              <th className="px-3 py-3 text-left">{tr(lang, "Status", "状态")}</th>
              <th className="px-3 py-3 text-left">{tr(lang, "Action", "操作")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tickets.map((t) => (
              <tr key={t.id}>
                <td className="px-3 py-2.5">{ticketTypeLabel(lang, t.type)}</td>
                <td className="px-3 py-2.5">{t.chassis}</td>
                <td className="px-3 py-2.5">{t.requestedDate ?? "-"}</td>
                <td className="max-w-[280px] px-3 py-2.5">{t.description || "-"}</td>
                <td className="px-3 py-2.5">
                  {t.specUrl ? (
                    <button type="button" onClick={() => window.open(t.specUrl, "_blank")} className="rounded border px-2 py-1 text-xs">
                      {tr(lang, "Download", "下载")}
                    </button>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {t.planUrl ? (
                    <button type="button" onClick={() => window.open(t.planUrl, "_blank")} className="rounded border px-2 py-1 text-xs">
                      {tr(lang, "Download", "下载")}
                    </button>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-3 py-2.5">{t.status === "approved" ? tr(lang, "Approved", "已批准") : tr(lang, "Unread", "未读")}</td>
                <td className="px-3 py-2.5">
                  {t.status === "approved" ? (
                    <span className="text-xs text-slate-500">{tr(lang, "Approved", "已批准")}</span>
                  ) : (
                    <button type="button" onClick={() => markApproved(t.id, t)} className="rounded border px-2 py-1 text-xs">
                      {tr(lang, "Approve", "批准")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
