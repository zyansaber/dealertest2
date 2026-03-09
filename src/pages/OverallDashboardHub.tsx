import { useMemo } from "react";
import { Navigate, useSearchParams } from "react-router-dom";

import OverallDashboardSidebar from "@/components/OverallDashboardSidebar";
import OverallDashboardAdmin from "@/pages/OverallDashboardAdmin";
import TargetAndHighlight from "@/pages/TargetAndHighlight";
import DealerStateAdmin from "@/pages/DealerStateAdmin";
import DealerOverallDashboard from "@/pages/DealerOverallDashboard";

type TabKey = "overview" | "target" | "admin" | "state";

const isTabKey = (value: string): value is TabKey => ["overview", "target", "admin", "state"].includes(value);

export default function OverallDashboardHub() {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "overview";

  const activeTab = useMemo<TabKey>(() => (isTabKey(tab) ? tab : "overview"), [tab]);

  if (!isTabKey(tab)) {
    return <Navigate to="/overall-dashboard?tab=overview" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex">
        <OverallDashboardSidebar />
        <main className="flex-1">
          {activeTab === "overview" ? <DealerOverallDashboard withSidebar={false} /> : null}
          {activeTab === "target" ? <TargetAndHighlight withSidebar={false} /> : null}
          {activeTab === "admin" ? <OverallDashboardAdmin /> : null}
          {activeTab === "state" ? <DealerStateAdmin /> : null}
        </main>
      </div>
    </div>
  );
}
