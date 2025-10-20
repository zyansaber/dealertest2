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
/**
 * 默认行为（不传 options）：
 *  - 过滤掉 "Regent Production" = Finished/Finish
 *  - 必须有 Chassis（存在且非空）
 *  - 必须有 Customer（存在且非空）
 *
 * 只有 UnsignedEmptySlots 页面需要放开时，才传 options：
 *  subscribeToSchedule(cb, {
 *    includeNoChassis: true,
 *    includeNoCustomer: true,
 *    includeFinished: true,
 *  })
 */
export const subscribeToSchedule = (
  callback: (data: ScheduleItem[]) => void,
  options: { includeNoChassis?: boolean; includeNoCustomer?: boolean; includeFinished?: boolean } = {}
) => {
  const { includeNoChassis = false, includeNoCustomer = false, includeFinished = false } = options;

  const scheduleRef = ref(database, "schedule");

  const handler = (snapshot: DataSnapshot) => {
    const raw = snapshot.val();

    // 统一成数组，兼容对象/数组两种形态，并过滤掉空值
    const list: any[] = raw
      ? Array.isArray(raw)
        ? raw.filter(Boolean)
        : Object.values(raw).filter(Boolean)
      : [];

    const filtered: ScheduleItem[] = list.filter((item: any) => {
      // 1) 过滤 Finished（除非放开）
      if (!includeFinished) {
        const rp = String(item?.["Regent Production"] ?? "").toLowerCase();
        if (rp === "finished" || rp === "finish") return false;
      }
      // 2) 必须有 Chassis（除非放开）
      if (!includeNoChassis) {
        if (!("Chassis" in (item ?? {})) || String(item?.Chassis ?? "") === "") return false;
      }
      // 3) 必须有 Customer（除非放开）
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
/** 同时订阅 spec_plan / specPlan / specplan，任一路径有数据就回调（与 DealerPortal 对齐） */
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
/** 同时订阅 dateTrack 与 datetrack，任一路径有数据就回调（兼容大小写差异） */
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
// 订阅所有经销商配置
export const subscribeAllDealerConfigs = (callback: (data: any) => void) => {
  const configsRef = ref(database, "dealerConfigs");

  const handler = (snapshot: DataSnapshot) => {
    const data = snapshot.val();
    callback(data || {});
  };

  onValue(configsRef, handler);
  return () => off(configsRef, "value", handler);
};

// 订阅单个经销商配置
export const subscribeDealerConfig = (dealerSlug: string, callback: (data: any) => void) => {
  const configRef = ref(database, `dealerConfigs/${dealerSlug}`);

  const handler = (snapshot: DataSnapshot) => {
    const data = snapshot.val();
    callback(data || null);
  };

  onValue(configRef, handler);
  return () => off(configRef, "value", handler);
};

// 设置经销商配置
export const setDealerConfig = async (dealerSlug: string, config: any) => {
  const configRef = ref(database, `dealerConfigs/${dealerSlug}`);
  await set(configRef, {
    ...config,
    slug: dealerSlug,
    updatedAt: new Date().toISOString(),
  });
};

// 删除经销商配置
export const removeDealerConfig = async (dealerSlug: string) => {
  const configRef = ref(database, `dealerConfigs/${dealerSlug}`);
  await remove(configRef);
};

// 设置PowerBI URL
export const setPowerbiUrl = async (dealerSlug: string, url: string) => {
  const urlRef = ref(database, `dealerConfigs/${dealerSlug}/powerbi_url`);
  await set(urlRef, url);

  // 同时更新 updatedAt
  const updatedAtRef = ref(database, `dealerConfigs/${dealerSlug}/updatedAt`);
  await set(updatedAtRef, new Date().toISOString());
};

// 获取PowerBI URL
export const getPowerbiUrl = async (dealerSlug: string): Promise<string | null> => {
  const urlRef = ref(database, `dealerConfigs/${dealerSlug}/powerbi_url`);
  const snapshot = await get(urlRef);
  return snapshot.exists() ? snapshot.val() : null;
};

// 生成随机6位字符串
export function generateRandomCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 将dealer名称转换为slug
export function dealerNameToSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** -------------------- 工具函数（保留你的排序/格式化） -------------------- */
// 解析 dd/mm/yyyy 格式的日期
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
