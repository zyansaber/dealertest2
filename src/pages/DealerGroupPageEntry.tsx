import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import Sidebar from "@/components/Sidebar";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { subscribeAllDealerConfigs, subscribeDealerConfig, subscribeToSchedule } from "@/lib/firebase";
import type { ScheduleItem } from "@/types";
import { isDealerGroup } from "@/types/dealer";
import { getRememberedGroupDealerSlug, rememberGroupDealerSlug } from "@/lib/dealerUtils";

function normalizeDealerSlug(raw?: string): string {
  const slug = (raw || "").toLowerCase();
  const m = slug.match(/^(.*?)-([a-z0-9]{6})$/);
  return m ? m[1] : slug;
}

function prettifyDealerName(slug: string): string {
  const s = slug.replace(/-/g, " ").trim();
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

type DealerGroupPageEntryProps = {
  targetPage: "inventory-management" | "show-management";
};

export default function DealerGroupPageEntry({ targetPage }: DealerGroupPageEntryProps) {
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
    const unsub = subscribeToSchedule((data) => setAllOrders(data || []));
    return () => {
      unsub?.();
    };
  }, []);

  useEffect(() => {
    if (!dealerSlug) return;
    const unsub = subscribeDealerConfig(dealerSlug, (config) => {
      setDealerConfig(config);
      setConfigLoading(false);
    });
    return unsub;
  }, [dealerSlug]);

  useEffect(() => {
    const unsub = subscribeAllDealerConfigs((data) => setAllDealerConfigs(data || {}));
    return unsub;
  }, []);

  const includedDealerSlugs = useMemo(() => {
    if (!dealerConfig || !isDealerGroup(dealerConfig)) return [dealerSlug];
    return dealerConfig.includedDealers || [];
  }, [dealerConfig, dealerSlug]);

  const includedDealerNames = useMemo(() => {
    if (!dealerConfig || !isDealerGroup(dealerConfig)) return null;
    return includedDealerSlugs.map((slug) => ({
      slug,
      name: allDealerConfigs[slug]?.name || prettifyDealerName(slug),
    }));
  }, [dealerConfig, includedDealerSlugs, allDealerConfigs]);

  useEffect(() => {
    if (rawDealerSlug && selectedDealerSlug) {
      rememberGroupDealerSlug(rawDealerSlug, selectedDealerSlug);
    }
  }, [rawDealerSlug, selectedDealerSlug]);

  useEffect(() => {
    if (configLoading || !dealerConfig || !isDealerGroup(dealerConfig) || selectedDealerSlug) return;
    const rememberedDealer = getRememberedGroupDealerSlug(rawDealerSlug);
    if (rememberedDealer && includedDealerSlugs.includes(rememberedDealer)) {
      navigate(`/dealergroup/${rawDealerSlug}/${rememberedDealer}/${targetPage}`, { replace: true });
    }
  }, [configLoading, dealerConfig, selectedDealerSlug, includedDealerSlugs, rawDealerSlug, targetPage, navigate]);

  const hasAccess = useMemo(() => {
    if (configLoading) return true;
    if (!dealerConfig) return false;
    return dealerConfig.isActive;
  }, [configLoading, dealerConfig]);

  const groupDisplayName = useMemo(() => {
    if (dealerConfig?.name) return dealerConfig.name;
    return prettifyDealerName(dealerSlug);
  }, [dealerConfig, dealerSlug]);

  if (!configLoading && !hasAccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="text-center py-16">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <CardTitle className="text-xl text-slate-700 mb-2">Access Denied</CardTitle>
            <p className="text-slate-500">This dealer group portal is currently inactive or does not exist.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (configLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-600">Loading dealer group...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        orders={allOrders}
        selectedDealer="locked"
        onDealerSelect={() => {}}
        hideOtherDealers={true}
        currentDealerName={groupDisplayName}
        showStats={false}
        isGroup={isDealerGroup(dealerConfig)}
        includedDealers={includedDealerNames}
      />
      <main className="flex-1 p-8">
        <Card className="max-w-2xl">
          <CardContent className="py-10 space-y-2">
            <CardTitle>Select a dealer</CardTitle>
            <p className="text-slate-600">
              Please choose a dealer from the left sidebar cards to open {targetPage.replace("-", " ")}.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
