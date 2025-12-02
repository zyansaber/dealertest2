import { useMemo, useState } from "react";
import {
  BarChart3,
  Factory,
  FileX,
  LayoutDashboard,
  Truck,
  DollarSign,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
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
      end: true
    });
  }

  if (!isGroup && isFinanceReportEnabled(normalizedDealerSlug)) {
    navigationItems.push({
      path: `${basePath}/finance-report`,
      label: "Finance Report",
      icon: DollarSign,
      end: true
    });
  }

  // 下拉菜单切换dealers
  const renderDealerSelector = () => {
    if (!orders || hideOtherDealers) return null;
    const dealers = Array.from(new Set(orders.map((order) => toStr(order?.Dealer))));

    return (
      <select
        value={selectedDealer}
        onChange={(e) => onDealerSelect(e.target.value)}
        className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-600"
      >
        <option value="all">All Dealers</option>
        {dealers.map((dealer) => (
          <option key={dealer} value={dealer}>
            {dealer}
          </option>
        ))}
      </select>
    );
  };

  return (
    <aside
      className={`sticky top-0 left-0 z-20 flex h-screen flex-shrink-0 flex-col overflow-y-auto border-r border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 text-slate-50 shadow-xl transition-all duration-300 ease-in-out ${
        isCollapsed ? "w-20" : "w-72"
      }`}
    >
      <div className="flex h-full flex-1 flex-col">
        {/* Header */}
        <div className="relative flex items-center gap-3 border-b border-slate-800 px-4 py-4">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
            <img
              src="/assets/snowy-river-logo.svg"
              alt="Snowy River Caravans"
              className="h-9 w-9 object-contain"
            />
          </div>
          {!isCollapsed && (
            <div className="space-y-1">
              <h1 className="text-base font-semibold leading-tight">
                {hideOtherDealers ? displayDealerName : "Dealer Portal"}
              </h1>
              <p className="text-sm text-slate-300">Orders and inventory</p>
            </div>
          )}
        </div>

        {/* Dealer Selector */}
        {!hideOtherDealers && (
          <div className="border-b border-slate-800 px-4 py-4">
            {!isCollapsed && (
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Select Dealer</h3>
            )}
            {renderDealerSelector()}
          </div>
        )}

        {/* Navigation */}
        {dealerSlug && (
          <div className="border-b border-slate-800 px-2 py-3">
            <nav className="space-y-1">
              {navigationItems.map((item) => (
                <NavLink key={item.path} to={item.path} end={item.end}>
                  {({ isActive }) => (
                    <Button
                      variant="ghost"
                      className={`flex w-full items-center justify-start gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                        isCollapsed ? "justify-center px-2" : ""
                      } ${
                        isActive
                          ? "bg-slate-800 text-white shadow-inner"
                          : "text-slate-200 hover:bg-slate-800 hover:text-white"
                      }`}
                    >
                      <item.icon className="h-5 w-5" />
                      {!isCollapsed && <span>{item.label}</span>}
                      {isCollapsed && <span className="sr-only">{item.label}</span>}
                    </Button>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>
        )}

        {/* Current Context Display - 显示当前dealer或分组信息 */}
        {hideOtherDealers && (
          <div className="border-b border-slate-800 px-4 py-4">
            {isCollapsed ? (
              <div className="mb-3 flex items-center justify-center text-slate-400">
                <ClipboardList className="h-4 w-4" />
                <span className="sr-only">Current Dealer</span>
              </div>
            ) : (
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Current Dealer</h3>
            )}

            {/* 如果是分组，显示包含的dealers作为可点击的卡片 */}
            {isGroup && includedDealers && includedDealers.length > 0 ? (
              <div className="space-y-2">
                {includedDealers.map((dealer) => {
                  const isSelected = selectedDealerSlug === dealer.slug;
                  return (
                    <button
                      key={dealer.slug}
                      onClick={() => handleDealerClick(dealer.slug)}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition ${
                        isSelected
                          ? "border-slate-500 bg-slate-800 text-white shadow-inner"
                          : "border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-600 hover:bg-slate-800"
                      } ${isCollapsed ? "flex-col gap-2 text-center" : ""}`}
                    >
                      <div className="space-y-0.5">
                        <div className="font-semibold">{dealer.name}</div>
                        {!isCollapsed && <div className="text-xs text-slate-300">Dealer Portal</div>}
                      </div>
                      {isSelected && <Badge variant="secondary">Active</Badge>}
                    </button>
                  );
                })}
              </div>
            ) : (
              // 单个dealer显示
              <div className={`rounded-lg border border-slate-700 bg-slate-900 ${isCollapsed ? "flex items-center justify-center p-3" : "p-4 space-y-2"}`}>
                {isCollapsed ? (
                  <ClipboardList className="h-4 w-4 text-slate-200" />
                ) : (
                  <>
                    <div className="font-semibold text-slate-50">{displayDealerName}</div>
                    <div className="text-sm text-slate-300">Dealer Portal</div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Basic Stats - 只显示基础统计 */}
        {showStats && (
          <div className="px-4 py-4">
            {!isCollapsed && (
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{displayDealerName} Overview</div>
            )}
            <div className="grid grid-cols-1 gap-3">
              <Card className="border border-slate-800 bg-slate-900 shadow-inner">
                <CardHeader className={`pb-2 ${isCollapsed ? "p-3" : "px-4 pt-4 pb-2"}`}>
                  <CardTitle className="flex items-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
                    <Package className={`h-3.5 w-3.5 ${isCollapsed ? "" : "mr-2"}`} />
                    {!isCollapsed && <span>Total Orders</span>}
                  </CardTitle>
                </CardHeader>
                <CardContent className={`${isCollapsed ? "p-3" : "px-4 pb-4 pt-1"}`}>
                  <div className="text-2xl font-bold text-white">{stats.total}</div>
                  {!isCollapsed && <p className="mt-1 text-xs text-slate-400">Recently synced</p>}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>

      <div className="mt-auto border-t border-slate-800 px-3 py-3">
        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-800 text-slate-100 shadow-sm transition hover:bg-slate-700"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
