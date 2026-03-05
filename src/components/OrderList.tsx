import { useState, useEffect, useMemo, useCallback } from "react";
import { Search, Filter, Calendar, User, LogOut } from "lucide-react";
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
  const [activeTab, setActiveTab] = useState<"caravan" | "vehicles">("caravan");
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
                <CardTitle>Vehicles ({filteredCampervanOrders.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-8 gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <div className="col-span-1 text-left">Forecast Production Date</div>
                  <div className="col-span-1 text-left">Chassis</div>
                  <div className="col-span-1 text-left">Customer</div>
                  <div className="col-span-1 text-left">Model</div>
                  <div className="col-span-1 text-left">Regent Production</div>
                  <div className="col-span-1 text-left">Signed Order Received</div>
                  <div className="col-span-1 text-left">Vehicle</div>
                  <div className="col-span-1 text-left">VIN</div>
                </div>

                {loadingVehicles ? (
                  <div className="text-center py-8 text-slate-500">Loading vehicle schedule...</div>
                ) : filteredCampervanOrders.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {filteredCampervanOrders.map((order, idx) => (
                      <div
                        key={`${order.chassisNumber || order.vinNumber || idx}`}
                        className="grid grid-cols-8 gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        <div className="col-span-1">{order.forecastProductionDate || "-"}</div>
                        <div className="col-span-1">{order.chassisNumber || "-"}</div>
                        <div className="col-span-1">{order.customer || "-"}</div>
                        <div className="col-span-1">{order.model || "-"}</div>
                        <div className="col-span-1">{order.regentProduction || "-"}</div>
                        <div className="col-span-1">{order.signedOrderReceived || "-"}</div>
                        <div className="col-span-1">{order.vehicle || "-"}</div>
                        <div className="col-span-1">{order.vinNumber || "-"}</div>
                      </div>
                    ))}
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
