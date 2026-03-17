import { useEffect, useMemo, useState } from "react";
import { off, onValue, ref, set } from "firebase/database";
import { AlertTriangle, Bell, Download } from "lucide-react";
import * as XLSX from "xlsx";

import { database } from "@/lib/firebase";

import type { PlanningLang } from "./i18n";
import { statusText, tr } from "./i18n";
import { getPlanningOrderType, planningOrderTypeLabel, type PlanningOrderType } from "./orderType";
import type { Row } from "./types";
import { displayValue, formatDate, parseDateToTimestamp } from "./utils";

type AlertRule = {
  id: string;
  titleEn: string;
  titleZh: string;
  statusEn: string;
  currentKey: "Purchase Order Sent" | "chassisWelding" | "assemblyLine" | "finishGoods" | "leavingFactory";
  nextKey: "chassisWelding" | "assemblyLine" | "finishGoods" | "leavingFactory" | "Left Port";
  thresholdDays: number;
};

type DelayReasonMap = Record<string, string>;

const DAY_MS = 24 * 60 * 60 * 1000;

const defaultAlertRules: AlertRule[] = [
  { id: "po-to-chassis", titleEn: "Longtree Not Started >90 days", titleZh: "Longtree 未开始超过90天", statusEn: "Not Start in Longtree", currentKey: "Purchase Order Sent", nextKey: "chassisWelding", thresholdDays: 90 },
  { id: "chassis-to-assembly", titleEn: "Longtree Chassis Welding >30 days", titleZh: "Longtree 底盘焊接超过30天", statusEn: "Chassis welding in Longtree", currentKey: "chassisWelding", nextKey: "assemblyLine", thresholdDays: 30 },
  { id: "assembly-to-fg", titleEn: "Longtree Assembly Line >25 days", titleZh: "Longtree 总装线超过25天", statusEn: "Assembly line Longtree", currentKey: "assemblyLine", nextKey: "finishGoods", thresholdDays: 25 },
  { id: "fg-to-leaving", titleEn: "Longtree Finished, not left factory >7 days", titleZh: "Longtree 已完工未出厂超过7天", statusEn: "Finishedin Longtree", currentKey: "finishGoods", nextKey: "leavingFactory", thresholdDays: 7 },
  { id: "leaving-to-leftport", titleEn: "Longtree Left Factory, stuck at port >10 days", titleZh: "Longtree 出厂滞留港口超过10天", statusEn: "Leaving factory from Longtree", currentKey: "leavingFactory", nextKey: "Left Port", thresholdDays: 10 },
];

const customerAlertRules: AlertRule[] = [
  { id: "po-to-chassis", titleEn: "Longtree Not Started >15 days", titleZh: "Longtree 未开始超过15天", statusEn: "Not Start in Longtree", currentKey: "Purchase Order Sent", nextKey: "chassisWelding", thresholdDays: 15 },
  { id: "chassis-to-assembly", titleEn: "Longtree Chassis Welding >20 days", titleZh: "Longtree 底盘焊接超过20天", statusEn: "Chassis welding in Longtree", currentKey: "chassisWelding", nextKey: "assemblyLine", thresholdDays: 20 },
  { id: "assembly-to-fg", titleEn: "Longtree Assembly Line >20 days", titleZh: "Longtree 总装线超过20天", statusEn: "Assembly line Longtree", currentKey: "assemblyLine", nextKey: "finishGoods", thresholdDays: 20 },
  { id: "fg-to-leaving", titleEn: "Longtree Finished, not left factory >7 days", titleZh: "Longtree 已完工未出厂超过7天", statusEn: "Finishedin Longtree", currentKey: "finishGoods", nextKey: "leavingFactory", thresholdDays: 7 },
  { id: "leaving-to-leftport", titleEn: "Longtree Left Factory, stuck at port >10 days", titleZh: "Longtree 出厂滞留港口超过10天", statusEn: "Leaving factory from Longtree", currentKey: "leavingFactory", nextKey: "Left Port", thresholdDays: 10 },
];

const transitionDefs = [
  { label: "Purchase Order Sent", get: (row: Row) => parseDateToTimestamp(row.schedule?.["Purchase Order Sent"]) },
  { label: "chassisWelding", get: (row: Row) => parseDateToTimestamp(row.dateTrack?.chassisWelding) },
  { label: "assemblyLine", get: (row: Row) => parseDateToTimestamp(row.dateTrack?.assemblyLine) },
  { label: "finishGoods", get: (row: Row) => parseDateToTimestamp(row.dateTrack?.finishGoods) },
  { label: "leavingFactory", get: (row: Row) => parseDateToTimestamp(row.dateTrack?.leavingFactory) },
  { label: "Received in Melbourne", get: (row: Row) => parseDateToTimestamp(row.dateTrack?.["Received in Melbourne"]) },
] as const;

const reasonSegmentMap = [
  { from: "Purchase Order Sent", to: "chassisWelding", reasonRuleId: "po-to-chassis" },
  { from: "chassisWelding", to: "assemblyLine", reasonRuleId: "chassis-to-assembly" },
  { from: "assemblyLine", to: "finishGoods", reasonRuleId: "assembly-to-fg" },
  { from: "finishGoods", to: "leavingFactory", reasonRuleId: "fg-to-leaving" },
  { from: "leavingFactory", to: "Received in Melbourne", reasonRuleId: "leaving-to-leftport" },
] as const;

const milestoneLabel = (lang: PlanningLang, key: string) => {
  const map: Record<string, string> = {
    "Purchase Order Sent": "采购订单发送",
    chassisWelding: "车架焊接",
    assemblyLine: "总装",
    finishGoods: "完工入库",
    leavingFactory: "离厂",
    "Received in Melbourne": "墨尔本工厂",
  };
  return lang === "zh" ? map[key] ?? key : key;
};

const formatEtaInput = (raw: string) => {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

const getLastStatus = (row: Row) => {
  if (parseDateToTimestamp(row.dateTrack?.["Received in Melbourne"]) != null) return "Melbourn Factory";
  if (parseDateToTimestamp(row.dateTrack?.melbournePortDate) != null) return "Melbourn Port";
  if (parseDateToTimestamp(row.dateTrack?.["Left Port"]) != null) return "On the sea";
  if (parseDateToTimestamp(row.dateTrack?.estLeavngPort) != null) return "waiting in port";
  if (parseDateToTimestamp(row.dateTrack?.leavingFactory) != null) return "Leaving factory from Longtree";
  if (parseDateToTimestamp(row.dateTrack?.finishGoods) != null) return "Finishedin Longtree";
  if (parseDateToTimestamp(row.dateTrack?.assemblyLine) != null) return "Assembly line Longtree";
  if (parseDateToTimestamp(row.dateTrack?.chassisWelding) != null) return "Chassis welding in Longtree";
  if (parseDateToTimestamp(row.schedule?.["Purchase Order Sent"]) != null) return "Not Start in Longtree";
  if (parseDateToTimestamp(row.schedule?.["Signed Plans Received"]) != null) return "Waiting for sending";
  if (parseDateToTimestamp(row.schedule?.["Order Received Date"]) != null) return "not confirmed orders";
  return "";
};

export default function AlertsAndRemindersPage({ rows, lang }: { rows: Row[]; lang: PlanningLang }) {
  const [tab, setTab] = useState<"alerts" | "reminders">("alerts");
  const [selectedRule, setSelectedRule] = useState<string>("all");
  const [customerTypeFilter, setCustomerTypeFilter] = useState<"all" | PlanningOrderType>("all");
  const [delayReasonMap, setDelayReasonMap] = useState<DelayReasonMap>({});
  const [editingReason, setEditingReason] = useState<Record<string, string>>({});
  const [etaMap, setEtaMap] = useState<Record<string, string>>({});
  const [editingEta, setEditingEta] = useState<Record<string, string>>({});

  const alertRules = useMemo(
    () => (customerTypeFilter === "customer" ? customerAlertRules : defaultAlertRules),
    [customerTypeFilter],
  );

  useEffect(() => {
    const reasonsRef = ref(database, "planningAlerts/delayReasons");
    const handler = (snap: any) => {
      const val = snap.val();
      if (val && typeof val === "object") setDelayReasonMap(val as DelayReasonMap);
      else setDelayReasonMap({});
    };
    onValue(reasonsRef, handler);
    return () => off(reasonsRef, "value", handler);
  }, []);

  useEffect(() => {
    const etaRef = ref(database, "planningAlerts/estimatedDeparture");
    const handler = (snap: any) => {
      const val = snap.val();
      if (val && typeof val === "object") setEtaMap(val as Record<string, string>);
      else setEtaMap({});
    };
    onValue(etaRef, handler);
    return () => off(etaRef, "value", handler);
  }, []);

  const baseAlerts = useMemo(() => {
    const now = Date.now();
    return rows.flatMap((row) => {
      const status = getLastStatus(row);
      const type = getPlanningOrderType(row.schedule?.Customer);

      return alertRules
        .filter((rule) => status === rule.statusEn || (rule.id === "leaving-to-leftport" && status === "waiting in port"))
        .map((rule) => {
          const currentRaw = rule.currentKey === "Purchase Order Sent" ? row.schedule?.[rule.currentKey] : row.dateTrack?.[rule.currentKey];
          const nextRaw = row.dateTrack?.[rule.nextKey];
          const currentTs = parseDateToTimestamp(currentRaw);
          const nextTs = parseDateToTimestamp(nextRaw);
          if (currentTs == null || nextTs != null) return null;
          const days = Math.floor((now - currentTs) / DAY_MS);
          if (days <= rule.thresholdDays) return null;

          return {
            rule,
            chassis: displayValue(row.schedule?.Chassis),
            customer: displayValue(row.schedule?.Customer),
            dealer: displayValue(row.schedule?.Dealer),
            model: displayValue(row.schedule?.Model),
            status,
            days,
            type,
            reasonKey: `${rule.id}__${displayValue(row.schedule?.Chassis)}`,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x != null);
    });
  }, [rows, alertRules]);

  const filteredByTypeAlerts = useMemo(
    () => baseAlerts.filter((item) => customerTypeFilter === "all" || item.type === customerTypeFilter),
    [baseAlerts, customerTypeFilter],
  );

  const alerts = useMemo(
    () => filteredByTypeAlerts.filter((item) => selectedRule === "all" || item.rule.id === selectedRule).sort((a, b) => b.days - a.days),
    [filteredByTypeAlerts, selectedRule],
  );

  const ruleCounts = useMemo(() => {
    const base = Object.fromEntries(alertRules.map((r) => [r.id, 0])) as Record<string, number>;
    filteredByTypeAlerts.forEach((item) => {
      base[item.rule.id] += 1;
    });
    return base;
  }, [alertRules, filteredByTypeAlerts]);

  const reminders = useMemo(() => {
    const now = Date.now();
    return rows
      .map((row) => {
        const requestTs = parseDateToTimestamp(row.schedule?.["Request Delivery Date"]);
        if (requestTs == null) return null;

        const hasAfterLeftFactory =
          parseDateToTimestamp(row.dateTrack?.estLeavngPort) != null ||
          parseDateToTimestamp(row.dateTrack?.["Left Port"]) != null ||
          parseDateToTimestamp(row.dateTrack?.melbournePortDate) != null ||
          parseDateToTimestamp(row.dateTrack?.["Received in Melbourne"]) != null;
        if (hasAfterLeftFactory) return null;

        const leftFactoryTs = parseDateToTimestamp(row.dateTrack?.leavingFactory);
        if (leftFactoryTs != null) return null;

        const latestLeftFactoryTs = requestTs - 50 * DAY_MS;
        const overdueDays = Math.max(0, Math.floor((now - latestLeftFactoryTs) / DAY_MS));
        const remainingDays = Math.max(0, Math.floor((latestLeftFactoryTs - now) / DAY_MS));
        const chassis = displayValue(row.schedule?.Chassis);

        const points = transitionDefs
          .map((p) => ({ label: p.label, ts: p.get(row) }))
          .filter((x) => x.ts != null) as Array<{ label: string; ts: number }>;
        const timelineOneLine = points.map((p) => `${milestoneLabel(lang, p.label)}: ${formatDate(p.ts)}`).join("   ");

        let slowReason = "";
        for (const seg of reasonSegmentMap) {
          const fromTs = points.find((p) => p.label === seg.from)?.ts ?? null;
          const toTs = points.find((p) => p.label === seg.to)?.ts ?? null;
          if (fromTs != null && toTs == null) {
            const customReason = String(delayReasonMap[`${seg.reasonRuleId}__${chassis}`] ?? "").trim();
            slowReason = `${milestoneLabel(lang, seg.from)} → ${milestoneLabel(lang, seg.to)}${customReason ? `：${customReason}` : lang === "zh" ? "：待补充原因" : ": reason pending"}`;
            break;
          }
        }

        return {
          chassis,
          customer: displayValue(row.schedule?.Customer),
          dealer: displayValue(row.schedule?.Dealer),
          model: displayValue(row.schedule?.Model),
          type: getPlanningOrderType(row.schedule?.Customer),
          requestTs,
          latestLeftFactoryTs,
          overdueDays,
          remainingDays,
          timelineOneLine,
          slowReason,
          eta: etaMap[chassis] ?? "",
        };
      })
      .filter((item): item is NonNullable<typeof item> => item != null)
      .filter((item) => customerTypeFilter === "all" || item.type === customerTypeFilter)
      .sort((a, b) => {
        if (a.overdueDays !== b.overdueDays) return b.overdueDays - a.overdueDays;
        return a.remainingDays - b.remainingDays;
      });
  }, [rows, customerTypeFilter, delayReasonMap, etaMap, lang]);

  const saveDelayReason = async (reasonKey: string) => {
    const value = String(editingReason[reasonKey] ?? "").trim();
    await set(ref(database, `planningAlerts/delayReasons/${reasonKey}`), value);
  };

  const saveEta = async (chassis: string) => {
    const value = String(editingEta[chassis] ?? "").trim();
    await set(ref(database, `planningAlerts/estimatedDeparture/${chassis}`), value);
  };

  const downloadAlertsExcel = () => {
    const data = alerts.map((item) => ({
      Chassis: item.chassis,
      Status: statusText(lang, item.status),
      DurationDays: item.days,
      Rule: `>${item.rule.thresholdDays}${lang === "zh" ? "天" : " days"}`,
      Type: item.type,
      Customer: item.customer,
      Dealer: item.dealer,
      Model: item.model,
      DelayReason: delayReasonMap[item.reasonKey] ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "alerts");
    XLSX.writeFile(wb, "planning-exception-alerts.xlsx");
  };

  const downloadRemindersExcel = () => {
    const data = reminders.map((item) => ({
      Chassis: item.chassis,
      Type: item.type,
      Customer: item.customer,
      Dealer: item.dealer,
      Model: item.model,
      RequestDeliveryDate: formatDate(item.requestTs),
      LatestLeftFactory: formatDate(item.latestLeftFactoryTs),
      Urgency:
        item.overdueDays > 0
          ? `${lang === "zh" ? "已延迟" : "Delayed"} ${item.overdueDays}${lang === "zh" ? "天" : " days"}`
          : `${lang === "zh" ? "剩余" : "Remaining"} ${item.remainingDays}${lang === "zh" ? "天" : " days"}`,
      Timeline: item.timelineOneLine,
      SlowSegmentReason: item.slowReason,
      EstimatedDeparture: item.eta,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "reminders");
    XLSX.writeFile(wb, "planning-urgent-reminders.xlsx");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-xl font-semibold">{tr(lang, "Exceptions & Reminders", "异常与提醒")}</h2>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <button type="button" onClick={() => setTab("alerts")} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium ${tab === "alerts" ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
              <AlertTriangle className="h-4 w-4" /> {tr(lang, "Exception Alerts", "异常告警")}
            </button>
            <button type="button" onClick={() => setTab("reminders")} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium ${tab === "reminders" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
              <Bell className="h-4 w-4" /> {tr(lang, "Special Urgent Reminders", "特别加急提醒")}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">{tr(lang, "Type", "类型")}</span>
            <select value={customerTypeFilter} onChange={(e) => setCustomerTypeFilter(e.target.value as "all" | PlanningOrderType) } className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
              <option value="all">{tr(lang, "All", "全部")}</option>
              <option value="stock">{planningOrderTypeLabel(lang, "stock")}</option>
              <option value="customer">{planningOrderTypeLabel(lang, "customer")}</option>
              <option value="prototype">{planningOrderTypeLabel(lang, "prototype")}</option>
            </select>
          </div>
        </div>
      </div>

      {tab === "alerts" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-end">
            <button type="button" onClick={downloadAlertsExcel} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
              <Download className="h-4 w-4" /> {tr(lang, "Download Excel", "下载 Excel")}
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-6">
            <button type="button" onClick={() => setSelectedRule("all")} className={`rounded-xl border p-3 text-left ${selectedRule === "all" ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`}>
              <p className="font-semibold">{tr(lang, "All Alerts", "全部异常")}</p>
              <p className="mt-1 text-2xl font-bold leading-none">{filteredByTypeAlerts.length}</p>
            </button>
            {alertRules.map((rule) => (
              <button key={rule.id} type="button" onClick={() => setSelectedRule(rule.id)} className={`rounded-xl border p-3 text-left ${selectedRule === rule.id ? "border-rose-500 bg-rose-50" : "border-rose-100 bg-white hover:bg-rose-50"}`}>
                <p className="text-sm font-medium text-slate-900">{lang === "zh" ? rule.titleZh : rule.titleEn}</p>
                <p className="mt-2 text-3xl font-extrabold leading-none text-rose-700">{ruleCounts[rule.id] ?? 0}</p>
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="max-h-[75vh] overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-left">{tr(lang, "Chassis", "车架号")}</th>
                    <th className="px-3 py-2 text-left">{tr(lang, "Status", "状态")}</th>
                    <th className="px-3 py-2 text-left">{tr(lang, "Duration", "已停留")}</th>
                    <th className="px-3 py-2 text-left">{tr(lang, "Rule", "规则")}</th>
                    <th className="px-3 py-2 text-left">{tr(lang, "Type", "类型")}</th>
                    <th className="px-3 py-2 text-left">{tr(lang, "Customer", "客户")}</th>
                    <th className="px-3 py-2 text-left">{tr(lang, "Dealer", "经销商")}</th>
                    <th className="px-3 py-2 text-left">{tr(lang, "Model", "车型")}</th>
                    <th className="px-3 py-2 text-left">{tr(lang, "Delay Reason", "延迟原因")}</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-slate-500">{tr(lang, "No exception alerts found.", "当前没有异常告警。")}</td>
                    </tr>
                  ) : (
                    alerts.map((item) => {
                      const value = editingReason[item.reasonKey] ?? delayReasonMap[item.reasonKey] ?? "";
                      const customerRowClass = item.type === "customer" ? "bg-amber-50/60" : item.type === "prototype" ? "bg-fuchsia-50/60" : "";
                      return (
                        <tr key={item.reasonKey} className={`border-t border-slate-100 align-top ${customerRowClass}`}>
                          <td className="px-3 py-2 font-medium">{item.chassis}</td>
                          <td className="px-3 py-2">{statusText(lang, item.status)}</td>
                          <td className="px-3 py-2 text-rose-600">{item.days}{tr(lang, " days", "天")}</td>
                          <td className="px-3 py-2">&gt;{item.rule.thresholdDays}{tr(lang, " days", "天")}</td>
                          <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${item.type === "customer" ? "bg-amber-200/70 text-amber-800" : item.type === "prototype" ? "bg-fuchsia-100 text-fuchsia-800" : "bg-emerald-100 text-emerald-800"}`}>{planningOrderTypeLabel(lang, item.type)}</span></td>
                          <td className="px-3 py-2">{item.customer}</td>
                          <td className="px-3 py-2">{item.dealer}</td>
                          <td className="px-3 py-2">{item.model}</td>
                          <td className="px-3 py-2">
                            <input value={value} onChange={(e) => setEditingReason((prev) => ({ ...prev, [item.reasonKey]: e.target.value }))} onBlur={() => saveDelayReason(item.reasonKey)} className="w-56 rounded-md border border-slate-300 px-2 py-1" placeholder={tr(lang, "Enter reason", "填写原因")} />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-end">
            <button type="button" onClick={downloadRemindersExcel} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
              <Download className="h-4 w-4" /> {tr(lang, "Download Excel", "下载 Excel")}
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="h-[calc(100vh-230px)] overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-left">{tr(lang, "Chassis", "车架号")}</th>
                    <th className="px-3 py-2 text-left">{tr(lang, "Type", "类型")}</th>
                    <th className="px-3 py-2 text-left">{tr(lang, "Customer", "客户")}</th>
                    <th className="px-3 py-2 text-left">{tr(lang, "Dealer", "经销商")}</th>
                    <th className="px-3 py-2 text-left">{tr(lang, "Model", "车型")}</th>
                    <th className="px-3 py-2 text-left">{tr(lang, "Request Delivery Date", "客户要求交付日期")}</th>
                    <th className="px-3 py-2 text-left">{tr(lang, "Latest Left Factory", "最晚离厂日期")}</th>
                    <th className="px-3 py-2 text-left">{tr(lang, "Urgency", "紧急程度")}</th>
                  </tr>
                </thead>
                <tbody>
                  {reminders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-slate-500">{tr(lang, "No records with Request Delivery Date.", "没有带 Request Delivery Date 的记录。")}</td>
                    </tr>
                  ) : (
                    reminders.flatMap((item) => {
                      const customerRowClass = item.type === "customer" ? "bg-amber-50/60" : item.type === "prototype" ? "bg-fuchsia-50/60" : "";
                      const etaValue = editingEta[item.chassis] ?? item.eta;

                      const mainRow = (
                        <tr key={`${item.chassis}-${item.requestTs}`} className={`border-t border-slate-100 ${customerRowClass}`}>
                          <td className="px-3 py-2 font-medium">{item.chassis}</td>
                          <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${item.type === "customer" ? "bg-amber-200/70 text-amber-800" : item.type === "prototype" ? "bg-fuchsia-100 text-fuchsia-800" : "bg-emerald-100 text-emerald-800"}`}>{planningOrderTypeLabel(lang, item.type)}</span></td>
                          <td className="px-3 py-2">{item.customer}</td>
                          <td className="px-3 py-2">{item.dealer}</td>
                          <td className="px-3 py-2">{item.model}</td>
                          <td className="px-3 py-2">{formatDate(item.requestTs)}</td>
                          <td className="px-3 py-2">{formatDate(item.latestLeftFactoryTs)}</td>
                          <td className={`px-3 py-2 font-medium ${item.overdueDays > 0 ? "text-rose-600" : "text-amber-700"}`}>
                            {item.overdueDays > 0 ? `${tr(lang, "Delayed", "已延迟")} ${item.overdueDays}${tr(lang, " days", "天")}` : `${tr(lang, "Remaining", "剩余")} ${item.remainingDays}${tr(lang, " days", "天")}`}
                          </td>
                        </tr>
                      );

                      const detailRow = (
                        <tr key={`${item.chassis}-${item.requestTs}-detail`} className={`border-b border-slate-200 ${customerRowClass}`}>
                          <td colSpan={8} className="px-3 pb-3 pt-1">
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                              <div className="mb-2">
                                <span className="font-semibold">{tr(lang, "Timeline", "时间线")}：</span>
                                <span className="ml-1">{item.timelineOneLine || "-"}</span>
                              </div>
                              <div className="mb-2">
                                <span className="font-semibold">{tr(lang, "Slow Segment", "慢节点")}：</span>
                                <span className="ml-1">{item.slowReason || (lang === "zh" ? "暂无" : "N/A")}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{tr(lang, "Estimated Dispatch Date", "预计发车时间")}：</span>
                                <input
                                  type="text"
                                  value={etaValue}
                                  onChange={(e) => setEditingEta((prev) => ({ ...prev, [item.chassis]: formatEtaInput(e.target.value) }))}
                                  onBlur={() => saveEta(item.chassis)}
                                  className="rounded-md border border-slate-300 bg-white px-2 py-1"
                                  placeholder="dd/mm/yyyy"
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );

                      return [mainRow, detailRow];
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
