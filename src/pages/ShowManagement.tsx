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

declare global {
  interface Window {
    jspdf?: any;
    jsPDF?: any;
  }
}

const loadScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    const existing = Array.from(document.querySelectorAll("script")).find((s) => s.src.includes(src));
    if (existing) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(s);
  });

const ensureJsPdf = async (): Promise<any> => {
  if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
  if (window.jsPDF) return window.jsPDF;
  await loadScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
  if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
  if (window.jsPDF) return window.jsPDF;
  throw new Error("jsPDF not available after loading");
};

let cachedLogoDataUrl: string | undefined;

const loadLogoDataUrl = async () => {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;

  try {
    const response = await fetch("/favicon.svg");
    const svgText = await response.text();
    const svgBlob = new Blob([svgText], { type: "image/svg+xml" });
    const svgUrl = URL.createObjectURL(svgBlob);

    const image = new Image();
    image.src = svgUrl;

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Failed to load logo"));
    });

    const canvas = document.createElement("canvas");
    const targetWidth = 260;
    const ratio = image.width ? targetWidth / image.width : 1;
    canvas.width = targetWidth;
    canvas.height = Math.max(120, image.height * ratio || 140);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Unable to render logo");

    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(svgUrl);

    cachedLogoDataUrl = canvas.toDataURL("image/png");
  } catch (error) {
    console.warn("Unable to embed logo in PDF", error);
  }

  return cachedLogoDataUrl;
};

const sanitizeOrderIdForBarcode = (orderId?: string | null) => {
  return (orderId || "").toUpperCase().replace(/[^0-9A-Z\-\.\/\+% ]/g, "-");
};

const code39Patterns: Record<string, string> = {
  "0": "nnnwwnwnn",
  "1": "wnnwnnnnw",
  "2": "nnwwnnnnw",
  "3": "wnwwnnnnn",
  "4": "nnnwwnnnw",
  "5": "wnnwwnnnn",
  "6": "nnwwwnnnn",
  "7": "nnnwnnwnw",
  "8": "wnnwnnwnn",
  "9": "nnwwnnwnn",
  A: "wnnnnwnnw",
  B: "nnwnnwnnw",
  C: "wnwnnwnnn",
  D: "nnnnwwnnw",
  E: "wnnnwwnnn",
  F: "nnwnwwnnn",
  G: "nnnnnwwnw",
  H: "wnnnnwwnn",
  I: "nnwnnwwnn",
  J: "nnnnwwwnn",
  K: "wnnnnnnww",
  L: "nnwnnnnww",
  M: "wnwnnnnwn",
  N: "nnnnwnnww",
  O: "wnnnwnnwn",
  P: "nnwnwnnwn",
  Q: "nnnnnnwww",
  R: "wnnnnnwwn",
  S: "nnwnnnwwn",
  T: "nnnnwnwwn",
  U: "wwnnnnnnw",
  V: "nwwnnnnnw",
  W: "wwwnnnnnn",
  X: "nwnnwnnnw",
  Y: "wwnnwnnnn",
  Z: "nwwnwnnnn",
  "-": "nwnnnnwnw",
  ".": "wwnnnnwnn",
  " ": "nwwnnnwnn",
  "$": "nwnwnwnnn",
  "/": "nwnwnnnwn",
  "+": "nwnnnwnwn",
  "%": "nnnwnwnwn",
  "*": "nwnnwnwnn",
};

type RgbColor = { r: number; g: number; b: number };

const drawBarcode = (
  doc: any,
  params: { orderId: string; x: number; y: number; height: number; barWidth?: number; color: RgbColor }
) => {
  const { orderId, x, y, height, barWidth = 1.1, color } = params;
  const cleanValue = `*${sanitizeOrderIdForBarcode(orderId)}*`;
  let cursor = x;

  doc.setFillColor(color.r, color.g, color.b);

  for (const char of cleanValue) {
    const pattern = code39Patterns[char];
    if (!pattern) continue;

    pattern.split("").forEach((token, index) => {
      const width = token === "w" ? barWidth * 3 : barWidth;
      const isBar = index % 2 === 0;
      if (isBar) {
        doc.rect(cursor, y, width, height, "F");
      }
      cursor += width;
    });

    cursor += barWidth; // inter-character gap
  }

  return cursor - x;
};

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


  const buildOrderPdf = async (params: {
    order: ShowOrder;
    show?: ShowRecord;
    dealerName: string;
    recipient: TeamMember;
  }) => {
    const { order, show, dealerName, recipient } = params;
    const JsPDF = await ensureJsPdf();
    const doc = new JsPDF("p", "pt", "a4");

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 48;
    const accent: RgbColor = { r: 33, g: 46, b: 71 };
    const softAccent: RgbColor = { r: 224, g: 237, b: 250 };
    const slate: RgbColor = { r: 64, g: 73, b: 86 };

    let cursorY = margin;

    const headerHeight = 160;
    doc.setFillColor(softAccent.r, softAccent.g, softAccent.b);
    doc.setDrawColor(accent.r, accent.g, accent.b);
    doc.setLineWidth(1.5);
    doc.roundedRect(margin, cursorY, pageWidth - margin * 2, headerHeight, 12, 12, "FD");

    const logoUrl = await loadLogoDataUrl();
    if (logoUrl) {
      const logoWidth = 150;
      const logoHeight = 90;
      const logoY = cursorY + headerHeight / 2 - logoHeight / 2;
      doc.addImage(logoUrl, "PNG", margin + 18, logoY, logoWidth, logoHeight);
    }

    const textX = margin + 200;
    const textWidth = pageWidth - textX - margin;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(accent.r, accent.g, accent.b);
    doc.setFontSize(22);
    doc.text("Snowy River", textX, cursorY + 48, { maxWidth: textWidth });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(16);
    doc.setTextColor(slate.r, slate.g, slate.b);
    doc.text("Dealer Confirmation", textX, cursorY + 74, { maxWidth: textWidth });

    doc.setFontSize(11);
    doc.text(
      "Thank you for partnering with Snowy River. This confirmation secures the approved order and prepares our team to deliver with confidence.",
      textX,
      cursorY + 98,
      { maxWidth: textWidth }
    );

    cursorY += headerHeight + 28;

    const labelSize = 11;
    const valueSize = 13;
    const rowHeight = 26;
    const detailRows: Array<[string, string]> = [
      ["Dealer", dealerName],
      ["Show", show?.name || order.showId || "Unknown show"],
      ["Salesperson", order.salesperson || recipient.memberName],
      ["Order ID", order.orderId || "Unavailable"],
      ["Status", order.status || "Pending"],
      ["Order Type", order.orderType || "Not set"],
    ];

    detailRows.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(labelSize);
      doc.setTextColor(slate.r, slate.g, slate.b);
      doc.text(label, margin, cursorY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(valueSize);
      doc.setTextColor(accent.r, accent.g, accent.b);
      doc.text(value || "", margin + 150, cursorY, { maxWidth: pageWidth - margin * 2 - 160 });
      cursorY += rowHeight;
    });

    cursorY += 18;

    const cardWidth = pageWidth - margin * 2;
    const cardHeight = 220;
    const cardY = cursorY;
    doc.setDrawColor(softAccent.r, softAccent.g, softAccent.b);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, cardY, cardWidth, cardHeight, 12, 12, "FD");

    const badgeY = cardY + 20;
    doc.setFillColor(softAccent.r, softAccent.g, softAccent.b);
    doc.roundedRect(margin + 18, badgeY, 180, 28, 6, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(accent.r, accent.g, accent.b);
    doc.text("Snowy River Show Team", margin + 28, badgeY + 19);

    const preparedY = badgeY + 44;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(slate.r, slate.g, slate.b);
    doc.text("Prepared for", margin + 18, preparedY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(valueSize);
    doc.setTextColor(accent.r, accent.g, accent.b);
    doc.text(recipient.memberName, margin + 18, preparedY + 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(slate.r, slate.g, slate.b);
    doc.text(recipient.email || "", margin + 18, preparedY + 32);

    let infoY = cardY + 120;
    const infoX = margin + 18;
    const valueX = margin + 150;
    const lineHeight = 14;

    const drawInfoRow = (label: string, value: string) => {
      const lines = doc.splitTextToSize(value || "", cardWidth - 170);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(labelSize);
      doc.setTextColor(slate.r, slate.g, slate.b);
      doc.text(label, infoX, infoY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(valueSize);
      doc.setTextColor(accent.r, accent.g, accent.b);
      doc.text(lines, valueX, infoY, { maxWidth: cardWidth - 170 });
      infoY += Math.max(rowHeight, lines.length * lineHeight) + 6;
    };

    drawInfoRow("Model", order.model || "Not set");
    drawInfoRow("Date", order.date || "Not set");
    drawInfoRow("Chassis", order.chassisNumber || "Not recorded");
    drawInfoRow("Dealer Notes", order.dealerNotes || "No additional notes");

    cursorY = cardY + cardHeight + 32;

    const barcodeY = cursorY;
    const barcodeWidth = drawBarcode(doc, {
      orderId: order.orderId || "Unknown",
      x: margin,
      y: barcodeY,
      height: 48,
      barWidth: 1.05,
      color: accent,
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(slate.r, slate.g, slate.b);
    doc.text(sanitizeOrderIdForBarcode(order.orderId), margin, barcodeY - 18);

    const panelX = margin + barcodeWidth + 20;
    const panelWidth = pageWidth - margin * 2 - barcodeWidth - 26;
    const panelHeight = 84;
    doc.setFillColor(softAccent.r, softAccent.g, softAccent.b);
    doc.roundedRect(panelX, barcodeY - 10, panelWidth, panelHeight, 10, 10, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(accent.r, accent.g, accent.b);
    doc.text("Delivery readiness", panelX + 12, barcodeY + 48);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(slate.r, slate.g, slate.b);
    doc.text(
      "Approved dealer confirmation locks in the chassis, options, and schedule.",
      panelX + 12,
      barcodeY + 30,
      { maxWidth: panelWidth - 24 }
    );
    doc.text(
      "Our Snowy River team will now prepare the next steps and keep you informed.",
      panelX + 12,
      barcodeY + 14,
      { maxWidth: panelWidth - 24 }
    );

    return doc.output("datauristring");
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

      const pdfAttachment = await buildOrderPdf({
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
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to confirm order: ${message}`);
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
