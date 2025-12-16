+131
-0

const fallbackShowDatabaseUrl =
  "https://snowyrivercaravanshow-default-rtdb.asia-southeast1.firebasedatabase.app";

const resolveShowDatabaseUrl = () => {
  const fromEnv =
    import.meta.env.VITE_SHOW_DATABASE_URL || import.meta.env.VITE_SHOW_FIREBASE_DATABASE_URL;
  const base = (fromEnv || fallbackShowDatabaseUrl).trim().replace(/\/?$/, "");
  return `${base}`;
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
    name: (item as any).name || "",
    category: (item as any).category || "",
    contains: (item as any).contains || (item as any).keywords || "",
    glCode: (item as any).glCode || (item as any).glcode || "",
  }));

const normalizeInternalOrders = (raw: any): InternalSalesOrderRecord[] =>
  normalizeCollection<InternalSalesOrderRecord>(raw).map((item) => {
    const payload: InternalSalesOrderRecord = {
      id: item.id,
      showId: (item as any).showId || (item as any).showID || (item as any).showid,
      showI: (item as any).showI,
      showName: (item as any).showName || (item as any).name,
      internalSalesOrderNumber:
        (item as any).internalSalesOrderNumber || (item as any).internalSalesOrderNo || (item as any).isoNumber,
      orderNumber: (item as any).orderNumber,
      location: (item as any).location,
      createdAt: (item as any).createdAt,
    };

    if (!payload.showId && payload.showI) payload.showId = payload.showI;

    return payload;
  });

const normalizeShows = (raw: any): FinanceShowRecord[] =>
  normalizeCollection<FinanceShowRecord>(raw).map((item) => ({
    id: item.id,
    name: (item as any).name || (item as any).showName || "",
    siteLocation: (item as any).siteLocation || (item as any).location || (item as any).place,
    startDate: (item as any).startDate || (item as any).start || (item as any).begin,
    finishDate: (item as any).finishDate || (item as any).endDate || (item as any).end,
    dealership: (item as any).dealership || (item as any).dealer,
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
