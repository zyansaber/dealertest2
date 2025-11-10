// src/lib/firebase.ts
import { initializeApp } from "firebase/app";
import {
  getDatabase,
  ref,
  onValue,
  off,
  set,
  get,
  remove,
  DataSnapshot,
} from "firebase/database";
import type { ScheduleItem, SpecPlan, DateTrack } from "@/types";

const firebaseConfig = {
  apiKey: "AIzaSyBcczqGj5X1_w9aCX1lOK4-kgz49Oi03Bg",
  authDomain: "scheduling-dd672.firebaseapp.com",
  databaseURL: "https://scheduling-dd672-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "scheduling-dd672",
  storageBucket: "scheduling-dd672.firebasestorage.app",
  messagingSenderId: "432092773012",
  appId: "1:432092773012:web:ebc7203ea570b0da2ad281",
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export { database };

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

export async function receiveChassisToYard(
  dealerSlug: string,
  chassis: string,
  pgiData: { pgidate?: string | null; dealer?: string | null; model?: string | null; customer?: string | null }
) {
  const targetRef = ref(database, `yardstock/${dealerSlug}/${chassis}`);
  const now = new Date().toISOString();
  await set(targetRef, {
    receivedAt: now,
    from_pgidate: pgiData?.pgidate ?? null,
    dealer: pgiData?.dealer ?? null,
    model: pgiData?.model ?? null,
    customer: pgiData?.customer ?? null,
  });

  const pgiRef = ref(database, `pgirecord/${chassis}`);
  await remove(pgiRef);
}

export async function addManualChassisToYard(dealerSlug: string, chassis: string) {
  const targetRef = ref(database, `yardstock/${dealerSlug}/${chassis}`);
  const now = new Date().toISOString();
  await set(targetRef, {
    receivedAt: now,
    dealer: null,
    model: null,
    customer: null,
    manual: true,
  });
}

export async function dispatchFromYard(dealerSlug: string, chassis: string) {
  const yardRef = ref(database, `yardstock/${dealerSlug}/${chassis}`);
  await remove(yardRef);
}

/** -------------------- Product Registration -------------------- */
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
      address: string;
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
 * Save handover data under handover/{dealerSlug}/{chassis}.
 */
type DealerAssistHandover = {
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
    address: string;
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
  invite: {
    email: string;
  };
};

export type HandoverPayload = DealerAssistHandover | CustomerEmailHandover;

export async function saveHandover(dealerSlug: string, chassis: string, data: HandoverPayload) {
  const targetRef = ref(database, `handover/${dealerSlug}/${chassis}`);
  await set(targetRef, data);
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
