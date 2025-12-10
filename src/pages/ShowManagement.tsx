import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Sidebar from "@/components/Sidebar";
import { prettifyDealerName, normalizeDealerSlug } from "@/lib/dealerUtils";
import { dealerNameToSlug } from "@/lib/firebase";
import {
  fetchShowOrderById,
  fetchTeamMembers,
  subscribeToShows,
  subscribeToShowOrders,
  updateShowOrder,
} from "@/lib/showDatabase";
import { sendDealerConfirmationEmail } from "@/lib/email";
import type { ShowOrder } from "@/types/showOrder";
import type { ShowRecord } from "@/types/show";
import type { TeamMember } from "@/types/teamMember";
import { CheckCircle2, Clock3 } from "lucide-react";

export default function ShowManagement() {
  const { dealerSlug: rawDealerSlug } = useParams<{ dealerSlug: string }>();
  const dealerSlug = normalizeDealerSlug(rawDealerSlug);
  const dealerDisplayName = prettifyDealerName(dealerSlug);

  const [orders, setOrders] = useState<ShowOrder[]>([]);
  const [shows, setShows] = useState<ShowRecord[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [showsLoading, setShowsLoading] = useState(true);
  const [teamMembersLoading, setTeamMembersLoading] = useState(true);
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);
  const [chassisDrafts, setChassisDrafts] = useState<Record<string, string>>({});
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  useEffect(() => {
    const unsub = subscribeToShowOrders((data) => {
      setOrders(data);
      setOrdersLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeToShows((data) => {
      setShows(data);
      setShowsLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const loadTeamMembers = async () => {
      try {
        const data = await fetchTeamMembers();
        setTeamMembers(data);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load team members");
      } finally {
        setTeamMembersLoading(false);
      }
    };

    void loadTeamMembers();
  }, []);

  const showMap = useMemo(() => {
    const map: Record<string, ShowRecord> = {};
    shows.forEach((show) => {
      if (show.id) {
        map[show.id] = show;
      }
    });
    return map;
  }, [shows]);

  const getShowDealerSlug = (show?: ShowRecord) => {
    const preferredDealer = (show?.handoverDealer ?? "").trim();
    const fallbackDealer = (show?.dealership ?? "").trim();
    return dealerNameToSlug(preferredDealer || fallbackDealer);
  };

  const ordersForDealer = useMemo(() => {
    return orders.filter((order) => {
      if (!order.orderId) return false;
      const show = showMap[order.showId];
      const showDealerSlug = normalizeDealerSlug(getShowDealerSlug(show));
      return !!showDealerSlug && showDealerSlug === dealerSlug;
    });
  }, [dealerSlug, orders, showMap]);

  const pendingConfirmationCount = useMemo(
    () => ordersForDealer.filter((order) => !order.dealerConfirm).length,
    [ordersForDealer]
  );

  const findSalesperson = (name?: string | null) => {
    if (!name) return null;
    const normalizedName = name.trim().toLowerCase();
    return teamMembers.find((member) => member.memberName.trim().toLowerCase() === normalizedName) || null;
  };

  const escapePdfText = (value: string) => value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  const buildOrderPdf = (params: { order: ShowOrder; show?: ShowRecord; dealerName: string; recipient: TeamMember }) => {
    const { order, show, dealerName, recipient } = params;
    const lines = [
      "Dealer Confirmation",
      `Dealer: ${dealerName}`,
      `Show: ${show?.name || order.showId || "Unknown show"}`,
      `Salesperson: ${order.salesperson || recipient.memberName}`,
      `Order ID: ${order.orderId}`,
      `Status: ${order.status || "Pending"}`,
      `Model: ${order.model || "Not set"}`,
      `Order Type: ${order.orderType || "Not set"}`,
      `Date: ${order.date || "Not set"}`,
      `Chassis: ${order.chassisNumber || "Not recorded"}`,
    ];

    const contentLines = lines.map((line, index) => `${index === 0 ? "" : "T*\n"}(${escapePdfText(line)}) Tj`).join("\n");

    const contentStream = `BT\n/F1 18 Tf\n50 760 Td\n20 TL\n${contentLines}\nET`;
    const encoder = new TextEncoder();
    const contentLength = encoder.encode(contentStream).length;

    const objects = [
      "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n",
      "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n",
      "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n",
      `4 0 obj<< /Length ${contentLength} >>stream\n${contentStream}\nendstream\nendobj\n`,
      "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n",
    ];

    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [];
    let currentOffset = encoder.encode(pdf).length;

    objects.forEach((obj) => {
      offsets.push(currentOffset);
      pdf += obj;
      currentOffset += encoder.encode(obj).length;
    });

    const xrefStart = currentOffset;
    pdf += "xref\n0 6\n0000000000 65535 f \n";
    offsets.forEach((offset) => {
      pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
    });
    pdf += "trailer<< /Size 6 /Root 1 0 R >>\nstartxref\n";
    pdf += `${xrefStart}\n%%EOF`;

    const bytes = encoder.encode(pdf);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });

    const base64 = btoa(binary);
    return `data:application/pdf;base64,${base64}`;
  };

  const handleConfirm = async (order: ShowOrder) => {
    setSavingOrderId(order.orderId);
    try {
      const latestOrder = await fetchShowOrderById(order.orderId);
      if (!latestOrder) {
        toast.error("Unable to find this order in the database");
        return;
      }

      if ((latestOrder.status || "").toLowerCase() !== "approved") {
        toast.error("Order must be approved before dealer confirmation");
        return;
      }

      if (teamMembersLoading) {
        toast.error("Team member list is still loading. Please try again in a moment.");
        return;
      }

      const salesperson = findSalesperson(latestOrder.salesperson);
      if (!salesperson?.email) {
        toast.error("Unable to find the salesperson's email in team members");
        return;
      }

      const pdfAttachment = buildOrderPdf({
        order: latestOrder,
        show: showMap[latestOrder.showId],
        dealerName: dealerDisplayName,
        recipient: salesperson,
      });

      await sendDealerConfirmationEmail({
        teamMember: salesperson,
        order: latestOrder,
        show: showMap[latestOrder.showId],
        dealerName: dealerDisplayName,
        pdfAttachment,
      });

      await updateShowOrder(order.orderId, { dealerConfirm: true });
      toast.success("Order confirmed and notification sent");
    } catch (error) {
      console.error(error);
      toast.error("Failed to confirm order");
    } finally {
      setSavingOrderId(null);
    }
  };

  const handleChassisSave = async (order: ShowOrder) => {
    const chassisNumber = chassisDrafts[order.orderId] ?? order.chassisNumber ?? "";
    setSavingOrderId(order.orderId);
    try {
      await updateShowOrder(order.orderId, { chassisNumber });
      toast.success("Chassis number updated");
    } catch (error) {
      console.error(error);
      toast.error("Failed to update chassis number");
    } finally {
      setSavingOrderId(null);
    }
  };

  const isLoading = ordersLoading || showsLoading;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        orders={[]}
        selectedDealer={dealerDisplayName}
        onDealerSelect={() => {}}
        hideOtherDealers
        currentDealerName={dealerDisplayName}
        showStats={false}
        showManagementPending={pendingConfirmationCount}
      />

      <main className="flex-1 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">Show Management</h1>
          <p className="text-slate-600">Manage show orders assigned to {dealerDisplayName}.</p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Orders</CardTitle>
            <Badge variant="outline" className="text-slate-700">
              Pending dealer confirmations: {pendingConfirmationCount}
            </Badge>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center gap-2 text-slate-600">
                <Clock3 className="h-4 w-4 animate-spin" /> Loading orders...
              </div>
            ) : ordersForDealer.length === 0 ? (
              <div className="py-10 text-center text-slate-500">No show orders found.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[1100px] text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-semibold">Order ID</TableHead>
                      <TableHead className="font-semibold">Show</TableHead>
                      <TableHead className="font-semibold">Show Dealer Slug</TableHead>
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="font-semibold">Model</TableHead>
                      <TableHead className="font-semibold">Salesperson</TableHead>
                      <TableHead className="font-semibold">Order Type</TableHead>
                      <TableHead className="font-semibold">Show Manager Confirmation</TableHead>
                      <TableHead className="font-semibold">Dealer Confirmation</TableHead>
                      <TableHead className="font-semibold">Chassis Number</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ordersForDealer.map((order) => {
                      const show = showMap[order.showId];
                      const showDealerSlug = getShowDealerSlug(show);
                      const normalizedShowDealerSlug = normalizeDealerSlug(showDealerSlug);
                      const chassisValue = chassisDrafts[order.orderId] ?? order.chassisNumber ?? "";
                      return (
                        <TableRow key={order.orderId}>
                          <TableCell className="font-semibold text-slate-900">{order.orderId}</TableCell>
                          <TableCell>{show?.name || order.showId || "Unknown show"}</TableCell>
                          <TableCell className="text-slate-700">{normalizedShowDealerSlug || "-"}</TableCell>
                          <TableCell>{order.date || "-"}</TableCell>
                          <TableCell>{order.model || "-"}</TableCell>
                          <TableCell>{order.salesperson || "-"}</TableCell>
                          <TableCell>{order.orderType || "-"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="bg-slate-100 text-slate-800">
                                {order.status || "Pending"}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            {order.dealerConfirm ? (
                              <div className="flex items-center gap-2 text-emerald-700">
                                <CheckCircle2 className="h-4 w-4" /> Confirmed
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => handleConfirm(order)}
                                disabled={savingOrderId === order.orderId}
                                className="h-8 rounded px-2 text-xs bg-emerald-600 hover:bg-emerald-700"
                              >
                                {savingOrderId === order.orderId ? "Saving..." : "Order confirmation"}
                              </Button>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Input
                                value={chassisValue}
                                onChange={(e) =>
                                  setChassisDrafts((prev) => ({ ...prev, [order.orderId]: e.target.value }))
                                }
                                placeholder="Enter chassis number"
                                className="w-48"
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleChassisSave(order)}
                                disabled={savingOrderId === order.orderId}
                              >
                                {savingOrderId === order.orderId ? "Saving..." : "Save"}
                              </Button>
                            </div>
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
      </main>
    </div>
  );
}
