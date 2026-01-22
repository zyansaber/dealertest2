// src/lib/firebase.ts
import { initializeApp } from "firebase/app";
import {
  getDatabase,
  ref,
  onValue,
  off,
  set,
  update,
  get,
  remove,
  DataSnapshot,
} from "firebase/database";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import type {
  SecondHandSale,
  ScheduleItem,
  SpecPlan,
  DateTrack,
  YardNewVanInvoice,
  NewSaleRecord,
  StockToCustomerRecord,
} from "@/types";
import type { DealerLayoutSnapshot, DealerTierLayout, TierConfig } from "@/types/tierConfig";

const requireEnv = (key: string, context: string) => {
  const value = import.meta.env?.[key];
  if (!value) {
    throw new Error(`Missing environment variable ${key} for ${context}`);
  }
  return value;
};

const firebaseConfig = {
  apiKey: requireEnv("VITE_FIREBASE_API_KEY", "primary Firebase config"),
  authDomain: requireEnv("VITE_FIREBASE_AUTH_DOMAIN", "primary Firebase config"),
  databaseURL: requireEnv("VITE_FIREBASE_DATABASE_URL", "primary Firebase config"),
  projectId: requireEnv("VITE_FIREBASE_PROJECT_ID", "primary Firebase config"),
  storageBucket: requireEnv("VITE_FIREBASE_STORAGE_BUCKET", "primary Firebase config"),
  messagingSenderId: requireEnv("VITE_FIREBASE_MESSAGING_SENDER_ID", "primary Firebase config"),
  appId: requireEnv("VITE_FIREBASE_APP_ID", "primary Firebase config"),
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const storage = getStorage(app);

export { app, database, storage };

export type ShowDealerMapping = {
  dealership: string;
  dealerSlug: string;
  updatedAt: string;
};

export type YardSizeRecord = {
  dealer?: string;
  dealerName?: string;
  name?: string;
  yard?: string;
  max_yard_capacity?: number | string;
  min_van_volume?: number | string;
  max?: number | string;
  min?: number | string;
  [key: string]: unknown;
};

export type DeliveryToAssignment = {
  chassis: string;
  deliveryTo: string;
  sourceDealerSlug?: string | null;
  updatedAt: string;
};

/** -------------------- schedule -------------------- */
export const subscribeToSchedule = (
  callback: (data: ScheduleItem[]) => void,
  options: { includeNoChassis?: boolean; includeNoCustomer?: boolean; includeFinished?: boolean } = {}
) => {
  const { includeNoChassis = false, includeNoCustomer = false, includeFinished = false } = options;

  const scheduleRef = ref(database, "schedule");

  const handler = (snapshot: DataSnapshot) => {
    const raw = snapshot.val();

    const list: any[] = raw
      ? Array.isArray(raw)
        ? raw.filter(Boolean)
        : Object.values(raw).filter(Boolean)
      : [];

    const filtered: ScheduleItem[] = list.filter((item: any) => {
      if (!includeFinished) {
        const rp = String(item?.["Regent Production"] ?? "").toLowerCase();
        if (rp === "finished" || rp === "finish") return false;
      }
      if (!includeNoChassis) {
        if (!("Chassis" in (item ?? {})) || String(item?.Chassis ?? "") === "") return false;
      }
      if (!includeNoCustomer) {
        if (!("Customer" in (item ?? {})) || String(item?.Customer ?? "") === "") return false;
      }
      return true;
    });

    callback(filtered);
  };

  onValue(scheduleRef, handler);
  return () => off(scheduleRef, "value", handler);
};

/** -------------------- spec_plan -------------------- */
export const subscribeToSpecPlan = (
  callback: (data: SpecPlan | Record<string, any> | any[]) => void
) => {
  const paths = ["spec_plan", "specPlan", "specplan"];
  const unsubs: Array<() => void> = [];

  paths.forEach((p) => {
    const r = ref(database, p);
    const handler = (snap: DataSnapshot) => {
      const val = snap.exists() ? snap.val() : null;
      if (val && (Array.isArray(val) ? val.length > 0 : Object.keys(val).length > 0)) {
        callback(val);
      }
    };
    onValue(r, handler);
    unsubs.push(() => off(r, "value", handler));
  });

  return () => unsubs.forEach((u) => u && u());
};

/** -------------------- dateTrack -------------------- */
export const subscribeToDateTrack = (
  callback: (data: DateTrack | Record<string, any> | any[]) => void
) => {
  const paths = ["dateTrack", "datetrack"];
  const unsubs: Array<() => void> = [];

  paths.forEach((p) => {
    const r = ref(database, p);
    const handler = (snap: DataSnapshot) => {
      const val = snap.exists() ? snap.val() : null;
      if (val && (Array.isArray(val) ? val.length > 0 : Object.keys(val).length > 0)) {
        callback(val);
      }
    };
    onValue(r, handler);
    unsubs.push(() => off(r, "value", handler));
  });

  return () => unsubs.forEach((u) => u && u());
};

/** -------------------- Dealer Config Functions -------------------- */
export const subscribeAllDealerConfigs = (callback: (data: any) => void) => {
  const configsRef = ref(database, "dealerConfigs");

  const handler = (snapshot: DataSnapshot) => {
    const data = snapshot.val();
    callback(data || {});
  };

  onValue(configsRef, handler);
  return () => off(configsRef, "value", handler);
};

export const subscribeDealerConfig = (dealerSlug: string, callback: (data: any) => void) => {
  const configRef = ref(database, `dealerConfigs/${dealerSlug}`);

  const handler = (snapshot: DataSnapshot) => {
    const data = snapshot.val();
    callback(data || null);
  };

  onValue(configRef, handler);
  return () => off(configRef, "value", handler);
};

export const setDealerConfig = async (dealerSlug: string, config: any) => {
  const configRef = ref(database, `dealerConfigs/${dealerSlug}`);
  await set(configRef, {
    ...config,
    slug: dealerSlug,
    updatedAt: new Date().toISOString(),
  });
};

export const removeDealerConfig = async (dealerSlug: string) => {
  const configRef = ref(database, `dealerConfigs/${dealerSlug}`);
  await remove(configRef);
};

/** -------------------- Delivery To Assignments -------------------- */
export const subscribeDeliveryToAssignments = (callback: (data: Record<string, DeliveryToAssignment>) => void) => {
  const deliveryRef = ref(database, "deliveryToAssignments");
  const handler = (snapshot: DataSnapshot) => {
    const data = snapshot.val();
    callback(data || {});
  };

  onValue(deliveryRef, handler);
  return () => off(deliveryRef, "value", handler);
};

export const setDeliveryToAssignment = async (
  chassis: string,
  payload: { deliveryTo: string; sourceDealerSlug?: string | null }
) => {
  const deliveryRef = ref(database, `deliveryToAssignments/${chassis}`);
  await set(deliveryRef, {
    chassis,
    deliveryTo: payload.deliveryTo,
    sourceDealerSlug: payload.sourceDealerSlug ?? null,
    updatedAt: new Date().toISOString(),
  });
};

export const clearDeliveryToAssignment = async (chassis: string) => {
  const deliveryRef = ref(database, `deliveryToAssignments/${chassis}`);
  await remove(deliveryRef);
};

export const setPowerbiUrl = async (dealerSlug: string, url: string) => {
  const urlRef = ref(database, `dealerConfigs/${dealerSlug}/powerbi_url`);
  await set(urlRef, url);
  const updatedAtRef = ref(database, `dealerConfigs/${dealerSlug}/updatedAt`);
  await set(updatedAtRef, new Date().toISOString());
};

export const getPowerbiUrl = async (dealerSlug: string): Promise<string | null> => {
  const urlRef = ref(database, `dealerConfigs/${dealerSlug}/powerbi_url`);
  const snapshot = await get(urlRef);
  return snapshot.exists() ? snapshot.val() : null;
};

/** -------------------- Tier Config -------------------- */
const withTimestamp = <T extends Record<string, any>>(payload: T) => ({ ...payload, updatedAt: new Date().toISOString() });

export const subscribeTierConfig = (callback: (data: TierConfig | null) => void) => {
  const settingsRef = ref(database, "tierConfig/settings");
  const legacyRef = ref(database, "tierConfig");

  let hasEmitted = false;

  const emit = (data: TierConfig | null) => {
    callback(data);
    hasEmitted = true;
  };

  const settingsHandler = (snapshot: DataSnapshot) => {
    if (snapshot.exists()) {
      emit(snapshot.val() as TierConfig);
    } else if (!hasEmitted) {
      // Fallback to legacy path once if settings are not present yet
      get(legacyRef).then((legacySnap) => {
        if (legacySnap.exists()) {
          emit(legacySnap.val() as TierConfig);
        } else {
          emit(null);
        }
      });
    }
  };

  onValue(settingsRef, settingsHandler);
  return () => off(settingsRef, "value", settingsHandler);
};

export const setTierConfig = async (config: TierConfig) => {
  const settingsRef = ref(database, "tierConfig/settings");
  const existingSnap = await get(settingsRef);
  const existing = existingSnap.exists() ? (existingSnap.val() as TierConfig) : {};

  await set(settingsRef, withTimestamp({ ...existing, ...config }));
};

export const subscribeDefaultTierLayout = (callback: (layout: DealerTierLayout | null) => void) => {
  const defaultRef = ref(database, "tierConfig/defaultLayout");
  const handler = (snapshot: DataSnapshot) => {
    callback(snapshot.exists() ? (snapshot.val() as DealerTierLayout) : null);
  };
  onValue(defaultRef, handler);
  return () => off(defaultRef, "value", handler);
};

export const subscribeDealerTierLayout = (
  dealerSlug: string,
  callback: (data: DealerLayoutSnapshot) => void
) => {
  const dealerRef = ref(database, `tierConfig/dealerLayouts/${dealerSlug}`);
  const defaultRef = ref(database, "tierConfig/defaultLayout");

  let dealerLayout: DealerTierLayout | null = null;
  let defaultLayout: DealerTierLayout | null = null;

  const emit = () => {
    if (!dealerSlug) return;
    const layout = dealerLayout || defaultLayout || null;
    const source: DealerLayoutSnapshot["source"] = dealerLayout
      ? "dealer"
      : defaultLayout
        ? "default"
        : "none";
    callback({ layout, defaultLayout, source });
  };

  const dealerHandler = (snapshot: DataSnapshot) => {
    dealerLayout = snapshot.exists() ? (snapshot.val() as DealerTierLayout) : null;
    emit();
  };

  const defaultHandler = (snapshot: DataSnapshot) => {
    defaultLayout = snapshot.exists() ? (snapshot.val() as DealerTierLayout) : null;
    emit();
  };

  onValue(dealerRef, dealerHandler);
  onValue(defaultRef, defaultHandler);
  return () => {
    off(dealerRef, "value", dealerHandler);
    off(defaultRef, "value", defaultHandler);
  };
};

export const setDealerTierLayout = async (dealerSlug: string, layout: DealerTierLayout) => {
  if (!dealerSlug) return;
  const dealerRef = ref(database, `tierConfig/dealerLayouts/${dealerSlug}`);
  await set(dealerRef, withTimestamp({ ...layout, slug: dealerSlug }));
};

export const setDefaultTierLayout = async (layout: DealerTierLayout) => {
  const defaultRef = ref(database, "tierConfig/defaultLayout");
  await set(defaultRef, withTimestamp(layout));
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const subscribeShowDealerMappings = (
  callback: (data: Record<string, ShowDealerMapping>) => void
) => {
  const mappingRef = ref(database, "showDealerMappings");

  const handler = (snapshot: DataSnapshot) => {
    const data = snapshot.val();
    callback((data || {}) as Record<string, ShowDealerMapping>);
  };

  onValue(mappingRef, handler);
  return () => off(mappingRef, "value", handler);
};

export const setShowDealerMapping = async (dealership: string, dealerSlug: string) => {
  const key = slugify(dealership || dealerSlug || "unknown-dealership");
  const mappingRef = ref(database, `showDealerMappings/${key}`);
  const payload: ShowDealerMapping = {
    dealership,
    dealerSlug,
    updatedAt: new Date().toISOString(),
  };

  await set(mappingRef, payload);
};

export function generateRandomCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function dealerNameToSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** -------------------- yard size -------------------- */
export const subscribeToYardSizes = (callback: (data: Record<string, YardSizeRecord>) => void) => {
  const yardRef = ref(database, "yardsize");

  const handler = (snapshot: DataSnapshot) => {
    const val = snapshot.exists() ? snapshot.val() : {};
    callback((val as Record<string, YardSizeRecord>) || {});
  };

  onValue(yardRef, handler);
  return () => off(yardRef, "value", handler);
};

/** -------------------- modelanalysis -------------------- */
export type ModelAnalysisRecord = {
  model?: string;
  tier?: string;
  function_layout?: string;
  key_strengths?: string;
  strategic_role?: string;
  standard_price?: number | string;
};

export const subscribeToModelAnalysis = (
  callback: (data: Record<string, ModelAnalysisRecord> | any[]) => void
) => {
  const analysisRef = ref(database, "modelanalysis");

  const handler = (snapshot: DataSnapshot) => {
    const val = snapshot.exists() ? snapshot.val() : null;
    if (!val) {
      callback({});
      return;
    }

    if (Array.isArray(val)) {
      callback(val.filter(Boolean));
    } else {
      callback(val);
    }
  };

  onValue(analysisRef, handler);
  return () => off(analysisRef, "value", handler);
};

/** -------------------- utils -------------------- */
const parseDDMMYYYY = (dateStr: string | null): Date => {
  if (!dateStr || dateStr.trim() === "") return new Date(9999, 11, 31);
  try {
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      if (isNaN(date.getTime())) return new Date(9999, 11, 31);
      return date;
    }
  } catch {}
  return new Date(9999, 11, 31);
};

export const sortOrders = (orders: ScheduleItem[]): ScheduleItem[] => {
  return orders.sort((a, b) => {
    const dateA = parseDDMMYYYY(a["Forecast Production Date"]);
    const dateB = parseDDMMYYYY(b["Forecast Production Date"]);
    const dateCompare = dateA.getTime() - dateB.getTime();
    if (dateCompare !== 0) return dateCompare;

    const safeString = (value: any): string => (value == null ? "" : String(value));

    const index1Compare = safeString(a.Index1).localeCompare(safeString(b.Index1));
    if (index1Compare !== 0) return index1Compare;

    const rank1Compare = safeString(a.Rank1).localeCompare(safeString(b.Rank1));
    if (rank1Compare !== 0) return rank1Compare;

    return safeString(a.Rank2).localeCompare(safeString(b.Rank2));
  });
};

/** -------------------- yard new van invoice -------------------- */
const toNumber = (value: any) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const normalizeDateInput = (value: any): string => {
  if (value == null || value === "") return "";
  if (typeof value === "number") {
    const millis = value < 1e12 ? value * 1000 : value;
    return new Date(millis).toISOString();
  }
  if (typeof value === "object") {
    if (value.seconds) {
      return new Date(value.seconds * 1000).toISOString();
    }
    if (value._seconds) {
      return new Date(value._seconds * 1000).toISOString();
    }
  }
  return String(value);
};

const pickInvoiceDate = (source: Record<string, any>): string => {
  const candidates = [
    source.invoiceDate,
    source.InvoiceDate,
    source.invoice_date,
    source.handoverAt,
    source.HandoverAt,
    source.grDate,
    source.GRDate,
    source.pgiDateGRSO,
    source.PGIDateGRSO,
    source.createdAt,
    source.CreatedAt,
  ];

  const chosen = candidates.find((value) => value != null && value !== "");
  return normalizeDateInput(chosen);
};

export const subscribeToYardNewVanInvoices = (
  dealerSlug: string,
  callback: (data: YardNewVanInvoice[]) => void
) => {
  if (!dealerSlug) {
    callback([]);
    return () => {};
  }

  const invoicesRef = ref(database, `yardnewvaninvoice/${dealerSlug}`);

  const handler = (snapshot: DataSnapshot) => {
    const value = snapshot.val();
    if (!value) {
      callback([]);
      return;
    }

    const invoices: YardNewVanInvoice[] = Object.entries(value).map(([key, payload]: [string, any]) => {
      const rawSource = payload?._source;
      const source =
        rawSource && typeof rawSource === "object" && !Array.isArray(rawSource)
          ? rawSource
          : payload ?? {};

      return {
        id: key,
        chassisNumber: source.chassis ?? source.Chassis ?? source.chassisNumber ?? "",
        createdOn: normalizeDateInput(source.createdOn ?? source.createdAt ?? source.CreatedAt),
        invoiceDate: pickInvoiceDate(source),
        pgiDate: normalizeDateInput(source.pgiDateGRSO ?? source.PGIDateGRSO ?? source.pgiDate),
        purchasePrice: toNumber(source.poFinalInvoiceValue ?? source.POFinalInvoiceValue),
        finalSalePrice: toNumber(source.grSONetValue ?? source.GRSONetValue),
        discountAmount: toNumber(
          source.totalSurchargeSO ??
            source.TotalSurchargeSO ??
            source.zg00Amount ??
            source.ZG00Amount
        ),
        customer: source.customer ?? source.billToParty ?? "",
        model: source.model ?? "",
        grSONumber: source.grSONumber ?? "",
        locationName: source.locationName ?? dealerSlug,
        raw: source,
      };
    });

    callback(invoices);
  };

  onValue(invoicesRef, handler);
  return () => off(invoicesRef, "value", handler);
};

export const subscribeToSecondHandSales = (
  warehouseSlug: string,
  callback: (data: SecondHandSale[]) => void
) => {
  if (!warehouseSlug) {
    callback([]);
    return () => {};
  }

  const salesRef = ref(database, `secondhandsale/${warehouseSlug}`);

  const handler = (snapshot: DataSnapshot) => {
    const value = snapshot.val();
    if (!value) {
      callback([]);
      return;
    }

    const sales: SecondHandSale[] = Object.entries(value).map(([key, payload]: [string, any]) => {
      const source = payload ?? {};

      return {
        id: key,
        chassis: source.chassis ?? "",
        finalInvoicePrice: toNumber(source.final_so_invoice_price),
        invoiceDate: normalizeDateInput(source.invoice_date),
        item: source.item ?? "",
        material: source.material ?? "",
        pgiDate: normalizeDateInput(source.pgi_date),
        grDate: normalizeDateInput(source.gr_date),
        poLineNetValue: toNumber(source.po_line_net_value),
        so: source.so ?? "",
        updatedAt: normalizeDateInput(source.updated_at),
        warehouse: source.warehouse ?? "",
        warehouseSlug: source.warehouse_slug ?? warehouseSlug,
      };
    });

    callback(sales);
  };

  onValue(salesRef, handler);
  return () => off(salesRef, "value", handler);
};

/** -------------------- stock to customer -------------------- */
export const subscribeToStockToCustomer = (
  salesOfficeSlug: string,
  callback: (data: StockToCustomerRecord[]) => void
) => {
  if (!salesOfficeSlug) {
    callback([]);
    return () => {};
  }

  const sapStockRef = ref(database, "stock to customer");

  const normalizeOffice = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const handler = (snapshot: DataSnapshot) => {
    const value = snapshot.val();
    if (!value) {
      callback([]);
      return;
    }

    const targetSlug = normalizeOffice(salesOfficeSlug);

    const records: StockToCustomerRecord[] = Object.entries(value).map(([key, payload]: [string, any]) => {
      const source = payload ?? {};
      const salesOfficeName = String(source.Sales_Office_Name ?? source.salesOfficeName ?? "");

      return {
        id: key,
        salesOrder: source.Sales_Order ?? key,
        materialCode: source.SO_Material_0010 ?? "",
        materialDesc: source.SO_Material_0010_Desc ?? "",
        salesOfficeName: salesOfficeName || String(source.salesOfficeCode ?? targetSlug),
        updateDate: normalizeDateInput(source.UDATE_YYYYMMDD ?? source.updateDate),
        raw: source,
      };
    });

    const filtered = records.filter((record) => normalizeOffice(record.salesOfficeName) === targetSlug);

    callback(filtered);
  };

  onValue(sapStockRef, handler);
  return () => off(sapStockRef, "value", handler);
};

/** -------------------- new sales -------------------- */
export const subscribeToNewSales = (
  salesOfficeSlug: string,
  callback: (data: NewSaleRecord[]) => void
) => {
  if (!salesOfficeSlug) {
    callback([]);
    return () => {};
  }

  const salesRef = ref(database, `newsales/${salesOfficeSlug}`);

  const handler = (snapshot: DataSnapshot) => {
    const value = snapshot.val();
    if (!value) {
      callback([]);
      return;
    }

    const records: NewSaleRecord[] = Object.entries(value).map(([key, payload]: [string, any]) => ({
      id: key,
      createdOn: normalizeDateInput(payload.createdOn),
      salesOfficeName: payload.salesOfficeName ?? salesOfficeSlug,
      materialDesc0010: payload.materialDesc0010 ?? payload.materialDesc ?? payload.modelDesc ?? "",
      billToNameFinal: payload.billToNameFinal ?? payload.customerName ?? payload.customer,
      finalPriceExGst: toNumber(payload.final_price_exgst ?? payload.finalPriceExGst),
      zg00Amount: toNumber(payload.zg00_amount ?? payload.zg00Amount),
      chassisNumber: payload.chassisnumber ?? payload.chassisNumber ?? payload.chassis ?? "",
      priceSource: payload.price_source ?? payload.priceSource ?? payload.price_source_new ?? payload.priceSourceNew,
      soNetValue: toNumber(payload.so_net_value ?? payload.soNetValue ?? payload.soNetValueInclGst),
    }));

    callback(records);
  };

  onValue(salesRef, handler);
  return () => off(salesRef, "value", handler);
};

export const formatDateDDMMYYYY = (dateStr: string | null): string => {
  if (!dateStr || dateStr.trim() === "") return "Not set";
  try {
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        return `${day.toString().padStart(2, "0")}/${month
          .toString()
          .padStart(2, "0")}/${year}`;
      }
    }
  } catch {}
  return dateStr as string;
};

/** -------------------- stock / reallocation -------------------- */
export function subscribeToStock(cb: (value: any) => void) {
  const r = ref(database, "stockorder");
  const handler = (snap: DataSnapshot) => cb(snap?.exists() ? snap.val() ?? {} : {});
  onValue(r, handler);
  return () => off(r, "value", handler);
}

export function subscribeToReallocation(cb: (value: any) => void) {
  const r = ref(database, "reallocation");
  const handler = (snap: DataSnapshot) => cb(snap?.exists() ? snap.val() ?? {} : {});
  onValue(r, handler);
  return () => off(r, "value", handler);
}

/** -------------------- PGI / Yard Stock -------------------- */
export function subscribeToPGIRecords(cb: (value: Record<string, any>) => void) {
  const r = ref(database, "pgirecord");
  const handler = (snap: DataSnapshot) => cb(snap?.exists() ? (snap.val() ?? {}) : {});
  onValue(r, handler);
  return () => off(r, "value", handler);
}

export function subscribeToYardStock(dealerSlug: string, cb: (value: Record<string, any>) => void) {
  const r = ref(database, `yardstock/${dealerSlug}`);
  const handler = (snap: DataSnapshot) => cb(snap?.exists() ? (snap.val() ?? {}) : {});
  onValue(r, handler);
  return () => off(r, "value", handler);
}

export function subscribeToYardPending(dealerSlug: string, cb: (value: Record<string, any>) => void) {
  const r = ref(database, `yardpending/${dealerSlug}`);
  const handler = (snap: DataSnapshot) => cb(snap?.exists() ? (snap.val() ?? {}) : {});
  onValue(r, handler);
  return () => off(r, "value", handler);
}

export function subscribeToYardPendingAll(cb: (value: Record<string, any>) => void) {
  const r = ref(database, "yardpending");
  const handler = (snap: DataSnapshot) => cb(snap?.exists() ? (snap.val() ?? {}) : {});
  onValue(r, handler);
  return () => off(r, "value", handler);
}

const DELIVERY_DOC_EXTENSION_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/webp": "webp",
};

function normalizeFileExtension(value?: string | null) {
  if (!value) return "";
  return value.replace(/^\./, "").trim().toLowerCase();
}

function getDeliveryDocExtension(filename?: string, contentType?: string) {
  const extFromName = normalizeFileExtension(filename?.split(".").pop());
  if (extFromName) return extFromName;
  const normalizedType = (contentType || "").toLowerCase();
  return DELIVERY_DOC_EXTENSION_BY_MIME[normalizedType] || "pdf";
}

type UploadDeliveryDocumentOptions = {
  filename?: string;
  contentType?: string;
};

export async function uploadDeliveryDocument(
  chassis: string,
  file: Blob,
  options: UploadDeliveryDocumentOptions = {}
): Promise<string> {
  const sanitized = chassis.trim().replace(/\s+/g, "").toUpperCase();
  const key = sanitized || `delivery_${Date.now()}`;
  const fileName = options.filename ?? (file instanceof File ? file.name : undefined);
  const rawContentType = options.contentType ?? (file instanceof File ? file.type : file.type);
  const contentType = rawContentType || "application/octet-stream";
  const extension = getDeliveryDocExtension(fileName, contentType);
  const fileRef = storageRef(storage, `deliverydoc/${key}.${extension}`);
  await uploadBytes(fileRef, file, { contentType });
  return getDownloadURL(fileRef);
}

export async function receiveChassisToYard(
  dealerSlug: string,
  chassis: string,
  pgiData: Record<string, any> | null | undefined
) {
  const targetRef = ref(database, `yardstock/${dealerSlug}/${chassis}`);
  const now = new Date().toISOString();
  const sanitizedPGIData: Record<string, any> = {};
  if (pgiData && typeof pgiData === "object") {
    for (const [key, value] of Object.entries(pgiData)) {
      sanitizedPGIData[key] = value ?? null;
    }
  }
  await set(targetRef, {
    ...sanitizedPGIData,
    receivedAt: now,
    from_pgidate:
      sanitizedPGIData.pgidate ??
      sanitizedPGIData.PGIDate ??
      sanitizedPGIData.pgIDate ??
      sanitizedPGIData.PgiDate ??
      null,
    dealer: sanitizedPGIData.dealer ?? null,
    model: sanitizedPGIData.model ?? null,
    customer: sanitizedPGIData.customer ?? null,
    type: "Stock",
  });

  const pgiRef = ref(database, `pgirecord/${chassis}`);
  await remove(pgiRef);
}

export async function markPGIHistory(chassis: string, history = true) {
  const pgiRef = ref(database, `pgirecord/${chassis}`);
  await update(pgiRef, { history });
}

export async function addManualChassisToYard(
  dealerSlug: string,
  payload: {
    chassis: string;
    receivedAt?: string | null;
    model?: string | null;
    vinnumber?: string | null;
    vinNumber?: string | null;
    wholesalePo?: number | null;
    type?: string | null;
  }
) {
  const targetRef = ref(database, `yardstock/${dealerSlug}/${payload.chassis}`);
  const now = new Date().toISOString();
  const vin = payload.vinnumber ?? payload.vinNumber ?? null;
  const wholesale = payload.wholesalePo ?? null;
  await set(targetRef, {
    receivedAt: payload.receivedAt ?? now,
    dealer: null,
    model: payload.model ?? null,
    customer: null,
    manual: true,
    type: payload.type ?? null,
    vinNumber: vin,
    vinnumber: vin,
    wholesalePo: wholesale,
    wholesalepo: wholesale,
  });
}

export async function addManualChassisToYardPending(
  dealerSlug: string,
  payload: {
    chassis: string;
    receivedAt?: string | null;
    model?: string | null;
    vinnumber?: string | null;
    vinNumber?: string | null;
    wholesalePo?: number | null;
    type?: string | null;
  }
) {
  const targetRef = ref(database, `yardpending/${dealerSlug}/${payload.chassis}`);
  const now = new Date().toISOString();
  const vin = payload.vinnumber ?? payload.vinNumber ?? null;
  const wholesale = payload.wholesalePo ?? null;
  await set(targetRef, {
    chassis: payload.chassis,
    requestedAt: now,
    receivedAt: payload.receivedAt ?? null,
    dealerSlug,
    dealer: dealerSlug,
    model: payload.model ?? null,
    customer: null,
    manual: true,
    type: payload.type ?? null,
    status: "pending",
    vinNumber: vin,
    vinnumber: vin,
    wholesalePo: wholesale,
    wholesalepo: wholesale,
  });
}

export async function dispatchFromYard(dealerSlug: string, chassis: string) {
  const yardRef = ref(database, `yardstock/${dealerSlug}/${chassis}`);
  await remove(yardRef);
}

/** -------------------- Stock rectification -------------------- */
export async function reportInvalidStock(dealerSlug: string, chassis: string) {
  const targetRef = ref(database, `stockrectification/${dealerSlug}/${chassis}`);
  const now = new Date().toISOString();
  await set(targetRef, { chassis, dealerSlug, createdAt: now, source: "report-invalid-stock" });
}

export function subscribeToStockRectificationAll(cb: (value: Record<string, any>) => void) {
  const r = ref(database, "stockrectification");
  const handler = (snap: DataSnapshot) => cb(snap?.exists() ? (snap.val() ?? {}) : {});
  onValue(r, handler);
  return () => off(r, "value", handler);
}

/** -------------------- Product Registration -------------------- */
type CustomerAddress = {
  street: string;
  suburb: string;
  country: "Australia" | "New Zealand";
  state: string;
  postcode: string;
};

export async function saveProductRegistration(
  dealerSlug: string,
  chassis: string,
  data: {
    chassis: string;
    model: string | null;
    dealerName: string | null;
    dealerSlug: string | null;
    handoverAt: string;
    customer: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      address: CustomerAddress;
    };
    createdAt: string;
    method: "dealer_assist";
  }
) {
  const targetRef = ref(database, `registrations/${dealerSlug}/${chassis}`);
  await set(targetRef, data);
}

/** -------------------- Handover -------------------- */
/**
 * Save handover data under handover/{dealerSlug}/{chassis} and remove the unit from yardstock.
 */
type DealerAssistHandover = {
  chassis: string;
  model: string | null;
  dealerName: string | null;
  dealerSlug: string | null;
  handoverAt: string;
  vinnumber?: string | null;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address: CustomerAddress;
  };
  createdAt: string;
  source: "dealer_assist_form";
};

type CustomerEmailHandover = {
  chassis: string;
  model: string | null;
  dealerName: string | null;
  dealerSlug: string | null;
  handoverAt: string;
  createdAt: string;
  source: "customer email";
  vinnumber?: string | null;
  invite: {
    email: string;
  };
};
export type HandoverPayload = DealerAssistHandover | CustomerEmailHandover;

export async function saveHandover(dealerSlug: string, chassis: string, data: HandoverPayload) {
  const targetRef = ref(database, `handover/${dealerSlug}/${chassis}`);
  await set(targetRef, data);
  const yardRef = ref(database, `yardstock/${dealerSlug}/${chassis}`);
  await remove(yardRef);
}

/**
 * Subscribe to handover entries under handover/{dealerSlug}
 */
export function subscribeToHandover(
  dealerSlug: string,
  cb: (value: Record<string, any>) => void
) {
  const r = ref(database, `handover/${dealerSlug}`);
  const handler = (snap: DataSnapshot) => cb(snap?.exists() ? (snap.val() ?? {}) : {});
  onValue(r, handler);
  return () => off(r, "value", handler);
}
