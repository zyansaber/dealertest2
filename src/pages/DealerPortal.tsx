// src/pages/DealerPortal.tsx
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
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
} from "@/lib/firebase";
import type { ScheduleItem, SpecPlan, DateTrack } from "@/types";
import * as XLSX from "xlsx";

/** 将 URL 中的 dealerId 还原为真实的 slug（去掉随机后缀 -xxxxxx） */
function normalizeDealerSlug(raw?: string): string {
  const slug = (raw || "").toLowerCase();
  const m = slug.match(/^(.*?)-([a-z0-9]{6})$/); // 末尾一段随机码
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

export default function DealerPortal() {
  const { dealerSlug: rawDealerSlug } = useParams<{ dealerSlug: string }>();
  const dealerSlug = useMemo(() => normalizeDealerSlug(rawDealerSlug), [rawDealerSlug]);

  const [allOrders, setAllOrders] = useState<ScheduleItem[]>([]);
  const [specPlans, setSpecPlans] = useState<SpecPlan>({});
  const [dateTracks, setDateTracks] = useState<DateTrack>({});
  const [dealerConfig, setDealerConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [configLoading, setConfigLoading] = useState(true);

  // 仅保留 Model Range 的筛选
  const [modelRangeFilter, setModelRangeFilter] = useState<{ modelRange?: string; customerType?: string }>({});

  // 订阅全量数据（与首页一致），本页再按 dealer 过滤
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

  // 订阅经销商配置
  useEffect(() => {
    if (!dealerSlug) return;

    const unsubConfig = subscribeDealerConfig(dealerSlug, (config) => {
      setDealerConfig(config);
      setConfigLoading(false);
    });

    return unsubConfig;
  }, [dealerSlug]);

  // 只展示当前 dealer 的订单
  const dealerOrders = useMemo(() => {
    if (!dealerSlug) return [];
    return (allOrders || []).filter(
      (o) => slugifyDealerName(o.Dealer) === dealerSlug
    );
  }, [allOrders, dealerSlug]);

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

  // 展示用的 Dealer 名称：优先来自配置，其次订单里的原始 Dealer 文本，否则用 slug 美化
  const dealerDisplayName = useMemo(() => {
    if (dealerConfig?.name) return dealerConfig.name;

    const fromOrder = dealerOrders[0]?.Dealer;
    return fromOrder && fromOrder.trim().length > 0
      ? fromOrder
      : prettifyDealerName(dealerSlug);
  }, [dealerConfig, dealerOrders, dealerSlug]);

  // 检查访问权限
  const hasAccess = useMemo(() => {
    if (configLoading) return true; // 加载中时假设有权限
    if (!dealerConfig) return false; // 没有配置则无权限
    return dealerConfig.isActive; // 根据配置的激活状态
  }, [dealerConfig, configLoading]);

  const exportToExcel = () => {
    if (filteredOrders.length === 0) return;

    const excelData = filteredOrders.map((order) => {
      // 以 Chassis 为 key 直取；若结构是按"Chassis Number"存的，再兜底找一次
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

      // 粗略的列宽（可根据最长标题适配）
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

  // 如果没有访问权限，显示错误页面
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
      {/* Sidebar - 移除统计信息显示 */}
      <Sidebar
        orders={filteredOrders}
        selectedDealer={dealerDisplayName}
        onDealerSelect={() => {}}
        hideOtherDealers={true}
        currentDealerName={dealerDisplayName}
        showStats={false}
      />

      <main className="flex-1 p-6 space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Dealer Portal — {dealerDisplayName}</h1>
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

        {/* Model Range Cards（仅此处保留筛选） */}
        <ModelRangeCards 
          orders={dealerOrders} 
          onFilterChange={setModelRangeFilter}
        />

        {/* Content */}
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
