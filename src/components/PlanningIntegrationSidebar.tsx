import { AlertTriangle, BarChart3, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Languages, LogOut, Search, Target } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { off, onValue, ref } from "firebase/database";
import { database } from "@/lib/firebase";
import type { PlanningLang } from "@/pages/planningIntegration/i18n";
import { tr } from "@/pages/planningIntegration/i18n";

type PlanningTabPath =
  | "/planningintegration"
  | "/planningintegration/schedule"
  | "/planningintegration/waiting-for-po"
  | "/planningintegration/new-po"
  | "/planningintegration/requsition"
  | "/planningintegration/alerts-reminders"
  | "/planningintegration/vans-in-delay"
  | "/planningintegration/vehicle-search"
  | "/planningintegration/target"
  | "/planningintegration/report"
  | "/planningintegration/australia-factory-calendar"
  | "/planningintegration/smart-scheduling";



type TicketType = "change-production-date" | "after-signed-off-change";

type RequisitionTicket = {
  type?: TicketType;
  approvals?: {
    techApproved?: boolean;
    productionApproved?: boolean;
  };
  status?: "unread" | "approved";
};

const isTicketFinalApproved = (ticket: RequisitionTicket) => {
  if (ticket.status === "approved") return true;
  if (ticket.type === "change-production-date") return Boolean(ticket.approvals?.productionApproved);
  if (ticket.type === "after-signed-off-change") return Boolean(ticket.approvals?.techApproved) && Boolean(ticket.approvals?.productionApproved);
  return false;
};

interface PlanningIntegrationSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  lang: PlanningLang;
  onToggleLang: () => void;
  onLogout: () => void;
}

export default function PlanningIntegrationSidebar({ collapsed, onToggle, lang, onToggleLang, onLogout }: PlanningIntegrationSidebarProps) {
  const [pendingTicketCount, setPendingTicketCount] = useState(0);

  useEffect(() => {
    const ticketsRef = ref(database, "mes/requisitionTickets");
    const handler = (snap: any) => {
      const raw = snap.val() || {};
      const pending = Object.values(raw).filter((item: any) => !isTicketFinalApproved(item || {})).length;
      setPendingTicketCount(pending);
    };

    onValue(ticketsRef, handler);
    return () => off(ticketsRef, "value", handler);
  }, []);

  const navItems: Array<{ path: PlanningTabPath; label: string; icon: typeof ClipboardList; end?: boolean }> = [
    { path: "/planningintegration/vehicle-search", label: tr(lang, "Vehicle Search", "车辆情况搜索"), icon: Search },
    { path: "/planningintegration", label: tr(lang, "planning dashboard", "计划总览"), icon: ClipboardList, end: true },
    { path: "/planningintegration/schedule", label: tr(lang, "schedule", "排产表"), icon: ClipboardList },
    { path: "/planningintegration/waiting-for-po", label: tr(lang, "waiting for PO", "待下 PO"), icon: ClipboardList },
    { path: "/planningintegration/new-po", label: tr(lang, "New PO", "新下 PO"), icon: ClipboardList },
    { path: "/planningintegration/requsition", label: tr(lang, "Requsition", "澳洲计划请求"), icon: ClipboardList },
    { path: "/planningintegration/alerts-reminders", label: tr(lang, "Reminders", "提醒"), icon: AlertTriangle },
    { path: "/planningintegration/vans-in-delay", label: tr(lang, "Vans in Delay", "延误车辆"), icon: AlertTriangle },
    { path: "/planningintegration/target", label: tr(lang, "target", "目标"), icon: Target },
    { path: "/planningintegration/report", label: tr(lang, "report", "报表"), icon: BarChart3 },
    { path: "/planningintegration/smart-scheduling", label: tr(lang, "Intelligent Scheduling", "智能排产"), icon: BarChart3 },
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
                  <div className={`relative flex items-center rounded-lg px-3 py-2 text-sm font-medium transition ${collapsed ? "justify-center" : "gap-3"} ${isActive ? "bg-slate-800 text-white shadow-inner" : "text-slate-200 hover:bg-slate-800 hover:text-white"}`}>
                    <Icon className="h-5 w-5" />
                    {!collapsed && <span>{item.label}</span>}
                    {item.path === "/planningintegration/requsition" && pendingTicketCount > 0 ? (
                      <span
                        className={`inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white ${collapsed ? "absolute right-1.5 top-1.5" : "ml-auto"}`}
                        aria-label={`pending requisition tickets: ${pendingTicketCount}`}
                      >
                        {pendingTicketCount}
                      </span>
                    ) : null}
                  </div>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto space-y-2 border-t border-slate-800 px-3 py-3">
        <NavLink to="/planningintegration/australia-factory-calendar">
          {({ isActive }) => (
            <div className={`flex h-9 w-full items-center justify-center gap-2 rounded-md border border-slate-700 text-slate-100 transition ${isActive ? "bg-slate-700" : "bg-slate-800 hover:bg-slate-700"}`}>
              <CalendarDays className="h-4 w-4" />
              {!collapsed && <span>{tr(lang, "Australia Factory Calendar", "澳洲工厂日历")}</span>}
            </div>
          )}
        </NavLink>

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
