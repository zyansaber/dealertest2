import { useState, useEffect, useMemo, useCallback } from "react";
import { Search, Filter, Calendar, User, LogOut } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import OrderDetails from "./OrderDetails";
import { subscribeToSchedule, subscribeToSpecPlan, subscribeToDateTrack, sortOrders } from "@/lib/firebase";
import type { ScheduleItem, SpecPlan, DateTrack, FilterOptions } from "@/types";

interface OrderListProps {
  selectedDealer?: string;
  orders?: ScheduleItem[];
  specPlans?: any;
  dateTracks?: any;
}

function OrderList({ selectedDealer, orders: propOrders, specPlans: propSpecPlans, dateTracks: propDateTracks }: OrderListProps) {
  const [orders, setOrders] = useState<ScheduleItem[]>([]);
  const [specPlan, setSpecPlan] = useState<SpecPlan>({});
  const [dateTrack, setDateTrack] = useState<DateTrack>({});
  const [loading, setLoading] = useState(true);
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

      {/* Filters */}
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

      {/* Content */}
      <div className="flex-1 p-6 overflow-auto">
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
              <div className="col-span-2 text-left">Customer</div>
              <div className="col-span-2 text-left">Model</div>
              <div className="col-span-1 text-left">Model Year</div>
              <div className="col-span-2 text-left">Forecast Melbourne Factory Start Date</div>
              <div className="col-span-2 text-left">Status</div>
              <div className="col-span-1 text-center">Action</div>
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
      </div>
    </div>
  );
}

export default OrderList;
