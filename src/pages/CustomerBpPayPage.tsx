import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { subscribeToCustomerBp } from "@/lib/firebase";
import type { CustomerBpRecord } from "@/types";
import { normalizeDealerSlug, prettifyDealerName } from "@/lib/dealerUtils";

const CUSTOMER_BP_ENABLED_SLUGS = new Set(["frankston", "launceston", "st-james", "traralgon", "geelong", "geelongz"]);

const currency = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 2,
});

const formatDate = (raw: string) => {
  if (!raw) return "-";
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(6, 8)}/${raw.slice(4, 6)}/${raw.slice(0, 4)}`;
  }
  return raw;
};

const parseDateRank = (raw: string) => {
  if (!raw) return 0;
  if (/^\d{8}$/.test(raw)) return Number(raw);

  const timestamp = Date.parse(raw);
  if (!Number.isNaN(timestamp)) return timestamp;

  return 0;
};

const getStatus = (amount: number) => {
  if (amount < -15000) {
    return {
      label: "Deposit",
      className: "bg-emerald-100 text-emerald-700 border-emerald-200",
    };
  }

  if (Math.abs(amount) > 10) {
    return {
      label: "OK",
      className: "bg-emerald-100 text-emerald-700 border-emerald-200",
    };
  }

  return {
    label: "-",
    className: "bg-slate-100 text-slate-600 border-slate-200",
  };
};

export default function CustomerBpPayPage() {
  const { dealerSlug: rawDealerSlug } = useParams<{ dealerSlug: string }>();
  const dealerSlug = useMemo(() => normalizeDealerSlug(rawDealerSlug), [rawDealerSlug]);
  const dealerName = useMemo(() => prettifyDealerName(dealerSlug), [dealerSlug]);
  const isEnabled = CUSTOMER_BP_ENABLED_SLUGS.has(dealerSlug);

  const [records, setRecords] = useState<CustomerBpRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!dealerSlug || !isEnabled) {
      setRecords([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = subscribeToCustomerBp(dealerSlug === "geelongz" ? "geelong" : dealerSlug, (data) => {
      setRecords(data);
      setLoading(false);
    });

    return unsub;
  }, [dealerSlug, isEnabled]);

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();

    return records
      .filter((item) => {
        if (!query) return true;
        return (
          item.businessPartner.toLowerCase().includes(query) ||
          item.businessPartnerName.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => parseDateRank(b.orderCreatedDate) - parseDateRank(a.orderCreatedDate));
  }, [records, search]);

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar
        orders={[]}
        selectedDealer={dealerName}
        onDealerSelect={() => {}}
        hideOtherDealers
        currentDealerName={dealerName}
      />

      <main className="flex-1 p-6 space-y-6">
        {!isEnabled ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              This page is only enabled for Frankston, Launceston, St James, Traralgon and Geelong.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Customer BP & Payment</CardTitle>
                <CardDescription>
                  Showing all BP customers. Sorted by Order Created Date (newest first). Status is <b>OK</b> when |BP Amount| &gt; 10, and <b>Deposit</b> when BP Amount &lt; -15,000.
                </CardDescription>
              </div>
              <Input
                className="sm:w-[320px]"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search BP number or BP name"
              />
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-auto max-h-[72vh]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">BP Amount</TableHead>
                      <TableHead>BP Number</TableHead>
                      <TableHead>BP Name</TableHead>
                      <TableHead>Sales Order</TableHead>
                      <TableHead>Chassis</TableHead>
                      <TableHead>Order Created</TableHead>
                      <TableHead>Order Type</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead className="text-right">Order Net</TableHead>
                      <TableHead className="text-right">Order Net (Incl GST)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                          Loading customer BP data...
                        </TableCell>
                      </TableRow>
                    ) : filteredRecords.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                          No records matched current filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRecords.map((item) => {
                        const status = getStatus(item.bpAmountSigned);
                        return (
                          <TableRow key={item.id}>
                            <TableCell>
                              <Badge variant="outline" className={status.className}>
                                {status.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium">{currency.format(item.bpAmountSigned)}</TableCell>
                            <TableCell>{item.businessPartner || "-"}</TableCell>
                            <TableCell>{item.businessPartnerName || "-"}</TableCell>
                            <TableCell>{item.salesOrder || "-"}</TableCell>
                            <TableCell>{item.chassisNumber || "-"}</TableCell>
                            <TableCell>{formatDate(item.orderCreatedDate)}</TableCell>
                            <TableCell>{item.orderType || "-"}</TableCell>
                            <TableCell>{item.orderCurrency || "-"}</TableCell>
                            <TableCell className="text-right">{currency.format(item.orderNetValue)}</TableCell>
                            <TableCell className="text-right">{currency.format(item.orderNetValueInclGst)}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
