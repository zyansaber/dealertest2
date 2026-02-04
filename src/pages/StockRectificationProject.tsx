import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  addManualChassisToYardPending,
  saveStockRectificationReport,
  subscribeToStockRectification,
  subscribeToYardPending,
  subscribeToYardStock,
  updateStockRectificationNote,
} from "@/lib/firebase";

const DEALERS = [
  { slug: "frankston", name: "Frankston" },
  { slug: "geelong", name: "Geelong" },
  { slug: "launceston", name: "Launceston" },
  { slug: "st-james", name: "ST James" },
  { slug: "traralgon", name: "Traralgon" },
];

const REASONS = [
  "Sold",
  "Never received",
  "Previously received but was reallocated",
  "Show",
  "Dispatch point",
  "Other",
];

const toStr = (value: unknown) => String(value ?? "");
const lower = (value: unknown) => toStr(value).toLowerCase();

const resolveRowType = (row: Record<string, any>) => {
  if (row?.type) return toStr(row.type);
  const customer = toStr(row?.customer).trim();
  if (!customer) return "Stock";
  return lower(customer).endsWith("stock") ? "Stock" : "Customer";
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
};

type StockRectificationViewProps = {
  dealerSlug?: string;
  showDealerList?: boolean;
};

export function StockRectificationView({ dealerSlug, showDealerList = true }: StockRectificationViewProps) {
  const navigate = useNavigate();
  const [yardStock, setYardStock] = useState<Record<string, any>>({});
  const [yardPending, setYardPending] = useState<Record<string, any>>({});
  const [reports, setReports] = useState<Record<string, any>>({});
  const [addChassis, setAddChassis] = useState("");
  const [addModel, setAddModel] = useState("");
  const [addReason, setAddReason] = useState("");
  const [addCustomReason, setAddCustomReason] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportChassis, setReportChassis] = useState("");
  const [reportModel, setReportModel] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [reportCustomReason, setReportCustomReason] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const currentDealer = useMemo(() => {
    if (dealerSlug) {
      return DEALERS.find((dealer) => dealer.slug === dealerSlug) ?? null;
    }
    return DEALERS[0];
  }, [dealerSlug]);

  useEffect(() => {
    if (showDealerList) {
      if (!dealerSlug || !DEALERS.some((dealer) => dealer.slug === dealerSlug)) {
        navigate(`/stock-rectification/${DEALERS[0].slug}`, { replace: true });
      }
      return;
    }

    if (!dealerSlug || !DEALERS.some((dealer) => dealer.slug === dealerSlug)) {
      navigate("/access-restricted", { replace: true });
    }
  }, [dealerSlug, navigate, showDealerList]);

  useEffect(() => {
    if (!currentDealer?.slug) return;

    const unsubStock = subscribeToYardStock(currentDealer.slug, (data) => setYardStock(data || {}));
    const unsubPending = subscribeToYardPending(currentDealer.slug, (data) => setYardPending(data || {}));
    const unsubReports = subscribeToStockRectification(currentDealer.slug, (data) => setReports(data || {}));

    return () => {
      unsubStock?.();
      unsubPending?.();
      unsubReports?.();
    };
  }, [currentDealer?.slug]);

  useEffect(() => {
    if (!reports) return;
    setNoteDrafts((prev) => {
      const next = { ...prev };
      Object.entries(reports).forEach(([chassis, report]) => {
        if (next[chassis] === undefined && report?.note != null) {
          next[chassis] = String(report.note);
        }
      });
      return next;
    });
  }, [reports]);

  const rows = useMemo(() => {
    const pendingRows = Object.entries(yardPending || {}).map(([key, value]) => {
      const row = value ?? {};
      const chassis = toStr(row.chassis || key).toUpperCase();
      return {
        chassis,
        model: toStr(row.model) || "-",
        customer: toStr(row.customer) || "-",
        receivedAt: formatDate(row.receivedAt),
        type: "Pending",
        isPending: true,
      };
    });

    const stockRows = Object.entries(yardStock || {}).map(([key, value]) => {
      const row = value ?? {};
      const chassis = toStr(row.chassis || key).toUpperCase();
      return {
        chassis,
        model: toStr(row.model) || "-",
        customer: toStr(row.customer) || "-",
        receivedAt: formatDate(row.receivedAt),
        type: resolveRowType(row),
        isPending: false,
      };
    });

    return [...pendingRows, ...stockRows].sort((a, b) => a.chassis.localeCompare(b.chassis));
  }, [yardPending, yardStock]);

  const handleAddToYard = async () => {
    const chassis = addChassis.trim().toUpperCase();
    if (!chassis) {
      toast.error("Please enter a chassis number.");
      return;
    }
    if (!addReason) {
      toast.error("Please select a reason.");
      return;
    }

    setAddLoading(true);
    try {
      await addManualChassisToYardPending(currentDealer.slug, {
        chassis,
        vinnumber: null,
        model: addModel.trim() ? addModel.trim() : null,
        receivedAt: new Date().toISOString(),
        wholesalePo: null,
        type: null,
      });
      await saveStockRectificationReport(currentDealer.slug, chassis, {
        source: "add-to-yard",
        reason: addReason,
        customReason: addReason === "Other" ? addCustomReason.trim() || null : null,
      });
      toast.success(`Added ${chassis} for yard approval.`);
      setAddChassis("");
      setAddModel("");
      setAddReason("");
      setAddCustomReason("");
    } catch (error) {
      console.error(error);
      toast.error("Failed to add chassis to yard.");
    } finally {
      setAddLoading(false);
    }
  };

  const openReportDialog = (chassis: string, model: string) => {
    setReportChassis(chassis);
    setReportModel(model);
    setReportReason("");
    setReportCustomReason("");
    setReportOpen(true);
  };

  const handleSubmitReport = async () => {
    if (!reportChassis) return;
    if (!reportReason) {
      toast.error("Please select a reason.");
      return;
    }

    setReportLoading(true);
    try {
      await saveStockRectificationReport(currentDealer.slug, reportChassis, {
        source: "report-invalid-stock",
        reason: reportReason,
        customReason: reportReason === "Other" ? reportCustomReason.trim() || null : null,
      });
      toast.success("Report saved.");
      setReportOpen(false);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save report.");
    } finally {
      setReportLoading(false);
    }
  };

  const handleSaveNote = async (chassis: string) => {
    const note = (noteDrafts[chassis] ?? "").trim();
    try {
      await updateStockRectificationNote(currentDealer.slug, chassis, note ? note : null);
      toast.success("Note saved.");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save note.");
    }
  };

  const content = (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">
          Stock Rectification project — {currentDealer?.name ?? ""}
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Review yard inventory and report invalid stock with reasons for {currentDealer?.name ?? ""}.
        </p>
      </div>

      <div className="grid gap-6">
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-slate-100">Add to yard (requires reason)</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto]">
            <div className="space-y-2">
              <Label htmlFor="add-chassis">Chassis</Label>
              <Input
                id="add-chassis"
                placeholder="Enter chassis"
                value={addChassis}
                onChange={(event) => setAddChassis(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-model">Model (optional)</Label>
              <Input
                id="add-model"
                placeholder="Model"
                value={addModel}
                onChange={(event) => setAddModel(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Select value={addReason} onValueChange={setAddReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  {REASONS.map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {reason}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {addReason === "Other" && (
                <Input
                  placeholder="Enter custom reason"
                  value={addCustomReason}
                  onChange={(event) => setAddCustomReason(event.target.value)}
                />
              )}
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleAddToYard}
                className="bg-sky-600 hover:bg-sky-700"
                disabled={addLoading}
              >
                {addLoading ? "Saving..." : "Add to yard"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-slate-100">Yard Inventory</CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <div className="text-sm text-slate-400">No units in yard inventory.</div>
            ) : (
              <div className="rounded-lg border border-slate-800 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-semibold text-slate-200">Chassis</TableHead>
                      <TableHead className="font-semibold text-slate-200">Model</TableHead>
                      <TableHead className="font-semibold text-slate-200">Customer</TableHead>
                      <TableHead className="font-semibold text-slate-200">Received At</TableHead>
                      <TableHead className="font-semibold text-slate-200">Status</TableHead>
                      <TableHead className="font-semibold text-slate-200">Report invalid stock</TableHead>
                      <TableHead className="font-semibold text-slate-200">Reported</TableHead>
                      <TableHead className="font-semibold text-slate-200">Reason</TableHead>
                      <TableHead className="font-semibold text-slate-200">Note</TableHead>
                      <TableHead className="font-semibold text-slate-200">Note Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const report = reports?.[row.chassis] ?? null;
                      const reportedReason = report?.reason ? String(report.reason) : "";
                      const reportedCustom = report?.customReason ? String(report.customReason) : "";
                      const reasonDisplay = reportedReason
                        ? reportedReason === "Other" && reportedCustom
                          ? `${reportedReason}: ${reportedCustom}`
                          : reportedReason
                        : "-";
                      const noteValue =
                        noteDrafts[row.chassis] !== undefined
                          ? noteDrafts[row.chassis]
                          : report?.note
                          ? String(report.note)
                          : "";
                      return (
                        <TableRow key={row.chassis} className={row.isPending ? "bg-amber-500/10" : undefined}>
                          <TableCell className="font-medium text-slate-100">{row.chassis}</TableCell>
                          <TableCell className="text-slate-200">{row.model}</TableCell>
                          <TableCell className="text-slate-200">{row.customer}</TableCell>
                          <TableCell className="text-slate-200">{row.receivedAt}</TableCell>
                          <TableCell className="text-slate-200">{row.type}</TableCell>
                          <TableCell>
                            {report ? (
                              <span className="text-xs font-semibold uppercase text-emerald-400">Reported</span>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-amber-400 text-amber-200 hover:bg-amber-500/10"
                                onClick={() => openReportDialog(row.chassis, row.model)}
                              >
                                Report
                              </Button>
                            )}
                          </TableCell>
                          <TableCell className="text-slate-200">{report ? "Yes" : "No"}</TableCell>
                          <TableCell className="text-slate-200">{reasonDisplay}</TableCell>
                          <TableCell className="text-slate-200">
                            <Input
                              value={noteValue}
                              placeholder="Add note"
                              onChange={(event) =>
                                setNoteDrafts((prev) => ({
                                  ...prev,
                                  [row.chassis]: event.target.value,
                                }))
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleSaveNote(row.chassis)}
                            >
                              Save
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="bg-slate-950 text-slate-100 border-slate-800">
          <DialogHeader>
            <DialogTitle>Report invalid stock</DialogTitle>
            <DialogDescription className="text-slate-400">
              {reportChassis} {reportModel ? `· ${reportModel}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reason</Label>
              <Select value={reportReason} onValueChange={setReportReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  {REASONS.map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {reason}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {reportReason === "Other" && (
              <div className="space-y-2">
                <Label>Custom reason</Label>
                <Input
                  placeholder="Enter custom reason"
                  value={reportCustomReason}
                  onChange={(event) => setReportCustomReason(event.target.value)}
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setReportOpen(false)}>
                Cancel
              </Button>
              <Button
                className="bg-amber-500 hover:bg-amber-600 text-slate-900"
                onClick={handleSubmitReport}
                disabled={reportLoading}
              >
                {reportLoading ? "Saving..." : "Save report"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );

  if (showDealerList) {
    return (
      <div className="flex min-h-screen bg-slate-950 text-slate-50">
        <aside className="w-64 border-r border-slate-800 bg-slate-900 p-4">
          <div className="mb-6">
            <div className="stock-rectification-glow rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-100">
              Stock Rectification project
            </div>
          </div>
          <nav className="space-y-2">
            {DEALERS.map((dealer) => (
              <NavLink
                key={dealer.slug}
                to={`/stock-rectification/${dealer.slug}`}
                className={({ isActive }) =>
                  `block rounded-md px-3 py-2 text-sm transition ${
                    isActive
                      ? "bg-slate-800 text-white"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`
                }
              >
                {dealer.name}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="flex-1 p-6">{content}</main>
      </div>
    );
  }

  return <div className="flex-1 p-6 bg-slate-950 text-slate-50">{content}</div>;
}

export default function StockRectificationProject() {
  const { dealerSlug } = useParams<{ dealerSlug: string }>();
  return <StockRectificationView dealerSlug={dealerSlug} showDealerList />;
}
