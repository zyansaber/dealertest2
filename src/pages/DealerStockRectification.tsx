import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import { subscribeDealerConfig, subscribeToSchedule } from "@/lib/firebase";
import { normalizeDealerSlug, prettifyDealerName } from "@/lib/dealerUtils";
import type { ScheduleItem } from "@/types";
import { StockRectificationView } from "@/pages/StockRectificationProject";

const slugifyDealerName = (name?: string): string =>
  (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export default function DealerStockRectification() {
  const { dealerSlug: rawDealerSlug = "" } = useParams<{ dealerSlug: string }>();
  const dealerSlug = useMemo(() => normalizeDealerSlug(rawDealerSlug), [rawDealerSlug]);

  const [allOrders, setAllOrders] = useState<ScheduleItem[]>([]);
  const [dealerConfig, setDealerConfig] = useState<any>(null);

  useEffect(() => {
    const unsubSchedule = subscribeToSchedule((data) => setAllOrders(data || []));
    return () => {
      unsubSchedule?.();
    };
  }, []);

  useEffect(() => {
    if (!dealerSlug) return;
    const unsubConfig = subscribeDealerConfig(dealerSlug, (config) => setDealerConfig(config));
    return unsubConfig;
  }, [dealerSlug]);

  const dealerOrders = useMemo(() => {
    if (!dealerSlug) return [];
    return allOrders.filter((order) => slugifyDealerName(order?.Dealer) === dealerSlug);
  }, [allOrders, dealerSlug]);

  const dealerDisplayName = useMemo(() => {
    if (dealerConfig?.name) return dealerConfig.name;
    const fromOrder = dealerOrders[0]?.Dealer;
    return fromOrder && fromOrder.trim().length > 0 ? fromOrder : prettifyDealerName(dealerSlug);
  }, [dealerConfig, dealerOrders, dealerSlug]);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        orders={dealerOrders}
        selectedDealer="locked"
        onDealerSelect={() => {}}
        hideOtherDealers={true}
        currentDealerName={dealerDisplayName}
        showStats={false}
      />
      <div className="flex-1 overflow-auto">
        <StockRectificationView dealerSlug={dealerSlug} showDealerList={false} />
      </div>
    </div>
  );
}
