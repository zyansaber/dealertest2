import { useEffect, useMemo, useState } from "react";
import { off, onValue, ref, set } from "firebase/database";
import { AlertTriangle, Bell } from "lucide-react";

import { database } from "@/lib/firebase";

import type { PlanningLang } from "./i18n";
import { statusText, tr } from "./i18n";
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

const alertRules: AlertRule[] = [
  {
    id: "po-to-chassis",
    titleEn: "Longtree Not Started >90 days",
    titleZh: "Longtree 未开始超过90天",
    statusEn: "Not Start in Longtree",
    currentKey: "Purchase Order Sent",
    nextKey: "chassisWelding",
    thresholdDays: 90,
  },
  {
    id: "chassis-to-assembly",
    titleEn: "Longtree Chassis Welding >30 days",
    titleZh: "Longtree 底盘焊接超过30天",
    statusEn: "Chassis welding in Longtree",
    currentKey: "chassisWelding",
    nextKey: "assemblyLine",
    thresholdDays: 30,
  },
  {
    id: "assembly-to-fg",
    titleEn: "Longtree Assembly Line >25 days",
    titleZh: "Longtree 总装线超过25天",
    statusEn: "Assembly line Longtree",
    currentKey: "assemblyLine",
    nextKey: "finishGoods",
    thresholdDays: 25,
  },
  {
    id: "fg-to-leaving",
    titleEn: "Longtree Finished, not left factory >7 days",
    titleZh: "Longtree 已完工未出厂超过7天",
    statusEn: "Finishedin Longtree",
    currentKey: "finishGoods",
    nextKey: "leavingFactory",
    thresholdDays: 7,
  },
  {
    id: "leaving-to-leftport",
    titleEn: "Longtree Left Factory, stuck at port >10 days",
    titleZh: "Longtree 出厂滞留港口超过10天",
    statusEn: "Leaving factory from Longtree",
    currentKey: "leavingFactory",
    nextKey: "Left Port",
    thresholdDays: 10,
  },
];

const getCustomerType = (row: Row): "stock" | "customer" => {
  const customer = String(row.schedule?.Customer ?? "").trim().toLowerCase();
  return customer.endsWith("stock") ? "stock" : "customer";
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
  const [customerTypeFilter, setCustomerTypeFilter] = useState<"all" | "stock" | "customer">("all");
  const [delayReasonMap, setDelayReasonMap] = useState<DelayReasonMap>({});
  const [editingReason, setEditingReason] = useState<Record<string, string>>({});

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

  const alerts = useMemo(() => {
    const now = Date.now();
    const out = rows.flatMap((row) => {
      const status = getLastStatus(row);
      const type = getCustomerType(row);
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
          const reasonKey = `${rule.id}__${displayValue(row.schedule?.Chassis)}`;
          return {
            rule,
            chassis: displayValue(row.schedule?.Chassis),
            customer: displayValue(row.schedule?.Customer),
            dealer: displayValue(row.schedule?.Dealer),
            model: displayValue(row.schedule?.Model),
            status,
            days,
            overdueDays: days - rule.thresholdDays,
            type,
            reasonKey,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x != null);
    });

    return out
      .filter((item) => selectedRule === "all" || item.rule.id === selectedRule)
      .filter((item) => customerTypeFilter === "all" || item.type === customerTypeFilter)
      .sort((a, b) => b.days - a.days);
  }, [rows, selectedRule, customerTypeFilter]);

  const ruleCounts = useMemo(() => {
    const base = Object.fromEntries(alertRules.map((r) => [r.id, 0])) as Record<string, number>;
    alerts.forEach((item) => {
      base[item.rule.id] += 1;
    });
    return base;
  }, [alerts]);

  const reminders = useMemo(() => {
    const now = Date.now();
    const items = rows
      .map((row) => {
        const requestTs = parseDateToTimestamp(row.schedule?.["Request Delivery Date"]);
        if (requestTs == null) return null;

        const hasAfterLeftFactory =
          parseDateToTimestamp(row.dateTrack?.estLeavngPort) != null ||
          parseDateToTimestamp(row.dateTrack?.["Left Port"]) != null ||
          parseDateToTimestamp(row.dateTrack?.melbournePortDate) != null ||
          parseDateToTimestamp(row.dateTrack?.["Received in Melbourne"]) != null;

        if (hasAfterLeftFactory) return null;

        const latestLeftFactoryTs = requestTs - 50 * DAY_MS;
        const leftFactoryTs = parseDateToTimestamp(row.dateTrack?.leavingFactory);
        const overdueDays = leftFactoryTs == null ? Math.max(0, Math.floor((now - latestLeftFactoryTs) / DAY_MS)) : Math.max(0, Math.floor((leftFactoryTs - latestLeftFactoryTs) / DAY_MS));
        const daysToDeadline = Math.floor((latestLeftFactoryTs - now) / DAY_MS);

        return {
          chassis: displayValue(row.schedule?.Chassis),
          customer: displayValue(row.schedule?.Customer),
          dealer: displayValue(row.schedule?.Dealer),
          model: displayValue(row.schedule?.Model),
          type: getCustomerType(row),
          requestTs,
          latestLeftFactoryTs,
          leftFactoryTs,
          overdueDays,
          daysToDeadline,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item != null)
      .filter((item) => customerTypeFilter === "all" || item.type === customerTypeFilter)
      .sort((a, b) => {
        if (a.overdueDays !== b.overdueDays) return b.overdueDays - a.overdueDays;
        return a.daysToDeadline - b.daysToDeadline;
      });

    return items;
  }, [rows, customerTypeFilter]);

  const saveDelayReason = async (reasonKey: string) => {
    const value = String(editingReason[reasonKey] ?? "").trim();
    await set(ref(database, `planningAlerts/delayReasons/${reasonKey}`), value);
  };

  const renderTypeFilter = (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-600">{tr(lang, "Type", "类型")}</span>
      <select
        value={customerTypeFilter}
        onChange={(e) => setCustomerTypeFilter(e.target.value as "all" | "stock" | "customer")}
        className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
      >
        <option value="all">{tr(lang, "All", "全部")}</option>
        <option value="stock">Stock</option>
        <option value="customer">Customer</option>
      </select>
    </div>
  );

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
              <Bell className="h-4 w-4" /> {tr(lang, "Reminders", "提醒")}
            </button>
          </div>
          {renderTypeFilter}
        </div>
      </div>

      {tab === "alerts" ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-5">
            <button
              type="button"
              onClick={() => setSelectedRule("all")}
              className={`rounded-xl border p-3 text-left text-sm ${selectedRule === "all" ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white"}`}
            >
              <p className="font-semibold">{tr(lang, "All Alerts", "全部异常")}</p>
              <p className="mt-1 text-xs">{alerts.length}</p>
            </button>
            {alertRules.map((rule) => (
              <button
                key={rule.id}
                type="button"
                onClick={() => setSelectedRule(rule.id)}
                className={`rounded-xl border p-3 text-left text-sm ${selectedRule === rule.id ? "border-rose-500 bg-rose-50" : "border-rose-100 bg-white hover:bg-rose-50"}`}
              >
                <p className="font-medium text-slate-900">{lang === "zh" ? rule.titleZh : rule.titleEn}</p>
                <p className="mt-1 text-xs text-rose-700">{ruleCounts[rule.id] ?? 0}</p>
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="max-h-[65vh] overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-left">Chassis</th>
                    <th className="px-3 py-2 text-left">{tr(lang, "Status", "状态")}</th>
                    <th className="px-3 py-2 text-left">{tr(lang, "Duration", "已停留")}</th>
                    <th className="px-3 py-2 text-left">{tr(lang, "Rule", "规则")}</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">{tr(lang, "Customer", "客户")}</th>
                    <th className="px-3 py-2 text-left">Dealer</th>
                    <th className="px-3 py-2 text-left">Model</th>
                    <th className="px-3 py-2 text-left">{tr(lang, "Delay Reason", "延迟原因")}</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                        {tr(lang, "No exception alerts found.", "当前没有异常告警。")}
                      </td>
                    </tr>
                  ) : (
                    alerts.map((item) => {
                      const value = editingReason[item.reasonKey] ?? delayReasonMap[item.reasonKey] ?? "";
                      return (
                        <tr key={item.reasonKey} className="border-t border-slate-100 align-top">
                          <td className="px-3 py-2 font-medium">{item.chassis}</td>
                          <td className="px-3 py-2">{statusText(lang, item.status)}</td>
                          <td className="px-3 py-2 text-rose-600">{item.days}{tr(lang, " days", "天")}</td>
                          <td className="px-3 py-2">&gt;{item.rule.thresholdDays}{tr(lang, " days", "天")}</td>
                          <td className="px-3 py-2 uppercase">{item.type}</td>
                          <td className="px-3 py-2">{item.customer}</td>
                          <td className="px-3 py-2">{item.dealer}</td>
                          <td className="px-3 py-2">{item.model}</td>
                          <td className="px-3 py-2">
                            <input
                              value={value}
                              onChange={(e) => setEditingReason((prev) => ({ ...prev, [item.reasonKey]: e.target.value }))}
                              onBlur={() => saveDelayReason(item.reasonKey)}
                              className="w-56 rounded-md border border-slate-300 px-2 py-1"
                              placeholder={tr(lang, "Enter reason", "填写原因")}
                            />
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
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="max-h-[65vh] overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-100 text-slate-700">
                <tr>
                  <th className="px-3 py-2 text-left">Chassis</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">{tr(lang, "Customer", "客户")}</th>
                  <th className="px-3 py-2 text-left">Dealer</th>
                  <th className="px-3 py-2 text-left">Model</th>
                  <th className="px-3 py-2 text-left">Request Delivery Date</th>
                  <th className="px-3 py-2 text-left">Latest Left Factory</th>
                  <th className="px-3 py-2 text-left">Actual Left Factory</th>
                  <th className="px-3 py-2 text-left">{tr(lang, "Delay", "延迟")}</th>
                </tr>
              </thead>
              <tbody>
                {reminders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                      {tr(lang, "No records with Request Delivery Date.", "没有带 Request Delivery Date 的记录。")}
                    </td>
                  </tr>
                ) : (
                  reminders.map((item) => (
                    <tr key={`${item.chassis}-${item.requestTs}`} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium">{item.chassis}</td>
                      <td className="px-3 py-2 uppercase">{item.type}</td>
                      <td className="px-3 py-2">{item.customer}</td>
                      <td className="px-3 py-2">{item.dealer}</td>
                      <td className="px-3 py-2">{item.model}</td>
                      <td className="px-3 py-2">{formatDate(item.requestTs)}</td>
                      <td className="px-3 py-2">{formatDate(item.latestLeftFactoryTs)}</td>
                      <td className="px-3 py-2">{item.leftFactoryTs == null ? "-" : formatDate(item.leftFactoryTs)}</td>
                      <td className={`px-3 py-2 font-medium ${item.overdueDays > 0 ? "text-rose-600" : "text-slate-700"}`}>
                        {item.overdueDays > 0 ? `${item.overdueDays}${tr(lang, " days", "天")}` : tr(lang, "On track", "正常")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
