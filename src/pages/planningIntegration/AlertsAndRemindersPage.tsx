import { useMemo, useState } from "react";
import { AlertTriangle, Bell, Clock3, Flag } from "lucide-react";

import type { PlanningLang } from "./i18n";
import { tr, statusText } from "./i18n";
import type { Row } from "./types";
import { displayValue, formatDate, parseDateToTimestamp } from "./utils";

type AlertRule = {
  id: string;
  labelEn: string;
  labelZh: string;
  statusEn: string;
  currentKey: "Purchase Order Sent" | "chassisWelding" | "assemblyLine" | "finishGoods" | "leavingFactory";
  nextKey: "chassisWelding" | "assemblyLine" | "finishGoods" | "leavingFactory" | "Left Port";
  thresholdDays: number;
};

type AlertHit = {
  chassis: string;
  customer: string;
  dealer: string;
  model: string;
  status: string;
  days: number;
  thresholdDays: number;
  currentDateText: string;
  currentKey: string;
  nextKey: string;
  overdueDays: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const alertRules: AlertRule[] = [
  {
    id: "po-to-chassis",
    labelEn: "Purchase Order Sent → chassisWelding over 90 days",
    labelZh: "Purchase Order Sent → chassisWelding 超过 90 天",
    statusEn: "Not Start in Longtree",
    currentKey: "Purchase Order Sent",
    nextKey: "chassisWelding",
    thresholdDays: 90,
  },
  {
    id: "chassis-to-assembly",
    labelEn: "chassisWelding → assemblyLine over 30 days",
    labelZh: "chassisWelding → assemblyLine 超过 30 天",
    statusEn: "Chassis welding in Longtree",
    currentKey: "chassisWelding",
    nextKey: "assemblyLine",
    thresholdDays: 30,
  },
  {
    id: "assembly-to-fg",
    labelEn: "assemblyLine → finishGoods over 25 days",
    labelZh: "assemblyLine → finishGoods 超过 25 天",
    statusEn: "Assembly line Longtree",
    currentKey: "assemblyLine",
    nextKey: "finishGoods",
    thresholdDays: 25,
  },
  {
    id: "fg-to-leaving",
    labelEn: "finishGoods → leavingFactory over 7 days",
    labelZh: "finishGoods → leavingFactory 超过 7 天",
    statusEn: "Finishedin Longtree",
    currentKey: "finishGoods",
    nextKey: "leavingFactory",
    thresholdDays: 7,
  },
  {
    id: "leaving-to-leftport",
    labelEn: "leavingFactory → Left Port over 10 days",
    labelZh: "leavingFactory → Left Port 超过 10 天",
    statusEn: "Leaving factory from Longtree",
    currentKey: "leavingFactory",
    nextKey: "Left Port",
    thresholdDays: 10,
  },
];

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

  const alerts = useMemo<AlertHit[]>(() => {
    const now = Date.now();
    const out: AlertHit[] = [];

    rows.forEach((row) => {
      const status = getLastStatus(row);

      alertRules.forEach((rule) => {
        if (status !== rule.statusEn && !(rule.id === "leaving-to-leftport" && status === "waiting in port")) return;

        const currentRaw = rule.currentKey === "Purchase Order Sent" ? row.schedule?.[rule.currentKey] : row.dateTrack?.[rule.currentKey];
        const nextRaw = row.dateTrack?.[rule.nextKey];

        const currentTs = parseDateToTimestamp(currentRaw);
        const nextTs = parseDateToTimestamp(nextRaw);

        if (currentTs == null || nextTs != null) return;

        const days = Math.floor((now - currentTs) / DAY_MS);
        if (days <= rule.thresholdDays) return;

        out.push({
          chassis: displayValue(row.schedule?.Chassis),
          customer: displayValue(row.schedule?.Customer),
          dealer: displayValue(row.schedule?.Dealer),
          model: displayValue(row.schedule?.Model),
          status,
          days,
          thresholdDays: rule.thresholdDays,
          currentDateText: formatDate(currentTs),
          currentKey: rule.currentKey,
          nextKey: rule.nextKey,
          overdueDays: days - rule.thresholdDays,
        });
      });
    });

    return out.sort((a, b) => b.overdueDays - a.overdueDays);
  }, [rows]);

  const reminders = useMemo(() => {
    return rows
      .map((row) => {
        const requestTs = parseDateToTimestamp(row.schedule?.["Request Delivery Date"]);
        if (requestTs == null) return null;
        const latestLeftFactoryTs = requestTs - 50 * DAY_MS;
        const leftFactoryTs = parseDateToTimestamp(row.dateTrack?.leavingFactory);

        return {
          chassis: displayValue(row.schedule?.Chassis),
          customer: displayValue(row.schedule?.Customer),
          dealer: displayValue(row.schedule?.Dealer),
          model: displayValue(row.schedule?.Model),
          requestTs,
          latestLeftFactoryTs,
          leftFactoryTs,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item != null)
      .sort((a, b) => a.latestLeftFactoryTs - b.latestLeftFactoryTs);
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-xl font-semibold">{tr(lang, "Exceptions & Reminders", "异常与提醒")}</h2>
        <p className="mt-1 text-sm text-slate-600">{tr(lang, "Track overdue production transitions and delivery-date commitments.", "跟踪超期状态流转与交付日期承诺。")}</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab("alerts")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium ${tab === "alerts" ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
          >
            <AlertTriangle className="h-4 w-4" /> {tr(lang, "Exception Alerts", "异常告警")}
          </button>
          <button
            type="button"
            onClick={() => setTab("reminders")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium ${tab === "reminders" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
          >
            <Bell className="h-4 w-4" /> {tr(lang, "Reminders", "提醒")}
          </button>
        </div>
      </div>

      {tab === "alerts" ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-5">
            {alertRules.map((rule) => (
              <div key={rule.id} className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm">
                <p className="font-medium text-rose-900">{lang === "zh" ? rule.labelZh : rule.labelEn}</p>
                <p className="mt-1 text-rose-700">{statusText(lang, rule.statusEn)}</p>
              </div>
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
                    <th className="px-3 py-2 text-left">{tr(lang, "Threshold", "阈值")}</th>
                    <th className="px-3 py-2 text-left">{tr(lang, "Customer", "客户")}</th>
                    <th className="px-3 py-2 text-left">Dealer</th>
                    <th className="px-3 py-2 text-left">Model</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                        {tr(lang, "No exception alerts found.", "当前没有异常告警。")}
                      </td>
                    </tr>
                  ) : (
                    alerts.map((item) => (
                      <tr key={`${item.chassis}-${item.currentKey}-${item.nextKey}`} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium">{item.chassis}</td>
                        <td className="px-3 py-2">{statusText(lang, item.status)}</td>
                        <td className="px-3 py-2 text-rose-600">{item.days} {tr(lang, "days", "天")}</td>
                        <td className="px-3 py-2">{item.thresholdDays} {tr(lang, "days", "天")}</td>
                        <td className="px-3 py-2">{item.customer}</td>
                        <td className="px-3 py-2">{item.dealer}</td>
                        <td className="px-3 py-2">{item.model}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {reminders.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-slate-500 shadow-sm">
              {tr(lang, "No records with Request Delivery Date.", "没有带 Request Delivery Date 的记录。")}
            </div>
          ) : (
            reminders.map((item) => {
              const isLate = item.leftFactoryTs != null && item.leftFactoryTs > item.latestLeftFactoryTs;
              const isPending = item.leftFactoryTs == null && Date.now() > item.latestLeftFactoryTs;
              return (
                <div key={`${item.chassis}-${item.requestTs}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-base font-semibold">{item.chassis}</p>
                      <p className="text-xs text-slate-600">{item.customer} · {item.dealer} · {item.model}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${isLate || isPending ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {isLate || isPending ? tr(lang, "Need attention", "需要关注") : tr(lang, "On track", "进度正常")}
                    </span>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl bg-indigo-50 p-3">
                      <p className="text-xs text-indigo-600">{tr(lang, "Request Delivery Date", "Request Delivery Date")}</p>
                      <p className="text-sm font-semibold text-indigo-900">{formatDate(item.requestTs)}</p>
                    </div>
                    <div className="rounded-xl bg-amber-50 p-3">
                      <p className="text-xs text-amber-700">{tr(lang, "Latest Left Factory", "最晚 Left Factory")}</p>
                      <p className="text-sm font-semibold text-amber-900">{formatDate(item.latestLeftFactoryTs)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-100 p-3">
                      <p className="text-xs text-slate-600">{tr(lang, "Actual Left Factory", "实际 Left Factory")}</p>
                      <p className="text-sm font-semibold text-slate-900">{item.leftFactoryTs == null ? "-" : formatDate(item.leftFactoryTs)}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
                    <Clock3 className="h-4 w-4" />
                    <span>{tr(lang, "Timeline:", "时间线：")}</span>
                    <Flag className="h-3.5 w-3.5" />
                    <span>{tr(lang, "Request Delivery Date - 50 days = latest left factory date", "Request Delivery Date - 50 天 = 最晚离厂日期")}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
