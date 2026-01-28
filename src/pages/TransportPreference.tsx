import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, Save } from "lucide-react";
import { toast } from "sonner";

import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  subscribeDealerConfig,
  subscribeDealerTransportPreferences,
  subscribeToSchedule,
  subscribeTransportCompanies,
  setDealerTransportPreferences,
} from "@/lib/firebase";
import { normalizeDealerSlug, prettifyDealerName } from "@/lib/dealerUtils";
import type { ScheduleItem } from "@/types";
import type { DealerTransportPreferences, TransportPreference, TransportCompany } from "@/types/transport";

type PreferenceDraft = Omit<TransportPreference, "preferenceRank">;

const MAX_PREFERENCES = 8;

const createEmptyPreferences = (): PreferenceDraft[] =>
  Array.from({ length: MAX_PREFERENCES }, () => ({
    companyId: "",
    truckNumber: "",
    supplierRating: "",
    bankGuarantee: "",
  }));

const slugifyDealerName = (name?: string) =>
  (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export default function TransportPreference() {
  const { dealerSlug: rawDealerSlug } = useParams<{ dealerSlug: string }>();
  const dealerSlug = useMemo(() => normalizeDealerSlug(rawDealerSlug), [rawDealerSlug]);

  const [allOrders, setAllOrders] = useState<ScheduleItem[]>([]);
  const [dealerConfig, setDealerConfig] = useState<any>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [companies, setCompanies] = useState<Record<string, TransportCompany>>({});
  const [destinationLocation, setDestinationLocation] = useState("");
  const [preferences, setPreferences] = useState<PreferenceDraft[]>(createEmptyPreferences());
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsubSchedule = subscribeToSchedule((data) => {
      setAllOrders(data || []);
    });
    return () => {
      unsubSchedule?.();
    };
  }, []);

  useEffect(() => {
    if (!dealerSlug) return;

    const unsubConfig = subscribeDealerConfig(dealerSlug, (config) => {
      setDealerConfig(config);
      setConfigLoading(false);
    });

    return unsubConfig;
  }, [dealerSlug]);

  useEffect(() => {
    const unsubscribe = subscribeTransportCompanies((data) => {
      setCompanies(data || {});
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!dealerSlug) return;
    setPreferencesLoading(true);

    const unsubscribe = subscribeDealerTransportPreferences(dealerSlug, (data) => {
      const destination = data?.destinationLocation || "";
      const initialPreferences = createEmptyPreferences();

      (data?.preferences || []).forEach((pref) => {
        const idx = pref.preferenceRank - 1;
        if (idx >= 0 && idx < MAX_PREFERENCES) {
          initialPreferences[idx] = {
            companyId: pref.companyId || "",
            truckNumber: pref.truckNumber || "",
            supplierRating: pref.supplierRating || "",
            bankGuarantee: pref.bankGuarantee || "",
          };
        }
      });

      setDestinationLocation(destination);
      setPreferences(initialPreferences);
      setPreferencesLoading(false);
    });

    return unsubscribe;
  }, [dealerSlug]);

  const orders = useMemo(() => {
    if (!dealerSlug) return [];
    return (allOrders || []).filter((order) => slugifyDealerName(order.Dealer) === dealerSlug);
  }, [allOrders, dealerSlug]);

  const dealerDisplayName = useMemo(() => {
    if (dealerConfig?.name) return dealerConfig.name;
    const fromOrder = orders[0]?.Dealer;
    return fromOrder && fromOrder.trim().length > 0 ? fromOrder : prettifyDealerName(dealerSlug);
  }, [dealerConfig, orders, dealerSlug]);

  const hasAccess = useMemo(() => {
    if (configLoading) return true;
    if (!dealerConfig) return false;
    return dealerConfig.isActive;
  }, [dealerConfig, configLoading]);

  const companyOptions = useMemo(
    () => Object.values(companies || {}).sort((a, b) => (a?.name || "").localeCompare(b?.name || "")),
    [companies]
  );

  const handlePreferenceChange = (index: number, key: keyof PreferenceDraft, value: string) => {
    setPreferences((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  };

  const handleSave = async () => {
    if (!dealerSlug) return;
    if (!destinationLocation.trim()) {
      toast.error("Please enter a destination location.");
      return;
    }

    const formattedPreferences: TransportPreference[] = preferences
      .map((pref, index) => ({
        preferenceRank: index + 1,
        companyId: pref.companyId.trim(),
        truckNumber: pref.truckNumber.trim(),
        supplierRating: pref.supplierRating.trim(),
        bankGuarantee: pref.bankGuarantee.trim(),
      }))
      .filter((pref) =>
        [pref.companyId, pref.truckNumber, pref.supplierRating, pref.bankGuarantee].some((value) => value)
      );

    const payload: DealerTransportPreferences = {
      destinationLocation: destinationLocation.trim(),
      preferences: formattedPreferences,
    };

    try {
      setSaving(true);
      await setDealerTransportPreferences(dealerSlug, payload);
      toast.success("Transport preferences saved.");
    } catch (error) {
      console.error("Failed to save transport preferences:", error);
      toast.error("Failed to save preferences. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!configLoading && !hasAccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="text-center py-16">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <CardTitle className="text-xl text-slate-700 mb-2">Access Denied</CardTitle>
            <p className="text-slate-500 mb-6">
              This dealer portal is currently inactive or does not exist. Please contact the administrator for access.
            </p>
            <p className="text-sm text-slate-400">Dealer: {dealerDisplayName}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (configLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-600">Loading transport preferences...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        orders={orders}
        selectedDealer="locked"
        onDealerSelect={() => {}}
        hideOtherDealers
        currentDealerName={dealerDisplayName}
        showStats={false}
      />

      <main className="flex-1 flex flex-col">
        <header className="border-b border-slate-200 bg-white p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Transport Preference</h1>
              <p className="mt-1 text-slate-600">
                Configure destination location and vendor preferences for {dealerDisplayName}.
              </p>
            </div>
            <Button onClick={handleSave} disabled={saving || preferencesLoading}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save Preferences"}
            </Button>
          </div>
        </header>

        <div className="flex-1 space-y-6 p-6">
          <Card>
            <CardHeader>
              <CardTitle>Destination Location</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label htmlFor="destination-location">
                Each dealer should have a destination location for transport planning.
              </Label>
              <Input
                id="destination-location"
                placeholder="Enter destination location"
                value={destinationLocation}
                onChange={(event) => setDestinationLocation(event.target.value)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Transport Company Preference List (Max 8)</CardTitle>
            </CardHeader>
            <CardContent>
              {preferencesLoading ? (
                <div className="text-slate-500">Loading preferences...</div>
              ) : (
                <div className="space-y-3">
                  <div className="text-sm text-slate-500">
                    Transport companies are managed in Admin. Choose vendors and record their details in priority order.
                  </div>
                  <div className="rounded-lg border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[80px]">Preference</TableHead>
                          <TableHead className="min-w-[220px]">Transport Company</TableHead>
                          <TableHead className="min-w-[160px]">Truck Number</TableHead>
                          <TableHead className="min-w-[160px]">Supplier Rating</TableHead>
                          <TableHead className="min-w-[180px]">Bank Guarantee</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preferences.map((pref, index) => (
                          <TableRow key={`pref-${index}`}>
                            <TableCell className="font-semibold text-slate-600">{index + 1}</TableCell>
                            <TableCell>
                              <Select
                                value={pref.companyId}
                                onValueChange={(value) => handlePreferenceChange(index, "companyId", value)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select company" />
                                </SelectTrigger>
                                <SelectContent>
                                  {companyOptions.length === 0 && (
                                    <SelectItem value="none" disabled>
                                      No companies available
                                    </SelectItem>
                                  )}
                                  {companyOptions.map((company) => (
                                    <SelectItem key={company.id} value={company.id}>
                                      {company.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input
                                value={pref.truckNumber}
                                onChange={(event) =>
                                  handlePreferenceChange(index, "truckNumber", event.target.value)
                                }
                                placeholder="Truck number"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={pref.supplierRating}
                                onChange={(event) =>
                                  handlePreferenceChange(index, "supplierRating", event.target.value)
                                }
                                placeholder="Rating"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={pref.bankGuarantee}
                                onChange={(event) =>
                                  handlePreferenceChange(index, "bankGuarantee", event.target.value)
                                }
                                placeholder="Bank guarantee"
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
