import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
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
  gap: number;
};

export default function TargetAndHighlight() {
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [campervans, setCampervans] = useState<CampervanScheduleItem[]>([]);
  const [config, setConfig] = useState<TargetHighlightConfig | null>(null);

  useEffect(() => {
    const unsubSchedule = subscribeToSchedule((data) => setSchedule((data || []) as ScheduleItem[]));
    const unsubCamper = subscribeToCampervanSchedule((data) => setCampervans((data || []) as CampervanScheduleItem[]));
    const unsubConfig = subscribeTargetHighlightConfig((data) => setConfig(data));

    return () => {
      unsubSchedule?.();
      unsubCamper?.();
      unsubConfig?.();
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
          const dealerTotal2026 = Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
          const result = Number(counts[range] || 0);
          const target = Number((dealerTotal2026 * targetPct).toFixed(2));
          return {
            dealer,
            result,
            target,
            gap: Number((result - target).toFixed(2)),
          };
        })
        .filter((row) => row.result > 0 || row.target > 0)
        .sort((a, b) => b.result - a.result);

      const totalResult = rows.reduce((sum, row) => sum + row.result, 0);
      const totalTarget = rows.reduce((sum, row) => sum + row.target, 0);

      return {
        range,
        targetPct,
        rows,
        totalResult,
        totalTarget,
      };
    });
  }, [dealerRangeCounts, focusRanges, rangeTargets]);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Target and Highlight</h1>
          <Link to="/overall-dashboard/admin" className="text-sm text-blue-600 underline underline-offset-4">
            Go to Admin settings
          </Link>
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
                  Total Target {chart.totalTarget.toFixed(2)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[340px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chart.rows} margin={{ top: 10, right: 16, left: 0, bottom: 75 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="dealer" angle={-35} textAnchor="end" interval={0} height={90} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="target" fill="#94a3b8" name="Target" />
                      <Bar dataKey="result" fill="#0ea5e9" name="2026 Result" />
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

