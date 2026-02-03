export function normalizeDealerSlug(raw?: string): string {
  const slug = (raw || "").toLowerCase();
  const match = slug.match(/^(.*?)-([a-z0-9]{6})$/);
  return match ? match[1] : slug;
}

export function prettifyDealerName(slug?: string): string {
  if (!slug) return "";
  const spaced = slug.replace(/-/g, " ").trim();
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}

export const FINANCE_REPORT_ENABLED_SLUGS = new Set<string>([
  "frankston",
  "geelong",
  "launceston",
  "st-james",
  "traralgon",
]);

export const STOCK_RECTIFICATION_ENABLED_SLUGS = new Set<string>([
  "frankston",
  "geelong",
  "launceston",
  "st-james",
  "traralgon",
]);

export const isFinanceReportEnabled = (slug?: string): boolean => {
  if (!slug) return false;
  return FINANCE_REPORT_ENABLED_SLUGS.has(slug);
};

export const isStockRectificationEnabled = (slug?: string): boolean => {
  if (!slug) return false;
  return STOCK_RECTIFICATION_ENABLED_SLUGS.has(slug);
};
