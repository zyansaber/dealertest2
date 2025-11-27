import { useMemo, useState } from "react";
import {
  Package,
  BarChart3,
  Factory,
  FileX,
  LayoutDashboard,
  Truck,
  DollarSign,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NavLink, useParams, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { ScheduleItem } from "@/types";
import { isFinanceReportEnabled, normalizeDealerSlug } from "@/lib/dealerUtils";

interface SidebarProps {
  orders: ScheduleItem[];
  selectedDealer: string;
  onDealerSelect: (dealer: string) => void;
  hideOtherDealers?: boolean;
  currentDealerName?: string;
  showStats?: boolean;
  isGroup?: boolean;
  includedDealers?: Array<{ slug: string; name: string }> | null;
}

/** ---- 安全工具函数：统一兜底，避免 undefined.toLowerCase 报错 ---- */
const toStr = (v: any) => String(v ?? "");
const lower = (v: any) => toStr(v).toLowerCase();

export default function Sidebar({
  orders,
  selectedDealer,
  onDealerSelect,
  hideOtherDealers = false,
  currentDealerName,
  showStats = true,
  isGroup = false,
  includedDealers = null
}: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { dealerSlug, selectedDealerSlug } = useParams<{ dealerSlug: string; selectedDealerSlug?: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // 计算基础统计数据（仅保留总订单数/stock/customer）
  const stats = useMemo(() => {
    const total = Array.isArray(orders) ? orders.length : 0;

    const stockVehicles = (Array.isArray(orders) ? orders : []).filter(
      (order) => lower(order?.Customer).endsWith("stock")
    ).length;

    const customerVehicles = Math.max(total - stockVehicles, 0);

    return { total, stockVehicles, customerVehicles };
  }, [orders]);

  // 获取显示的dealer名称
  const displayDealerName = useMemo(() => {
    if (hideOtherDealers && currentDealerName) {
      return currentDealerName;
    }
    if (selectedDealer === "all") {
      return "All Dealers";
    }
    return selectedDealer || "Dealer Portal";
  }, [selectedDealer, hideOtherDealers, currentDealerName]);

  const normalizedDealerSlug = normalizeDealerSlug(dealerSlug);

  // 获取当前页面类型（dashboard, dealerorders, inventorystock, unsigned, yard）
  const getCurrentPage = () => {
    const path = location.pathname;
    if (path.includes('/inventory-management')) return 'inventory-management';
    if (path.includes('/finance-report')) return 'finance-report';
    if (path.includes('/inventorystock')) return 'inventorystock';
    if (path.includes('/unsigned')) return 'unsigned';
    if (path.includes('/dealerorders')) return 'dealerorders';
    if (path.includes('/yard')) return 'yard';
    if (path.includes('/dashboard')) return 'dashboard';
    return 'dealerorders';
  };

  // 处理dealer点击 - 切换到选中的dealer并保持当前页面
  const handleDealerClick = (newDealerSlug: string) => {
    const currentPage = getCurrentPage();
    if (isGroup) {
      navigate(`/dealergroup/${dealerSlug}/${newDealerSlug}/${currentPage}`);
    } else {
      navigate(`/dealer/${newDealerSlug}/${currentPage}`);
    }
  };

  // 导航路径 - 根据是否是group使用不同的前缀
  const basePath = useMemo(() => {
    if (isGroup) {
      return dealerSlug && selectedDealerSlug 
        ? `/dealergroup/${dealerSlug}/${selectedDealerSlug}` 
        : dealerSlug 
        ? `/dealergroup/${dealerSlug}` 
        : "/";
    } else {
      return dealerSlug ? `/dealer/${dealerSlug}` : "/";
    }
  }, [isGroup, dealerSlug, selectedDealerSlug]);
    
  const navigationItems = [
    { path: `${basePath}/dashboard`, label: "Dashboard", icon: LayoutDashboard, end: true },
    { path: isGroup ? `${basePath}/dealerorders` : basePath, label: "Dealer Orders", icon: BarChart3, end: !isGroup },
    { path: `${basePath}/inventorystock`, label: "Factory Inventory", icon: Factory, end: true },
    { path: `${basePath}/yard`, label: "Yard Inventory & On The Road", icon: Truck, end: true },
    { path: `${basePath}/unsigned`, label: "Unsigned & Empty Slots", icon: FileX, end: true },
  ];

if (!isGroup) {
    navigationItems.splice(4, 0, {
      path: `${basePath}/inventory-management`,
      label: "Inventory Management",
      icon: ClipboardList,
      end: true,
    });
  }

  if (!isGroup && isFinanceReportEnabled(normalizedDealerSlug)) {
    navigationItems.push({
      path: `${basePath}/finance-report`,
      label: "Finance Report",
      icon: DollarSign,
      end: true,
    });
  }


  return (
    <aside
      className={`relative h-full border-r border-white/10 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50 shadow-2xl transition-all duration-500 ease-in-out ${
        isCollapsed ? "w-24" : "w-80"
      }`}
    >
      <div className="pointer-events-none absolute -right-20 top-10 h-60 w-40 rounded-full bg-blue-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -left-10 bottom-10 h-44 w-52 rounded-full bg-indigo-500/20 blur-3xl" />

      {/* Header */}
      <div className="relative border-b border-white/10 px-5 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-sky-400 shadow-lg shadow-blue-500/30">
            <Package className="h-6 w-6 text-white" />
          </div>
          {!isCollapsed && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight">
                  {hideOtherDealers ? displayDealerName : "Dealer Portal"}
                </h1>
                <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-slate-100">
                  <Sparkles className="h-3 w-3" />
                  Premium
                </span>
              </div>
              <p className="text-sm text-slate-300/80">Order Management System</p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          className="absolute right-4 top-5 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-100 backdrop-blur transition hover:-translate-y-[1px] hover:bg-white/10"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation */}
      {dealerSlug && (
        <div className="relative border-b border-white/10 px-3 py-4">
          <div className="absolute inset-x-3 top-2 h-10 rounded-xl bg-gradient-to-r from-blue-500/5 via-indigo-500/10 to-blue-500/5 blur-lg" />
          <nav className="relative space-y-1">
            {navigationItems.map((item) => (
              <NavLink key={item.path} to={item.path} end={item.end}>
                {({ isActive }) => (
                  <Button
                    variant="ghost"
                    className={`group relative w-full justify-start overflow-hidden rounded-xl border border-transparent px-3 py-3 text-sm font-medium transition-all duration-300 hover:border-white/10 hover:bg-white/5 hover:text-white ${
                      isCollapsed ? "justify-center px-2" : ""
                    } ${isActive ? "bg-white/10 text-white shadow-lg shadow-blue-500/30" : "text-slate-200"}`}
                  >
                    <span
                      className={`flex items-center gap-3 ${
                        isCollapsed ? "flex-col gap-1 text-xs" : ""
                      }`}
                    >
                      <item.icon className={`h-5 w-5 ${!isCollapsed ? "" : "text-slate-100"}`} />
                      {!isCollapsed && <span>{item.label}</span>}
                      {isCollapsed && <span className="text-[10px] uppercase tracking-wide">{item.label}</span>}
                    </span>
                    {isActive && !isCollapsed && (
                      <span className="absolute inset-y-2 right-2 flex w-[10px] items-center justify-center rounded-full bg-gradient-to-b from-blue-400 to-sky-300" />
                    )}
                  </Button>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      )}

      {/* Current Context Display - 显示当前dealer或分组信息 */}
      {hideOtherDealers && (
        <div className="border-b border-white/10 px-4 py-5">
          {!isCollapsed && <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-slate-300">Current Dealer</h3>}

          {/* 如果是分组，显示包含的dealers作为可点击的卡片 */}
          {isGroup && includedDealers && includedDealers.length > 0 ? (
            <div className={`space-y-2 ${isCollapsed ? "grid grid-cols-1 gap-2" : ""}`}>
              {includedDealers.map((dealer) => {
                const isSelected = selectedDealerSlug === dealer.slug;
                return (
                  <button
                    key={dealer.slug}
                    onClick={() => handleDealerClick(dealer.slug)}
                    className={`relative w-full overflow-hidden rounded-xl border transition-all duration-300 ${
                      isSelected
                        ? "border-blue-400/50 bg-gradient-to-r from-blue-500/20 via-indigo-500/10 to-sky-400/10 shadow-lg shadow-blue-500/20"
                        : "border-white/10 bg-white/5 hover:border-blue-400/30 hover:bg-white/10"
                    } ${isCollapsed ? "p-3" : "p-4"}`}
                  >
                    {isSelected && (
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-blue-500/5 via-transparent to-indigo-400/5" />
                    )}
                    <div className={`relative flex items-center justify-between ${isCollapsed ? "flex-col gap-2 text-center" : ""}`}>
                      <div className="space-y-1">
                        <div className={`font-semibold ${isSelected ? "text-white" : "text-slate-100"}`}>
                          {dealer.name}
                        </div>
                        {!isCollapsed && (
                          <div className={`text-xs ${isSelected ? "text-blue-100" : "text-slate-300"}`}>
                            Dealer Portal
                          </div>
                        )}
                      </div>
                      {isSelected && (
                        <Badge variant="default" className="z-10 bg-blue-500 text-white shadow shadow-blue-400/40">
                          Active
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            // 单个dealer显示
            <div className={`relative overflow-hidden rounded-xl border border-white/10 bg-white/5 ${isCollapsed ? "p-3" : "p-4 space-y-2"}`}>
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-indigo-500/10" />
              <div className="relative font-semibold text-white">{displayDealerName}</div>
              {!isCollapsed && <div className="relative text-sm text-blue-100">Dealer Portal</div>}
            </div>
          )}
        </div>
      )}

      {/* Basic Stats - 只显示基础统计 */}
      {showStats && (
        <div className="px-4 py-5">
          {!isCollapsed && (
            <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.15em] text-slate-300">
              <span>{displayDealerName} Overview</span>
              <span className="rounded-full bg-blue-500/20 px-2 py-1 text-[10px] text-blue-100">Live</span>
            </div>
          )}
          <div className={`grid grid-cols-1 gap-3 ${isCollapsed ? "" : ""}`}>
            <Card className="overflow-hidden border border-white/10 bg-gradient-to-br from-blue-500/15 via-indigo-500/10 to-slate-900/40 shadow-lg shadow-blue-500/10">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.12),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(79,70,229,0.15),transparent_35%)]" />
              <CardHeader className={`relative pb-2 ${isCollapsed ? "p-3" : "px-4 pt-4 pb-2"}`}>
                <CardTitle className="flex items-center text-xs font-semibold uppercase tracking-[0.12em] text-blue-100">
                  <Package className={`h-3.5 w-3.5 ${isCollapsed ? "" : "mr-2"}`} />
                  {!isCollapsed && <span>Total Orders</span>}
                </CardTitle>
              </CardHeader>
              <CardContent className={`relative ${isCollapsed ? "p-3" : "px-4 pb-4 pt-1"}`}>
                <div className="text-2xl font-bold text-white">{stats.total}</div>
                {!isCollapsed && (
                  <p className="mt-1 text-xs text-blue-100/80">Freshly synced across all channels</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </aside>
  );
}
