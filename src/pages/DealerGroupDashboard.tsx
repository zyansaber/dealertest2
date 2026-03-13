// src/pages/DealerGroupDashboard.tsx
import { useParams, useNavigate } from "react-router-dom";
import { useMemo, useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import { subscribeToSchedule, subscribeDealerConfig, subscribeAllDealerConfigs } from "@/lib/firebase";
import type { ScheduleItem } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, Settings, AlertTriangle } from "lucide-react";
import { isDealerGroup } from "@/types/dealer";

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
    return includedDealerSlugs.map(slug => {
      const config = allDealerConfigs[slug];
      return {
        slug,
        name: config?.name || prettifyDealerName(slug)
      };
    });
  }, [dealerConfig, includedDealerSlugs, allDealerConfigs]);

  useEffect(() => {
    if (!configLoading && dealerConfig && isDealerGroup(dealerConfig) && !selectedDealerSlug) {
      const firstDealer = includedDealerSlugs[0];
      if (firstDealer) {
        navigate(`/dealergroup/${rawDealerSlug}/${firstDealer}/dashboard`, { replace: true });
      }
    }
  }, [configLoading, dealerConfig, selectedDealerSlug, includedDealerSlugs, rawDealerSlug, navigate]);

  const currentDealerSlug = selectedDealerSlug || includedDealerSlugs[0] || dealerSlug;

  const orders = useMemo(() => {
    if (!currentDealerSlug) return [];
    return (allOrders || []).filter(
      (o) => slugifyDealerName(o.Dealer) === currentDealerSlug
    );
  }, [allOrders, currentDealerSlug]);

  const dealerDisplayName = useMemo(() => {
    if (selectedDealerSlug) {
      const selectedConfig = allDealerConfigs[selectedDealerSlug];
      if (selectedConfig?.name) return selectedConfig.name;
      const fromOrder = orders.find(o => slugifyDealerName(o.Dealer) === selectedDealerSlug)?.Dealer;
      return fromOrder || prettifyDealerName(selectedDealerSlug);
    }
    if (dealerConfig?.name) return dealerConfig.name;
    const fromOrder = orders[0]?.Dealer;
    return fromOrder && fromOrder.trim().length > 0
      ? fromOrder
      : prettifyDealerName(dealerSlug);
  }, [dealerConfig, orders, dealerSlug, selectedDealerSlug, allDealerConfigs]);

  // 获取当前dealer的PowerBI URL
  const currentDealerPowerBIUrl = useMemo(() => {
    if (selectedDealerSlug) {
      const selectedConfig = allDealerConfigs[selectedDealerSlug];
      return selectedConfig?.powerbi_url || null;
    }
    return dealerConfig?.powerbi_url || null;
  }, [selectedDealerSlug, allDealerConfigs, dealerConfig]);

  const hasAccess = useMemo(() => {
    if (configLoading) return true;
    if (!dealerConfig) return false;
    return dealerConfig.isActive;
  }, [dealerConfig, configLoading]);

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
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (configLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-600">Loading dealer dashboard...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
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
      
      <main className="flex-1 flex flex-col bg-slate-50">
        <header className="bg-white border-b border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                {dealerDisplayName} Dashboard
              </h1>
              <p className="text-slate-600 mt-1">
                Business Intelligence & Analytics
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              {currentDealerPowerBIUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                >
                  <a
                    href={currentDealerPowerBIUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open in New Tab
                  </a>
                </Button>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 p-6">
          {currentDealerPowerBIUrl ? (
            <Card className="h-full">
              <CardContent className="p-0 h-full">
                <iframe
                  src={currentDealerPowerBIUrl}
                  className="w-full h-full min-h-[600px] border-0 rounded-lg"
                  title={`${dealerDisplayName} PowerBI Dashboard`}
                  allowFullScreen
                  style={{
                    border: 'none',
                    borderRadius: '8px'
                  }}
                />
              </CardContent>
            </Card>
          ) : (
            <Card className="h-full flex items-center justify-center">
              <CardContent className="text-center py-16">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Settings className="w-8 h-8 text-slate-400" />
                </div>
                <CardTitle className="text-xl text-slate-700 mb-2">
                  PowerBI Dashboard Not Configured
                </CardTitle>
                <p className="text-slate-500 mb-6 max-w-md">
                  The PowerBI dashboard for {dealerDisplayName} has not been configured yet. 
                  Please contact the administrator to set up your dashboard.
                </p>
                <p className="text-sm text-slate-400">
                  Dashboard configuration is managed through the Admin panel.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
