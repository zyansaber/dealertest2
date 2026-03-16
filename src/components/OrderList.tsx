import { useState, useEffect, useMemo, useCallback } from "react";
import { Search, Filter, Calendar, User, LogOut, FileDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import OrderDetails from "./OrderDetails";
import { toast } from "sonner";
import {
  subscribeToSchedule,
  subscribeToSpecPlan,
  subscribeToDateTrack,
  subscribeAllDealerConfigs,
  subscribeDeliveryToAssignments,
  setDeliveryToAssignment,
  clearDeliveryToAssignment,
  sortOrders,
  subscribeToCampervanSchedule,
  subscribeToYardStock,
  subscribeToSchedulingVanOptions,
} from "@/lib/firebase";
import { formatDateDDMMYYYY } from "@/lib/firebase";
import type { ScheduleItem, SpecPlan, DateTrack, FilterOptions, CampervanScheduleItem } from "@/types";

interface OrderListProps {
  selectedDealer?: string;
  orders?: ScheduleItem[];
  specPlans?: any;
  dateTracks?: any;
  dealerSlug?: string;
  deliveryToEnabled?: boolean;
  deliveryToOptions?: string[];
}

interface CombinedStockRow {
  chassis: string;
  source: "orderlist" | "yardinventory";
  dealer?: string;
  customer?: string;
  model?: string;
  salesOrder?: string;
  retailsaleprice?: number | null;
  discount?: number | null;
  items?: Record<string, any>;
}

declare global {
  interface Window {
    jspdf?: any;
    jsPDF?: any;
  }
}

const loadScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === "1") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load script: ${src}`)), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "1";
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.body.appendChild(script);
  });

const ensureJsPdf = async () => {
  if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
  if (window.jsPDF) return window.jsPDF;
  await loadScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
  if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
  if (window.jsPDF) return window.jsPDF;
  throw new Error("jsPDF not available after loading");
};

function OrderList({
  selectedDealer,
  orders: propOrders,
  specPlans: propSpecPlans,
  dateTracks: propDateTracks,
  dealerSlug,
  deliveryToEnabled = false,
  deliveryToOptions = [],
}: OrderListProps) {
  const [orders, setOrders] = useState<ScheduleItem[]>([]);
  const [specPlan, setSpecPlan] = useState<SpecPlan>({});
  const [dateTrack, setDateTrack] = useState<DateTrack>({});
  const [campervanOrders, setCampervanOrders] = useState<CampervanScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [dealerConfigs, setDealerConfigs] = useState<Record<string, any>>({});
  const [deliveryToAssignments, setDeliveryToAssignments] = useState<Record<string, any>>({});
  const [yardStockMap, setYardStockMap] = useState<Record<string, any>>({});
  const [schedulingVanOptionsMap, setSchedulingVanOptionsMap] = useState<Record<string, any>>({});
  const [downloadingStockPdf, setDownloadingStockPdf] = useState(false);
  const [activeTab, setActiveTab] = useState<"caravan" | "vehicles">("caravan");
  const [vehicleSearchTerm, setVehicleSearchTerm] = useState("");
  const [filters, setFilters] = useState<FilterOptions>({
    model: "",
    modelYear: "",
    regentProduction: "",
    customerType: "",
    dateRange: { start: "", end: "" },
    searchTerm: ""
  });

  // Use props if provided, otherwise subscribe to Firebase
  useEffect(() => {
    if (propOrders && propSpecPlans && propDateTracks) {
      setOrders(propOrders);
      // Convert arrays to objects if needed
      if (Array.isArray(propSpecPlans)) {
        const specPlanObj = propSpecPlans.reduce((acc, plan) => {
          if (plan.Chassis) {
            acc[plan.Chassis] = plan;
          }
          return acc;
        }, {} as SpecPlan);
        setSpecPlan(specPlanObj);
      } else {
        setSpecPlan(propSpecPlans);
      }
      
      if (Array.isArray(propDateTracks)) {
        const dateTrackObj = propDateTracks.reduce((acc, track) => {
          if (track.Chassis || track["Chassis Number"]) {
            const key = track.Chassis || track["Chassis Number"];
            acc[key] = track;
          }
          return acc;
        }, {} as DateTrack);
        setDateTrack(dateTrackObj);
      } else {
        setDateTrack(propDateTracks);
      }
      
      setLoading(false);
      return;
    }

    const unsubscribeSchedule = subscribeToSchedule((data) => {
      setOrders(sortOrders(data));
      setLoading(false);
    });

    const unsubscribeSpecPlan = subscribeToSpecPlan(setSpecPlan);
    const unsubscribeDateTrack = subscribeToDateTrack(setDateTrack);

    return () => {
      unsubscribeSchedule();
      unsubscribeSpecPlan();
      unsubscribeDateTrack();
    };
  }, [propOrders, propSpecPlans, propDateTracks]);

  const showVehiclesTab = Boolean(dealerSlug);

  useEffect(() => {
    if (!showVehiclesTab) {
      setCampervanOrders([]);
      setLoadingVehicles(false);
      return;
    }

    setLoadingVehicles(true);
    const unsubscribe = subscribeToCampervanSchedule((data) => {
      setCampervanOrders(data || []);
      setLoadingVehicles(false);
    });

    return () => {
      unsubscribe?.();
    };
  }, [showVehiclesTab]);

  useEffect(() => {
    if (!dealerSlug) {
      setYardStockMap({});
      setSchedulingVanOptionsMap({});
      return;
    }

    const unsubYard = subscribeToYardStock(dealerSlug, (data) => {
      setYardStockMap(data || {});
    });
    const unsubScheduling = subscribeToSchedulingVanOptions(dealerSlug, (data) => {
      setSchedulingVanOptionsMap(data || {});
    });

    return () => {
      unsubYard?.();
      unsubScheduling?.();
    };
  }, [dealerSlug]);

  useEffect(() => {
    if (!deliveryToEnabled) {
      setDealerConfigs({});
      return;
    }
    const unsubscribe = subscribeAllDealerConfigs((data) => {
      setDealerConfigs(data || {});
    });
    return unsubscribe;
  }, [deliveryToEnabled]);

  useEffect(() => {
    if (!deliveryToEnabled) {
      setDeliveryToAssignments({});
      return;
    }
    const unsubscribe = subscribeDeliveryToAssignments((data) => {
      setDeliveryToAssignments(data || {});
    });
    return unsubscribe;
  }, [deliveryToEnabled]);

  // Reset filters when dealer changes
  useEffect(() => {
    setFilters({
      model: "",
      modelYear: "",
      regentProduction: "",
      customerType: "",
      dateRange: { start: "", end: "" },
      searchTerm: ""
    });
  }, [selectedDealer]);

  const slugifyDealerName = useCallback((name?: string): string => {
    return (name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }, []);

  const dealerOrders = useMemo(() => {
    if (!selectedDealer || selectedDealer === "all") return orders;
    return orders.filter(order => order.Dealer === selectedDealer);
  }, [orders, selectedDealer]);

  // 判断是否为 Stock 车辆
  const isStockVehicle = useCallback((customer: string) => {
    return customer.toLowerCase().endsWith('stock');
  }, []);

  const filteredOrders = useMemo(() => {
    return dealerOrders.filter(order => {
      // Search filter
      if (filters.searchTerm) {
        const searchLower = filters.searchTerm.toLowerCase();
        const matchesSearch = 
          order.Chassis.toLowerCase().includes(searchLower) ||
          order.Customer.toLowerCase().includes(searchLower) ||
          (order.Dealer && order.Dealer.toLowerCase().includes(searchLower)) ||
          order.Model.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Model filter
      if (filters.model && filters.model !== "all" && order.Model !== filters.model) return false;

      // Model Year filter
      if (filters.modelYear && filters.modelYear !== "all" && order["Model Year"] !== filters.modelYear) return false;

      // Regent Production filter
      if (filters.regentProduction && filters.regentProduction !== "all" && order["Regent Production"] !== filters.regentProduction) return false;

      // Customer Type filter (Stock vs Customer)
      if (filters.customerType && filters.customerType !== "all") {
        const isStock = isStockVehicle(order.Customer);
        if (filters.customerType === "stock" && !isStock) return false;
        if (filters.customerType === "customer" && isStock) return false;
      }

      // Date range filter (Forecast Production Date)
      if (filters.dateRange.start || filters.dateRange.end) {
        const orderDateStr = order["Forecast Production Date"];
        if (orderDateStr) {
          try {
            const parts = orderDateStr.split('/');
            if (parts.length === 3) {
              const day = parseInt(parts[0]);
              const month = parseInt(parts[1]) - 1;
              const year = parseInt(parts[2]);
              const orderDate = new Date(year, month, day);
              
              if (filters.dateRange.start) {
                const startDate = new Date(filters.dateRange.start);
                if (orderDate < startDate) return false;
              }
              if (filters.dateRange.end) {
                const endDate = new Date(filters.dateRange.end);
                if (orderDate > endDate) return false;
              }
            }
          } catch {
            // Skip invalid dates
          }
        }
      }

      return true;
    });
  }, [dealerOrders, filters, isStockVehicle]);

  const uniqueModels = useMemo(() => {
    return [...new Set(dealerOrders.map(order => order.Model))].filter(Boolean).sort();
  }, [dealerOrders]);

  const uniqueModelYears = useMemo(() => {
    return [...new Set(dealerOrders.map(order => order["Model Year"]))].filter(Boolean).sort();
  }, [dealerOrders]);

  const uniqueProductionStatuses = useMemo(() => {
    return [...new Set(dealerOrders.map(order => order["Regent Production"]))].filter(Boolean).sort();
  }, [dealerOrders]);

  const filteredCampervanOrders = useMemo(() => {
    if (!dealerSlug) return campervanOrders;
    return campervanOrders.filter((order) => slugifyDealerName(order.dealer) === dealerSlug);
  }, [campervanOrders, dealerSlug, slugifyDealerName]);

  const vehicleStatusText: Record<string, string> = {
    "not confirmed orders": "Not Confirmed Orders",
    "Waiting for sending": "Waiting for Sending",
    "Not Start in Longtree": "Not Started in Longtree",
    "Chassis welding in Longtree": "Chassis Welding in Longtree",
    "Assembly line Longtree": "Assembly Line Longtree",
    "Finishedin Longtree": "Finished in Longtree",
    "Leaving factory from Longtree": "Leaving Factory from Longtree",
    "waiting in port": "Waiting in Port",
    "On the sea": "On the Sea",
    "Melbourn Port": "Melbourne Port",
    "Melbourn Factory": "Melbourne Factory",
  };

  const vehicleStatusClass: Record<string, string> = {
    "not confirmed orders": "bg-amber-100 text-amber-800",
    "Waiting for sending": "bg-yellow-100 text-yellow-800",
    "Not Start in Longtree": "bg-sky-100 text-sky-800",
    "Chassis welding in Longtree": "bg-blue-100 text-blue-800",
    "Assembly line Longtree": "bg-indigo-100 text-indigo-800",
    "Finishedin Longtree": "bg-violet-100 text-violet-800",
    "Leaving factory from Longtree": "bg-orange-100 text-orange-800",
    "waiting in port": "bg-pink-100 text-pink-800",
    "On the sea": "bg-cyan-100 text-cyan-800",
    "Melbourn Port": "bg-lime-100 text-lime-800",
    "Melbourn Factory": "bg-emerald-100 text-emerald-800",
  };

  const searchedVehicleOrders = useMemo(() => {
    const q = vehicleSearchTerm.trim().toLowerCase();
    return filteredCampervanOrders.filter((order) => {
      if (!q) return true;

      return [
        order.forecastProductionDate,
        order.chassisNumber,
        order.customer,
        order.model,
        order.regentProduction,
        order.signedOrderReceived,
        order.vehicle,
        order.vinNumber,
      ]
        .map((x) => String(x || "").toLowerCase())
        .some((val) => val.includes(q));
    });
  }, [filteredCampervanOrders, vehicleSearchTerm]);

  const getVehicleDocUrl = useCallback((chassis: string | undefined, kind: "spec" | "plan") => {
    if (!chassis) return "";
    const doc = specPlan[chassis] || specPlan[chassis.toUpperCase()] || specPlan[chassis.toLowerCase()];
    if (!doc) return "";
    if (kind === "spec") return doc.spec || doc["Spec File"] || "";
    return doc.plan || doc["Plan File"] || "";
  }, [specPlan]);

  const parseFlexibleDate = useCallback((dateStr: string | null | undefined): Date | null => {
    if (!dateStr) return null;

    const parts = dateStr.split("/").map((part) => parseInt(part.trim(), 10));
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;

    const [first, second, third] = parts;
    const isYearFirst = first > 31 || String(first).length === 4;
    const year = isYearFirst ? first : third;
    const month = second - 1;
    const day = isYearFirst ? third : first;

    const date = new Date(year, month, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }, []);

  const addDays = useCallback((date: Date, days: number): Date => {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
  }, []);

  const formatDateFromDate = useCallback((date: Date | null): string => {
    if (!date) return "Not set";
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }, []);

  const showDeliveryTo = Boolean(deliveryToEnabled && dealerSlug);

  const deliveryToOptionList = useMemo(
    () =>
      (deliveryToOptions || []).map((slug) => ({
        value: slug,
        label: dealerConfigs?.[slug]?.name || slug,
      })),
    [deliveryToOptions, dealerConfigs]
  );

  const handleDeliveryToSave = useCallback(
    async (chassis: string, value: string) => {
      if (!dealerSlug) return;
      try {
        if (!value) {
          await clearDeliveryToAssignment(chassis);
          toast.success("Delivery To cleared");
          return;
        }
        await setDeliveryToAssignment(chassis, { deliveryTo: value, sourceDealerSlug: dealerSlug });
        toast.success("Delivery To updated");
      } catch (error) {
        console.error("Failed to update delivery to:", error);
        toast.error("Failed to update Delivery To");
      }
    },
    [dealerSlug]
  );

  const getDisplayForecastProductionDate = useCallback((order: ScheduleItem): string => {
    const originalFormatted = formatDateDDMMYYYY(order["Forecast Production Date"]);
    const isVanOnTheSeaStatus = (order["Regent Production"] || "").trim().toLowerCase() === "van on the sea";
    if (!isVanOnTheSeaStatus) return originalFormatted;

    const shipmentDateStr = order.Shipment?.split("-")?.[0]?.trim();
    const shipmentDate = parseFlexibleDate(shipmentDateStr);
    if (!shipmentDate) return originalFormatted;

    const minForecastDate = addDays(shipmentDate, 3);
    const forecastDate = parseFlexibleDate(order["Forecast Production Date"]);

    if (!forecastDate) return formatDateFromDate(minForecastDate);

    const shouldUseMinDate = forecastDate.getTime() < minForecastDate.getTime();
    return formatDateFromDate(shouldUseMinDate ? minForecastDate : forecastDate);
  }, [addDays, formatDateFromDate, parseFlexibleDate]);

  const combinedStockRows = useMemo<CombinedStockRow[]>(() => {
    const normalizeChassis = (value?: string) => String(value || "").replace(/[-\s]/g, "").trim().toUpperCase();
    const isStockType = (customer?: string, type?: string) => {
      const c = String(customer || "").toLowerCase();
      const t = String(type || "").toLowerCase();
      return c.endsWith("stock") || t === "stock";
    };

    const merged = new Map<string, CombinedStockRow>();

    dealerOrders.forEach((order) => {
      const rp = String(order["Regent Production"] || "").trim().toLowerCase();
      if (rp === "finished" || rp === "finish") return;
      if (!isStockType(order.Customer)) return;
      const ch = normalizeChassis(order.Chassis);
      if (!ch) return;
      const extra = schedulingVanOptionsMap?.[ch] || schedulingVanOptionsMap?.[order.Chassis] || {};
      merged.set(ch, {
        chassis: ch,
        source: "orderlist",
        dealer: order.Dealer,
        customer: order.Customer,
        model: order.Model,
        salesOrder: extra?.salesOrder,
        retailsaleprice: typeof extra?.retailsaleprice === "number" ? extra.retailsaleprice : null,
        discount: typeof extra?.discount === "number" ? extra.discount : null,
        items: extra?.items && typeof extra.items === "object" ? extra.items : {},
      });
    });

    Object.entries(yardStockMap || {}).forEach(([key, payload]: [string, any]) => {
      const ch = normalizeChassis(key || payload?.chassis || payload?.vinNumber);
      if (!ch) return;
      if (!isStockType(payload?.customer, payload?.type)) return;
      const prev = merged.get(ch);
      merged.set(ch, {
        chassis: ch,
        source: "yardinventory",
        dealer: payload?.dealer || prev?.dealer,
        customer: payload?.customer || prev?.customer,
        model: payload?.model || prev?.model,
        salesOrder: payload?.salesOrder || prev?.salesOrder,
        retailsaleprice: typeof payload?.retailsaleprice === "number" ? payload.retailsaleprice : prev?.retailsaleprice ?? null,
        discount: typeof payload?.discount === "number" ? payload.discount : prev?.discount ?? null,
        items: payload?.items && typeof payload.items === "object" ? payload.items : prev?.items || {},
      });
    });

    return Array.from(merged.values()).sort((a, b) => a.chassis.localeCompare(b.chassis));
  }, [dealerOrders, schedulingVanOptionsMap, yardStockMap]);

  const handleDownloadStockPdf = useCallback(async () => {
    try {
      if (combinedStockRows.length === 0) {
        toast.error("No stock vehicles to download.");
        return;
      }

      setDownloadingStockPdf(true);
      const JsPDF = await ensureJsPdf();
      const doc = new JsPDF("p", "pt", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 40;
      const lineHeight = 16;
      const maxTextWidth = pageWidth - margin * 2;

      const writeLine = (text: string, y: number) => {
        const wrapped = doc.splitTextToSize(text, maxTextWidth);
        doc.text(wrapped, margin, y);
        return y + wrapped.length * lineHeight;
      };

      combinedStockRows.forEach((row, index) => {
        if (index > 0) doc.addPage();
        let y = 52;
        doc.setFontSize(14);
        y = writeLine(`Stock Vehicle ${index + 1}/${combinedStockRows.length}`, y);
        doc.setFontSize(11);
        y += 8;
        y = writeLine(`Chassis: ${row.chassis}`, y);
        y = writeLine(`Source: ${row.source}`, y);
        y = writeLine(`Dealer: ${row.dealer || "-"}`, y);
        y = writeLine(`Customer: ${row.customer || "-"}`, y);
        y = writeLine(`Model: ${row.model || "-"}`, y);
        y = writeLine(`Sales Order: ${row.salesOrder || "-"}`, y);
        y = writeLine(`Retail Sale Price (incl GST): ${row.retailsaleprice ?? "-"}`, y);
        y = writeLine(`Discount (incl GST): ${row.discount ?? "-"}`, y);
        y += 10;
        doc.setFontSize(12);
        y = writeLine("Items:", y);
        doc.setFontSize(10);

        const items = row.items && typeof row.items === "object" ? Object.values(row.items) : [];
        if (items.length === 0) {
          writeLine("- (no items)", y);
        } else {
          items.forEach((item: any, itemIdx) => {
            y = writeLine(
              `${itemIdx + 1}. itemNo=${item?.itemNo || "-"}, materialCode=${item?.materialCode || "-"}, description=${item?.description || "-"}, price=${item?.price ?? "-"}`,
              y,
            );
          });
        }
      });

      const today = new Date().toISOString().slice(0, 10);
      doc.save(`stock_combined_${dealerSlug || "dealer"}_${today}.pdf`);
      toast.success("Stock PDF downloaded.");
    } catch (error) {
      console.error("Failed to download stock PDF:", error);
      toast.error("Failed to generate stock PDF.");
    } finally {
      setDownloadingStockPdf(false);
    }
  }, [combinedStockRows, dealerSlug]);

  const clearFilters = useCallback(() => {
    setFilters({
      model: "",
      modelYear: "",
      regentProduction: "",
      customerType: "",
      dateRange: { start: "", end: "" },
      searchTerm: ""
    });
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-slate-500">Loading orders...</div>
      </div>
    );
  }

  const dealerName = selectedDealer === "all" ? "All Dealers" : selectedDealer;

  return (
    <div className="flex-1 flex flex-col">
      {/* Header - Only show if selectedDealer is provided (admin view) */}
      {selectedDealer && (
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">{dealerName} — Orders</h1>
              <p className="text-slate-600 mt-1">
                {selectedDealer === "all" 
                  ? "Track and manage all dealer orders" 
                  : `Track and manage orders for ${dealerName}`
                }
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <User className="w-4 h-4" />
                <span>Admin User</span>
              </div>
              <Button variant="ghost" size="sm">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </header>
      )}

      {/* Content */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "caravan" | "vehicles")} className="flex-1 flex flex-col">
        {showVehiclesTab && (
          <div className="bg-white border-b border-slate-200 px-6 py-4">
            <TabsList className="grid w-full max-w-sm grid-cols-2">
              <TabsTrigger value="caravan">Caravan</TabsTrigger>
              <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
            </TabsList>
          </div>
        )}

        {activeTab === "caravan" && (
          <div className="bg-white border-b border-slate-200 px-6 py-4">
            <div className="flex flex-wrap gap-4 items-center">
              {/* Search */}
              <div className="relative flex-1 min-w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search by Chassis, Customer, or Model..."
                  className="pl-10"
                  value={filters.searchTerm}
                  onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                />
              </div>

              {/* Model Filter */}
              <Select
                value={filters.model || "all"}
                onValueChange={(value) => setFilters(prev => ({ ...prev, model: value === "all" ? "" : value }))}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Models" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Models</SelectItem>
                  {uniqueModels.map(model => (
                    <SelectItem key={model} value={model}>{model}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Model Year Filter */}
              <Select
                value={filters.modelYear || "all"}
                onValueChange={(value) => setFilters(prev => ({ ...prev, modelYear: value === "all" ? "" : value }))}
              >
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="All Years" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {uniqueModelYears.map(year => (
                    <SelectItem key={year} value={year}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Customer Type Filter */}
              <Select
                value={filters.customerType || "all"}
                onValueChange={(value) => setFilters(prev => ({ ...prev, customerType: value === "all" ? "" : value }))}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="stock">Stock</SelectItem>
                  <SelectItem value="customer">Customer</SelectItem>
                </SelectContent>
              </Select>

              {/* Production Status Filter */}
              <Select
                value={filters.regentProduction || "all"}
                onValueChange={(value) => setFilters(prev => ({ ...prev, regentProduction: value === "all" ? "" : value }))}
              >
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {uniqueProductionStatuses.map(status => (
                    <SelectItem key={status} value={status}>{status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Clear Filters */}
              <Button variant="outline" onClick={clearFilters}>
                Clear Filters
              </Button>
              {dealerSlug && (
                <Button variant="outline" onClick={handleDownloadStockPdf} disabled={downloadingStockPdf}>
                  <FileDown className="w-4 h-4 mr-2" />
                  {downloadingStockPdf ? "Building PDF..." : `Download Stock PDF (${combinedStockRows.length})`}
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 p-6 overflow-auto">
          <TabsContent value="caravan" className="mt-0">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Orders ({filteredOrders.length})</CardTitle>
                  <div className="text-sm text-slate-500">
                    Showing {filteredOrders.length} of {dealerOrders.length} orders
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Table Header - 调整列宽 */}
                <div className="grid grid-cols-12 gap-2 pb-3 mb-4 border-b border-slate-200 text-sm font-medium text-slate-700">
                  <div className="col-span-2 text-left">Chassis</div>
                  <div className={showDeliveryTo ? "col-span-3 text-left" : "col-span-2 text-left"}>Customer</div>
                  <div className={showDeliveryTo ? "col-span-1 text-left" : "col-span-2 text-left"}>Model</div>
                  <div className="col-span-1 text-left">Model Year</div>
                  {showDeliveryTo && <div className="col-span-1 text-left">Delivery To</div>}
                  <div className="col-span-2 text-left">Forecast Melbourne Factory Start Date</div>
                  <div className={showDeliveryTo ? "col-span-1 text-left" : "col-span-2 text-left"}>Status</div>
                  <div className="col-span-1 text-center">Updating Subscription</div>
                </div>

                {/* Orders List */}
                <div className="space-y-2">
                  {filteredOrders.length > 0 ? (
                    filteredOrders.map((order) => (
                      <OrderDetails
                        key={order.Chassis}
                        order={order}
                        specPlan={specPlan[order.Chassis]}
                        dateTrack={dateTrack[order.Chassis] ||
                          Object.values(dateTrack).find(dt => dt["Chassis Number"] === order.Chassis)}
                        isStock={isStockVehicle(order.Customer)}
                        displayForecastProductionDate={getDisplayForecastProductionDate(order)}
                        showDeliveryTo={showDeliveryTo}
                        deliveryToLabel={
                          deliveryToAssignments?.[order.Chassis]?.deliveryTo
                            ? deliveryToOptionList.find((opt) => opt.value === deliveryToAssignments[order.Chassis]?.deliveryTo)
                                ?.label || deliveryToAssignments[order.Chassis]?.deliveryTo
                            : "Not set"
                        }
                        deliveryToValue={deliveryToAssignments?.[order.Chassis]?.deliveryTo || ""}
                        deliveryToOptions={deliveryToOptionList}
                        onDeliveryToSave={(value) => handleDeliveryToSave(order.Chassis, value)}
                      />
                    ))
                  ) : (
                    <div className="text-center py-8 text-slate-500">
                      No orders found matching your criteria
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="vehicles" className="mt-0">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Vehicles ({searchedVehicleOrders.length})</CardTitle>
                  <div className="text-sm text-slate-500">
                    Showing {searchedVehicleOrders.length} of {filteredCampervanOrders.length} vehicles
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex flex-col gap-3">
                  <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      placeholder="Search vehicles (chassis / customer / VIN / status)"
                      className="pl-10"
                      value={vehicleSearchTerm}
                      onChange={(e) => setVehicleSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                {loadingVehicles ? (
                  <div className="text-center py-8 text-slate-500">Loading vehicle schedule...</div>
                ) : searchedVehicleOrders.length > 0 ? (
                  <div className="overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <div className="grid min-w-[1180px] grid-cols-10 gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      <div>Forecast Production Date</div>
                      <div>Chassis</div>
                      <div>Customer</div>
                      <div>Model</div>
                      <div>Current Status</div>
                      <div>Signed Order Received</div>
                      <div>Vehicle</div>
                      <div>VIN</div>
                      <div className="text-center">Spec</div>
                      <div className="text-center">Plan</div>
                    </div>

                    <div className="mt-2 space-y-2">
                    {searchedVehicleOrders.map((order, idx) => {
                      const specUrl = getVehicleDocUrl(order.chassisNumber, "spec");
                      const planUrl = getVehicleDocUrl(order.chassisNumber, "plan");
                      const status = String(order.regentProduction || "-").trim() || "-";
                      return (
                      <div
                        key={`${order.chassisNumber || order.vinNumber || idx}`}
                        className="grid min-w-[1180px] grid-cols-10 gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:border-slate-300"
                      >
                        <div>{order.forecastProductionDate || "-"}</div>
                        <div className="font-medium">{order.chassisNumber || "-"}</div>
                        <div>{order.customer || "-"}</div>
                        <div>{order.model || "-"}</div>
                        <div>
                          <Badge className={vehicleStatusClass[status] || "bg-slate-100 text-slate-700"}>{vehicleStatusText[status] || status}</Badge>
                        </div>
                        <div>{order.signedOrderReceived || "-"}</div>
                        <div>{order.vehicle || "-"}</div>
                        <div>{order.vinNumber || "-"}</div>
                        <div className="text-center">
                          <Button size="sm" variant={specUrl ? "outline" : "ghost"} disabled={!specUrl} onClick={() => window.open(specUrl, "_blank")}>Download</Button>
                        </div>
                        <div className="text-center">
                          <Button size="sm" variant={planUrl ? "outline" : "ghost"} disabled={!planUrl} onClick={() => window.open(planUrl, "_blank")}>Download</Button>
                        </div>
                      </div>
                    )})}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    No vehicles found for this dealer
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

export default OrderList;
