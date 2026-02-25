import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setTargetHighlightConfig, subscribeTargetHighlightConfig } from "@/lib/firebase";
import { TARGET_MODEL_RANGES, toPercentValue } from "@/lib/targetHighlight";
import OverallDashboardSidebar from "@/components/OverallDashboardSidebar";

export default function OverallDashboardAdmin() {
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [focusRanges, setFocusRanges] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = subscribeTargetHighlightConfig((data) => {
      setTargets(data?.modelRangeTargets || {});
      setFocusRanges((data?.focusModelRanges || []).filter(Boolean));
    });
    return () => unsub?.();
  }, []);

  const totalPercent = useMemo(
    () => focusRanges.reduce((sum, range) => sum + toPercentValue(Number(targets[range] ?? 0)), 0),
    [focusRanges, targets]
  );

  const handleSave = async () => {
    try {
      setSaving(true);
      await setTargetHighlightConfig({
        modelRangeTargets: targets,
        focusModelRanges: focusRanges,
      });
      toast.success("Target and focus model range saved to Firebase");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <OverallDashboardSidebar />
      <div className="flex-1 p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Overall Dashboard Admin</h1>
          </div>

          <Card>
          <CardHeader>
            <CardTitle>Model Range Target (%) & Focus Selection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">
              Set target percentage for each Model Range, then choose focus model range(s).
            </p>

            <div className="grid gap-3 md:grid-cols-3">
              {TARGET_MODEL_RANGES.map((range) => {
                const checked = focusRanges.includes(range);
                return (
                  <div key={range} className="rounded-lg border bg-white p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <Label htmlFor={`target-${range}`} className="font-semibold">
                        {range}
                      </Label>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`focus-${range}`}
                          checked={checked}
                          onCheckedChange={(next) => {
                            const enabled = Boolean(next);
                            setFocusRanges((prev) =>
                              enabled ? Array.from(new Set([...prev, range])) : prev.filter((item) => item !== range)
                            );
                          }}
                        />
                        <Label htmlFor={`focus-${range}`} className="text-xs text-slate-600">
                          Focus
                        </Label>
                      </div>
                    </div>
                    <Input
                      id={`target-${range}`}
                      type="number"
                      min={0}
                      step={0.1}
                      value={targets[range] ?? ""}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setTargets((prev) => ({ ...prev, [range]: Number.isFinite(value) ? value : 0 }));
                      }}
                      placeholder="e.g. 12.5"
                    />
                  </div>
                );
              })}
            </div>

            <div className="rounded-md border border-dashed bg-slate-100 p-3 text-sm text-slate-700">
              Focus ranges: {focusRanges.length} | Total focus target: {totalPercent.toFixed(1)}%
            </div>

            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save to Firebase"}
            </Button>
          </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

