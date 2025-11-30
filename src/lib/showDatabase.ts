import { getApps, initializeApp } from "firebase/app";
import { DataSnapshot, getDatabase, off, onValue, ref } from "firebase/database";
import type { ShowRecord } from "@/types/show";

const showFirebaseConfig = {
  apiKey: "AIzaSyCxOWHjnnyjILF_zZFC0gVha9rx8nrpGwE",
  authDomain: "snowyrivercaravanshow.firebaseapp.com",
  databaseURL: "https://snowyrivercaravanshow-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "snowyrivercaravanshow",
  storageBucket: "snowyrivercaravanshow.firebasestorage.app",
  messagingSenderId: "694283393601",
  appId: "1:694283393601:web:7881e6874d48a689c7c4c0",
  measurementId: "G-30FVX1JBT8",
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

export { showDatabase };
