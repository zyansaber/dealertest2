import { useEffect, useMemo, useState } from "react";
import { off, onValue, push, ref, set } from "firebase/database";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";

import { database, storage } from "@/lib/firebase";

import type { PlanningLang } from "./i18n";
import { tr } from "./i18n";

type Ticket = {
  id: string;
  type: "change-production-date" | "after-signed-off-change";
  chassis: string;
  requestedDate?: string;
  description?: string;
  specUrl?: string;
  planUrl?: string;
  status: "open" | "resolved";
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

export default function RequsitionPage({ lang }: { lang: PlanningLang }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);

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
      const list: Ticket[] = Object.entries(val).map(([id, item]: any) => ({ id, ...(item || {}) })).sort((a, b) => b.createdAt - a.createdAt);
      setTickets(list);
    };
    onValue(r, handler);
    return () => off(r, "value", handler);
  }, []);

  const submitChangeProduction = async () => {
    if (!cpdChassis.trim() || !cpdDate) return;
    const p = push(ref(database, "mes/requisitionTickets"));
    await set(p, {
      type: "change-production-date",
      chassis: cpdChassis.trim().toUpperCase(),
      requestedDate: cpdDate,
      status: "open",
      createdAt: Date.now(),
    });
    setCpdChassis("");
    setCpdDate("");
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
      status: "open",
      createdAt: Date.now(),
    });

    setAscChassis("");
    setAscDesc("");
    setAscSpec(null);
    setAscPlan(null);
  };

  const markResolved = async (id: string, current: Ticket) => {
    await set(ref(database, `mes/requisitionTickets/${id}`), { ...current, status: "resolved" });
  };

  const openTickets = useMemo(() => tickets.filter((t) => t.status !== "resolved"), [tickets]);
  const resolvedTickets = useMemo(() => tickets.filter((t) => t.status === "resolved"), [tickets]);

  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-semibold">{tr(lang, "Requsition", "Requsition")}</h2>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-semibold">{tr(lang, "Change Production Date", "Change Production Date")}</div>
          <div className="space-y-2">
            <input className="w-full rounded border px-3 py-2 text-sm" placeholder={tr(lang, "Chassis", "车架号")} value={cpdChassis} onChange={(e) => setCpdChassis(e.target.value)} />
            <input type="date" className="w-full rounded border px-3 py-2 text-sm" value={cpdDate} onChange={(e) => setCpdDate(e.target.value)} />
            <button type="button" onClick={submitChangeProduction} className="rounded bg-slate-900 px-3 py-2 text-sm text-white">{tr(lang, "Approve", "批准")}</button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-semibold">{tr(lang, "After Signed Off Change", "After Signed Off Change")}</div>
          <div className="space-y-2">
            <input className="w-full rounded border px-3 py-2 text-sm" placeholder={tr(lang, "Chassis", "车架号")} value={ascChassis} onChange={(e) => setAscChassis(e.target.value)} />
            <textarea className="w-full rounded border px-3 py-2 text-sm" placeholder={tr(lang, "Description", "描述")} value={ascDesc} onChange={(e) => setAscDesc(e.target.value)} />
            <input type="file" onChange={(e) => setAscSpec(e.target.files?.[0] ?? null)} />
            <input type="file" onChange={(e) => setAscPlan(e.target.files?.[0] ?? null)} />
            <button type="button" onClick={submitAfterSigned} className="rounded bg-slate-900 px-3 py-2 text-sm text-white">{tr(lang, "Submit", "提交")}</button>
          </div>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 text-sm font-semibold">{tr(lang, "Ticket cards", "ticket cards")}</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {openTickets.map((t) => (
            <div key={t.id} className="rounded border p-3">
              <div className="text-sm font-semibold">{t.type}</div>
              <div className="text-xs text-slate-600">{t.chassis}</div>
              {t.requestedDate ? <div className="text-xs">{tr(lang, "Requested date", "需求发车时间")}: {t.requestedDate}</div> : null}
              {t.description ? <div className="text-xs">{t.description}</div> : null}
              <div className="mt-2 flex gap-2">
                {t.specUrl ? <button type="button" onClick={() => window.open(t.specUrl, "_blank")} className="rounded border px-2 py-1 text-xs">Spec</button> : null}
                {t.planUrl ? <button type="button" onClick={() => window.open(t.planUrl, "_blank")} className="rounded border px-2 py-1 text-xs">Plan</button> : null}
                <button type="button" onClick={() => markResolved(t.id, t)} className="rounded border px-2 py-1 text-xs">{tr(lang, "Resolve", "解决")}</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 text-sm font-semibold">{tr(lang, "Resolved cards", "解决的cards")}</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {resolvedTickets.map((t) => (
            <div key={t.id} className="rounded border p-3 opacity-75">
              <div className="text-sm font-semibold">{t.type}</div>
              <div className="text-xs text-slate-600">{t.chassis}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
