import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import DealerOverallDashboard from "./DealerOverallDashboard";
import { subscribeDealerConfig } from "@/lib/firebase";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { isDealerGroup } from "@/types/dealer";

const normalizeDealerSlug = (raw?: string): string => {
  const slug = (raw || "").toLowerCase();
  const match = slug.match(/^(.*?)-([a-z0-9]{6})$/);
  return match ? match[1] : slug;
};

export default function DealerGroupDashboard() {
  const { dealerSlug: rawDealerSlug, selectedDealerSlug } = useParams<{
    dealerSlug: string;
    selectedDealerSlug?: string;
  }>();
  const navigate = useNavigate();
  const dealerSlug = useMemo(() => normalizeDealerSlug(rawDealerSlug), [rawDealerSlug]);

  const [dealerConfig, setDealerConfig] = useState<any>(null);
  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {
    if (!dealerSlug) return;
    const unsub = subscribeDealerConfig(dealerSlug, (config) => {
      setDealerConfig(config);
      setConfigLoading(false);
    });
    return unsub;
  }, [dealerSlug]);

  useEffect(() => {
    if (configLoading || !dealerConfig || !isDealerGroup(dealerConfig) || selectedDealerSlug) {
      return;
    }
    const firstDealer = dealerConfig.includedDealers?.[0];
    if (firstDealer) {
      navigate(`/dealergroup/${rawDealerSlug}/${firstDealer}/dashboard`, { replace: true });
    }
  }, [configLoading, dealerConfig, selectedDealerSlug, navigate, rawDealerSlug]);

  const hasAccess = useMemo(() => {
    if (configLoading) return true;
    if (!dealerConfig) return false;
    return dealerConfig.isActive;
  }, [configLoading, dealerConfig]);

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
        <div className="text-slate-600">Loading dealer dashboard...</div>
      </div>
    );
  }

  return <DealerOverallDashboard />;
}
