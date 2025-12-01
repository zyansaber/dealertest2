import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  subscribeTierConfig,
  setTierConfig,
  subscribeToYardSizes,
  dealerNameToSlug,
  subscribeDealerTierLayout,
  setDealerTierLayout,
  setDefaultTierLayout,
  subscribeToModelAnalysis,
} from "@/lib/firebase";
import type { DealerLayoutSnapshot, DealerTierLayout, TierConfig, TierTarget } from "@/types/tierConfig";
import { defaultDealerTierLayout, defaultShareTargets, defaultTierTargets } from "@/config/tierDefaults";
import type { YardSizeRecord, ModelAnalysisRecord } from "@/lib/firebase";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

const toNumber = (value: string) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const pickNumber = (source: Record<string, any>, keys: string[]) => {
  for (const key of keys) {
    const num = Number(source?.[key]);
    if (Number.isFinite(num)) return num;
  }
  return undefined;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export default function TierConfigEditor() {
  const [config, setConfig] = useState<TierConfig>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [yardSizes, setYardSizes] = useState<Record<string, YardSizeRecord>>({});
  const [selectedDealerSlug, setSelectedDealerSlug] = useState<string>("");
  const [dealerLayout, setDealerLayout] = useState<DealerTierLayout>(defaultDealerTierLayout);
  const [defaultLayout, setDefaultLayout] = useState<DealerTierLayout>(defaultDealerTierLayout);
  const [layoutSource, setLayoutSource] = useState<DealerLayoutSnapshot["source"]>("default");
  const [layoutSaving, setLayoutSaving] = useState(false);
  const [layoutMessage, setLayoutMessage] = useState<string | null>(null);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [tierModelInputs, setTierModelInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    const unsub = subscribeTierConfig((data) => {
      setConfig(data || {});
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    const unsub = subscribeToYardSizes((data) => setYardSizes(data || {}));
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (!selectedDealerSlug) return;
    const unsub = subscribeDealerTierLayout(selectedDealerSlug, ({ layout, defaultLayout, source }) => {
      setDealerLayout(layout || defaultLayout || defaultDealerTierLayout);
      setDefaultLayout(defaultLayout || defaultDealerTierLayout);
      setLayoutSource(source);
    });
    return () => unsub?.();
  }, [selectedDealerSlug]);

  useEffect(() => {
    const unsub = subscribeToModelAnalysis((data) => {
      const list: string[] = [];
      const register = (value?: string) => {
        const label = (value || "").trim();
        if (label) list.push(label);
      };

      if (Array.isArray(data)) {
        (data as ModelAnalysisRecord[]).forEach((item) => register((item as any)?.model || (item as any)?.Model));
      } else {
        Object.entries(data || {}).forEach(([key, value]) => {
          register(key);
          register((value as any)?.model || (value as any)?.Model);
        });
      }

      const unique = Array.from(new Set(list.map((item) => item.trim()))).sort((a, b) => a.localeCompare(b));
      setModelOptions(unique);
    });
    return () => unsub?.();
  }, []);

  const yardOptions = useMemo(() => {
    const entries = Object.entries(yardSizes || {});
    const options = entries.map(([key, value]) => {
      const label =
        (value?.dealer as string) || (value?.dealerName as string) || (value?.yard as string) || (value?.name as string) || key;
      const slug = slugify(label) || dealerNameToSlug(label) || slugify(key);
      const minVolume = pickNumber(value as Record<string, any>, [
        "Min Van Volumn",
        "Min Van Volume",
        "min_van_volumn",
        "min_van_volume",
        "minVanVolume",
        "minVanVolumn",
        "min_van",
        "minimum_van_volume",
        "Min",
        "MIN",
        "min",
      ]);
      return { key, slug, label, minVolume };
    });
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [yardSizes]);

  useEffect(() => {
    if (!selectedDealerSlug && yardOptions.length > 0) {
      setSelectedDealerSlug(yardOptions[0]?.slug || "");
    }
  }, [selectedDealerSlug, yardOptions]);

  const selectedYard = useMemo(() => {
    return yardOptions.find((option) => option.slug === selectedDealerSlug) || null;
  }, [selectedDealerSlug, yardOptions]);

  const effectiveTargets = useMemo(() => {
    const tierTargets: Record<string, TierTarget> = { ...defaultTierTargets };
    Object.entries(config.tierTargets || {}).forEach(([tier, target]) => {
      tierTargets[tier] = { ...tierTargets[tier], ...target } as TierTarget;
    });

    const shareTargets = { ...defaultShareTargets, ...(config.shareTargets || {}) };

    return { tierTargets, shareTargets };
  }, [config]);

  const yardShareCounts = useMemo(() => {
    if (!selectedYard?.minVolume || selectedYard.minVolume <= 0) return {} as Record<string, number>;
    return Object.fromEntries(
      Object.entries(effectiveTargets.shareTargets).map(([tier, pct]) => [tier, Math.round(selectedYard.minVolume * pct)])
    );
  }, [effectiveTargets.shareTargets, selectedYard]);

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
      const cleanedShareTargets = Object.fromEntries(
        Object.entries(config.shareTargets || {}).filter(([, value]) => Number.isFinite(value))
      );

      const cleanedTierTargets = Object.fromEntries(
        Object.entries(config.tierTargets || {})
          .map(([tier, target]) => {
            const merged = { ...defaultTierTargets[tier], ...target } as TierTarget;
            const minimum = Number.isFinite(merged.minimum) ? merged.minimum : undefined;

            if (minimum == null) return null;

            const payload: TierTarget = {
              label: merged.label,
              role: merged.role,
              minimum,
            };

            if (Number.isFinite(merged.ceiling)) {
              payload.ceiling = merged.ceiling;
            }

            return [tier, payload];
          })
          .filter(Boolean) as Array<[string, TierTarget]>
      );

      const payload: TierConfig = {};
      if (Object.keys(cleanedShareTargets).length > 0) {
        payload.shareTargets = cleanedShareTargets;
      }
      if (Object.keys(cleanedTierTargets).length > 0) {
        payload.tierTargets = cleanedTierTargets;
      }

      await setTierConfig(payload);
      setMessage("Saved to Firebase.");
    } catch (err) {
      setMessage(`Save failed: ${(err as Error)?.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  const normalizeLayout = (layout: DealerTierLayout | null): DealerTierLayout => {
    const tiers = (layout?.tiers?.length ? layout.tiers : defaultDealerTierLayout.tiers).map((tier, idx) => {
      const models = Array.from(new Set((tier.models || []).map((m) => m.trim()).filter(Boolean)));
      const sortOrder = Number.isFinite(tier.sortOrder) ? Number(tier.sortOrder) : idx + 1;
      const code = tier.code?.trim() || `T${idx + 1}`;
      const name = tier.name?.trim() || `Tier ${code}`;
      return { ...tier, code, name, sortOrder, models };
    });

    return { ...(layout || {}), tiers } as DealerTierLayout;
  };

  const handleAddTier = () => {
    setDealerLayout((prev) => {
      const base = normalizeLayout(prev);
      const nextIndex = (base.tiers?.length || 0) + 1;
      const tiers = [...(base.tiers || [])];
      tiers.push({ code: `T${nextIndex}`, name: `Tier ${nextIndex}`, description: "", models: [], sortOrder: nextIndex });
      return { ...base, tiers } as DealerTierLayout;
    });
  };

  const handleRemoveTier = (index: number) => {
    setDealerLayout((prev) => {
      const base = normalizeLayout(prev);
      const tiers = [...(base.tiers || [])];
      tiers.splice(index, 1);
      return { ...base, tiers } as DealerTierLayout;
    });
  };

  const handleTierFieldChange = (index: number, field: keyof DealerTierLayout["tiers"][number], value: string) => {
    setDealerLayout((prev) => {
      const base = normalizeLayout(prev);
      const tiers = [...(base.tiers || [])];
      const current = tiers[index];
      if (!current) return base;
      const next: DealerTierLayout["tiers"][number] = { ...current };
      if (field === "sortOrder") {
        next.sortOrder = Number(value) || 0;
      } else if (field === "models") {
        next.models = value
          .split(",")
          .map((m) => m.trim())
          .filter(Boolean);
      } else if (field === "description") {
        next.description = value;
      } else if (field === "name") {
        next.name = value;
      } else {
        next.code = value;
      }
      tiers[index] = next;
      return { ...base, tiers } as DealerTierLayout;
    });
  };

  const handleRemoveModel = (index: number, model: string) => {
    setDealerLayout((prev) => {
      const base = normalizeLayout(prev);
      const tiers = [...(base.tiers || [])];
      const current = tiers[index];
      if (!current) return base;
      const models = (current.models || []).filter((m) => m !== model);
      tiers[index] = { ...current, models };
      return { ...base, tiers } as DealerTierLayout;
    });
  };

  const handleAddModel = (index: number, model: string) => {
    const trimmed = model.trim();
    if (!trimmed) return;
    setDealerLayout((prev) => {
      const base = normalizeLayout(prev);
      const tiers = [...(base.tiers || [])];
      const current = tiers[index];
      if (!current) return base;
      const models = Array.from(new Set([...(current.models || []), trimmed]));
      tiers[index] = { ...current, models };
      return { ...base, tiers } as DealerTierLayout;
    });
    setTierModelInputs((prev) => ({ ...prev, [index]: "" }));
  };

  const handleCopyDefault = () => setDealerLayout(defaultLayout || defaultDealerTierLayout);

  const handleLayoutSave = async () => {
    if (!selectedDealerSlug) return;
    setLayoutSaving(true);
    setLayoutMessage(null);
    try {
      const payload = normalizeLayout(dealerLayout);
      await setDealerTierLayout(selectedDealerSlug, payload);
      setLayoutMessage("Saved dealer-specific tier layout.");
    } catch (err) {
      setLayoutMessage(`Save failed: ${(err as Error)?.message || "Unknown error"}`);
    } finally {
      setLayoutSaving(false);
    }
  };

  const handleDefaultLayoutSave = async () => {
    setLayoutSaving(true);
    setLayoutMessage(null);
    try {
      const payload = normalizeLayout(dealerLayout);
      await setDefaultTierLayout(payload);
      setLayoutMessage("Saved as the default tier layout template.");
    } catch (err) {
      setLayoutMessage(`Save failed: ${(err as Error)?.message || "Unknown error"}`);
    } finally {
      setLayoutSaving(false);
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

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-200">
            <CardTitle className="text-lg font-semibold text-slate-900">Dealer tier layout</CardTitle>
            <p className="text-sm text-slate-600">
              Assign specific models into each tier for the selected dealer. Save to push directly to Firebase; defaults stay
              available to reuse.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
              <Button onClick={handleLayoutSave} disabled={!selectedDealerSlug || layoutSaving}>
                {layoutSaving ? "Saving..." : "Save dealer layout"}
              </Button>
              <Button variant="outline" onClick={handleCopyDefault} disabled={layoutSaving}>
                Use default template
              </Button>
              <Button variant="ghost" onClick={handleDefaultLayoutSave} disabled={layoutSaving}>
                Save as default template
              </Button>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                Source: {layoutSource}
              </span>
              {layoutMessage && <span className="text-xs text-slate-700">{layoutMessage}</span>}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {normalizeLayout(dealerLayout).tiers.map((tier, index) => (
                <div key={`${tier.code}-${index}`} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <span>Tier {tier.code}</span>
                        <Badge variant="secondary">Sort {tier.sortOrder ?? index + 1}</Badge>
                      </div>
                      <p className="text-xs text-slate-600">Customize label, description, order, and model assignments.</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleRemoveTier(index)}>
                      Remove
                    </Button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-sm text-slate-700">
                      <span className="text-xs text-slate-500">Tier code</span>
                      <Input value={tier.code} onChange={(e) => handleTierFieldChange(index, "code", e.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm text-slate-700">
                      <span className="text-xs text-slate-500">Display name</span>
                      <Input value={tier.name} onChange={(e) => handleTierFieldChange(index, "name", e.target.value)} />
                    </label>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-sm text-slate-700">
                      <span className="text-xs text-slate-500">Description</span>
                      <Textarea
                        value={tier.description || ""}
                        onChange={(e) => handleTierFieldChange(index, "description", e.target.value)}
                        rows={3}
                      />
                    </label>
                    <label className="space-y-1 text-sm text-slate-700">
                      <span className="text-xs text-slate-500">Sort order</span>
                      <Input
                        type="number"
                        value={tier.sortOrder ?? index + 1}
                        onChange={(e) => handleTierFieldChange(index, "sortOrder", e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {(tier.models || []).map((model) => (
                        <Badge
                          key={`${tier.code}-${model}`}
                          variant="outline"
                          className="gap-2 rounded-full bg-slate-50 px-3 py-1 text-slate-800"
                        >
                          <span>{model}</span>
                          <button
                            type="button"
                            className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                            onClick={() => handleRemoveModel(index, model)}
                          >
                            ×
                          </button>
                        </Badge>
                      ))}
                      {(tier.models || []).length === 0 && (
                        <span className="text-xs text-slate-500">No models assigned yet.</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        list="model-options"
                        placeholder="Add model"
                        value={tierModelInputs[index] || ""}
                        onChange={(e) => setTierModelInputs((prev) => ({ ...prev, [index]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddModel(index, tierModelInputs[index] || "");
                          }
                        }}
                      />
                      <Button
                        variant="outline"
                        onClick={() => handleAddModel(index, tierModelInputs[index] || "")}
                        disabled={layoutSaving}
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={handleAddTier} disabled={layoutSaving}>
                Add another tier
              </Button>
            </div>

            <datalist id="model-options">
              {modelOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save to Firebase"}
          </Button>
          {message && <span className="text-sm text-slate-700">{message}</span>}
        </div>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-200">
            <CardTitle className="text-lg font-semibold text-slate-900">Yard requirement preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="grid gap-4 md:grid-cols-2 md:items-end">
              <div className="space-y-2">
                <Label className="text-sm text-slate-700">Select dealer / yard</Label>
                <Select value={selectedDealerSlug} onValueChange={setSelectedDealerSlug}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a dealer" />
                  </SelectTrigger>
                  <SelectContent>
                    {yardOptions.map((option) => (
                      <SelectItem key={option.slug} value={option.slug}>
                        {option.label || option.slug}
                      </SelectItem>
                    ))}
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Baseline: min yard volume</p>
                {selectedYard?.minVolume ? (
                  <p>
                    Using current min yard number of <span className="font-semibold">{selectedYard.minVolume}</span> units. Percent
                    targets above are applied to this baseline.
                  </p>
                ) : (
                  <p className="text-amber-700">No min yard volume found for this dealer.</p>
                )}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {Object.entries(effectiveTargets.shareTargets).map(([tier, pct]) => (
                <div key={tier} className="space-y-1 rounded-lg border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
                  <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
                    <span>Tier {tier}</span>
                    <span className="text-xs text-slate-500">{Math.round(pct * 10000) / 100}%</span>
                  </div>
                  <p className="text-sm text-slate-700">
                    Target yard count: <span className="font-semibold">{yardShareCounts[tier] ?? "-"}</span>
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
