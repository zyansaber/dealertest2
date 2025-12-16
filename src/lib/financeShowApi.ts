const fallbackShowDatabaseUrl =
  "https://snowyrivercaravanshow-default-rtdb.asia-southeast1.firebasedatabase.app";

const resolveShowDatabaseUrl = () => {
  const fromEnv =
    import.meta.env.VITE_SHOW_DATABASE_URL || import.meta.env.VITE_SHOW_FIREBASE_DATABASE_URL;
  const base = (fromEnv || fallbackShowDatabaseUrl).trim().replace(/\/?$/, "");
  return `${base}`;
};

const toText = (value: any): string => {
  if (value === null || typeof value === "undefined") return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.filter(Boolean).map((item) => toText(item)).join(", ");
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export type FinanceExpense = {
  id: string;
  name: string;
  category?: string;
  contains?: string;
  glCode?: string;
};

export type InternalSalesOrderRecord = {
  id: string;
  showId?: string;
  showI?: string;
  showName?: string;
  internalSalesOrderNumber?: string;
  orderNumber?: string;
  location?: string;
  createdAt?: string;
};

export type FinanceShowRecord = {
  id: string;
  name?: string;
  siteLocation?: string;
  startDate?: string;
  finishDate?: string;
  dealership?: string;
};

export type FinanceDataSnapshot = {
  expenses: FinanceExpense[];
  internalSalesOrders: InternalSalesOrderRecord[];
  shows: FinanceShowRecord[];
};

const fetchJson = async <T>(path: string): Promise<T | null> => {
  const baseUrl = resolveShowDatabaseUrl();
  const response = await fetch(`${baseUrl}/${path}.json`);

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Fetch failed for ${path}: ${response.status} ${detail}`);
  }

  return (await response.json()) as T;
};

const normalizeCollection = <T extends { id?: string }>(raw: any): T[] => {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw.filter(Boolean).map((item, index) => ({ id: item?.id || String(index), ...item }));
  }

  if (typeof raw === "object") {
    return Object.entries(raw)
      .filter(([, value]) => Boolean(value))
      .map(([key, value]) => ({ id: key, ...(value as object) })) as T[];
  }

  return [];
};

const normalizeExpenses = (raw: any): FinanceExpense[] =>
  normalizeCollection<FinanceExpense>(raw).map((item) => ({
    id: item.id,
    name: toText((item as any).name),
    category: toText((item as any).category),
    contains: toText((item as any).contains || (item as any).keywords),
    glCode: toText((item as any).glCode || (item as any).glcode),
  }));

const normalizeInternalOrders = (raw: any): InternalSalesOrderRecord[] =>
  normalizeCollection<InternalSalesOrderRecord>(raw).map((item) => {
    const payload: InternalSalesOrderRecord = {
      id: item.id,
      showId: toText((item as any).showId || (item as any).showID || (item as any).showid),
      showI: toText((item as any).showI),
      showName: toText((item as any).showName || (item as any).name),
      internalSalesOrderNumber:
        toText(
          (item as any).internalSalesOrderNumber ||
            (item as any).internalSalesOrderNo ||
            (item as any).isoNumber
        ),
      orderNumber: toText((item as any).orderNumber),
      location: toText((item as any).location),
      createdAt: toText((item as any).createdAt),
    };

    if (!payload.showId && payload.showI) payload.showId = payload.showI;

    return payload;
  });

const normalizeShows = (raw: any): FinanceShowRecord[] =>
  normalizeCollection<FinanceShowRecord>(raw).map((item) => ({
    id: item.id,
    name: toText((item as any).name || (item as any).showName),
    siteLocation: toText((item as any).siteLocation || (item as any).location || (item as any).place),
    startDate: toText((item as any).startDate || (item as any).start || (item as any).begin),
    finishDate: toText((item as any).finishDate || (item as any).endDate || (item as any).end),
    dealership: toText((item as any).dealership || (item as any).dealer),
  }));

export const fetchFinanceSnapshot = async (): Promise<FinanceDataSnapshot> => {
  const [expensesRaw, internalSalesOrdersRaw, showsRaw] = await Promise.all([
    fetchJson("finance/expenses"),
    fetchJson("finance/internalSalesOrders"),
    fetchJson("shows"),
  ]);

  return {
    expenses: normalizeExpenses(expensesRaw),
    internalSalesOrders: normalizeInternalOrders(internalSalesOrdersRaw),
    shows: normalizeShows(showsRaw),
  };
};

export const financeDataSummary = (snapshot: FinanceDataSnapshot) => ({
  expenses: snapshot.expenses.length,
  internalSalesOrders: snapshot.internalSalesOrders.length,
  shows: snapshot.shows.length,
});

export { resolveShowDatabaseUrl };
