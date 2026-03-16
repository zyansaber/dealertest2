import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";

import PlanningIntegrationSidebar from "@/components/PlanningIntegrationSidebar";

import OverviewPage from "./planningIntegration/OverviewPage";
import SchedulePage from "./planningIntegration/SchedulePage";
import TargetPage from "./planningIntegration/TargetPage";
import ReportPage from "./planningIntegration/ReportPage";
import WaitingForOrderingPage from "./planningIntegration/WaitingForOrderingPage";
import VansInDelayPage from "./planningIntegration/VansInDelayPage";
import NewPOPage from "./planningIntegration/NewPOPage";
import RequsitionPage from "./planningIntegration/RequsitionPage";
import VehicleSearchPage from "./planningIntegration/VehicleSearchPage";
import AlertsAndRemindersPage from "./planningIntegration/AlertsAndRemindersPage";
import AustraliaFactoryCalendarPage from "./planningIntegration/AustraliaFactoryCalendarPage";
import SmartSchedulingPage from "./planningIntegration/SmartSchedulingPage";
import { usePlanningData } from "./planningIntegration/usePlanningData";
import type { Granularity } from "./planningIntegration/types";
import type { PlanningLang } from "./planningIntegration/i18n";
import { tr } from "./planningIntegration/i18n";

export default function PlanningIntegration() {
  const [collapsed, setCollapsed] = useState(false);
  const [reportGranularity, setReportGranularity] = useState<Granularity>("month");
  const [lang, setLang] = useState<PlanningLang>("en");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    const savedLang = localStorage.getItem("planningintegration-lang");
    if (savedLang === "zh" || savedLang === "en") setLang(savedLang);
    setIsAuthed(localStorage.getItem("planningintegration-auth") === "ok");
  }, []);

  const data = usePlanningData(reportGranularity);
  const planningVersion = "2026-03-04-refresh";

  const onLogin = () => {
    if (password !== "admin") {
      setError(lang === "zh" ? "密码错误" : "Incorrect password");
      return;
    }
    localStorage.setItem("planningintegration-auth", "ok");
    localStorage.setItem("planningintegration-lang", lang);
    setIsAuthed(true);
  };

  const onToggleLang = () => {
    const next = lang === "en" ? "zh" : "en";
    setLang(next);
    localStorage.setItem("planningintegration-lang", next);
  };

  const onLogout = () => {
    localStorage.removeItem("planningintegration-auth");
    setIsAuthed(false);
    setPassword("");
  };

  if (!isAuthed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-2 text-2xl font-semibold">{tr(lang, "Planning Integration Login", "计划页面登录")}</h2>
          <p className="mb-4 text-sm text-slate-600">{tr(lang, "Please choose language and enter password.", "请选择语言并输入密码。")}</p>

          <label className="mb-2 block text-sm font-medium">{tr(lang, "Language", "语言")}</label>
          <select
            value={lang}
            onChange={(e) => {
              const next = e.target.value as PlanningLang;
              setLang(next);
              localStorage.setItem("planningintegration-lang", next);
            }}
            className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="en">English</option>
            <option value="zh">中文</option>
          </select>

          <label className="mb-2 block text-sm font-medium">{tr(lang, "Password", "密码")}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onLogin()}
            className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder={tr(lang, "Enter password", "请输入密码")}
          />
          {error ? <p className="mb-3 text-sm text-rose-600">{error}</p> : null}

          <button type="button" onClick={onLogin} className="w-full rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-800">
            {tr(lang, "Login", "登录")}
          </button>
          <p className="mt-3 text-center text-xs text-slate-400">{tr(lang, "Version", "版本")}: {planningVersion}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <PlanningIntegrationSidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        lang={lang}
        onToggleLang={onToggleLang}
        onLogout={onLogout}
      />
      <main className={`min-w-0 p-6 transition-all ${collapsed ? "ml-20" : "ml-72"}`}>
        <Routes>
          <Route path="/" element={<OverviewPage rows={data.rows} lang={lang} />} />
          <Route path="/schedule" element={<SchedulePage rows={data.scheduleRows} waitingOrderPrices={data.waitingOrderPrices} lang={lang} />} />
          <Route
            path="/waiting-for-po"
            element={<WaitingForOrderingPage withStatus={data.withStatus} waitingOrderPrices={data.waitingOrderPrices} saveWaitingPrice={data.saveWaitingPrice} specByChassis={data.specByChassis} planByChassis={data.planByChassis} lang={lang} />}
          />
          <Route path="/waiting-for-ordering" element={<Navigate to="/planningintegration/waiting-for-po" replace />} />
          <Route path="/new-po" element={<NewPOPage rows={data.rows} specByChassis={data.specByChassis} planByChassis={data.planByChassis} lang={lang} />} />
          <Route path="/requsition" element={<RequsitionPage lang={lang} />} />
          <Route path="/alerts-reminders" element={<AlertsAndRemindersPage rows={data.rows} lang={lang} />} />
          <Route path="/australia-factory-calendar" element={<AustraliaFactoryCalendarPage lang={lang} />} />
          <Route path="/smart-scheduling" element={<SmartSchedulingPage rows={data.rows} lang={lang} />} />
          <Route path="/vans-in-delay" element={<VansInDelayPage rows={data.rows} lang={lang} />} />
          <Route path="/vehicle-search" element={<VehicleSearchPage rows={data.rows} specByChassis={data.specByChassis} planByChassis={data.planByChassis} lang={lang} />} />
          <Route
            path="/target"
            element={<TargetPage monthsForTargetInput={data.monthsForTargetInput} monthsForDiff={data.monthsForDiff} targets={data.targets} saveSharedTarget={data.saveSharedTarget} monthlyActuals={data.monthlyActuals} currentMonthLabel={data.currentMonthLabel} currentMonthActuals={data.currentMonthActuals} lang={lang} />}
          />
          <Route path="/report" element={<ReportPage trend={data.trend} rows={data.rows} granularity={reportGranularity} setGranularity={setReportGranularity} lang={lang} />} />
          <Route path="*" element={<Navigate to="/planningintegration" replace />} />
        </Routes>
      </main>
    </div>
  );
}
