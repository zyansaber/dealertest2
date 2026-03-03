import { BarChart3, ChevronLeft, ChevronRight, ClipboardList, Ship, Target } from "lucide-react";
import { NavLink } from "react-router-dom";

type PlanningTabPath = "/planningintegration" | "/planningintegration/schedule" | "/planningintegration/leaving-port-estimation" | "/planningintegration/target" | "/planningintegration/report";

interface PlanningIntegrationSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navItems: Array<{ path: PlanningTabPath; label: string; icon: typeof ClipboardList; end?: boolean }> = [
  { path: "/planningintegration", label: "planning dashboard", icon: ClipboardList, end: true },
  { path: "/planningintegration/schedule", label: "schedule", icon: ClipboardList },
  { path: "/planningintegration/leaving-port-estimation", label: "Leaving port estimation", icon: Ship },
  { path: "/planningintegration/target", label: "target", icon: Target },
  { path: "/planningintegration/report", label: "report", icon: BarChart3 },
];

export default function PlanningIntegrationSidebar({ collapsed, onToggle }: PlanningIntegrationSidebarProps) {
  return (
    <aside className={`fixed left-0 top-0 flex h-screen shrink-0 flex-col border-r border-slate-800 bg-slate-950 text-slate-100 transition-all ${collapsed ? "w-20" : "w-72"}`}>
      <div className="border-b border-slate-800 px-4 py-4">
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
            <img src="/assets/snowy-river-logo.svg" alt="Snowy River Caravans" className="h-9 w-9 object-contain" />
          </div>
          {!collapsed && <div className="space-y-1"><h1 className="text-base font-semibold leading-tight">Planning Portal</h1><p className="text-sm text-slate-300">Orders and inventory</p></div>}
        </div>
      </div>

      <div className="border-b border-slate-800 px-2 py-3">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.path} to={item.path} end={item.end}>
                {({ isActive }) => (
                  <div className={`flex items-center rounded-lg px-3 py-2 text-sm font-medium transition ${collapsed ? "justify-center" : "gap-3"} ${isActive ? "bg-slate-800 text-white shadow-inner" : "text-slate-200 hover:bg-slate-800 hover:text-white"}`}>
                    <Icon className="h-5 w-5" />
                    {!collapsed && <span>{item.label}</span>}
                  </div>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto border-t border-slate-800 px-3 py-3">
        <button type="button" onClick={onToggle} className="flex h-9 w-full items-center justify-center rounded-md border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
