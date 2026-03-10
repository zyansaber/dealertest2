import { AlertTriangle, BarChart3, ChevronLeft, ChevronRight, ClipboardList, Languages, LogOut, Search, Target } from "lucide-react";
import { NavLink } from "react-router-dom";
import type { PlanningLang } from "@/pages/planningIntegration/i18n";
import { tr } from "@/pages/planningIntegration/i18n";

type PlanningTabPath = "/planningintegration" | "/planningintegration/schedule" | "/planningintegration/waiting-for-po" | "/planningintegration/new-po" | "/planningintegration/requsition" | "/planningintegration/vans-in-delay" | "/planningintegration/vehicle-search" | "/planningintegration/target" | "/planningintegration/report";

interface PlanningIntegrationSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  lang: PlanningLang;
  onToggleLang: () => void;
  onLogout: () => void;
}

export default function PlanningIntegrationSidebar({ collapsed, onToggle, lang, onToggleLang, onLogout }: PlanningIntegrationSidebarProps) {
  const navItems: Array<{ path: PlanningTabPath; label: string; icon: typeof ClipboardList; end?: boolean }> = [
    { path: "/planningintegration/vehicle-search", label: tr(lang, "Vehicle Search", "车辆情况搜索"), icon: Search },
    { path: "/planningintegration", label: tr(lang, "planning dashboard", "计划总览"), icon: ClipboardList, end: true },
    { path: "/planningintegration/schedule", label: tr(lang, "schedule", "排产表"), icon: ClipboardList },
    { path: "/planningintegration/waiting-for-po", label: tr(lang, "waiting for PO", "待下 PO"), icon: ClipboardList },
    { path: "/planningintegration/new-po", label: tr(lang, "New PO", "新下 PO"), icon: ClipboardList },
    { path: "/planningintegration/requsition", label: tr(lang, "Requsition", "Requsition"), icon: ClipboardList },
    { path: "/planningintegration/vans-in-delay", label: tr(lang, "Vans in Delay", "延误车辆"), icon: AlertTriangle },
    { path: "/planningintegration/target", label: tr(lang, "target", "目标"), icon: Target },
    { path: "/planningintegration/report", label: tr(lang, "report", "报表"), icon: BarChart3 },
  ];

  return (
    <aside className={`fixed left-0 top-0 flex h-screen shrink-0 flex-col border-r border-slate-800 bg-slate-950 text-slate-100 transition-all ${collapsed ? "w-20" : "w-72"}`}>
      <div className="border-b border-slate-800 px-4 py-4">
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
            <img src="/assets/snowy-river-logo.svg" alt="Snowy River Caravans" className="h-9 w-9 object-contain" />
          </div>
          {!collapsed && <h1 className="text-base font-semibold leading-tight">{tr(lang, "Planning Portal", "计划平台")}</h1>}
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

      <div className="mt-auto space-y-2 border-t border-slate-800 px-3 py-3">
        <button type="button" onClick={onToggleLang} className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700">
          <Languages className="h-4 w-4" />
          {!collapsed && <span>{lang === "zh" ? "中文" : "English"}</span>}
        </button>
        <button type="button" onClick={onLogout} className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700">
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>{tr(lang, "Logout", "退出")}</span>}
        </button>
        <button type="button" onClick={onToggle} className="flex h-9 w-full items-center justify-center rounded-md border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
