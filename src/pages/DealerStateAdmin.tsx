import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { setDealerConfig, subscribeAllDealerConfigs, subscribeToCampervanSchedule, subscribeToSchedule, subscribeToSchedule2024 } from "@/lib/firebase";
import type { CampervanScheduleItem, ScheduleItem } from "@/types";

const STATE_OPTIONS = ["WA", "NT", "SA", "QLD", "NSW", "ACT", "VIC", "TAS", "NZ", "UNASSIGNED"];

const MANAGED_STATE_SLUGS = [
  "abco",
  "alldealers",
  "auswide",
  "bendigo",
  "bundaberg",
  "caravans-wa",
  "christchurch",
  "cmg-campers",
  "dario",
  "destiny-rv",
  "forest-glen",
  "frankston",
  "geelong",
  "green-rv",
  "green-show",
  "gympie",
  "heatherbrae",
  "launceston",
  "marsden-point",
  "motorhub",
  "newcastle-caravans-rv",
  "selfowned",
  "slacks-creek",
  "st-james",
  "toowoomba",
  "townsville",
];


const normalizeState = (value: unknown) => {
  const upper = String(value ?? "").trim().toUpperCase();
  return STATE_OPTIONS.includes(upper) ? upper : "UNASSIGNED";
};

const slugifyDealerName = (name?: string) =>
  String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const prettifyDealerName = (slug: string) =>
  slug
    .replace(/-/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());


export default function DealerStateAdmin() {
  const [dealerConfigs, setDealerConfigs] = useState<Record<string, any>>({});
  const [savingSlug, setSavingSlug] = useState<string | null>(null);
  const [scheduleOrders, setScheduleOrders] = useState<ScheduleItem[]>([]);
  const [scheduleOrders2024, setScheduleOrders2024] = useState<ScheduleItem[]>([]);
  const [campervans, setCampervans] = useState<CampervanScheduleItem[]>([]);

  useEffect(() => {
    const scheduleOptions = { includeNoChassis: true, includeNoCustomer: true, includeFinished: true };
    const unsubscribe = subscribeAllDealerConfigs((data) => setDealerConfigs(data || {}));
    const unsubSchedule = subscribeToSchedule((data) => setScheduleOrders(data || []), scheduleOptions);
    const unsubSchedule2024 = subscribeToSchedule2024((data) => setScheduleOrders2024(data || []), scheduleOptions);
    const unsubCamper = subscribeToCampervanSchedule((data) => setCampervans(data || []));

    return () => {
      unsubscribe?.();
      unsubSchedule?.();
      unsubSchedule2024?.();
      unsubCamper?.();
    };
  }, []);

  const dealerRows = useMemo(() => {
    const slugMap = new Map<string, { slug: string; name: string; config: any }>();

    MANAGED_STATE_SLUGS.forEach((slug) => {
      const config = dealerConfigs?.[slug] || null;
      slugMap.set(slug, { slug, name: config?.name || prettifyDealerName(slug), config });
    });

    Object.entries(dealerConfigs || {}).forEach(([slug, config]) => {
      const normalized = slugifyDealerName(slug);
      if (!normalized) return;
      slugMap.set(normalized, {
        slug: normalized,
        name: config?.name || prettifyDealerName(normalized),
        config,
      });
    });

    [...scheduleOrders, ...scheduleOrders2024].forEach((order) => {
      const slug = slugifyDealerName((order as any)?.Dealer);
      if (!slug) return;
      if (!slugMap.has(slug)) {
        slugMap.set(slug, { slug, name: prettifyDealerName(slug), config: dealerConfigs?.[slug] || null });
      }
    });

    campervans.forEach((item) => {
      const slug = slugifyDealerName((item as any)?.dealer);
      if (!slug) return;
      if (!slugMap.has(slug)) {
        slugMap.set(slug, { slug, name: prettifyDealerName(slug), config: dealerConfigs?.[slug] || null });
      }
    });

    return Array.from(slugMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [campervans, dealerConfigs, scheduleOrders, scheduleOrders2024]);

  const updateState = async (slug: string, state: string) => {
    const existing = dealerConfigs?.[slug] || {};

    setSavingSlug(slug);
    try {
      await setDealerConfig(slug, {
        slug,
        name: existing?.name || slug,
        code: existing?.code || slug.toUpperCase().replace(/-/g, "_"),
        isActive: existing?.isActive ?? true,
        createdAt: existing?.createdAt || new Date().toISOString(),
        productRegistrationDealerName: existing?.productRegistrationDealerName || existing?.name || slug,
        initialTarget2026: existing?.initialTarget2026 ?? 0,
        powerbi_url: existing?.powerbi_url || "",
        ...existing,
        state,
      });
      toast.success(`Saved ${existing?.name || slug} → ${state}`);
    } catch (error) {
      console.error("Failed to update dealer state", error);
      toast.error("Failed to save dealer state");
    } finally {
      setSavingSlug(null);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Dealer State Mapping (Hidden Admin)</h1>
            <p className="text-sm text-slate-600">Set a state for each dealer to power the Australia map analytics.</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/overall-dashboard">Back to Dashboard</Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Dealer State Configuration</CardTitle>
            <p className="text-sm text-slate-500">All dealers found in configs + schedule + 2024schedule + campervan schedule are listed here.</p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dealer</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>State</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dealerRows.map((dealer) => {
                  const state = normalizeState(dealer.config?.state);
                  return (
                    <TableRow key={dealer.slug}>
                      <TableCell className="font-medium">{dealer.name}</TableCell>
                      <TableCell className="text-slate-500">{dealer.slug}</TableCell>
                      <TableCell>
                        <Select
                          value={state}
                          onValueChange={(next) => updateState(dealer.slug, next)}
                          disabled={savingSlug === dealer.slug}
                        >
                          <SelectTrigger className="w-44">
                            <SelectValue placeholder="Select state" />
                          </SelectTrigger>
                          <SelectContent>
                            {STATE_OPTIONS.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
