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

export const isFinanceReportEnabled = (slug?: string): boolean => {
  if (!slug) return false;
  return FINANCE_REPORT_ENABLED_SLUGS.has(slug);
};

const GROUP_DEALER_KEY_PREFIX = "dealergroup:selectedDealer:";

export const rememberGroupDealerSlug = (groupSlug?: string, dealerSlug?: string) => {
  if (typeof window === "undefined") return;
  if (!groupSlug || !dealerSlug) return;
  window.sessionStorage.setItem(`${GROUP_DEALER_KEY_PREFIX}${normalizeDealerSlug(groupSlug)}`, normalizeDealerSlug(dealerSlug));
};

export const getRememberedGroupDealerSlug = (groupSlug?: string): string | null => {
  if (typeof window === "undefined") return null;
  if (!groupSlug) return null;
  return window.sessionStorage.getItem(`${GROUP_DEALER_KEY_PREFIX}${normalizeDealerSlug(groupSlug)}`);
};
