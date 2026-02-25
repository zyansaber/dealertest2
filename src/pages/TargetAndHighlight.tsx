import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, ReferenceLine } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  subscribeAllDealerConfigs,
  subscribeTargetHighlightConfig,
  subscribeToCampervanSchedule,
  subscribeToSchedule,
  type TargetHighlightConfig,
} from "@/lib/firebase";
import { buildDealerRangeCounts2026 } from "@/lib/targetHighlight";
import type { CampervanScheduleItem, ScheduleItem } from "@/types";

type DealerChartRow = {
  dealer: string;
  result: number;
  target: number;
  difference: number;
};

const normalizeKey = (value: unknown) => String(value ?? "").trim().toLowerCase();

const getInitialTarget2026 = (config: any) => {
  const value = Number(
    config?.initialTarget2026 ??
      config?.initialTarget ??
      config?.target2026 ??
      config?.yearlyTarget2026 ??
      config?.targetYearly2026 ??
      0
  );
  return Number.isFinite(value) ? value : 0;
};

export default function TargetAndHighlight() {
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [campervans, setCampervans] = useState<CampervanScheduleItem[]>([]);
  const [config, setConfig] = useState<TargetHighlightConfig | null>(null);
  const [dealerConfigs, setDealerConfigs] = useState<Record<string, any>>({});

  useEffect(() => {
    const unsubSchedule = subscribeToSchedule((data) => setSchedule((data || []) as ScheduleItem[]));
    const unsubCamper = subscribeToCampervanSchedule((data) => setCampervans((data || []) as CampervanScheduleItem[]));
    const unsubConfig = subscribeTargetHighlightConfig((data) => setConfig(data));
    const unsubDealerConfigs = subscribeAllDealerConfigs((data) => setDealerConfigs(data || {}));

    return () => {
      unsubSchedule?.();
      unsubCamper?.();
      unsubConfig?.();
      unsubDealerConfigs?.();
    };
  }, []);

  const focusRanges = useMemo(() => config?.focusModelRanges || [], [config]);
  const rangeTargets = useMemo(() => config?.modelRangeTargets || {}, [config]);

  const dealerRangeCounts = useMemo(() => buildDealerRangeCounts2026(schedule, campervans), [schedule, campervans]);

  const eligibleDealers = useMemo(() => {
    return Object.entries(dealerConfigs)
      .map(([slug, cfg]) => {
        const target2026 = getInitialTarget2026(cfg);
        const isActive = cfg?.isActive !== false;
        return {
          slug,
          name: String(cfg?.name || slug),
          target2026,
          isActive,
        };
      })
      .filter((item) => item.isActive && item.target2026 > 0);
  }, [dealerConfigs]);

  const charts = useMemo(() => {
    const countsByNormalizedDealer = new Map<string, Record<string, number>>();
    Object.entries(dealerRangeCounts).forEach(([dealer, counts]) => {
      const key = normalizeKey(dealer);
      if (!key) return;
      countsByNormalizedDealer.set(key, counts || {});
    });

    return focusRanges.map((range) => {
      const targetPct = Number(rangeTargets[range] ?? 0) / 100;

      const rows: DealerChartRow[] = eligibleDealers
        .map((dealer) => {
          const byName = countsByNormalizedDealer.get(normalizeKey(dealer.name));
          const bySlug = countsByNormalizedDealer.get(normalizeKey(dealer.slug));
          const counts = byName || bySlug || {};
          const result = Number(counts[range] || 0);
          const target = Number((dealer.target2026 * targetPct).toFixed(2));
          const difference = Number((result - target).toFixed(2));

          return {
            dealer: dealer.name,
            result,
            target,
            difference,
          };
        })
        .sort((a, b) => b.difference - a.difference);

      const totalResult = rows.reduce((sum, row) => sum + row.result, 0);
      const totalTarget = rows.reduce((sum, row) => sum + row.target, 0);
      const totalDifference = Number((totalResult - totalTarget).toFixed(2));

      return {
        range,
        rows,
        totalResult,
        totalTarget,
        totalDifference,
      };
    });
  }, [dealerRangeCounts, eligibleDealers, focusRanges, rangeTargets]);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Target and Highlight</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>2026 Schedule Production Confirmed vs Target (Focus Model Ranges)</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            Dealers included: active dealers with Initial Target (2026). Number of charts equals number of selected focus model ranges.
          </CardContent>
        </Card>

        {charts.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-slate-600">
              No focus model range selected yet. Please configure in /overall-dashboard/admin.
            </CardContent>
          </Card>
        ) : (
          charts.map((chart) => (
            <Card key={chart.range}>
              <CardHeader>
                <CardTitle>
                  {chart.range} | Target {chart.totalTarget.toFixed(2)} | Total Result {chart.totalResult} | Total Difference {chart.totalDifference.toFixed(2)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[340px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chart.rows} margin={{ top: 10, right: 16, left: 0, bottom: 75 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="dealer" angle={-35} textAnchor="end" interval={0} height={90} />
                      <YAxis />
                      <Tooltip formatter={(value: number) => [Number(value).toFixed(2), "Difference"]} />
                      <ReferenceLine y={0} stroke="#334155" />
                      <Bar dataKey="difference" name="Difference (Result - Target)">
                        {chart.rows.map((row) => (
                          <Cell key={`${chart.range}-${row.dealer}`} fill={row.difference >= 0 ? "#16a34a" : "#dc2626"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
