import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, ReferenceLine } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  subscribeTargetHighlightConfig,
  subscribeToCampervanSchedule,
  subscribeToSchedule,
  subscribeAllDealerConfigs,
  type TargetHighlightConfig,
} from "@/lib/firebase";
import { buildDealerRangeCounts2026 } from "@/lib/targetHighlight";
import type { CampervanScheduleItem, ScheduleItem } from "@/types";

type DealerChartRow = {
  dealer: string;
  result: number;
  dealerPercent: number;
  targetPercent: number;
  differencePercent: number;
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

  const charts = useMemo(() => {
    return focusRanges.map((range) => {
      const targetPct = Number(rangeTargets[range] ?? 0) / 100;

      const rows: DealerChartRow[] = Object.entries(dealerRangeCounts)
        .map(([dealer, counts]) => {
          const dealerKey = dealer.trim().toLowerCase();
          const matchedConfig = Object.entries(dealerConfigs).find(([, cfg]) => {
            const slug = String((cfg as any)?.slug ?? "").trim().toLowerCase();
            const name = String((cfg as any)?.name ?? "").trim().toLowerCase();
            return dealerKey === slug || dealerKey === name;
          })?.[1] as any;

          if (matchedConfig && matchedConfig.isActive === false) {
            return null;
          }

          const dealerTotal2026 = Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
          if (!dealerTotal2026) {
            return null;
          }
          const result = Number(counts[range] || 0);
          const dealerPercent = (result / dealerTotal2026) * 100;
          const targetPercent = targetPct * 100;
          const differencePercent = Number((dealerPercent - targetPercent).toFixed(2));
          return {
            dealer,
            result,
            dealerPercent: Number(dealerPercent.toFixed(2)),
            targetPercent: Number(targetPercent.toFixed(2)),
            differencePercent,
          };
        })
        .filter((row): row is DealerChartRow => Boolean(row))
        .sort((a, b) => b.differencePercent - a.differencePercent);

      const totalResult = rows.reduce((sum, row) => sum + row.result, 0);
      const avgDifferencePercent = rows.length ? Number((rows.reduce((sum, row) => sum + row.differencePercent, 0) / rows.length).toFixed(2)) : 0;

      return {
        range,
        targetPct,
        rows,
        totalResult,
        avgDifferencePercent,
      };
    });
  }, [dealerConfigs, dealerRangeCounts, focusRanges, rangeTargets]);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Target and Highlight</h1>
          </div>

        <Card>
          <CardHeader>
            <CardTitle>2026 Forecast Delivery Volume vs Target (Focus Model Ranges)</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            Excludes records where Production Status is finished. Number of charts equals number of selected focus model ranges.
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
                  {chart.range} | Target {Number.isFinite(chart.targetPct * 100) ? (chart.targetPct * 100).toFixed(1) : "0.0"}% | Total Result {chart.totalResult} |
                  Avg Difference {chart.avgDifferencePercent.toFixed(2)}%
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[340px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chart.rows} margin={{ top: 10, right: 16, left: 0, bottom: 75 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="dealer" angle={-35} textAnchor="end" interval={0} height={90} />
                      <YAxis unit="%" />
                      <Tooltip formatter={(value: number) => [`${Number(value).toFixed(2)}%`, "Difference"]} />
                      <ReferenceLine y={0} stroke="#334155" />
                      <Bar dataKey="differencePercent" name="Difference % (Actual - Target)">
                        {chart.rows.map((row) => (
                          <Cell key={`${chart.range}-${row.dealer}`} fill={row.differencePercent >= 0 ? "#16a34a" : "#dc2626"} />
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

