import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { subscribeTierConfig, setTierConfig } from "@/lib/firebase";
import type { TierConfig, TierTarget } from "@/types/tierConfig";
import { defaultShareTargets, defaultTierTargets } from "@/config/tierDefaults";

const toNumber = (value: string) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

export default function TierConfigEditor() {
  const [config, setConfig] = useState<TierConfig>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeTierConfig((data) => {
      setConfig(data || {});
    });
    return () => unsub?.();
  }, []);

  const effectiveTargets = useMemo(() => {
    const tierTargets: Record<string, TierTarget> = { ...defaultTierTargets };
    Object.entries(config.tierTargets || {}).forEach(([tier, target]) => {
      tierTargets[tier] = { ...tierTargets[tier], ...target } as TierTarget;
    });

    const shareTargets = { ...defaultShareTargets, ...(config.shareTargets || {}) };

    return { tierTargets, shareTargets };
  }, [config]);

  const handleShareChange = (tier: string, value: string) => {
    const pct = Math.max(0, toNumber(value));
    setConfig((prev) => ({
      ...prev,
      shareTargets: {
        ...(prev.shareTargets || {}),
        [tier]: pct / 100,
      },
    }));
  };

  const handleTierTargetChange = (tier: string, key: "minimum" | "ceiling", value: string) => {
    const num = Math.max(0, Math.floor(toNumber(value)));
    setConfig((prev) => ({
      ...prev,
      tierTargets: {
        ...(prev.tierTargets || {}),
        [tier]: {
          ...(prev.tierTargets?.[tier] || {}),
          [key]: num,
        },
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload: TierConfig = {
        shareTargets: config.shareTargets,
        tierTargets: config.tierTargets,
      };
      await setTierConfig(payload);
      setMessage("Saved to Firebase.");
    } catch (err) {
      setMessage(`Save failed: ${(err as Error)?.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">Tier configuration</h1>
          <p className="text-sm text-slate-600">
            Adjust the target yard mix and minimum/maximum counts per tier. Values save to Firebase (tierConfig) and feed the
            Inventory Management page.
          </p>
        </div>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-200">
            <CardTitle className="text-lg font-semibold text-slate-900">Share of yard capacity</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-4">
            {Object.entries(effectiveTargets.shareTargets).map(([tier, pct]) => (
              <div key={tier} className="space-y-1 rounded-lg border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
                  <span>Tier {tier}</span>
                  <span className="text-xs text-slate-500">default {(defaultShareTargets[tier] || 0) * 100}%</span>
                </div>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round((config.shareTargets?.[tier] ?? pct) * 100 * 100) / 100 || 0}
                  onChange={(e) => handleShareChange(tier, e.target.value)}
                  className="text-right font-semibold"
                />
                <p className="text-xs text-slate-600">Target percent of total yard capacity.</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-200">
            <CardTitle className="text-lg font-semibold text-slate-900">Minimum / maximum by tier</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {Object.entries(effectiveTargets.tierTargets).map(([tier, target]) => (
              <div key={tier} className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
                  <span>Tier {tier}</span>
                  <span className="text-xs text-slate-500">{target.label}</span>
                </div>
                <div className="space-y-1 text-sm text-slate-700">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500">Minimum on yard</span>
                    <Input
                      type="number"
                      min={0}
                      value={config.tierTargets?.[tier]?.minimum ?? target.minimum}
                      onChange={(e) => handleTierTargetChange(tier, "minimum", e.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500">Maximum on yard (optional)</span>
                    <Input
                      type="number"
                      min={0}
                      value={config.tierTargets?.[tier]?.ceiling ?? target.ceiling ?? ""}
                      onChange={(e) => handleTierTargetChange(tier, "ceiling", e.target.value)}
                    />
                  </label>
                </div>
                <p className="text-xs text-slate-600">{target.role}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save to Firebase"}
          </Button>
          {message && <span className="text-sm text-slate-700">{message}</span>}
        </div>
      </div>
    </div>
  );
}
