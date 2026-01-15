import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Sidebar from "@/components/Sidebar";
import { prettifyDealerName, normalizeDealerSlug } from "@/lib/dealerUtils";
import { dealerNameToSlug, subscribeShowDealerMappings } from "@/lib/firebase";
import {
  fetchShowOrderById,
  fetchTeamMembers,
  formatShowDate,
  parseFlexibleDateToDate,
  subscribeToShows,
  subscribeToShowOrders,
  subscribeToShowTasks,
  updateShowOrder,
  updateShowTask,
} from "@/lib/showDatabase";
import { sendDealerConfirmationEmail } from "@/lib/email";
import type { ShowOrder } from "@/types/showOrder";
import type { ShowRecord } from "@/types/show";
import type { TeamMember } from "@/types/teamMember";
import type { ShowTask } from "@/types/showTask";
import type { ShowDealerMapping } from "@/lib/firebase";
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

const TASK_STATUS_OPTIONS = [
  { label: "Not Started", value: "Not Started" },
  { label: "In Progress", value: "In Progress" },
  { label: "Done", value: "Done" },
] as const;

const normalizeTaskStatus = (status?: string | null) => {
  if (!status) return "";
  const normalized = status.trim().toLowerCase();
  if (normalized === "not started" || normalized === "not_started" || normalized === "notstarted") {
    return "Not Started";
  }
  if (normalized === "in progress" || normalized === "in_progress" || normalized === "inprogress") {
    return "In Progress";
  }
  if (normalized === "done" || normalized === "finished" || normalized === "complete" || normalized === "completed") {
    return "Done";
  }
  return status.trim();
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

const estimateCode39Width = (orderId: string, barWidth: number) => {
  const cleanValue = `*${sanitizeOrderIdForBarcode(orderId)}*`;
  let total = 0;

  for (const char of cleanValue) {
    const pattern = code39Patterns[char];
    if (!pattern) continue;

    pattern.split("").forEach((token) => {
      const width = token === "w" ? barWidth * 3 : barWidth;
      total += width;
    });

    total += barWidth; // inter-character gap
  }

  return total;
};

const pickBarcodeBarWidth = (orderId: string, maxWidth: number) => {
  let bw = 1.0;
  while (bw > 0.6 && estimateCode39Width(orderId, bw) > maxWidth) {
    bw -= 0.05;
  }
  return Math.max(0.6, bw);
};

const drawBarcode = (
  doc: any,
  params: { orderId: string; x: number; y: number; height: number; barWidth?: number; color: RgbColor }
) => {
  const { orderId, x, y, height, barWidth = 1.0, color } = params;
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
  const { dealerSlug: rawDealerSlug, section } = useParams<{ dealerSlug: string; section?: string }>();
  const dealerSlug = normalizeDealerSlug(rawDealerSlug);
  const dealerDisplayName = prettifyDealerName(dealerSlug);

  const [orders, setOrders] = useState<ShowOrder[]>([]);
  const [shows, setShows] = useState<ShowRecord[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [showsLoading, setShowsLoading] = useState(true);
  const [mappingsLoading, setMappingsLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<ShowOrder | null>(null);
  const [teamMembersLoading, setTeamMembersLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [chassisDrafts, setChassisDrafts] = useState<Record<string, string>>({});
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [showMappings, setShowMappings] = useState<Record<string, ShowDealerMapping>>({});
  const [showTasks, setShowTasks] = useState<ShowTask[]>([]);

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
    const unsub = subscribeShowDealerMappings((data) => {
      setShowMappings(data || {});
      setMappingsLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeToShowTasks((data) => {
      setShowTasks(data);
      setTasksLoading(false);
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

  const stringifyDisplayField = (value: unknown) => {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value).trim();
    }
    if (value && typeof value === "object") {
      const combined = Object.values(value as Record<string, unknown>)
        .filter((part) => typeof part === "string" && part.trim())
        .join(", ");
      return combined.trim();
    }
    return "";
  };

  const stringifyDealerField = (value: unknown) => stringifyDisplayField(value);

  const formatCurrency = (value?: number | null) => {
    if (value == null || Number.isNaN(value)) return "";
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);
  };

  const stripHtmlTags = (value?: string | null) => {
    if (!value) return "";
    if (typeof window !== "undefined" && "DOMParser" in window) {
      const parsed = new DOMParser().parseFromString(value, "text/html");
      return parsed.body.textContent?.trim() || "";
    }
    return value.replace(/<[^>]*>/g, "").trim();
  };

  const getShowDealerSlug = (show?: ShowRecord) => {
    const preferredDealer = stringifyDealerField(show?.handoverDealer);
    const fallbackDealer = stringifyDealerField(show?.dealership);
    return dealerNameToSlug(preferredDealer || fallbackDealer);
  };

  const resolveShowDealer = useCallback(
    (show?: ShowRecord) => {
      if (!show) return { slug: "", source: "none" as const };

      const mappingKey = dealerNameToSlug(stringifyDealerField(show.dealership));
      const mappedSlug = mappingKey && showMappings[mappingKey]?.dealerSlug;
      if (mappedSlug) {
        return { slug: normalizeDealerSlug(mappedSlug), source: "mapping" as const };
      }

      const inferredSlug = normalizeDealerSlug(getShowDealerSlug(show));
      if (inferredSlug) {
        return { slug: inferredSlug, source: "inferred" as const };
      }

      return { slug: "", source: "none" as const };
    },
    [showMappings]
  );

  const ordersForDealer = useMemo(() => {
    return orders.filter((order) => {
      if (!order.orderId) return false;
      const show = showMap[order.showId];
      const showDealerSlug = resolveShowDealer(show).slug;
      return !!showDealerSlug && showDealerSlug === dealerSlug;
    });
  }, [dealerSlug, orders, resolveShowDealer, showMap]);

  const showsWithMatch = useMemo(() => {
    return shows
      .map((show) => {
        const mappingKey = dealerNameToSlug(stringifyDealerField(show.dealership));
        const mappedSlug = mappingKey ? showMappings[mappingKey]?.dealerSlug || "" : "";
        const startDate = parseFlexibleDateToDate(show.startDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const finishDate = parseFlexibleDateToDate(show.finishDate)?.getTime() ?? startDate;

        return {
          show,
          startDate,
          finishDate,
          mappedSlug: mappedSlug ? normalizeDealerSlug(mappedSlug) : "",
        };
      })
      .filter((item) => item.mappedSlug && item.mappedSlug === dealerSlug)
      .sort((a, b) => a.startDate - b.startDate);
  }, [dealerSlug, showMappings, shows]);

  const tasksByShowId = useMemo(() => {
    const grouped: Record<string, ShowTask[]> = {};
    showTasks.forEach((task) => {
      if (!task.eventId) return;
      if (!grouped[task.eventId]) {
        grouped[task.eventId] = [];
      }
      grouped[task.eventId].push(task);
    });
    return grouped;
  }, [showTasks]);

  const pendingConfirmationCount = useMemo(
    () => ordersForDealer.filter((order) => !order.dealerConfirm).length,
    [ordersForDealer]
  );

  const findSalesperson = (name?: string | null) => {
    if (!name) return null;
    const normalizedName = name.trim().toLowerCase();
    return teamMembers.find((member) => member.memberName.trim().toLowerCase() === normalizedName) || null;
  };

  const handleTaskStatusChange = async (task: ShowTask, status: string) => {
    if (!task.id) return;
    setSavingTaskId(task.id);
    try {
      await updateShowTask(task.id, { status });
      toast.success("Task status updated.");
    } catch (error) {
      console.error(error);
      toast.error("Failed to update task status.");
    } finally {
      setSavingTaskId(null);
    }
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
    const lightSlate: RgbColor = { r: 120, g: 130, b: 145 };

    let cursorY = margin;

    const ensureSpace = (heightNeeded: number) => {
      if (cursorY + heightNeeded > pageHeight - margin) {
        doc.addPage();
        cursorY = margin;
      }
    };

    // ---------------------------
    // Header (更稳的视觉结构)
    // ---------------------------
    const headerHeight = 150;
    ensureSpace(headerHeight + 10);

    doc.setFillColor(softAccent.r, softAccent.g, softAccent.b);
    doc.setDrawColor(accent.r, accent.g, accent.b);
    doc.setLineWidth(1.2);
    doc.roundedRect(margin, cursorY, pageWidth - margin * 2, headerHeight, 12, 12, "FD");

    const logoUrl = await loadLogoDataUrl();
    if (logoUrl) {
      const logoWidth = 130;
      const logoHeight = 78;
      const logoX = margin + 18;
      const logoY = cursorY + headerHeight / 2 - logoHeight / 2;
      doc.addImage(logoUrl, "PNG", logoX, logoY, logoWidth, logoHeight);
    }

    const headerTextX = margin + 170;
    const headerTextWidth = pageWidth - headerTextX - margin;

    doc.setFont("helvetica", "bold");
    doc.setTextColor(accent.r, accent.g, accent.b);
    doc.setFontSize(22);
    doc.text("Snowy River", headerTextX, cursorY + 46, { maxWidth: headerTextWidth });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(15);
    doc.setTextColor(slate.r, slate.g, slate.b);
    doc.text("Show Commission Proof", headerTextX, cursorY + 72, { maxWidth: headerTextWidth });

    doc.setFontSize(10.5);
    doc.setTextColor(lightSlate.r, lightSlate.g, lightSlate.b);
    doc.text(
      "This document confirms the approved show order for dealer acknowledgement and next-step preparation.",
      headerTextX,
      cursorY + 98,
      { maxWidth: headerTextWidth }
    );

    cursorY += headerHeight + 26;

    // ---------------------------
    // Key-Value detail block
    // ---------------------------
    const detailRows: Array<[string, string]> = [
      ["Dealer", dealerName],
      ["Show", show?.name || order.showId || "Unknown show"],
      ["Salesperson", order.salesperson || recipient.memberName],
      ["Order ID", order.orderId || "Unavailable"],
      ["Status", order.status || "Pending"],
      ["Order Type", order.orderType || "Not set"],
    ];

    const labelX = margin;
    const valueX = margin + 150;
    const labelSize = 11;
    const valueSize = 12.5;
    const rowHeight = 24;
    const valueMaxWidth = pageWidth - margin * 2 - 150;

    ensureSpace(detailRows.length * rowHeight + 12);

    detailRows.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(labelSize);
      doc.setTextColor(slate.r, slate.g, slate.b);
      doc.text(label, labelX, cursorY);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(valueSize);
      doc.setTextColor(accent.r, accent.g, accent.b);
      const lines = doc.splitTextToSize(value || "", valueMaxWidth);
      doc.text(lines, valueX, cursorY, { maxWidth: valueMaxWidth });

      cursorY += Math.max(rowHeight, lines.length * 14);
    });

    cursorY += 16;

    // ---------------------------
    // "Prepared for" card (只放核心字段，避免溢出)
    // ---------------------------
    const cardPadding = 18;
    const cardWidth = pageWidth - margin * 2;
    const badgeHeight = 26;

    const coreInfo = [
      ["Model", order.model || "Not set"],
      ["Date", order.date || "Not set"],
      ["Chassis", order.chassisNumber || "Not recorded"],
    ];

    // 估算 card 高度
    const infoLabelWidth = 110;
    const infoValueWidth = cardWidth - cardPadding * 2 - infoLabelWidth - 10;
    const infoLineHeight = 14;

    // 顶部区域（badge + prepared-for）
    const topBlockHeight = 90;

    let infoBlockHeight = 0;
    coreInfo.forEach(([, value]) => {
      const lines = doc.splitTextToSize(value || "", infoValueWidth);
      const h = Math.max(22, lines.length * infoLineHeight);
      infoBlockHeight += h + 6;
    });

    const cardHeight = Math.max(180, topBlockHeight + infoBlockHeight + 16);

    ensureSpace(cardHeight + 10);

    const cardY = cursorY;
    doc.setDrawColor(softAccent.r, softAccent.g, softAccent.b);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, cardY, cardWidth, cardHeight, 12, 12, "FD");

    // badge
    const badgeY = cardY + cardPadding;
    doc.setFillColor(softAccent.r, softAccent.g, softAccent.b);
    doc.roundedRect(margin + cardPadding, badgeY, 190, badgeHeight, 6, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(accent.r, accent.g, accent.b);
    doc.text("Snowy River Show Team", margin + cardPadding + 10, badgeY + 18);

    // prepared for
    const preparedY = badgeY + badgeHeight + 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(slate.r, slate.g, slate.b);
    doc.text("Prepared for", margin + cardPadding, preparedY);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.5);
    doc.setTextColor(accent.r, accent.g, accent.b);
    doc.text(recipient.memberName || "Salesperson", margin + cardPadding, preparedY + 18);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.8);
    doc.setTextColor(lightSlate.r, lightSlate.g, lightSlate.b);
    doc.text(recipient.email || "", margin + cardPadding, preparedY + 34);

    // core info rows
    let infoY = cardY + topBlockHeight + 20;
    const infoX = margin + cardPadding;
    const infoValueX = infoX + infoLabelWidth + 10;

    coreInfo.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(slate.r, slate.g, slate.b);
      doc.text(label, infoX, infoY);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.setTextColor(accent.r, accent.g, accent.b);
      const lines = doc.splitTextToSize(value || "", infoValueWidth);
      doc.text(lines, infoValueX, infoY);

      infoY += Math.max(22, lines.length * infoLineHeight) + 6;
    });

    cursorY = cardY + cardHeight + 22;

    // ---------------------------
    // Dealer Notes block (单独处理，最防重叠)
    // ---------------------------
    const notesText = (order.dealerNotes || "").trim();
    if (notesText) {
      const notesTitleHeight = 18;
      const notesBoxPadding = 14;
      const notesMaxWidth = pageWidth - margin * 2 - notesBoxPadding * 2;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11.5);
      const notesLines = doc.splitTextToSize(notesText, notesMaxWidth);
      const notesBodyHeight = notesLines.length * 14;

      const notesBoxHeight = notesTitleHeight + notesBodyHeight + notesBoxPadding * 2 + 8;

      ensureSpace(notesBoxHeight + 8);

      const boxY = cursorY;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(softAccent.r, softAccent.g, softAccent.b);
      doc.roundedRect(margin, boxY, pageWidth - margin * 2, notesBoxHeight, 10, 10, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(slate.r, slate.g, slate.b);
      doc.text("Dealer Notes", margin + notesBoxPadding, boxY + notesBoxPadding + 10);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.8);
      doc.setTextColor(accent.r, accent.g, accent.b);
      doc.text(
        notesLines,
        margin + notesBoxPadding,
        boxY + notesBoxPadding + 28,
        { maxWidth: notesMaxWidth }
      );

      cursorY += notesBoxHeight + 20;
    }

    // ---------------------------
    // Compact barcode footer
    // ---------------------------
    const footerHeight = 70;
    ensureSpace(footerHeight);

    // subtle divider line
    doc.setDrawColor(230, 235, 242);
    doc.setLineWidth(1);
    doc.line(margin, cursorY, pageWidth - margin, cursorY);
    cursorY += 14;

    const orderIdText = sanitizeOrderIdForBarcode(order.orderId);
    const barcodeHeight = 26; // 更紧凑，避免抢占右下角空间
    const footerAvailableWidth = pageWidth - margin * 2;

    const maxBarcodeWidth = Math.min(220, footerAvailableWidth * 0.4);
    const chosenBarWidth = pickBarcodeBarWidth(order.orderId || "Unknown", maxBarcodeWidth);

    // 左侧条码
    const barcodeX = margin;
    const barcodeY = cursorY + 10;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(slate.r, slate.g, slate.b);
    doc.text(orderIdText || "", barcodeX, cursorY);

    const barcodeWidth = drawBarcode(doc, {
      orderId: order.orderId || "Unknown",
      x: barcodeX,
      y: barcodeY,
      height: barcodeHeight,
      barWidth: chosenBarWidth,
      color: accent,
    });

    // 右侧更小的提示 panel
    const panelX = barcodeX + Math.min(barcodeWidth, maxBarcodeWidth) + 18;
    const panelWidth = pageWidth - margin - panelX;
    const panelHeight = 44;

    doc.setFillColor(softAccent.r, softAccent.g, softAccent.b);
    doc.roundedRect(panelX, barcodeY - 2, panelWidth, panelHeight, 8, 8, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(accent.r, accent.g, accent.b);
    doc.text("Attach to Concur commission request", panelX + 10, barcodeY + 18);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.2);
    doc.setTextColor(slate.r, slate.g, slate.b);
    doc.text("Use this confirmation as the supporting document.", panelX + 10, barcodeY + 32, {
      maxWidth: panelWidth - 20,
    });

    // ---------------------------
    // Done
    // ---------------------------
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

      const isApproved = (latestOrder.status || "").toLowerCase() === "approved";

      let emailSent = false;

      if (isApproved) {
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

        emailSent = true;
      }

      await updateShowOrder(order.orderId, { dealerConfirm: true });

      if (emailSent) {
        toast.success("Order confirmed and notification sent");
      } else {
        toast.success("Order confirmed (email not sent because order is not approved)");
      }
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

  const showListLoading = showsLoading || mappingsLoading || tasksLoading;
  const isLoading = ordersLoading || showsLoading || mappingsLoading;

  if (!section) {
    return <Navigate to={`/dealer/${dealerSlug}/show-management/tasks`} replace />;
  }

  const view = section === "orders" ? "orders" : "tasks";
  const selectedShow = selectedOrder ? showMap[selectedOrder.showId] : undefined;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        orders={[]}
        selectedDealer={dealerDisplayName}
        onDealerSelect={() => {}}
        hideOtherDealers
        currentDealerName={dealerDisplayName}
        showStats={false}
      />

      <main className="flex-1 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">Show Management</h1>
          <p className="text-slate-600">Manage show orders assigned to {dealerDisplayName}.</p>
        </div>

        {view === "tasks" && (
          <Card className="mb-6">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-lg">Show lineup for {dealerDisplayName}</CardTitle>
              <p className="text-sm text-slate-600">
                Shows are filtered by their <code>showDealerMappings</code> slug and display their related tasks. Each row
                surfaces the schedule alongside tasks pulled from <code>showTasks</code>.
              </p>
            </div>
            <Badge variant="secondary" className="px-3 py-1 text-sm">
              {showsWithMatch.length} shows
            </Badge>
          </CardHeader>
          <CardContent>
            {showListLoading ? (
              <div className="flex items-center gap-2 text-slate-600">
                <Clock3 className="h-4 w-4 animate-spin" /> Loading shows...
              </div>
            ) : showsWithMatch.length === 0 ? (
              <div className="py-8 text-center text-slate-500">No shows available.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[840px] text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-semibold">Show</TableHead>
                      <TableHead className="font-semibold">Schedule</TableHead>
                      <TableHead className="font-semibold">Tasks</TableHead>
                      <TableHead className="font-semibold text-right">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {showsWithMatch.map(({ show }) => {
                      const tasksForShow = tasksByShowId[show.id] || [];
                      return (
                        <TableRow key={show.id || show.name}>
                          <TableCell className="font-semibold text-slate-900">
                            <div className="space-y-0.5">
                              <div>{stringifyDisplayField(show.name) || "Untitled show"}</div>
                              {stringifyDisplayField(show.siteLocation) && (
                                <div className="text-xs text-slate-500">{stringifyDisplayField(show.siteLocation)}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium text-slate-900">{formatShowDate(show.startDate)}</div>
                              <div className="text-xs text-slate-500">to {formatShowDate(show.finishDate)}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {tasksLoading ? (
                              <div className="flex items-center gap-2 text-slate-600">
                                <Clock3 className="h-4 w-4 animate-spin" /> Loading tasks...
                              </div>
                            ) : tasksForShow.length === 0 ? (
                              <div className="text-slate-500">No tasks for this show.</div>
                            ) : (
                              <div className="space-y-2">
                                {tasksForShow.map((task) => (
                                  <div key={task.id} className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="space-y-1">
                                        <div className="font-medium text-slate-900">
                                          {stringifyDisplayField(task.taskName) || task.id}
                                        </div>
                                        {(stringifyDisplayField(task.dueDate) || stringifyDisplayField(task.assignedTo)) && (
                                          <div className="text-xs text-slate-500">
                                            {[stringifyDisplayField(task.dueDate), stringifyDisplayField(task.assignedTo)]
                                              .filter(Boolean)
                                              .join(" • ")}
                                          </div>
                                        )}
                                        {stringifyDisplayField(task.notes) && (
                                          <div className="text-xs text-slate-500">{stringifyDisplayField(task.notes)}</div>
                                        )}
                                      </div>
                                      <Select
                                        value={normalizeTaskStatus(task.status) || undefined}
                                        onValueChange={(value) => handleTaskStatusChange(task, value)}
                                        disabled={savingTaskId === task.id}
                                      >
                                        <SelectTrigger className="w-40 self-start">
                                          <SelectValue placeholder="Select status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {TASK_STATUS_OPTIONS.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                              {option.label}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="space-y-1">
                              {stringifyDisplayField(show.status) && (
                                <div className="text-sm font-medium text-slate-900">{stringifyDisplayField(show.status)}</div>
                              )}
                              {(stringifyDisplayField(show.eventOrganiser) || stringifyDisplayField(show.standSize)) && (
                                <div className="text-xs text-slate-500">
                                  {[stringifyDisplayField(show.eventOrganiser), stringifyDisplayField(show.standSize)]
                                    .filter(Boolean)
                                    .join(" • ")}
                                </div>
                              )}
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
        )}

        {view === "orders" && (
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
                      <TableHead className="font-semibold">Customer</TableHead>
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="font-semibold">Model</TableHead>
                      <TableHead className="font-semibold">Salesperson</TableHead>
                      <TableHead className="font-semibold">Order Type</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="font-semibold">Dealer Confirmation</TableHead>
                      <TableHead className="font-semibold">Chassis Number</TableHead>
                      <TableHead className="font-semibold">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ordersForDealer.map((order) => {
                      const show = showMap[order.showId];
                      const isCancelled = (order.status || "").toLowerCase() === "cancelled";
                      const chassisValue = chassisDrafts[order.orderId] ?? order.chassisNumber ?? "";
                      return (
                        <TableRow key={order.orderId}>
                          <TableCell className="font-semibold text-slate-900">{order.orderId}</TableCell>
                          <TableCell>
                            {stringifyDisplayField(show?.name) || order.showId || "Unknown show"}
                          </TableCell>
                          <TableCell className="text-slate-700">{stringifyDisplayField(order.customerName) || "-"}</TableCell>
                          <TableCell>{stringifyDisplayField(order.date) || "-"}</TableCell>
                          <TableCell>{stringifyDisplayField(order.model) || "-"}</TableCell>
                          <TableCell>{stringifyDisplayField(order.salesperson) || "-"}</TableCell>
                          <TableCell>{stringifyDisplayField(order.orderType) || "-"}</TableCell>
                          <TableCell>
                            <div className={isCancelled ? "text-rose-600 font-medium" : "text-slate-700"}>
                              {isCancelled ? "Cancelled by show manager" : stringifyDisplayField(order.status) || "Pending"}
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
                                {savingOrderId === order.orderId ? "Saving..." : "Dealership Confirmation"}
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
                          <TableCell>
                            <Button variant="outline" size="sm" onClick={() => setSelectedOrder(order)}>
                              View details
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
              <DialogContent className="max-w-4xl">
                <DialogHeader>
                  <DialogTitle>Order details</DialogTitle>
                  <DialogDescription>
                    {selectedShow?.name || selectedOrder?.showId || "Unknown show"} •{" "}
                    {stringifyDisplayField(selectedOrder?.customerName) || "Unnamed customer"}
                  </DialogDescription>
                </DialogHeader>
                {selectedOrder && (
                  <div className="space-y-6">
                    {(selectedOrder.status || "").toLowerCase() === "cancelled" && (
                      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        Cancelled by show manager.
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                      <div>
                        <div className="text-xs font-semibold uppercase text-slate-500">Order ID</div>
                        <div className="font-medium text-slate-900">{selectedOrder.orderId || "-"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase text-slate-500">Status</div>
                        <div className="font-medium text-slate-900">{selectedOrder.status || "Pending"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase text-slate-500">Order Type</div>
                        <div className="font-medium text-slate-900">{selectedOrder.orderType || "-"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase text-slate-500">Contract Number</div>
                        <div className="font-medium text-slate-900">{selectedOrder.contractNumber || "-"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase text-slate-500">Contract Value</div>
                        <div className="font-medium text-slate-900">
                          {formatCurrency(selectedOrder.contractValue) || "-"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase text-slate-500">Customer</div>
                        <div className="font-medium text-slate-900">{selectedOrder.customerName || "-"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase text-slate-500">Salesperson</div>
                        <div className="font-medium text-slate-900">{selectedOrder.salesperson || "-"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase text-slate-500">Date</div>
                        <div className="font-medium text-slate-900">{selectedOrder.date || "-"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase text-slate-500">Model</div>
                        <div className="font-medium text-slate-900">{selectedOrder.model || "-"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase text-slate-500">Chassis Number</div>
                        <div className="font-medium text-slate-900">{selectedOrder.chassisNumber || "-"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase text-slate-500">Handover Dealer</div>
                        <div className="font-medium text-slate-900">{selectedOrder.handoverDealer || "-"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase text-slate-500">Approved By</div>
                        <div className="font-medium text-slate-900">{selectedOrder.approvedBy || "-"}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase text-slate-500">Cancelled By</div>
                        <div className="font-medium text-slate-900">{selectedOrder.cancelledBy || "-"}</div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-slate-700">Salesperson comments</div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                        {stripHtmlTags(selectedOrder.salespersonOrderComments) || "No comments provided."}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="text-sm font-semibold text-slate-700">Attachments</div>
                      {selectedOrder.orderAttachments && selectedOrder.orderAttachments.length > 0 ? (
                        <Carousel className="relative">
                          <CarouselContent>
                            {selectedOrder.orderAttachments.map((attachment, index) => (
                              <CarouselItem key={`${attachment.path || attachment.url || index}`}>
                                <div className="space-y-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                    <span className="font-medium text-slate-800">
                                      {attachment.name || `Attachment ${index + 1}`}
                                    </span>
                                    {attachment.url && (
                                      <a
                                        href={attachment.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs font-semibold text-sky-600 hover:text-sky-700"
                                      >
                                        Open file
                                      </a>
                                    )}
                                  </div>
                                  <div className="aspect-video w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                                    {attachment.url ? (
                                      <iframe
                                        src={attachment.url}
                                        title={attachment.name || `Attachment ${index + 1}`}
                                        className="h-full w-full"
                                      />
                                    ) : (
                                      <div className="flex h-full items-center justify-center text-sm text-slate-500">
                                        Preview unavailable.
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </CarouselItem>
                            ))}
                          </CarouselContent>
                          {selectedOrder.orderAttachments.length > 1 && (
                            <>
                              <CarouselPrevious className="-left-4" />
                              <CarouselNext className="-right-4" />
                            </>
                          )}
                        </Carousel>
                      ) : (
                        <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                          No attachments uploaded.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
