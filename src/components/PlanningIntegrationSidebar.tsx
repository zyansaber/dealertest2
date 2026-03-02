import { BarChart3, ClipboardList, Ship } from "lucide-react";

type PlanningTab = "planningintegration" | "leaving-port-estimation" | "report";

interface PlanningIntegrationSidebarProps {
  activeTab: PlanningTab;
  onTabChange: (tab: PlanningTab) => void;
  totalRows: number;
}

const navItems: Array<{ key: PlanningTab; label: string; icon: typeof ClipboardList }> = [
  { key: "planningintegration", label: "planningintegration", icon: ClipboardList },
  { key: "leaving-port-estimation", label: "Leaving port estimation", icon: Ship },
  { key: "report", label: "report", icon: BarChart3 },
];

export default function PlanningIntegrationSidebar({
  activeTab,
  onTabChange,
  totalRows,
}: PlanningIntegrationSidebarProps) {
  return (
    <aside className="fixed left-0 top-0 flex h-screen w-72 shrink-0 flex-col border-r border-slate-800 bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
            <img
              src="/assets/snowy-river-logo.svg"
              alt="Snowy River Caravans"
              className="h-9 w-9 object-contain"
            />
          </div>
          <div className="space-y-1">
            <h1 className="text-base font-semibold leading-tight">Planning Portal</h1>
            <p className="text-sm text-slate-300">Orders and inventory</p>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-800 px-2 py-3">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onTabChange(item.key)}
                className={`flex w-full items-center justify-start gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                  isActive
                    ? "bg-slate-800 text-white shadow-inner"
                    : "text-slate-200 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="px-4 py-4">
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">Total Orders</div>
          <div className="text-2xl font-bold text-white">{totalRows}</div>
          <div className="text-xs text-slate-400">Non-finished schedules</div>
        </div>
      </div>
    </aside>
  );
}
