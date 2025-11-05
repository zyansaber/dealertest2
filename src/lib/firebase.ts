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

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getDatabase(app);

/* =========================
 *  工具函数
 * ========================= */
export type Unsubscribe = () => void;

const toStr = (v: any) => String(v ?? "");
const lower = (v: any) => toStr(v).toLowerCase();
const clampSlug = (s: string) => lower(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
export const normalizeDealerSlug = (raw?: string) => {
  const slug = lower(raw);
  const m = slug?.match(/^(.*?)-([a-z0-9]{6})$/);
  return m ? m[1] : slug;
};

const tsToISO = (v: any): string | null => {
  if (v == null) return null;
  if (typeof v === "number") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
};

function safeOnValue<T = any>(r: DatabaseReference, cb: (val: T) => void): Unsubscribe {
  const handler = (snap: any) => cb((snap.val() ?? {}) as T);
  onValue(r, handler);
  return () => off(r, "value", handler);
}

/* =========================
 *  通用订阅：Schedule / Dealer Config / Stock / Reallocation / PGI
 * ========================= */

// Schedule 订阅（返回数组，元素含 Chassis/Model/Customer 等；未做强过滤）
// options 目前保留形参，后续需要时可在这里实现 includeNoChassis 等筛选
export function subscribeToSchedule(
  callback: (rows: any[]) => void,
  _options?: { includeNoChassis?: boolean; includeNoCustomer?: boolean; includeFinished?: boolean }
): Unsubscribe {
  // 你的历史项目里有多写法：schedule/spec_plan/dateTrack 等并存
  // 这里只订 schedule 根；如需兼容其它命名，可自行扩展
  const r = ref(db, "schedule");
  return safeOnValue<Record<string, any>>(r, (obj) => {
    const rows: any[] = [];
    Object.entries(obj || {}).forEach(([chassis, v]: any) => {
      // 允许两种常见字段命名
      const item = {
        Chassis: chassis,
        Model: v?.Model ?? v?.model ?? "",
        Customer: v?.Customer ?? v?.customer ?? "",
        Dealer: v?.Dealer ?? v?.dealer ?? "",
        ...(v || {}),
      };
      rows.push(item);
    });
    callback(rows);
  });
}

// Dealer 配置
export function subscribeDealerConfig(slug: string, callback: (cfg: any | null) => void): Unsubscribe {
  const s = normalizeDealerSlug(slug);
  const r = ref(db, `dealerConfigs/${s}`);
  return safeOnValue<any>(r, (v) => callback(v || null));
}
export function subscribeAllDealerConfigs(callback: (map: Record<string, any>) => void): Unsubscribe {
  const r = ref(db, "dealerConfigs");
  return safeOnValue<Record<string, any>>(r, (v) => callback(v || {}));
}
export async function setDealerConfig(slug: string, cfg: any) {
  const s = normalizeDealerSlug(slug);
  await set(ref(db, `dealerConfigs/${s}`), cfg ?? {});
}
export async function removeDealerConfig(slug: string) {
  const s = normalizeDealerSlug(slug);
  await remove(ref(db, `dealerConfigs/${s}`));
}
export async function setPowerbiUrl(slug: string, url: string) {
  const s = normalizeDealerSlug(slug);
  await update(ref(db, `dealerConfigs/${s}`), { powerbiUrl: url });
}

// Stock / Reallocation（只读）
export function subscribeToStock(callback: (data: Record<string, any>) => void): Unsubscribe {
  return safeOnValue<Record<string, any>>(ref(db, "stockorder"), (v) => callback(v || {}));
}
export function subscribeToReallocation(callback: (data: Record<string, any>) => void): Unsubscribe {
  return safeOnValue<Record<string, any>>(ref(db, "reallocation"), (v) => callback(v || {}));
}

// PGI 记录（pgirecord）
export function subscribeToPGIRecords(callback: (map: Record<string, any>) => void): Unsubscribe {
  return safeOnValue<Record<string, any>>(ref(db, "pgirecord"), (v) => callback(v || {}));
}

/* =========================
 *  Yard / Handover 订阅与写入
 * ========================= */

// 单经销商 Yard
export function subscribeToYardStock(dealerSlug: string, callback: (map: Record<string, any>) => void): Unsubscribe {
  const s = normalizeDealerSlug(dealerSlug);
  return safeOnValue<Record<string, any>>(ref(db, `yardstock/${s}`), (v) => callback(v || {}));
}

// 单经销商 Handover
export function subscribeToHandover(dealerSlug: string, callback: (map: Record<string, any>) => void): Unsubscribe {
  const s = normalizeDealerSlug(dealerSlug);
  return safeOnValue<Record<string, any>>(ref(db, `handover/${s}`), (v) => callback(v || {}));
}

// 多经销商 Handover 聚合（用于集团页）
export function subscribeToHandoverForDealers(
  dealerSlugs: string[],
  callback: (all: Record<string, Record<string, any>>) => void
): Unsubscribe {
  const slugs = (dealerSlugs || []).map((x) => normalizeDealerSlug(x)).filter(Boolean);
  const offList: Unsubscribe[] = [];
  const accum: Record<string, Record<string, any>> = {};

  slugs.forEach((slug) => {
    const unsub = safeOnValue<Record<string, any>>(ref(db, `handover/${slug}`), (v) => {
      accum[slug] = v || {};
      // 返回一个合并后的快照
      callback({ ...accum });
    });
    offList.push(unsub);
  });

  return () => offList.forEach((fn) => fn());
}

/* Yard 写入：收货/手动入场/发车/交接保存 */
export async function receiveChassisToYard(
  dealerSlug: string,
  chassis: string,
  payload?: { model?: string; customer?: string } & Record<string, any>
) {
  const s = normalizeDealerSlug(dealerSlug);
  const ch = (chassis || "").toUpperCase();
  const path = `yardstock/${s}/${ch}`;
  const receivedAtISO = new Date().toISOString();
  const body = {
    chassis: ch,
    model: payload?.model ?? payload?.Model ?? "",
    customer: payload?.customer ?? payload?.Customer ?? "",
    dealer: s,
    receivedAt: receivedAtISO,
    source: payload?.source ?? "PGI",
    ...(payload || {}),
  };
  await set(ref(db, path), body);
}

export async function addManualChassisToYard(
  dealerSlug: string,
  chassis: string,
  extra?: { model?: string; customer?: string }
) {
  const s = normalizeDealerSlug(dealerSlug);
  const ch = (chassis || "").toUpperCase();
  const path = `yardstock/${s}/${ch}`;
  const body = {
    chassis: ch,
    model: extra?.model ?? "",
    customer: extra?.customer ?? "Stock",
    dealer: s,
    receivedAt: new Date().toISOString(),
    source: "manual",
  };
  await set(ref(db, path), body);
}

// 发车（仅从 yard 移除；真正的 handover 由 saveHandover 写入）
export async function dispatchFromYard(dealerSlug: string, chassis: string) {
  const s = normalizeDealerSlug(dealerSlug);
  const ch = (chassis || "").toUpperCase();
  await remove(ref(db, `yardstock/${s}/${ch}`));
}

/**
 * 保存 Handover（并从 yard 删除）
 * data 典型：
 * {
 *   chassis: "1TPQ205",
 *   dealerName: "St James",
 *   dealerSlug: "stjames",
 *   handoverAt: "2025-10-23T00:00:00.000Z",
 *   customer: "NA",
 *   model: "SRP19",
 *   source: "SAPdata" | "form" | ...
 * }
 */
export async function saveHandover(
  dealerSlug: string,
  chassis: string,
  data: {
    handoverAt?: string;
    customer?: string;
    model?: string;
    dealerName?: string;
    dealerSlug?: string;
    source?: string;
    createdAt?: string;
    [k: string]: any;
  }
) {
  const s = normalizeDealerSlug(dealerSlug);
  const ch = (chassis || "").toUpperCase();
  const nowISO = new Date().toISOString();
  const nodeRef = ref(db, `handover/${s}/${ch}`);

  // 兼容你的数据口径：createdAt 与 handoverAt 都写，默认用 now
  const body = {
    chassis: ch,
    dealerName: data?.dealerName ?? s,
    dealerSlug: s,
    model: data?.model ?? "",
    customer: data?.customer ?? "NA",
    source: data?.source ?? "SAPdata",
    createdAt: data?.createdAt ?? nowISO,
    handoverAt: data?.handoverAt ?? nowISO,
    ...data,
  };

  // 1) handover/{dealer}/{chassis}
  await set(nodeRef, body);

  // 2) 从 yard 移除
  await remove(ref(db, `yardstock/${s}/${ch}`));
}

/* =========================
 *  SpecPlan / DateTrack（只读，保留老接口方便其它页面）
 * ========================= */
export function subscribeToSpecPlan(callback: (map: Record<string, any>) => void): Unsubscribe {
  // 历史里有 spec_plan/specPlan/specplan 三种；这里按优先级订阅一个存在的节点
  const candidates = ["spec_plan", "specPlan", "specplan"];
  let stopped = false;
  const offList: Unsubscribe[] = [];

  const install = (path: string) =>
    safeOnValue<Record<string, any>>(ref(db, path), (v) => !stopped && callback(v || {}));

  candidates.forEach((p) => offList.push(install(p)));
  return () => {
    stopped = true;
    offList.forEach((fn) => fn());
  };
}

export function subscribeToDateTrack(callback: (map: Record<string, any>) => void): Unsubscribe {
  const candidates = ["dateTrack", "DateTrack", "date_track"];
  let stopped = false;
  const offList: Unsubscribe[] = [];

  const install = (path: string) =>
    safeOnValue<Record<string, any>>(ref(db, path), (v) => !stopped && callback(v || {}));

  candidates.forEach((p) => offList.push(install(p)));
  return () => {
    stopped = true;
    offList.forEach((fn) => fn());
  };
}

/* =========================
 *  Subscriptions（chassis 订阅/取消）
 * ========================= */
export function subscribeToSubscriptions(callback: (map: Record<string, any>) => void): Unsubscribe {
  return safeOnValue<Record<string, any>>(ref(db, "subscriptions"), (v) => callback(v || {}));
}
export async function addSubscription(chassis: string, payload: any) {
  const ch = (chassis || "").toUpperCase();
  await set(ref(db, `subscriptions/${ch}`), { chassis: ch, createdAt: serverTimestamp(), ...(payload || {}) });
}
export async function removeSubscription(chassis: string) {
  const ch = (chassis || "").toUpperCase();
  await remove(ref(db, `subscriptions/${ch}`));
}

/* =========================
 *  Utils（如果需要写入通用日志）
 * ========================= */
export async function appendLog(path: string, payload: any) {
  const keyRef = push(ref(db, path));
  await set(keyRef, { createdAt: serverTimestamp(), ...payload });
}
