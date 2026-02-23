import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import * as XLSX from "xlsx";
import Sidebar from "@/components/Sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { subscribeToCustomerBp } from "@/lib/firebase";
import type { CustomerBpRecord } from "@/types";
import { normalizeDealerSlug, prettifyDealerName } from "@/lib/dealerUtils";
import { Download } from "lucide-react";

const CUSTOMER_BP_ENABLED_SLUGS = new Set(["frankston", "launceston", "st-james", "traralgon", "geelong", "geelongz"]);

type StatusFilter = "all" | "ok" | "deposit" | "paid-not-registered" | "unpaid-or-not-registered";

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

const getStatusMeta = (amount: number) => {
  if (Math.abs(amount) <= 10) {
    return {
      key: "ok" as const,
      label: "OK",
      className: "bg-emerald-100 text-emerald-700 border-emerald-200",
    };
  }

  if (amount < 0 && amount > -15000) {
    return {
      key: "deposit" as const,
      label: "Deposit",
      className: "bg-violet-100 text-violet-700 border-violet-200",
    };
  }

  if (amount < 0) {
    return {
      key: "paid-not-registered" as const,
      label: "Paid, not registered",
      className: "bg-blue-100 text-blue-700 border-blue-200",
    };
  }

  return {
    key: "unpaid-or-not-registered" as const,
    label: "Unpaid / not registered",
    className: "bg-amber-100 text-amber-700 border-amber-200",
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

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
          item.businessPartnerName.toLowerCase().includes(query) ||
          item.chassisNumber.toLowerCase().includes(query)
        );
      })
      .filter((item) => {
        if (statusFilter === "all") return true;
        return getStatusMeta(item.bpAmountSigned).key === statusFilter;
      })
      .sort((a, b) => parseDateRank(b.orderCreatedDate) - parseDateRank(a.orderCreatedDate));
  }, [records, search, statusFilter]);

  const exportToExcel = () => {
    const exportRows = filteredRecords.map((item) => {
      const status = getStatusMeta(item.bpAmountSigned);
      return {
        Status: status.label,
        "BP Amount": item.bpAmountSigned,
        "BP Number": item.businessPartner || "",
        "BP Name": item.businessPartnerName || "",
        "Sales Order": item.salesOrder || "",
        Chassis: item.chassisNumber || "",
        "Order Created": item.orderCreatedDate || "",
        "Order Type": item.orderType || "",
        Currency: item.orderCurrency || "",
        "Order Net": item.orderNetValue,
        "Order Net (Incl GST)": item.orderNetValueInclGst,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "CustomerBP");

    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `${dealerSlug || "dealer"}-customer-bp-${today}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar
        orders={[]}
        selectedDealer={dealerName}
        onDealerSelect={() => {}}
        hideOtherDealers
        currentDealerName={dealerName}
        showStats={false}
      />

      <main className="flex-1 p-6 space-y-6">
        {!isEnabled ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              This page is only enabled for Frankston, Launceston, St James, Traralgon and Geelong.
            </CardContent>
          </Card>
        ) : (
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="gap-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Customer BP & Payment</CardTitle>
                  <CardDescription>
                    Sorted by Order Created Date (newest first). Status rules: ±10 is OK; -15000 &lt; amount &lt; 0 is Deposit; other negatives are Paid, not registered; positives are Unpaid / not registered.
                  </CardDescription>
                </div>
                <Button onClick={exportToExcel} className="w-full md:w-auto" variant="outline" disabled={loading || filteredRecords.length === 0}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Excel
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search BP number, BP name, or Chassis"
                />
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All status</SelectItem>
                    <SelectItem value="ok">OK</SelectItem>
                    <SelectItem value="deposit">Deposit</SelectItem>
                    <SelectItem value="paid-not-registered">Paid, not registered</SelectItem>
                    <SelectItem value="unpaid-or-not-registered">Unpaid / not registered</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center rounded-md border bg-slate-50 px-3 text-sm text-slate-600">
                  Records: <span className="ml-2 font-semibold text-slate-900">{filteredRecords.length}</span>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <div className="rounded-lg border border-slate-200 overflow-auto max-h-[72vh]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-slate-50">
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
                        const status = getStatusMeta(item.bpAmountSigned);
                        return (
                          <TableRow key={item.id} className="hover:bg-slate-50/80">
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
