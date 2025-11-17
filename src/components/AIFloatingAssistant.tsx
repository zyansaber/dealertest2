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
  Sparkles,
  Truck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { subscribeToSchedule } from "@/lib/firebase";
import type { ScheduleItem } from "@/types";

interface QuickAction {
  id:
    | "track"
    | "receive"
    | "pgi"
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
    id: "pgi",
    title: "PGI a Van",
    description: "Mark a vehicle as PGI without hunting for the right screen.",
    cta: "Open PGI tools",
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

export default function AIFloatingAssistant() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<QuickAction | null>(quickActions[0]);
  const [orders, setOrders] = useState<ScheduleItem[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

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
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase();
    return orders
      .filter((order) =>
        order.Chassis.toLowerCase().includes(term) ||
        order.Customer.toLowerCase().includes(term) ||
        order.Model.toLowerCase().includes(term)
      )
      .slice(0, 3);
  }, [orders, searchTerm]);

  const unsignedCount = useMemo(
    () => orders.filter((o) => !(o as any)["Signed Plans Received"]?.trim?.()).length,
    [orders]
  );

  const redSlots = useMemo(() => {
    return orders.filter((o) => {
      const days = daysFromToday(parseDate(o["Forecast Production Date"]));
      const missingSignature = !(o as any)["Signed Plans Received"]?.trim?.();
      return missingSignature && days !== null && days <= 14;
    }).length;
  }, [orders]);

  const pgiInThreeDays = useMemo(() => {
    return orders.filter((o) => {
      const days = daysFromToday(parseDate(o["Request Delivery Date"] || o["Forecast Production Date"]));
      const production = o["Regent Production"]?.toLowerCase?.();
      const isPGI = production?.includes("pgi") || production?.includes("dispatch");
      return days !== null && days <= 3 && (!production || isPGI);
    }).length;
  }, [orders]);

  const smartSummary = useMemo(() => {
    const total = orders.length;
    const pending = orders.filter((o) => !o["Regent Production"] || o["Regent Production"].toLowerCase() === "pending").length;
    const withDates = orders.filter((o) => parseDate(o["Forecast Production Date"]) !== null).length;

    return {
      total,
      pending,
      withDates,
    };
  }, [orders]);

  const handleNavigate = (action: QuickAction) => {
    const path = buildPath(action.target);
    navigate(path);
    setOpen(false);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3">
      {open && (
        <Card className="w-[360px] sm:w-[420px] shadow-2xl border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-300">AI Copilot</p>
              <p className="text-base font-semibold">Everything, one click away</p>
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
                <p className="text-[11px] font-semibold text-slate-800 flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-amber-500" /> AI ready
                </p>
              </button>
            ))}
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

            {selectedAction?.id === "track" && (
              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-1">Search by chassis / customer</p>
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Type chassis, customer, or model"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {!searchTerm && <p className="text-xs text-slate-500">Start typing to see live statuses.</p>}
                  {searchTerm && loadingOrders && (
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
                    </p>
                  )}
                  {searchTerm && !loadingOrders && trackedOrders.length === 0 && (
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
