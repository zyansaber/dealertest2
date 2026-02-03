import { getApps, initializeApp } from "firebase/app";
import { DataSnapshot, get, getDatabase, off, onValue, ref, update } from "firebase/database";
import type { ShowRecord } from "@/types/show";
import type { ShowOrder } from "@/types/showOrder";
import type { TeamMember } from "@/types/teamMember";
import type { ShowTask } from "@/types/showTask";

const requireEnv = (key: string, context: string) => {
  const value = import.meta.env?.[key];
  if (!value) {
    throw new Error(`Missing environment variable ${key} for ${context}`);
  }
  return value;
};

const showFirebaseConfig = {
  apiKey: requireEnv("VITE_SHOW_FIREBASE_API_KEY", "show database Firebase config"),
  authDomain: requireEnv("VITE_SHOW_FIREBASE_AUTH_DOMAIN", "show database Firebase config"),
  databaseURL: requireEnv("VITE_SHOW_FIREBASE_DATABASE_URL", "show database Firebase config"),
  projectId: requireEnv("VITE_SHOW_FIREBASE_PROJECT_ID", "show database Firebase config"),
  storageBucket: requireEnv("VITE_SHOW_FIREBASE_STORAGE_BUCKET", "show database Firebase config"),
  messagingSenderId: requireEnv("VITE_SHOW_FIREBASE_MESSAGING_SENDER_ID", "show database Firebase config"),
  appId: requireEnv("VITE_SHOW_FIREBASE_APP_ID", "show database Firebase config"),
  measurementId: requireEnv("VITE_SHOW_FIREBASE_MEASUREMENT_ID", "show database Firebase config"),
};

const ensureShowApp = () => {
  const existing = getApps().find((app) => app.name === "showDatabase");
  if (existing) return existing;
  return initializeApp(showFirebaseConfig, "showDatabase");
};

const showApp = ensureShowApp();
const showDatabase = getDatabase(showApp);

export const parseFlexibleDateToDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const slashMatch = trimmed.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{2,4})$/);
  if (slashMatch) {
    const day = parseInt(slashMatch[1], 10);
    const month = parseInt(slashMatch[2], 10) - 1;
    const year = parseInt(slashMatch[3], 10);
    const parsed = new Date(year < 100 ? 2000 + year : year, month, day);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  const hyphenMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (hyphenMatch) {
    const year = parseInt(hyphenMatch[1], 10);
    const month = parseInt(hyphenMatch[2], 10) - 1;
    const day = parseInt(hyphenMatch[3], 10);
    const parsed = new Date(year, month, day);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(trimmed);
  return isNaN(parsed.getTime()) ? null : parsed;
};

const parseFlexibleDate = (value?: string | null): string => {
  const parsed = parseFlexibleDateToDate(value);
  if (!parsed) return "";
  return parsed.toLocaleDateString("en-AU", { year: "numeric", month: "short", day: "numeric" });
};

export const formatShowDate = (value?: string | null): string => {
  const formatted = parseFlexibleDate(value);
  return formatted || "Not set";
};

const resolveHandoverDealer = (item: any): string => {
  const candidates = [
    item?.handoverDealer,
    item?.handoverdealer,
    item?.handover_dealer,
    item?.["handover dealer"],
    item?.["Handover Dealer"],
  ];

  for (const candidate of candidates) {
    const value = typeof candidate === "string" ? candidate.trim() : "";
    if (value) return value;
  }

  return "";
};

export const subscribeToShows = (callback: (shows: ShowRecord[]) => void) => {
  const showsRef = ref(showDatabase, "shows");

  const handler = (snapshot: DataSnapshot) => {
    const raw = snapshot.val();
    const list: any[] = raw
      ? Array.isArray(raw)
        ? raw.filter(Boolean)
        : Object.values(raw).filter(Boolean)
      : [];

    const normalized: ShowRecord[] = list.map((item: any, index: number) => ({
      id: item.id ?? item.showId ?? String(index),
      name: item.name ?? "",
      dealership: item.dealership ?? "",
      handoverDealer: resolveHandoverDealer(item),
      siteLocation: item.siteLocation ?? "",
      layoutAddress: item.layoutAddress ?? "",
      standSize: item.standSize ?? "",
      eventOrganiser: item.eventOrganiser ?? "",
      startDate: item.startDate ?? "",
      finishDate: item.finishDate ?? "",
      showDuration: item.showDuration ?? 0,
      caravansOnDisplay: item.caravansOnDisplay ?? 0,
      sales2024: item.sales2024 ?? 0,
      sales2025: item.sales2025 ?? 0,
      sales2026: item.sales2026 ?? 0,
      target2024: item.target2024 ?? 0,
      target2025: item.target2025 ?? 0,
      target2026: item.target2026 ?? 0,
      status: item.status ?? "",
    }));

    callback(normalized);
  };

  onValue(showsRef, handler);
  return () => off(showsRef, "value", handler);
};

export const subscribeToShowOrders = (callback: (orders: ShowOrder[]) => void) => {
  const ordersRef = ref(showDatabase, "showOrders");

  const handler = (snapshot: DataSnapshot) => {
    const raw = snapshot.val();
    const list: any[] = raw
      ? Array.isArray(raw)
        ? raw.filter(Boolean)
        : Object.entries(raw).map(([key, value]) => ({ orderId: key, ...(value as any) }))
      : [];

    const normalized: ShowOrder[] = list.map((item: any) => ({
      orderId: item.orderId || item.id || "",
      id: item.id,
      showId: item.showId || "",
      date: item.date || "",
      model: item.model || "",
      orderType: item.orderType || "",
      status: item.status || "",
      salesperson: item.salesperson || "",
      chassisNumber: item.chassisNumber || "",
      customerName: item.customerName || item.customer || "",
      dealerConfirm: Boolean(item.dealerConfirm),
      dealerConfirmAt: item.dealerConfirmAt || "",
      approvedBy: item.approvedBy || "",
      cancelledBy: item.cancelledBy || "",
      contractNumber: item.contractNumber || "",
      contractValue: typeof item.contractValue === "number" ? item.contractValue : Number(item.contractValue ?? 0),
      handoverDealer: item.handoverDealer || "",
      salespersonOrderComments: item.salespersonOrderComments || "",
      dealershipComments: item.dealershipComments || "",
      orderAttachments: Array.isArray(item.orderAttachments) ? item.orderAttachments : [],
    }));

    callback(normalized.filter((item) => item.orderId));
  };

  onValue(ordersRef, handler);
  return () => off(ordersRef, "value", handler);
};

export const subscribeToShowTasks = (callback: (tasks: ShowTask[]) => void) => {
  const tasksRef = ref(showDatabase, "showTasks");

  const handler = (snapshot: DataSnapshot) => {
    const raw = snapshot.val();
    const list: any[] = raw
      ? Array.isArray(raw)
        ? raw.filter(Boolean)
        : Object.entries(raw).map(([key, value]) => ({ id: key, ...(value as any) }))
      : [];

    const normalized: ShowTask[] = list.map((item) => ({
      id: item.id || item.taskId || "",
      eventId: item.eventId || item.showId || "",
      taskName: item.taskName || item.name || "",
      status: item.status || "",
      assignedTo: item.assignedTo || item.assignee || "",
      dueDate: item.dueDate || "",
      notes: item.notes || "",
    }));

    callback(normalized.filter((item) => item.id && item.eventId));
  };

  onValue(tasksRef, handler);
  return () => off(tasksRef, "value", handler);
};

export const updateShowOrder = async (orderId: string, updates: Partial<ShowOrder>) => {
  const orderRef = ref(showDatabase, `showOrders/${orderId}`);
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  if (updates.dealerConfirm) {
    payload.dealerConfirmAt = new Date().toISOString();
  } else if (typeof updates.dealerConfirmAt !== "undefined") {
    payload.dealerConfirmAt = updates.dealerConfirmAt;
  }

  await update(orderRef, payload);
};

export const updateShowTask = async (taskId: string, updates: Partial<ShowTask>) => {
  const taskRef = ref(showDatabase, `showTasks/${taskId}`);
  const payload: Record<string, unknown> = {
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await update(taskRef, payload);
};

export const fetchShowOrderById = async (orderId: string): Promise<ShowOrder | null> => {
  if (!orderId) return null;

  const orderRef = ref(showDatabase, `showOrders/${orderId}`);
  const snapshot = await get(orderRef);

  if (!snapshot.exists()) return null;

  const data = snapshot.val();
  return {
    orderId,
    id: data.id,
    showId: data.showId || "",
    date: data.date || "",
    model: data.model || "",
    orderType: data.orderType || "",
    status: data.status || "",
    salesperson: data.salesperson || "",
    customerName: data.customerName || data.customer || "",
    chassisNumber: data.chassisNumber || "",
    dealerConfirm: Boolean(data.dealerConfirm),
    dealerConfirmAt: data.dealerConfirmAt || "",
    approvedBy: data.approvedBy || "",
    cancelledBy: data.cancelledBy || "",
    contractNumber: data.contractNumber || "",
    contractValue: typeof data.contractValue === "number" ? data.contractValue : Number(data.contractValue ?? 0),
    handoverDealer: data.handoverDealer || "",
    salespersonOrderComments: data.salespersonOrderComments || "",
    dealershipComments: data.dealershipComments || "",
    orderAttachments: Array.isArray(data.orderAttachments) ? data.orderAttachments : [],
  };
};

export const fetchTeamMembers = async (): Promise<TeamMember[]> => {
  const membersRef = ref(showDatabase, "teamMembers");
  const snapshot = await get(membersRef);

  if (!snapshot.exists()) return [];

  const raw = snapshot.val();
  const entries = Array.isArray(raw) ? raw.filter(Boolean) : Object.entries(raw).map(([id, value]) => ({ id, ...(value as object) }));

  return entries.map((item: any, index: number) => ({
    id: item.id ?? String(index),
    memberId: item.memberId ?? "",
    memberName: item.memberName ?? item.name ?? "",
    email: item.email ?? "",
    activeFlag: typeof item.activeFlag === "number" ? item.activeFlag : Number(item.activeFlag ?? 0),
    role: item.role ?? "",
    totalSales: item.totalSales ?? 0,
    totalWorkDays: item.totalWorkDays ?? 0,
  }));
};

export { showDatabase };
