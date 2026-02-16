import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { setDealerConfig, subscribeAllDealerConfigs } from "@/lib/firebase";

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

export default function DealerStateAdmin() {
  const [dealerConfigs, setDealerConfigs] = useState<Record<string, any>>({});
  const [savingSlug, setSavingSlug] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeAllDealerConfigs((data) => setDealerConfigs(data || {}));
    return unsubscribe;
  }, []);

  const dealerRows = useMemo(() => {
    const rows = MANAGED_STATE_SLUGS.map((slug) => {
      const config = dealerConfigs?.[slug] || null;
      return {
        slug,
        name: config?.name || slug,
        config,
      };
    });

    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, [dealerConfigs]);

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
