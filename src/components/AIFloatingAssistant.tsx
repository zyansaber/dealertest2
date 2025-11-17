import { type ElementType, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Bot,
  CarFront,
  ClipboardCheck,
  Factory,
  LineChart,
  Loader2,
  MenuSquare,
  Radar,
  Route,
  Search,
  Sparkles,
  Truck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { subscribeToSchedule } from "@/lib/firebase";
import type { ScheduleItem } from "@/types";

interface QuickAction {
  id:
    | "track"
    | "receive"
    | "handover"
    | "factory"
    | "unsigned"
    | "road"
    | "revenue";
  title: string;
  description: string;
  cta: string;
  icon: ElementType;
  target: "orders" | "yard" | "inventory" | "unsigned" | "dashboard" | "finance";
}

interface CommandShortcut {
  id:
    | "dashboard"
    | "orders"
    | "inventory"
    | "unsigned"
    | "yard"
    | "finance"
    | "group-dashboard"
    | "group-inventory"
    | "group-unsigned"
    | "group-yard";
  title: string;
  description: string;
  icon: ElementType;
  target: QuickAction["target"];
  groupOnly?: boolean;
}

const quickActions: QuickAction[] = [
  {
    id: "track",
    title: "Tracking Orders",
    description: "Instantly surface the latest production and delivery status.",
    cta: "Show order status",
    icon: Radar,
    target: "orders",
  },
  {
    id: "receive",
    title: "Receive a Van",
    description: "Jump straight to the yard receiving flow.",
    cta: "Open receiving",
    icon: Truck,
    target: "yard",
  },
  {
    id: "handover",
    title: "Handover a Van",
    description: "Jump to handover with the chassis pre-filled.",
    cta: "Open handover form",
    icon: ClipboardCheck,
    target: "yard",
  },
  {
    id: "factory",
    title: "Need a Factory Order",
    description: "Start a factory request with the correct dealer context applied.",
    cta: "Create request",
    icon: Factory,
    target: "inventory",
  },
  {
    id: "unsigned",
    title: "Unsigned / Red Slots",
    description: "See slots missing signatures and priority red slots instantly.",
    cta: "Review slots",
    icon: MenuSquare,
    target: "unsigned",
  },
  {
    id: "road",
    title: "Vans on the Road (PGI ≤ 3 days)",
    description: "Who is rolling out soon? Get a three-day PGI radar.",
    cta: "Show road view",
    icon: Route,
    target: "yard",
  },
  {
    id: "revenue",
    title: "Check Revenue",
    description: "Open the finance dashboard without leaving the page.",
    cta: "Open revenue",
    icon: LineChart,
    target: "finance",
  },
];

const commandShortcuts: CommandShortcut[] = [
  {
    id: "dashboard",
    title: "Dealer dashboard",
    description: "Revenue, pipeline, and health for this dealer",
    icon: LineChart,
    target: "dashboard",
  },
  {
    id: "orders",
    title: "Dealer orders",
    description: "Order board with search, filters, and PGI insights",
    icon: Radar,
    target: "orders",
  },
  {
    id: "inventory",
    title: "Inventory stock",
    description: "Allocation, stock, and factory requests",
    icon: Factory,
    target: "inventory",
  },
  {
    id: "unsigned",
    title: "Unsigned slots",
    description: "Unsigned plans with red slot highlight",
    icon: MenuSquare,
    target: "unsigned",
  },
  {
    id: "yard",
    title: "Yard & PGI",
    description: "Receive vans, PGI, and dispatch",
    icon: Truck,
    target: "yard",
  },
  {
    id: "finance",
    title: "Finance report",
    description: "PowerBI revenue tiles and KPI trends",
    icon: LineChart,
    target: "finance",
  },
  {
    id: "group-dashboard",
    title: "Dealer group dashboard",
    description: "Roll-up metrics and dealer switching",
    icon: Sparkles,
    target: "dashboard",
    groupOnly: true,
  },
  {
    id: "group-inventory",
    title: "Group inventory",
    description: "Group-level stock and reallocation",
    icon: Factory,
    target: "inventory",
    groupOnly: true,
  },
  {
    id: "group-unsigned",
    title: "Group unsigned",
    description: "Unsigned slots across dealers",
    icon: MenuSquare,
    target: "unsigned",
    groupOnly: true,
  },
  {
    id: "group-yard",
    title: "Group yard",
    description: "Group-level receive and PGI",
    icon: Truck,
    target: "yard",
    groupOnly: true,
  },
];

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const clean = value.trim();
  if (!clean) return null;
  const parts = clean.split("/");
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts.map((p) => parseInt(p, 10));
    const date = new Date(yyyy, mm - 1, dd);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const isoDate = new Date(clean);
  return Number.isNaN(isoDate.getTime()) ? null : isoDate;
}

function daysFromToday(date: Date | null): number | null {
  if (!date) return null;
  const diff = date.getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

const friendlyStatus = (order: ScheduleItem): string => {
  const production = order["Regent Production"]?.trim?.();
  const delivery = order["Request Delivery Date"]?.trim?.();
  const shipment = (order as any).Shipment?.trim?.();

  if (production) return production;
  if (shipment) return `Shipment: ${shipment}`;
  if (delivery) return `Requested delivery ${delivery}`;
  return "Status pending";
};

function normalizeDealerSlug(raw?: string): string {
  const slug = (raw || "").toLowerCase();
  const m = slug.match(/^(.*?)-([a-z0-9]{6})$/);
  return m ? m[1] : slug;
}

function slugifyDealerName(name?: string): string {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function AIFloatingAssistant() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<QuickAction | null>(quickActions[0]);
  const [orders, setOrders] = useState<ScheduleItem[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [orderSearch, setOrderSearch] = useState("");
  const [commandSearch, setCommandSearch] = useState("");
  const [chassisInput, setChassisInput] = useState("");
  const [prefillNotice, setPrefillNotice] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToSchedule((data) => {
      setOrders(data || []);
      setLoadingOrders(false);
    });
    return () => unsub?.();
  }, []);

  const context = useMemo(() => {
    const parts = location.pathname.split("/").filter(Boolean);
    const type = parts[0];
    if (type === "dealer") {
      const dealerSlug = parts[1];
      return { kind: "dealer" as const, dealerSlug };
    }
    if (type === "dealergroup") {
      const dealerSlug = parts[1];
      const selectedDealerSlug = parts[2] && !["dashboard", "dealerorders", "inventorystock", "unsigned", "yard"].includes(parts[2]) ? parts[2] : undefined;
      return { kind: "dealergroup" as const, dealerSlug, selectedDealerSlug };
    }
    return { kind: "main" as const };
  }, [location.pathname]);

  const activeDealerSlug = useMemo(() => {
    if (context.kind === "dealer") return normalizeDealerSlug(context.dealerSlug);
    if (context.kind === "dealergroup") {
      if (context.selectedDealerSlug) return normalizeDealerSlug(context.selectedDealerSlug);
      return normalizeDealerSlug(context.dealerSlug);
    }
    return null;
  }, [context]);

  const scopedOrders = useMemo(() => {
    if (!activeDealerSlug) return orders;
    return orders.filter((o) => slugifyDealerName(o.Dealer) === activeDealerSlug);
  }, [orders, activeDealerSlug]);

  const buildPath = (target: QuickAction["target"]): string => {
    if (context.kind === "dealer" && context.dealerSlug) {
      switch (target) {
        case "orders":
          return `/dealer/${context.dealerSlug}`;
        case "yard":
          return `/dealer/${context.dealerSlug}/yard`;
        case "inventory":
          return `/dealer/${context.dealerSlug}/inventorystock`;
        case "unsigned":
          return `/dealer/${context.dealerSlug}/unsigned`;
        case "dashboard":
          return `/dealer/${context.dealerSlug}/dashboard`;
        case "finance":
          return `/dealer/${context.dealerSlug}/finance-report`;
        default:
          return "/dashboard";
      }
    }

    if (context.kind === "dealergroup" && context.dealerSlug) {
      const base = `/dealergroup/${context.dealerSlug}`;
      const dealerPrefix = context.selectedDealerSlug ? `${base}/${context.selectedDealerSlug}` : base;
      switch (target) {
        case "orders":
          return `${dealerPrefix}/dealerorders`;
        case "yard":
          return `${dealerPrefix}/yard`;
        case "inventory":
          return `${dealerPrefix}/inventorystock`;
        case "unsigned":
          return `${dealerPrefix}/unsigned`;
        case "dashboard":
          return `${dealerPrefix}/dashboard`;
        case "finance":
          return `${dealerPrefix}/dashboard`;
        default:
          return "/dashboard";
      }
    }

    switch (target) {
      case "orders":
        return "/dashboard";
      case "yard":
        return "/dashboard";
      case "inventory":
        return "/dashboard";
      case "unsigned":
        return "/dashboard";
      case "dashboard":
        return "/dashboard";
      case "finance":
        return "/dashboard";
      default:
        return "/dashboard";
    }
  };

  const trackedOrders = useMemo(() => {
    if (!orderSearch.trim()) return [];
    const term = orderSearch.toLowerCase();
    return scopedOrders
      .filter((order) =>
        order.Chassis.toLowerCase().includes(term) ||
        order.Customer.toLowerCase().includes(term) ||
        order.Model.toLowerCase().includes(term)
      )
      .slice(0, 3);
  }, [scopedOrders, orderSearch]);

  const filteredShortcuts = useMemo(() => {
    const term = commandSearch.trim().toLowerCase();
    return commandShortcuts
      .filter((shortcut) =>
        context.kind === "dealergroup" ? true : shortcut.groupOnly ? false : true
      )
      .filter((shortcut) =>
        term
          ? shortcut.title.toLowerCase().includes(term) ||
            shortcut.description.toLowerCase().includes(term)
          : true
      )
      .slice(0, 6);
  }, [commandSearch, context.kind]);

  const chassisMatch = useMemo(() => {
    const term = chassisInput.trim().toLowerCase();
    if (!term) return null;
    return scopedOrders.find((order) => order.Chassis.toLowerCase().includes(term));
  }, [chassisInput, scopedOrders]);

  const unsignedCount = useMemo(
    () => scopedOrders.filter((o) => !(o as any)["Signed Plans Received"]?.trim?.()).length,
    [scopedOrders]
  );

  const redSlots = useMemo(() => {
    return scopedOrders.filter((o) => {
      const days = daysFromToday(parseDate(o["Forecast Production Date"]));
      const missingSignature = !(o as any)["Signed Plans Received"]?.trim?.();
      return missingSignature && days !== null && days <= 14;
    }).length;
  }, [scopedOrders]);

  const pgiInThreeDays = useMemo(() => {
    return scopedOrders.filter((o) => {
      const days = daysFromToday(parseDate(o["Request Delivery Date"] || o["Forecast Production Date"]));
      const production = o["Regent Production"]?.toLowerCase?.();
      const isPGI = production?.includes("pgi") || production?.includes("dispatch");
      return days !== null && days <= 3 && (!production || isPGI);
    }).length;
  }, [scopedOrders]);

  const smartSummary = useMemo(() => {
    const total = scopedOrders.length;
    const pending = scopedOrders.filter((o) => !o["Regent Production"] || o["Regent Production"].toLowerCase() === "pending").length;
    const withDates = scopedOrders.filter((o) => parseDate(o["Forecast Production Date"]) !== null).length;
    const nextUnsigned = scopedOrders
      .filter((o) => !(o as any)["Signed Plans Received"]?.trim?.())
      .map((o) => ({
        chassis: o.Chassis,
        customer: o.Customer,
        etaDays: daysFromToday(parseDate(o["Forecast Production Date"])) ?? 9999,
      }))
      .sort((a, b) => a.etaDays - b.etaDays)[0];
    const nextPGI = scopedOrders
      .map((o) => ({
        chassis: o.Chassis,
        deliveryDays: daysFromToday(parseDate(o["Request Delivery Date"] || o["Forecast Production Date"])) ?? 9999,
        status: o["Regent Production"] ?? "",
      }))
      .sort((a, b) => a.deliveryDays - b.deliveryDays)[0];

    return {
      total,
      pending,
      withDates,
      nextUnsigned,
      nextPGI,
    };
  }, [scopedOrders]);

  const suggestedActions = useMemo(() => {
    const suggestions = [] as Array<{ label: string; detail: string; action: QuickAction }>;

    if (smartSummary.nextUnsigned && smartSummary.nextUnsigned.etaDays < 30) {
      suggestions.push({
        label: "Unsigned slot risk",
        detail: `${smartSummary.nextUnsigned.customer || "Customer"} – ${smartSummary.nextUnsigned.chassis} due in ${smartSummary.nextUnsigned.etaDays}d`,
        action: quickActions.find((a) => a.id === "unsigned")!,
      });
    }

    if (smartSummary.nextPGI && smartSummary.nextPGI.deliveryDays < 5) {
      suggestions.push({
        label: "Upcoming PGI",
        detail: `${smartSummary.nextPGI.chassis} expected in ${smartSummary.nextPGI.deliveryDays}d (${smartSummary.nextPGI.status || ""})`,
        action: quickActions.find((a) => a.id === "road")!,
      });
    }

    if (!suggestions.length) {
      suggestions.push({
        label: "Jump back to dashboard",
        detail: "Open the most relevant dashboard for this context",
        action: quickActions.find((a) => a.id === "track")!,
      });
    }

    return suggestions.slice(0, 2);
  }, [smartSummary]);

  const handleNavigate = (action: QuickAction | CommandShortcut) => {
    const path = buildPath(action.target);
    navigate(path);
    setOpen(false);
  };

  const goToYardWithState = (state: Record<string, any>) => {
    const path = buildPath("yard");
    navigate(path, { state });
    setOpen(false);
  };

  const handleReceiveNow = () => {
    const chassis = chassisInput.trim().toUpperCase();
    if (!chassis) return;
    setPrefillNotice(`已为 ${chassis} 预填入场流程，正在打开 Yard...`);
    goToYardWithState({ aiPrefillChassis: chassis, aiAction: "receive" });
  };

  const handleHandoverNow = () => {
    const chassis = chassisInput.trim().toUpperCase();
    if (!chassis) return;
    setPrefillNotice(`正在为 ${chassis} 打开 handover 表单...`);
    goToYardWithState({ aiPrefillChassis: chassis, aiAction: "handover" });
  };

  useEffect(() => {
    setPrefillNotice(null);
  }, [selectedAction]);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3">
      {open && (
        <Card className="w-[360px] sm:w-[420px] shadow-2xl border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-300">AI Copilot</p>
              <p className="text-base font-semibold">Everything, one click away</p>
              <p className="text-[11px] text-slate-200">Understands {context.kind === "dealergroup" ? "dealer group" : "dealer"} pages and jumps to the right view.</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10"
              onClick={() => setOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 p-3">
            {quickActions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => setSelectedAction(action)}
                className={`flex flex-col gap-1 rounded-xl border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/40 ${
                  selectedAction?.id === action.id
                    ? "border-slate-900 bg-slate-900/5"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center gap-2 text-slate-800">
                  <action.icon className="h-4 w-4 text-slate-600" />
                  <p className="font-semibold text-sm">{action.title}</p>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{action.description}</p>
                <span className="inline-flex w-fit items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600">
                  <Sparkles className="h-3 w-3 text-amber-500" />
                  <span>AI shortcut</span>
                </span>
              </button>
            ))}
          </div>

          <div className="px-4 pb-2">
            <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-700">
                <span className="flex items-center gap-1 font-semibold">
                  <Search className="h-3 w-3" />
                  直接输入车架号
                </span>
                {selectedAction && (
                  <Badge variant="outline" className="rounded-full text-[11px]">
                    {selectedAction.title}
                  </Badge>
                )}
              </div>
              <Input
                value={chassisInput}
                onChange={(e) => setChassisInput(e.target.value)}
                placeholder="例如：6K9..."
                className="text-sm"
              />
              {prefillNotice && <p className="text-[11px] text-emerald-700">{prefillNotice}</p>}

              {selectedAction?.id === "track" && (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                  {chassisMatch ? (
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-900">{chassisMatch.Chassis}</p>
                      <p className="text-slate-600">{chassisMatch.Customer}</p>
                      <p className="text-slate-500">Model: {chassisMatch.Model}</p>
                      <p className="font-semibold text-emerald-700 flex items-center gap-1">
                        <Sparkles className="h-3 w-3 text-emerald-500" />
                        {friendlyStatus(chassisMatch)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-slate-500">输入车架号即可返回最新状态。</p>
                  )}
                </div>
              )}

              {selectedAction?.id === "receive" && (
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                  <div>
                    <p className="font-semibold text-slate-900">Receive & add to yard</p>
                    <p className="text-slate-500">预填车架号并打开入场流程。</p>
                  </div>
                  <Button size="sm" onClick={handleReceiveNow} disabled={!chassisInput.trim()}>
                    Receive now
                  </Button>
                </div>
              )}

              {selectedAction?.id === "handover" && (
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                  <div>
                    <p className="font-semibold text-slate-900">直接打开 Handover</p>
                    <p className="text-slate-500">跳到交付表单并自动带入车架号。</p>
                  </div>
                  <Button size="sm" onClick={handleHandoverNow} disabled={!chassisInput.trim()}>
                    Open form
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-100 bg-slate-50/70 p-4">
            <div className="mb-3 flex items-center justify-between text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-slate-700" />
                <span>Smart summary</span>
              </div>
              {loadingOrders ? (
                <span className="flex items-center gap-1 text-slate-500">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading
                </span>
              ) : (
                <span className="text-slate-500">Live</span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-slate-600">
              <div className="rounded-lg bg-white p-2 border border-slate-100">
                <p className="text-lg font-semibold text-slate-900">{smartSummary.total}</p>
                <p>Total orders</p>
              </div>
              <div className="rounded-lg bg-white p-2 border border-slate-100">
                <p className="text-lg font-semibold text-amber-600">{unsignedCount}</p>
                <p>Unsigned</p>
              </div>
              <div className="rounded-lg bg-white p-2 border border-slate-100">
                <p className="text-lg font-semibold text-emerald-700">{pgiInThreeDays}</p>
                <p>Road ≤3d</p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-700 sm:grid-cols-2">
              {suggestedActions.map((suggestion) => (
                <button
                  key={suggestion.label}
                  type="button"
                  onClick={() => suggestion.action && handleNavigate(suggestion.action)}
                  className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition hover:-translate-y-[1px] hover:border-slate-300"
                >
                  <div className="flex items-center gap-2 text-slate-900">
                    <Sparkles className="h-3 w-3 text-amber-500" />
                    <span className="font-semibold">{suggestion.label}</span>
                  </div>
                  <p className="text-[11px] text-slate-500">{suggestion.detail}</p>
                </button>
              ))}
            </div>

            {selectedAction?.id === "track" && (
              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-1">Search by chassis / customer</p>
                  <Input
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    placeholder="Type chassis, customer, or model"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {!orderSearch && <p className="text-xs text-slate-500">Start typing to see live statuses.</p>}
                  {orderSearch && loadingOrders && (
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
                    </p>
                  )}
                  {orderSearch && !loadingOrders && trackedOrders.length === 0 && (
                    <p className="text-xs text-slate-500">No matching orders found.</p>
                  )}
                  {trackedOrders.map((order) => (
                    <div
                      key={order.Chassis}
                      className="rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700"
                    >
                      <p className="font-semibold text-slate-900">{order.Chassis}</p>
                      <p className="text-slate-600">{order.Customer}</p>
                      <p className="text-slate-500">Model: {order.Model}</p>
                      <p className="text-slate-800 flex items-center gap-1">
                        <Sparkles className="h-3 w-3 text-emerald-500" /> {friendlyStatus(order)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedAction?.id === "unsigned" && (
              <div className="mt-3 text-xs text-slate-700 space-y-2">
                <p className="font-semibold">AI risk view</p>
                <p>
                  {unsignedCount} unsigned slots detected. {redSlots} of them are priority (within 14 days of production).
                </p>
                <div className="flex gap-2 text-[11px]">
                  <span className="flex-1 rounded-lg bg-white border border-amber-100 px-3 py-2">Red slots: {redSlots}</span>
                  <span className="flex-1 rounded-lg bg-white border border-slate-100 px-3 py-2">With dates: {smartSummary.withDates}</span>
                </div>
              </div>
            )}

            {selectedAction?.id === "road" && (
              <div className="mt-3 text-xs text-slate-700 space-y-2">
                <p className="font-semibold">PGI radar</p>
                <p>{pgiInThreeDays} vans are within 3 days of PGI / dispatch based on delivery targets.</p>
              </div>
            )}

            {selectedAction?.id === "revenue" && (
              <div className="mt-3 text-xs text-slate-700 space-y-2">
                <p className="font-semibold">Revenue pulse</p>
                <p>
                  Open the finance dashboard to review PowerBI revenue tiles, margin snapshots, and trending KPIs without leaving your current page.
                </p>
              </div>
            )}

            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Search className="h-3 w-3" />
                <span>Command palette</span>
                <Badge variant="secondary" className="rounded-full">All pages</Badge>
              </div>
              <Input
                value={commandSearch}
                onChange={(e) => setCommandSearch(e.target.value)}
                placeholder="Search actions (dashboard, yard, finance, unsigned…)"
                className="text-sm"
              />
              <div className="max-h-32 space-y-2 overflow-y-auto pr-1 text-xs">
                {filteredShortcuts.map((shortcut) => (
                  <button
                    key={shortcut.id}
                    type="button"
                    onClick={() => handleNavigate(shortcut)}
                    className="flex w-full items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-slate-300"
                  >
                    <shortcut.icon className="mt-[2px] h-4 w-4 text-slate-600" />
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900">{shortcut.title}</p>
                      <p className="text-[11px] text-slate-600">{shortcut.description}</p>
                    </div>
                    {context.kind === "dealergroup" && shortcut.groupOnly && (
                      <Badge className="mt-[2px]" variant="outline">Group</Badge>
                    )}
                  </button>
                ))}
                {!filteredShortcuts.length && (
                  <p className="text-[11px] text-slate-500">No commands match that search.</p>
                )}
              </div>
            </div>

            <Button
              className="mt-4 w-full bg-slate-900 text-white hover:bg-slate-800"
              onClick={() => selectedAction && handleNavigate(selectedAction)}
            >
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-2">
                  {selectedAction ? <selectedAction.icon className="h-4 w-4" /> : <CarFront className="h-4 w-4" />}
                  <span>{selectedAction?.cta || "Go"}</span>
                </div>
                <Sparkles className="h-4 w-4 text-amber-400" />
              </div>
            </Button>
          </div>
        </Card>
      )}

      <Button
        className="flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-white shadow-2xl"
        onClick={() => setOpen((prev) => !prev)}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
          {open ? <X className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </div>
        <div className="flex flex-col items-start text-left">
          <span className="text-[11px] uppercase tracking-wide text-white/70">AI Assistant</span>
          <span className="text-sm font-semibold">Need an instant action?</span>
        </div>
        {!open && <Sparkles className="h-4 w-4 text-amber-300" />}
      </Button>
    </div>
  );
}
