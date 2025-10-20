// src/pages/DealerGroupPortal.tsx
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Download, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import Sidebar from "@/components/Sidebar";
import OrderList from "@/components/OrderList";
import ModelRangeCards from "@/components/ModelRangeCards";
import {
  subscribeToSchedule,
  subscribeToSpecPlan,
  subscribeToDateTrack,
  subscribeDealerConfig,
  subscribeAllDealerConfigs,
} from "@/lib/firebase";
import type { ScheduleItem, SpecPlan, DateTrack } from "@/types";
import type { DealerGroupConfig } from "@/types/dealer";
import { isDealerGroup } from "@/types/dealer";
import * as XLSX from "xlsx";

/** 将 URL 中的 dealerId 还原为真实的 slug（去掉随机后缀 -xxxxxx） */
function normalizeDealerSlug(raw?: string): string {
  const slug = (raw || "").toLowerCase();
  const m = slug.match(/^(.*?)-([a-z0-9]{6})$/);
  return m ? m[1] : slug;
}

/** 和首页一致的 slug 规则（把 Dealer 文本转为 slug，用于比较） */
function slugifyDealerName(name?: string): string {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** 将 slug 转成人看得懂的 Dealer 名称（基础美化） */
function prettifyDealerName(slug: string): string {
  const s = slug.replace(/-/g, " ").trim();
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DealerGroupPortal() {
  const { dealerSlug: rawDealerSlug, selectedDealerSlug } = useParams<{ 
    dealerSlug: string;
    selectedDealerSlug?: string;
  }>();
  const navigate = useNavigate();
  const dealerSlug = useMemo(() => normalizeDealerSlug(rawDealerSlug), [rawDealerSlug]);

  const [allOrders, setAllOrders] = useState<ScheduleItem[]>([]);
  const [specPlans, setSpecPlans] = useState<SpecPlan>({});
  const [dateTracks, setDateTracks] = useState<DateTrack>({});
  const [dealerConfig, setDealerConfig] = useState<any>(null);
  const [allDealerConfigs, setAllDealerConfigs] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [configLoading, setConfigLoading] = useState(true);

  // 仅保留 Model Range 的筛选
  const [modelRangeFilter, setModelRangeFilter] = useState<{ modelRange?: string; customerType?: string }>({});

  // 订阅全量数据
  useEffect(() => {
    const unsubSchedule = subscribeToSchedule((data) => {
      setAllOrders(data || []);
      setLoading(false);
    });
    const unsubSpecPlan = subscribeToSpecPlan((data) => setSpecPlans(data || {}));
    const unsubDateTrack = subscribeToDateTrack((data) => setDateTracks(data || {}));
    return () => {
      unsubSchedule?.();
      unsubSpecPlan?.();
      unsubDateTrack?.();
    };
  }, []);

  // 订阅当前经销商/分组配置
  useEffect(() => {
    if (!dealerSlug) return;

    const unsubConfig = subscribeDealerConfig(dealerSlug, (config) => {
      setDealerConfig(config);
      setConfigLoading(false);
    });

    return unsubConfig;
  }, [dealerSlug]);

  // 订阅所有经销商配置（用于获取分组中包含的dealer名称）
  useEffect(() => {
    const unsubAllConfigs = subscribeAllDealerConfigs((data) => {
      setAllDealerConfigs(data || {});
    });

    return unsubAllConfigs;
  }, []);

  // 获取包含的dealer slugs（如果是分组）
  const includedDealerSlugs = useMemo(() => {
    if (!dealerConfig || !isDealerGroup(dealerConfig)) {
      return [dealerSlug];
    }
    return dealerConfig.includedDealers || [];
  }, [dealerConfig, dealerSlug]);

  // 获取包含的dealer名称映射
  const includedDealerNames = useMemo(() => {
    if (!dealerConfig || !isDealerGroup(dealerConfig)) {
      return null;
    }
    
    return includedDealerSlugs.map(slug => {
      const config = allDealerConfigs[slug];
      return {
        slug,
        name: config?.name || prettifyDealerName(slug)
      };
    });
  }, [dealerConfig, includedDealerSlugs, allDealerConfigs]);

  // 如果是分组且没有选中dealer，自动重定向到第一个dealer
  useEffect(() => {
    if (!configLoading && dealerConfig && isDealerGroup(dealerConfig) && !selectedDealerSlug) {
      const firstDealer = includedDealerSlugs[0];
      if (firstDealer) {
        navigate(`/dealergroup/${rawDealerSlug}/${firstDealer}/dashboard`, { replace: true });
      }
    }
  }, [configLoading, dealerConfig, selectedDealerSlug, includedDealerSlugs, rawDealerSlug, navigate]);

  // 当前显示的dealer slug（如果选中了特定dealer，只显示该dealer）
  const currentDealerSlug = selectedDealerSlug || includedDealerSlugs[0] || dealerSlug;

  // 只展示当前选中dealer的订单
  const dealerOrders = useMemo(() => {
    if (!currentDealerSlug) return [];
    return (allOrders || []).filter(
      (o) => slugifyDealerName(o.Dealer) === currentDealerSlug
    );
  }, [allOrders, currentDealerSlug]);

  // 过滤订单（仅 Model Range / Customer Type）
  const filteredOrders = useMemo(() => {
    return dealerOrders.filter(order => {
      // Model Range 过滤
      if (modelRangeFilter.modelRange) {
        const chassisPrefix = order.Chassis?.substring(0, 3).toUpperCase();
        if (chassisPrefix !== modelRangeFilter.modelRange) return false;
      }

      // Customer Type 过滤
      if (modelRangeFilter.customerType) {
        const isStock = (order.Customer || "").toLowerCase().endsWith("stock");
        if (modelRangeFilter.customerType === "stock" && !isStock) return false;
        if (modelRangeFilter.customerType === "customer" && isStock) return false;
      }

      return true;
    });
  }, [dealerOrders, modelRangeFilter]);

  // 展示用的 Dealer 名称
  const dealerDisplayName = useMemo(() => {
    // 如果选中了特定dealer，显示该dealer的名称
    if (selectedDealerSlug) {
      const selectedConfig = allDealerConfigs[selectedDealerSlug];
      if (selectedConfig?.name) return selectedConfig.name;
      
      const fromOrder = dealerOrders.find(o => slugifyDealerName(o.Dealer) === selectedDealerSlug)?.Dealer;
      return fromOrder || prettifyDealerName(selectedDealerSlug);
    }

    // 否则显示分组名称或第一个dealer的名称
    if (dealerConfig?.name) return dealerConfig.name;

    const fromOrder = dealerOrders[0]?.Dealer;
    return fromOrder && fromOrder.trim().length > 0
      ? fromOrder
      : prettifyDealerName(dealerSlug);
  }, [dealerConfig, dealerOrders, dealerSlug, selectedDealerSlug, allDealerConfigs]);

  // 检查访问权限
  const hasAccess = useMemo(() => {
    if (configLoading) return true;
    if (!dealerConfig) return false;
    return dealerConfig.isActive;
  }, [dealerConfig, configLoading]);

  const exportToExcel = () => {
    if (filteredOrders.length === 0) return;

    const excelData = filteredOrders.map((order) => {
      const dateTrack =
        (dateTracks as any)[order.Chassis] ||
        (Object.values(dateTracks) as any[]).find(
          (dt: any) => dt?.["Chassis Number"] === order.Chassis
        );

      return {
        Chassis: order.Chassis,
        Customer: order.Customer,
        Model: order.Model,
        "Model Year": order["Model Year"],
        Dealer: order.Dealer,
        "Forecast Production Date": order["Forecast Production Date"],
        "Order Received Date": order["Order Received Date"] || "",
        "Signed Plans Received": order["Signed Plans Received"] || "",
        "Purchase Order Sent": order["Purchase Order Sent"] || "",
        "Price Date": order["Price Date"] || "",
        "Request Delivery Date": order["Request Delivery Date"] || "",
        "Regent Production": order["Regent Production"] || "",
        Shipment: (order as any).Shipment || "",
        "Left Port": (dateTrack || {})["Left Port"] || "",
        "Received in Melbourne": (dateTrack || {})["Received in Melbourne"] || "",
        "Dispatched from Factory": (dateTrack || {})["Dispatched from Factory"] || "",
      };
    });

    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);

      const colWidths = Object.keys(excelData[0] || {}).map((key) => ({
        wch: Math.max(key.length, 15),
      }));
      (ws as any)["!cols"] = colWidths;

      const date = new Date().toISOString().split("T")[0];
      const filename = `${dealerDisplayName}_Orders_${date}.xlsx`;

      XLSX.utils.book_append_sheet(wb, ws, "Orders");
      XLSX.writeFile(wb, filename);
    } catch (err) {
      console.error("Export excel failed:", err);
    }
  };

  if (!configLoading && !hasAccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="text-center py-16">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <CardTitle className="text-xl text-slate-700 mb-2">
              Access Denied
            </CardTitle>
            <p className="text-slate-500 mb-6">
              This dealer portal is currently inactive or does not exist. 
              Please contact the administrator for access.
            </p>
            <p className="text-sm text-slate-400">
              Dealer: {dealerDisplayName}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading || configLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-600">Loading dealer portal...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        orders={filteredOrders}
        selectedDealer={dealerDisplayName}
        onDealerSelect={() => {}}
        hideOtherDealers={true}
        currentDealerName={dealerDisplayName}
        showStats={false}
        isGroup={isDealerGroup(dealerConfig)}
        includedDealers={includedDealerNames}
      />

      <main className="flex-1 p-6 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">
              Dealer Portal — {dealerDisplayName}
            </h1>
            <p className="text-muted-foreground mt-1">
              Order Tracking ({filteredOrders.length} of {dealerOrders.length} orders)
            </p>
          </div>

          <Button
            onClick={exportToExcel}
            disabled={filteredOrders.length === 0}
            className="bg-green-600 hover:bg-green-700"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Excel
          </Button>
        </header>

        <ModelRangeCards 
          orders={dealerOrders} 
          onFilterChange={setModelRangeFilter}
        />

        {filteredOrders.length === 0 ? (
          <div className="text-muted-foreground">
            {dealerOrders.length === 0 ? (
              <>No orders found for <span className="font-medium">{dealerDisplayName}</span>.</>
            ) : (
              <>No orders match your current filters.</>
            )}
          </div>
        ) : (
          <OrderList orders={filteredOrders} specPlans={specPlans} dateTracks={dateTracks} />
        )}
      </main>
    </div>
  );
}
