import { Routes, Route, Navigate } from "react-router-dom";
import { useState } from "react";

import PlanningIntegrationSidebar from "@/components/PlanningIntegrationSidebar";

import OverviewPage from "./planningIntegration/OverviewPage";
import SchedulePage from "./planningIntegration/SchedulePage";
import TargetPage from "./planningIntegration/TargetPage";
import ReportPage from "./planningIntegration/ReportPage";
import WaitingForOrderingPage from "./planningIntegration/WaitingForOrderingPage";
import { usePlanningData } from "./planningIntegration/usePlanningData";

export default function PlanningIntegration() {
  const [collapsed, setCollapsed] = useState(false);
  const data = usePlanningData("month");

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <PlanningIntegrationSidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <main className={`min-w-0 p-6 transition-all ${collapsed ? "ml-20" : "ml-72"}`}>
        <Routes>
          <Route path="/" element={<OverviewPage rows={data.rows} />} />
          <Route path="/schedule" element={<SchedulePage rows={data.scheduleRows} waitingOrderPrices={data.waitingOrderPrices} />} />
          <Route path="/waiting-for-ordering" element={<WaitingForOrderingPage withStatus={data.withStatus} waitingOrderPrices={data.waitingOrderPrices} saveWaitingPrice={data.saveWaitingPrice} />} />
          <Route path="/target" element={<TargetPage monthsForTargetInput={data.monthsForTargetInput} monthsForDiff={data.monthsForDiff} targets={data.targets} saveSharedTarget={data.saveSharedTarget} monthlyActuals={data.monthlyActuals} />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="*" element={<Navigate to="/planningintegration" replace />} />
        </Routes>
      </main>
    </div>
  );
}
