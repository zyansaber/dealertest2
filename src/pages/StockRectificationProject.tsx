import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { ScheduleItem } from "@/types";
import {
  addStockRectificationToYardPending,
  reportInvalidStockWithReason,
  subscribeToSchedule,
  subscribeToStockRectificationAll,
  subscribeToYardPending,
} from "@/lib/firebase";
import {
  isStockRectificationEnabled,
  normalizeDealerSlug,
  prettifyDealerName,
} from "@/lib/dealerUtils";

type RectificationRecord = {
  reason?: string;
  note?: string | null;
  createdAt?: string;
};

type YardPendingRecord = {
  reason?: string;
  note?: string | null;
  requestedAt?: string;
};

type StockRow = {
  chassis: string;
  model: string;
  customer: string;
  regentProduction: string;
};

const RECTIFICATION_REASONS = [
  "Sold",
  "Never received",
  "Previously received but was reallocated",
  "Show",
  "Dispatch point",
];

const slugifyDealerName = (name?: string) =>
  (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export default function StockRectificationProject() {
  const { dealerSlug: rawDealerSlug = "" } = useParams<{ dealerSlug: string }>();
  const dealerSlug = useMemo(() => normalizeDealerSlug(rawDealerSlug), [rawDealerSlug]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [rectificationMap, setRectificationMap] = useState<Record<string, Record<string, RectificationRecord>>>({});
  const [yardPendingMap, setYardPendingMap] = useState<Record<string, YardPendingRecord>>({});

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<"report" | "yard" | null>(null);
  const [selectedRow, setSelectedRow] = useState<StockRow | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const unsubSchedule = subscribeToSchedule(
      (data) => setSchedule(Array.isArray(data) ? data : []),
      { includeNoCustomer: true }
    );
    const unsubRectification = subscribeToStockRectificationAll((data) => {
      setRectificationMap((data || {}) as Record<string, Record<string, RectificationRecord>>);
    });
    const unsubYardPending = subscribeToYardPending(dealerSlug, (data) => {
      setYardPendingMap((data || {}) as Record<string, YardPendingRecord>);
    });

    return () => {
      unsubSchedule?.();
      unsubRectification?.();
      unsubYardPending?.();
    };
  }, [dealerSlug]);

  const dealerDisplayName = useMemo(() => {
    const match = schedule.find((item) => slugifyDealerName(item?.Dealer) === dealerSlug);
    return match?.Dealer ? String(match.Dealer) : prettifyDealerName(dealerSlug);
  }, [schedule, dealerSlug]);

  const stockRows = useMemo<StockRow[]>(() => {
    return schedule
      .filter((item) => slugifyDealerName(item?.Dealer) === dealerSlug)
      .filter((item) => item?.Chassis)
      .map((item) => ({
        chassis: String(item.Chassis),
        model: String(item.Model || item["Model"] || item["Model Range"] || item["ModelRange"] || "-"),
        customer: String(item.Customer || "Stock"),
        regentProduction: String(item["Regent Production"] || "Not Started"),
      }))
      .sort((a, b) => a.chassis.localeCompare(b.chassis));
  }, [schedule, dealerSlug]);

  const rectificationByDealer = rectificationMap[dealerSlug] || {};

  const openDialog = (type: "report" | "yard", row: StockRow) => {
    setDialogType(type);
    setSelectedRow(row);
    setReason("");
    setNote("");
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setDialogType(null);
    setSelectedRow(null);
    setReason("");
    setNote("");
  };

  const handleSubmit = async () => {
    if (!selectedRow || !dialogType) return;
    if (!reason) {
      toast.error("Please select a reason before submitting.");
      return;
    }

    try {
      if (dialogType === "report") {
        await reportInvalidStockWithReason(dealerSlug, selectedRow.chassis, {
          reason,
          note: note.trim() || null,
          model: selectedRow.model,
          source: "stock-rectification-project",
        });
        toast.success(`Reported invalid stock for ${selectedRow.chassis}.`);
      } else {
        await addStockRectificationToYardPending(dealerSlug, {
          chassis: selectedRow.chassis,
          model: selectedRow.model,
          reason,
          note: note.trim() || null,
          source: "stock-rectification-project",
        });
        toast.success(`Added ${selectedRow.chassis} to yard pending list.`);
      }
      closeDialog();
    } catch (error) {
      console.error("Stock rectification action failed", error);
      toast.error("Failed to submit. Please try again.");
    }
  };

  if (!isStockRectificationEnabled(dealerSlug)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-slate-600 shadow-sm">
          Stock Rectification project is not available for this dealer.
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        orders={schedule.filter((item) => slugifyDealerName(item?.Dealer) === dealerSlug)}
        selectedDealer="locked"
        onDealerSelect={() => {}}
        hideOtherDealers={true}
        currentDealerName={dealerDisplayName}
        showStats={false}
      />

      <div className="flex-1 overflow-auto">
        <div className="space-y-4 p-4 md:p-6 lg:p-8">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Stock Rectification project</h2>
              <p className="text-sm text-slate-500">
                Review current stock for {dealerDisplayName} and flag items that need correction.
              </p>
            </div>
            <div className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
              {stockRows.length} Stock Items
            </div>
          </div>

          <div className="rounded-xl border bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chassis</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Regent Production</TableHead>
                  <TableHead>Report invalid stock</TableHead>
                  <TableHead>Reported</TableHead>
                  <TableHead>Add to yard</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                      No stock records found for this dealer.
                    </TableCell>
                  </TableRow>
                ) : (
                  stockRows.map((row) => {
                    const reportEntry = rectificationByDealer[row.chassis];
                    const pendingEntry = yardPendingMap[row.chassis];
                    const reportedLabel = reportEntry
                      ? `${reportEntry.reason || "Reported"}${reportEntry.note ? ` · ${reportEntry.note}` : ""}`
                      : "—";

                    return (
                      <TableRow key={row.chassis}>
                        <TableCell className="font-medium">{row.chassis}</TableCell>
                        <TableCell>{row.model}</TableCell>
                        <TableCell>{row.customer}</TableCell>
                        <TableCell>{row.regentProduction}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-amber-500 text-amber-700 hover:bg-amber-50"
                            onClick={() => openDialog("report", row)}
                            disabled={Boolean(reportEntry)}
                          >
                            Report
                          </Button>
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">{reportedLabel}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-sky-500 text-sky-700 hover:bg-sky-50"
                            onClick={() => openDialog("yard", row)}
                            disabled={Boolean(pendingEntry)}
                          >
                            {pendingEntry ? "Pending" : "Add to yard"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogType === "report" ? "Report invalid stock" : "Add stock to yard"}
            </DialogTitle>
            <DialogDescription>
              {selectedRow
                ? `Chassis ${selectedRow.chassis} · ${dealerDisplayName}`
                : "Select a reason before submitting."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Reason</label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {RECTIFICATION_REASONS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Notes (optional)</label>
              <Textarea
                placeholder="Add any extra details for the team."
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {dialogType === "report" ? "Submit report" : "Submit add to yard"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
