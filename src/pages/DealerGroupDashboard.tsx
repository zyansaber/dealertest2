// src/pages/DealerGroupDashboard.tsx
import { useParams, useNavigate, Routes, Route, useLocation } from "react-router-dom";
import { useMemo, useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import DealerOverallDashboard from "./DealerOverallDashboard";
import { subscribeToSchedule, subscribeDealerConfig, subscribeAllDealerConfigs } from "@/lib/firebase";
import type { ScheduleItem } from "@/types";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { isDealerGroup } from "@/types/dealer";
import { getRememberedGroupDealerSlug, rememberGroupDealerSlug } from "@/lib/dealerUtils";

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

function prettifyDealerName(slug: string): string {
  const s = slug.replace(/-/g, " ").trim();
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DealerGroupDashboard() {
  const { dealerSlug: rawDealerSlug, selectedDealerSlug } = useParams<{
    dealerSlug: string;
    selectedDealerSlug?: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const dealerSlug = useMemo(() => normalizeDealerSlug(rawDealerSlug), [rawDealerSlug]);

  const [allOrders, setAllOrders] = useState<ScheduleItem[]>([]);
  const [dealerConfig, setDealerConfig] = useState<any>(null);
  const [allDealerConfigs, setAllDealerConfigs] = useState<any>({});
  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {
    const unsubSchedule = subscribeToSchedule((data) => {
      setAllOrders(data || []);
    });
    return () => {
      unsubSchedule?.();
    };
  }, []);

  useEffect(() => {
    if (!dealerSlug) return;
    const unsubConfig = subscribeDealerConfig(dealerSlug, (config) => {
      setDealerConfig(config);
      setConfigLoading(false);
    });
    return unsubConfig;
  }, [dealerSlug]);

  useEffect(() => {
    const unsubAllConfigs = subscribeAllDealerConfigs((data) => {
      setAllDealerConfigs(data || {});
    });
    return unsubAllConfigs;
  }, []);

  const includedDealerSlugs = useMemo(() => {
    if (!dealerConfig || !isDealerGroup(dealerConfig)) {
      return [dealerSlug];
    }
    return dealerConfig.includedDealers || [];
  }, [dealerConfig, dealerSlug]);

  const includedDealerNames = useMemo(() => {
    if (!dealerConfig || !isDealerGroup(dealerConfig)) {
      return null;
    }
    return includedDealerSlugs.map((slug) => {
      const config = allDealerConfigs[slug];
      return {
        slug,
        name: config?.name || prettifyDealerName(slug),
      };
    });
  }, [dealerConfig, includedDealerSlugs, allDealerConfigs]);

  useEffect(() => {
    if (rawDealerSlug && selectedDealerSlug) {
      rememberGroupDealerSlug(rawDealerSlug, selectedDealerSlug);
    }
  }, [rawDealerSlug, selectedDealerSlug]);

  useEffect(() => {
    if (!configLoading && dealerConfig && isDealerGroup(dealerConfig) && !selectedDealerSlug) {
      const rememberedDealer = getRememberedGroupDealerSlug(rawDealerSlug);
      const preferredDealer = rememberedDealer && includedDealerSlugs.includes(rememberedDealer)
        ? rememberedDealer
        : includedDealerSlugs[0];
      if (preferredDealer) {
        navigate(`/dealergroup/${rawDealerSlug}/${preferredDealer}/dashboard`, { replace: true });
      }
    }
  }, [configLoading, dealerConfig, selectedDealerSlug, includedDealerSlugs, rawDealerSlug, navigate]);

  const currentDealerSlug = selectedDealerSlug || includedDealerSlugs[0] || dealerSlug;

  const orders = useMemo(() => {
    if (!currentDealerSlug) return [];
    return (allOrders || []).filter((o) => slugifyDealerName(o.Dealer) === currentDealerSlug);
  }, [allOrders, currentDealerSlug]);

  const dealerDisplayName = useMemo(() => {
    if (selectedDealerSlug) {
      const selectedConfig = allDealerConfigs[selectedDealerSlug];
      if (selectedConfig?.name) return selectedConfig.name;
      const fromOrder = orders.find((o) => slugifyDealerName(o.Dealer) === selectedDealerSlug)?.Dealer;
      return fromOrder || prettifyDealerName(selectedDealerSlug);
    }
    if (dealerConfig?.name) return dealerConfig.name;
    const fromOrder = orders[0]?.Dealer;
    return fromOrder && fromOrder.trim().length > 0 ? fromOrder : prettifyDealerName(dealerSlug);
  }, [dealerConfig, orders, dealerSlug, selectedDealerSlug, allDealerConfigs]);

  const hasAccess = useMemo(() => {
    if (configLoading) return true;
    if (!dealerConfig) return false;
    return dealerConfig.isActive;
  }, [dealerConfig, configLoading]);

  const dashboardBasePath = useMemo(() => {
    const marker = "/dashboard";
    const lowerPath = location.pathname.toLowerCase();
    const index = lowerPath.indexOf(marker);
    if (index === -1) return location.pathname.replace(/\/+$/, "");
    return location.pathname.slice(0, index + marker.length);
  }, [location.pathname]);

  const scopedLocation = useMemo(
    () => ({
      ...location,
      pathname: `${dashboardBasePath}/dealer/${currentDealerSlug}/dashboard`,
    }),
    [location, dashboardBasePath, currentDealerSlug]
  );

  if (!configLoading && !hasAccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="text-center py-16">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <CardTitle className="text-xl text-slate-700 mb-2">Access Denied</CardTitle>
            <p className="text-slate-500 mb-6">This dealer portal is currently inactive or does not exist.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (configLoading || !currentDealerSlug) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-600">Loading dealer dashboard...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        orders={orders}
        selectedDealer="locked"
        onDealerSelect={() => {}}
        hideOtherDealers={true}
        currentDealerName={dealerDisplayName}
        showStats={false}
        isGroup={isDealerGroup(dealerConfig)}
        includedDealers={includedDealerNames}
      />

      <main className="flex-1 min-h-screen">
        <Routes location={scopedLocation}>
          <Route path="dealer/:dealerSlug/dashboard" element={<DealerOverallDashboard key={currentDealerSlug} hideSidebar />} />
        </Routes>
      </main>
    </div>
  );
}
