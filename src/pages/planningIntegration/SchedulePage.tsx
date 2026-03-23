import { useEffect, useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import * as XLSX from "xlsx";
import type { Row } from "./types";
import { displayValue, parseDateToTimestamp } from "./utils";
import { milestoneSequence, phaseCardMap } from "./types";
import type { PlanningLang } from "./i18n";
import { statusText, tr } from "./i18n";
import { getPlanningOrderType, planningOrderTypeLabel } from "./orderType";
import { database, subscribeToCampervanSchedule } from "@/lib/firebase";
import { off, onValue, ref, update } from "firebase/database";
import type { CampervanScheduleItem } from "@/types";

const columns: Array<{
  label: string;
  zhLabel: string;
  key: string;
  source: "schedule" | "dateTrack";
  className?: string;
}> = [
  {
    label: "Current Status",
    zhLabel: "当前状态",
    key: "_status",
    source: "schedule",
  },
  {
    label: "Aging Days",
    zhLabel: "滞留天数",
    key: "_aging",
    source: "schedule",
  },
  {
    label: "Waiting for ordering",
    zhLabel: "待下单价格",
    key: "_wfo",
    source: "schedule",
  },
  {
    label: "Forecast Production Date",
    zhLabel: "预测生产日期",
    key: "Forecast Production Date",
    source: "schedule",
  },
  {
    label: "Request Delivery Date",
    zhLabel: "客户要求交付",
    key: "Request Delivery Date",
    source: "schedule",
  },
  {
    label: "Latest Ex-factory Date",
    zhLabel: "最晚出厂日期",
    key: "_latestExFactory",
    source: "schedule",
  },
  { label: "Chassis", zhLabel: "底盘号", key: "Chassis", source: "schedule" },
  {
    label: "Customer",
    zhLabel: "客户",
    key: "Customer",
    source: "schedule",
    className: "max-w-[110px] truncate",
  },
  { label: "Dealer", zhLabel: "经销商", key: "Dealer", source: "schedule" },
  { label: "Model", zhLabel: "车型", key: "Model", source: "schedule" },
  {
    label: "Model Year",
    zhLabel: "年款",
    key: "Model Year",
    source: "schedule",
  },
  {
    label: "Order Received Date",
    zhLabel: "接单日期",
    key: "Order Received Date",
    source: "schedule",
  },
  {
    label: "Signed Plans Received",
    zhLabel: "签图回收",
    key: "Signed Plans Received",
    source: "schedule",
  },
  {
    label: "Purchase Order Sent",
    zhLabel: "采购单发送",
    key: "Purchase Order Sent",
    source: "schedule",
  },
  {
    label: "chassisWelding",
    zhLabel: "底盘焊接",
    key: "chassisWelding",
    source: "dateTrack",
  },
  {
    label: "assemblyLine",
    zhLabel: "总装线",
    key: "assemblyLine",
    source: "dateTrack",
  },
  {
    label: "finishGoods",
    zhLabel: "完工入库",
    key: "finishGoods",
    source: "dateTrack",
  },
  {
    label: "leavingFactory",
    zhLabel: "离开工厂",
    key: "leavingFactory",
    source: "dateTrack",
  },
  {
    label: "estLeavngPort",
    zhLabel: "预计离港",
    key: "estLeavngPort",
    source: "dateTrack",
  },
  {
    label: "Left Port",
    zhLabel: "已离港",
    key: "Left Port",
    source: "dateTrack",
  },
  {
    label: "melbournePortDate",
    zhLabel: "墨尔本港到港",
    key: "melbournePortDate",
    source: "dateTrack",
  },
  {
    label: "Received in Melbourne",
    zhLabel: "墨尔本工厂接收",
    key: "Received in Melbourne",
    source: "dateTrack",
  },
];

const statusGroup = {
  "Melbourn Factory": ["Melbourn Factory"],
  "Order Processing": ["not confirmed orders", "Waiting for sending"],
  "Longtree Factory": [
    "Not Start in Longtree",
    "Chassis welding in Longtree",
    "Assembly line Longtree",
    "Finishedin Longtree",
  ],
  "on the transit": [
    "Leaving factory from Longtree",
    "waiting in port",
    "On the sea",
    "Melbourn Port",
  ],
} as const;

const statusClass: Record<string, string> = {
  "Melbourn Factory": "bg-emerald-100",
  "not confirmed orders": "bg-amber-100",
  "Waiting for sending": "bg-yellow-100",
  "Not Start in Longtree": "bg-sky-100",
  "Chassis welding in Longtree": "bg-blue-100",
  "Assembly line Longtree": "bg-indigo-100",
  "Finishedin Longtree": "bg-violet-100",
  "Leaving factory from Longtree": "bg-orange-100",
  "waiting in port": "bg-pink-100",
  "On the sea": "bg-cyan-100",
  "Melbourn Port": "bg-lime-100",
};


const exportWorkbook = (sheetName: string, rows: Record<string, unknown>[], filename: string) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  const colWidths = Object.keys(rows[0] || {}).map((key) => ({
    wch: Math.max(
      String(key).length,
      ...rows.map((row) => String(row[key] ?? "").length),
      12,
    ),
  }));
  ws["!cols"] = colWidths;
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
};

const PAGE_SIZE = 80;

const editableVehicleStatuses = [
  "longtreeScheduling",
  "productionInProgress",
  "offLine",
  "shipped",
  "departedPort",
] as const;
type EditableVehicleStatus = (typeof editableVehicleStatuses)[number];

const vehicleStatusText: Record<string, string> = {
  longtreeScheduling: "Longtree Scheduling",
  productionInProgress: "Production In Progress",
  offLine: "Off Line",
  shipped: "Shipped",
  departedPort: "Departed Port",
};

const vehicleStatusClass: Record<string, string> = {
  longtreeScheduling: "bg-indigo-100 text-indigo-800",
  productionInProgress: "bg-blue-100 text-blue-800",
  offLine: "bg-violet-100 text-violet-800",
  shipped: "bg-emerald-100 text-emerald-800",
  departedPort: "bg-cyan-100 text-cyan-800",
};

type TicketType = "change-production-date" | "after-signed-off-change";

type RequisitionTicket = {
  type?: TicketType;
  chassis?: string;
  approvals?: {
    techApproved?: boolean;
    productionApproved?: boolean;
  };
  status?: "unread" | "approved";
};

const normalize = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toUpperCase();


const parseDdMmYyyyToUtc = (dateText: unknown) => {
  const raw = String(dateText || "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/\./g, "/").replace(/-/g, "/");
  const [dd, mm, yyyy] = normalized.split("/").map(Number);
  if (!dd || !mm || !yyyy) return null;
  const dt = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
};

const formatUtcToDdMmYyyy = (dt: Date) => {
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = dt.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const formatDateMinusDays = (dateText: unknown, days: number) => {
  const dt = parseDdMmYyyyToUtc(dateText);
  if (!dt) return "-";
  dt.setUTCDate(dt.getUTCDate() - days);
  return formatUtcToDdMmYyyy(dt);
};

const MS_PER_DAY = 86400000;

const buildLatestExFactoryDate = (requestDeliveryDate: unknown, signedPlansReceived: unknown) => {
  const requestDate = parseDdMmYyyyToUtc(requestDeliveryDate);
  if (requestDate) {
    requestDate.setUTCDate(requestDate.getUTCDate() - 70);
    return requestDate;
  }
  const signedDate = parseDdMmYyyyToUtc(signedPlansReceived);
  if (!signedDate) return null;
  signedDate.setUTCDate(signedDate.getUTCDate() + 140);
  return signedDate;
};

const isWithinNext30Days = (dateText: unknown, minusDays = 40) => {
  const dt = parseDdMmYyyyToUtc(dateText);
  if (!dt) return false;
  dt.setUTCDate(dt.getUTCDate() - minusDays);

  const today = new Date();
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const targetUtc = Date.UTC(
    dt.getUTCFullYear(),
    dt.getUTCMonth(),
    dt.getUTCDate(),
  );
  const diffDays = Math.floor((targetUtc - todayUtc) / 86400000);
  return diffDays >= 0 && diffDays <= 30;
};

const isTicketFinalApproved = (ticket: RequisitionTicket) => {
  if (ticket.status === "approved") return true;
  if (ticket.type === "change-production-date")
    return Boolean(ticket.approvals?.productionApproved);
  if (ticket.type === "after-signed-off-change")
    return (
      Boolean(ticket.approvals?.techApproved) &&
      Boolean(ticket.approvals?.productionApproved)
    );
  return false;
};

export default function SchedulePage({
  rows,
  waitingOrderPrices,
  lang,
}: {
  rows: Row[];
  waitingOrderPrices: Record<string, number>;
  lang: PlanningLang;
}) {
  const top = useRef<HTMLDivElement | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);

  const [groupFilter, setGroupFilter] = useState<
    keyof typeof statusGroup | "all"
  >("all");
  const [orderTypeTab, setOrderTypeTab] = useState<"stock" | "customer" | "prototype" | "all">(
    "customer",
  );
  const [page, setPage] = useState(1);
  const [selectedAgingBucket, setSelectedAgingBucket] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"caravan" | "motorised">(
    "caravan",
  );
  const [vehicleSearchTerm, setVehicleSearchTerm] = useState("");
  const [campervanOrders, setCampervanOrders] = useState<
    CampervanScheduleItem[]
  >([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [approvedChangeChassisSet, setApprovedChangeChassisSet] = useState<
    Set<string>
  >(new Set());

  useEffect(() => {
    const ticketsRef = ref(database, "mes/requisitionTickets");
    const handler = (snap: any) => {
      const raw = snap.val() || {};
      const approved = new Set<string>();
      Object.values(raw).forEach((item: any) => {
        const ticket: RequisitionTicket = item || {};
        const chassis = normalize(ticket.chassis);
        if (!chassis) return;
        if (isTicketFinalApproved(ticket)) approved.add(chassis);
      });
      setApprovedChangeChassisSet(approved);
    };
    onValue(ticketsRef, handler);
    return () => off(ticketsRef, "value", handler);
  }, []);

  useEffect(() => {
    setLoadingVehicles(true);
    const unsubscribe = subscribeToCampervanSchedule((data) => {
      setCampervanOrders(data || []);
      setLoadingVehicles(false);
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  const enriched = useMemo(
    () =>
      rows.map((r) => {
        let last = "";
        milestoneSequence.forEach((m) => {
          const ts = parseDateToTimestamp(
            m.source === "schedule"
              ? (r.schedule as any)?.[m.key]
              : r.dateTrack?.[m.key],
          );
          if (ts != null) last = m.key;
        });
        const currentStatus = (phaseCardMap[last] ?? last) || "-";
        const latestExFactoryDate = buildLatestExFactoryDate(
          (r.schedule as any)?.["Request Delivery Date"],
          (r.schedule as any)?.["Signed Plans Received"],
        );
        const latestExFactoryTs = latestExFactoryDate?.getTime() ?? null;
        const agingToLatestExFactory =
          latestExFactoryTs == null
            ? null
            : Math.floor((Date.now() - latestExFactoryTs) / MS_PER_DAY);
        return {
          ...r,
          currentStatus,
          latestExFactoryDate: latestExFactoryDate
            ? formatUtcToDdMmYyyy(latestExFactoryDate)
            : "",
          agingToLatestExFactory,
        };
      }),
    [rows],
  );

  const filtered = useMemo(() => {
    return enriched.filter((r) => {
      if (
        groupFilter !== "all" &&
        !statusGroup[groupFilter].includes(r.currentStatus as any)
      )
        return false;
      const orderType = getPlanningOrderType(r.schedule?.Customer);
      if (orderTypeTab === "all") return true;
      return orderType === orderTypeTab;
    });
  }, [enriched, groupFilter, orderTypeTab]);

  const latestExFactoryAgingBuckets = useMemo(() => {
    const bucketConfig = [
      { key: "0", label: "<=0", min: Number.NEGATIVE_INFINITY, max: 0 },
      { key: "30", label: "1-30", min: 1, max: 30 },
      { key: "70", label: "31-70", min: 31, max: 70 },
      { key: "90", label: "71-90", min: 71, max: 90 },
      { key: "120", label: "91-120", min: 91, max: 120 },
      { key: "120+", label: "120+", min: 121, max: Number.POSITIVE_INFINITY },
    ];
    const counts = bucketConfig.map((cfg) => ({ ...cfg, count: 0 }));
    filtered.forEach((row) => {
      const agingValue = row.agingToLatestExFactory;
      if (typeof agingValue !== "number" || Number.isNaN(agingValue)) return;
      const bucket = counts.find((cfg) => agingValue >= cfg.min && agingValue <= cfg.max);
      if (bucket) bucket.count += 1;
    });
    const max = Math.max(1, ...counts.map((item) => item.count));
    return { counts, max };
  }, [filtered]);

  const ageFilteredRows = useMemo(() => {
    if (!selectedAgingBucket) return filtered;
    const bucket = latestExFactoryAgingBuckets.counts.find(
      (item) => item.key === selectedAgingBucket,
    );
    if (!bucket) return filtered;
    return filtered.filter((row) => {
      const value = row.agingToLatestExFactory;
      return (
        typeof value === "number" &&
        !Number.isNaN(value) &&
        value >= bucket.min &&
        value <= bucket.max
      );
    });
  }, [filtered, latestExFactoryAgingBuckets.counts, selectedAgingBucket]);

  const groupCards = useMemo(() => {
    const mk = (k: keyof typeof statusGroup) => ({
      key: k,
      count: enriched.filter((r) =>
        statusGroup[k].includes(r.currentStatus as any),
      ).length,
    });
    return [
      mk("Melbourn Factory"),
      mk("Order Processing"),
      mk("Longtree Factory"),
      mk("on the transit"),
    ];
  }, [enriched]);

  const totalPages = Math.max(1, Math.ceil(ageFilteredRows.length / PAGE_SIZE));
  const pagedRows = ageFilteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const searchedVehicleOrders = useMemo(() => {
    const q = vehicleSearchTerm.trim().toLowerCase();
    return campervanOrders
      .filter((order) => {
        const chassis = String(order.chassisNumber || "").trim();
        const status = String(order.regentProduction || "").trim();
        if (!chassis) return false;
        if (status.toLowerCase() === "finished") return false;

        if (!q) return true;
        return [
          order.forecastProductionDate,
          order.chassisNumber,
          order.customer,
          order.dealer,
          order.model,
          order.regentProduction,
          order.signedOrderReceived,
          order.vehicle,
          order.vinNumber,
        ]
          .map((v) => String(v || "").toLowerCase())
          .some((v) => v.includes(q));
      })
      .sort((a, b) => {
        const aDate = parseDdMmYyyyToUtc(a.forecastProductionDate);
        const bDate = parseDdMmYyyyToUtc(b.forecastProductionDate);
        if (aDate && bDate) return aDate.getTime() - bDate.getTime();
        if (aDate) return -1;
        if (bDate) return 1;
        return String(a.forecastProductionDate || "").localeCompare(
          String(b.forecastProductionDate || ""),
        );
      });
  }, [campervanOrders, vehicleSearchTerm]);

  const exportCaravanExcel = () => {
    const exportRows = ageFilteredRows.map((r) => {
      const chassisKey = normalize(r.chassis);
      return columns.reduce<Record<string, unknown>>((acc, c) => {
        const label = lang === "zh" ? c.zhLabel : c.label;
        if (c.key === "_status") acc[label] = statusText(lang, displayValue(r.currentStatus));
        else if (c.key === "_aging") {
          const agingValue = typeof r.agingToLatestExFactory === "number" && !Number.isNaN(r.agingToLatestExFactory)
            ? r.agingToLatestExFactory
            : null;
          acc[label] = agingValue == null ? "-" : agingValue >= 0 ? `+${agingValue}` : String(agingValue);
        } else if (c.key === "_wfo") {
          acc[label] = Number.isFinite(Number(waitingOrderPrices[r.chassis])) ? `AUD ${waitingOrderPrices[r.chassis]}` : "-";
        } else if (c.key === "_latestExFactory") {
          acc[label] = r.latestExFactoryDate || "-";
        } else if (c.key === "Chassis") {
          const chassisValue = displayValue((r.schedule as any)?.[c.key]);
          acc[label] = approvedChangeChassisSet.has(chassisKey) ? `${chassisValue} (${tr(lang, "change", "改")})` : chassisValue;
        } else {
          const raw = c.source === "schedule" ? (r.schedule as any)?.[c.key] : r.dateTrack?.[c.key];
          acc[label] = displayValue(raw);
        }
        return acc;
      }, {});
    });

    exportWorkbook(
      "schedule",
      exportRows,
      `planning_schedule_${orderTypeTab}_${groupFilter}_${selectedAgingBucket ?? "all"}.xlsx`,
    );
  };

  const exportMotorisedExcel = () => {
    const exportRows = searchedVehicleOrders.map((order) => ({
      [tr(lang, "Forecast Production Date", "预测生产日期")]: String(order.forecastProductionDate || "-"),
      [tr(lang, "Latest Shipment Date", "最晚发货日期")]: formatDateMinusDays(order.forecastProductionDate, 40),
      [tr(lang, "Chassis", "底盘号")]: String(order.chassisNumber || "-"),
      [tr(lang, "Customer", "客户")]: String(order.customer || "-"),
      [tr(lang, "Dealer", "经销商")]: String(order.dealer || "-"),
      [tr(lang, "Model", "车型")]: String(order.model || "-"),
      [tr(lang, "Current Status", "当前状态")]: lang === "zh"
        ? statusText(lang, String(order.regentProduction || "-"))
        : vehicleStatusText[String(order.regentProduction || "").trim()] || String(order.regentProduction || "-"),
      [tr(lang, "Signed Order Received", "签单接收")]: String(order.signedOrderReceived || "-"),
      [tr(lang, "Vehicle", "车辆")]: String(order.vehicle || "-"),
      VIN: String(order.vinNumber || "-"),
    }));

    exportWorkbook(
      "motorised_schedule",
      exportRows,
      `planning_motorised_schedule_${vehicleSearchTerm.trim() || "all"}.xlsx`,
    );
  };

  const updateVehicleStatus = async (
    order: CampervanScheduleItem,
    nextStatus: string,
  ) => {
    const id = order._id;
    if (!id) return;
    try {
      await update(ref(database, `campervanSchedule/${id}`), {
        regentProduction: nextStatus,
      });
    } catch (error) {
      console.error("Failed to update vehicle status", error);
    }
  };

  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-semibold">
          {tr(lang, "schedule", "排产表")}
        </h2>
        <div className="mt-4 inline-flex rounded-lg border border-slate-300 bg-slate-50 p-1 text-sm">
          <button
            type="button"
            onClick={() => setActiveTab("caravan")}
            className={`rounded-md px-3 py-1.5 ${activeTab === "caravan" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
          >
            {tr(lang, "Caravan", "拖挂式")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("motorised")}
            className={`rounded-md px-3 py-1.5 ${activeTab === "motorised" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
          >
            {tr(lang, "Motorised", "自行式")}
          </button>
        </div>
      </div>

      {activeTab === "motorised" ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-500">
              {tr(
                lang,
                "Using same source as dealer order list > vehicles",
                "使用与 dealer order list > vehicles 相同的数据源",
              )}
              </div>
              <button
                type="button"
                onClick={exportMotorisedExcel}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                {tr(lang, "Download Excel", "下载 Excel")}
              </button>
            </div>
            <input
              type="text"
              value={vehicleSearchTerm}
              onChange={(e) => setVehicleSearchTerm(e.target.value)}
              placeholder={tr(
                lang,
                "Search vehicles (chassis / customer / VIN / status)",
                "搜索自行式（底盘 / 客户 / VIN / 状态）",
              )}
              className="w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </div>

          {loadingVehicles ? (
            <div className="py-8 text-center text-slate-500">
              {tr(lang, "Loading vehicle schedule...", "正在加载自行式排产...")}
            </div>
          ) : searchedVehicleOrders.length === 0 ? (
            <div className="py-8 text-center text-slate-500">
              {tr(lang, "No vehicles found", "没有找到数据")}
            </div>
          ) : (
            <div className="overflow-auto rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50">
              <table className="min-w-[1500px] text-sm">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="px-3 py-3 text-left font-semibold">
                      {tr(lang, "Forecast Production Date", "预测生产日期")}
                    </th>
                    <th className="px-3 py-3 text-left font-semibold">
                      {tr(lang, "Latest Shipment Date", "最晚发货日期")}
                    </th>
                    <th className="px-3 py-3 text-left font-semibold">
                      {tr(lang, "Chassis", "底盘号")}
                    </th>
                    <th className="px-3 py-3 text-left font-semibold">
                      {tr(lang, "Customer", "客户")}
                    </th>
                    <th className="px-3 py-3 text-left font-semibold">
                      {tr(lang, "Dealer", "经销商")}
                    </th>
                    <th className="px-3 py-3 text-left font-semibold">
                      {tr(lang, "Model", "车型")}
                    </th>
                    <th className="px-3 py-3 text-left font-semibold">
                      {tr(lang, "Current Status", "当前状态")}
                    </th>
                    <th className="px-3 py-3 text-left font-semibold">
                      {tr(lang, "Signed Order Received", "签单接收")}
                    </th>
                    <th className="px-3 py-3 text-left font-semibold">
                      {tr(lang, "Vehicle", "车辆")}
                    </th>
                    <th className="px-3 py-3 text-left font-semibold">VIN</th>
                  </tr>
                </thead>
                <tbody>
                  {searchedVehicleOrders.map((order, idx) => {
                    const status =
                      String(order.regentProduction || "").trim() || "-";
                    const statusOptions =
                      status === "-"
                        ? ["-", ...editableVehicleStatuses]
                        : !editableVehicleStatuses.includes(
                              status as EditableVehicleStatus,
                            )
                          ? [status, ...editableVehicleStatuses]
                          : [...editableVehicleStatuses];
                    const shouldHighlight = isWithinNext30Days(
                      order.forecastProductionDate,
                      40,
                    );
                    return (
                      <tr
                        key={`${order._id || order.chassisNumber || order.vinNumber || idx}`}
                        className={`border-b border-slate-200 ${shouldHighlight ? "bg-amber-100/60" : idx % 2 === 0 ? "bg-white" : "bg-slate-50/70"}`}
                      >
                        <td className="whitespace-nowrap px-3 py-2.5 font-medium">
                          {String(order.forecastProductionDate || "-")}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                          {formatDateMinusDays(
                            order.forecastProductionDate,
                            40,
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-900">
                          {String(order.chassisNumber || "-")}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          {String(order.customer || "-")}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          {String(order.dealer || "-")}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          {String(order.model || "-")}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <select
                            value={status}
                            onChange={(e) =>
                              updateVehicleStatus(order, e.target.value)
                            }
                            className={`rounded-md border border-slate-300 px-2 py-1.5 text-xs font-semibold ${vehicleStatusClass[status] || "bg-slate-100 text-slate-700"}`}
                          >
                            {statusOptions.map((item) => (
                              <option key={item} value={item}>
                                {lang === "zh"
                                  ? statusText(lang, item)
                                  : vehicleStatusText[item] || item}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          {String(order.signedOrderReceived || "-")}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          {String(order.vehicle || "-")}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          {String(order.vinNumber || "-")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {groupCards.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => {
                  setGroupFilter((prev) => (prev === c.key ? "all" : c.key));
                  setPage(1);
                }}
                className={`rounded-xl border p-4 text-left shadow-sm transition ${groupFilter === c.key ? "border-slate-900 bg-slate-100" : "border-slate-200 bg-white"}`}
              >
                <div className="text-sm font-semibold text-slate-700">
                  {c.key === "Melbourn Factory"
                    ? tr(lang, "Melbourn Factory", "墨尔本工厂")
                    : c.key === "Order Processing"
                      ? tr(lang, "Order Processing", "订单处理中")
                      : c.key === "Longtree Factory"
                        ? tr(lang, "Longtree Factory", "Longtree 工厂")
                        : tr(lang, "on the transit", "在途运输")}
                </div>
                <div className="mt-1 text-3xl font-bold text-slate-900">
                  {c.count}
                </div>
              </button>
            ))}
          </div>

          <div className="mb-4 inline-flex rounded-lg border border-slate-300 bg-slate-50 p-1 text-sm">
            <button
              type="button"
              onClick={() => {
                setOrderTypeTab("stock");
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 ${orderTypeTab === "stock" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
            >
              {planningOrderTypeLabel(lang, "stock")}
            </button>
            <button
              type="button"
              onClick={() => {
                setOrderTypeTab("customer");
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 ${orderTypeTab === "customer" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
            >
              {planningOrderTypeLabel(lang, "customer")}
            </button>
            <button
              type="button"
              onClick={() => {
                setOrderTypeTab("prototype");
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 ${orderTypeTab === "prototype" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
            >
              {planningOrderTypeLabel(lang, "prototype")}
            </button>
            <button
              type="button"
              onClick={() => {
                setOrderTypeTab("all");
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 ${orderTypeTab === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
            >
              {tr(lang, "All", "所有")}
            </button>
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
            <div>
              {tr(lang, "Filtered rows", "筛选后行数")}: {ageFilteredRows.length}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={exportCaravanExcel}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                {tr(lang, "Download Excel", "下载 Excel")}
              </button>
              <button
                type="button"
                disabled={page <= 1}
                className="rounded border px-2 py-1 disabled:opacity-50"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {tr(lang, "Prev", "上一页")}
              </button>
              <span>
                {tr(lang, "Page", "页")} {page}/{totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                className="rounded border px-2 py-1 disabled:opacity-50"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                {tr(lang, "Next", "下一页")}
              </button>
            </div>
          </div>

          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 text-sm font-semibold text-slate-700">
              {tr(lang, "Aging bar chart (vs Latest Ex-factory Date)", "Aging柱状图（按最晚出厂日期）")}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {latestExFactoryAgingBuckets.counts.map((bucket) => {
                const widthPct = Math.round((bucket.count / latestExFactoryAgingBuckets.max) * 100);
                const active = selectedAgingBucket === bucket.key;
                return (
                  <button
                    key={bucket.key}
                    type="button"
                    onClick={() => {
                      setSelectedAgingBucket((prev) =>
                        prev === bucket.key ? null : bucket.key,
                      );
                      setPage(1);
                    }}
                    className={`rounded-lg border p-3 text-left transition ${active ? "border-slate-900 bg-slate-100" : "border-slate-200 bg-slate-50"}`}
                  >
                    <div className="text-xs font-semibold text-slate-600">{bucket.label}</div>
                    <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-sky-500"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    <div className="mt-2 text-lg font-bold text-slate-900">{bucket.count}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div
              ref={top}
              className="overflow-x-auto overflow-y-hidden border-b border-slate-200"
              onScroll={() => {
                if (bottom.current && top.current)
                  bottom.current.scrollLeft = top.current.scrollLeft;
              }}
            >
              <div style={{ width: 2850, height: 1 }} />
            </div>
            <div
              ref={bottom}
              className="max-h-[calc(100vh-420px)] overflow-auto"
              onScroll={() => {
                if (top.current && bottom.current)
                  top.current.scrollLeft = bottom.current.scrollLeft;
              }}
            >
              <table className="min-w-[2850px] divide-y divide-slate-200 text-sm">
                <thead className="sticky top-0 bg-slate-100">
                  <tr>
                    {columns.map((c) => (
                      <th
                        key={c.key}
                        className="px-3 py-3 text-left font-semibold"
                      >
                        {lang === "zh" ? c.zhLabel : c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedRows.map((r, i) => (
                    <tr
                      key={`${r.chassis}-${i}`}
                      className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}
                    >
                      {columns.map((c) => {
                        let v: unknown;
                        if (c.key === "_status") v = r.currentStatus;
                        else if (c.key === "_aging") {
                          const agingValue = r.agingToLatestExFactory;
                          v =
                            typeof agingValue === "number" &&
                            !Number.isNaN(agingValue)
                              ? agingValue
                              : "-";
                        }
                        else if (c.key === "_wfo")
                          v = Number.isFinite(
                            Number(waitingOrderPrices[r.chassis]),
                          )
                            ? `AUD ${waitingOrderPrices[r.chassis]}`
                            : "-";
                        else
                          v =
                            c.source === "schedule"
                              ? (r.schedule as any)?.[c.key]
                              : r.dateTrack?.[c.key];

                        if (c.key === "_status") {
                          return (
                            <td
                              key={`${r.chassis}-${c.key}-${i}`}
                              className="whitespace-nowrap px-3 py-2.5"
                            >
                              <span
                                className={`rounded px-2 py-1 text-xs ${statusClass[String(v)] ?? "bg-slate-100"}`}
                              >
                                {statusText(lang, displayValue(v))}
                              </span>
                            </td>
                          );
                        }

                        if (c.key === "Request Delivery Date") {
                          return (
                            <td
                              key={`${r.chassis}-${c.key}-${i}`}
                              className={`whitespace-nowrap px-3 py-2.5 ${c.className ?? ""}`}
                            >
                              {String(v ?? "").trim()}
                            </td>
                          );
                        }

                        if (c.key === "_latestExFactory") {
                          v = r.latestExFactoryDate;
                        }

                        if (c.key === "_aging") {
                          const agingValue =
                            typeof r.agingToLatestExFactory === "number" &&
                            !Number.isNaN(r.agingToLatestExFactory)
                              ? r.agingToLatestExFactory
                              : null;
                          const agingText =
                            agingValue == null
                              ? "-"
                              : agingValue >= 0
                                ? `+${agingValue}`
                                : String(agingValue);
                          return (
                            <td
                              key={`${r.chassis}-${c.key}-${i}`}
                              className={`whitespace-nowrap px-3 py-2.5 font-semibold ${agingValue == null ? "text-slate-500" : agingValue >= 0 ? "text-rose-600" : "text-emerald-600"}`}
                            >
                              {agingText}
                            </td>
                          );
                        }

                        const chassisKey = normalize(r.chassis);
                        const hasApprovedChange =
                          c.key === "Chassis" &&
                          approvedChangeChassisSet.has(chassisKey);

                        return (
                          <td
                            key={`${r.chassis}-${c.key}-${i}`}
                            className={`whitespace-nowrap px-3 py-2.5 ${c.className ?? ""}`}
                          >
                            {displayValue(v)}
                            {hasApprovedChange ? (
                              <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-800">
                                {tr(lang, "change", "改")}
                              </span>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
