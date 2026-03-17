import { tr, type PlanningLang } from "./i18n";

export type PlanningOrderType = "stock" | "customer" | "prototype";

export const getPlanningOrderType = (customerValue: unknown): PlanningOrderType => {
  const customer = String(customerValue ?? "").trim().toLowerCase();
  if (customer === "prototype") return "prototype";
  if (customer.endsWith("stock")) return "stock";
  return "customer";
};

export const isPlanningCustomerOrder = (orderType: PlanningOrderType) =>
  orderType === "customer";

export const planningOrderTypeLabel = (lang: PlanningLang, orderType: PlanningOrderType) => {
  if (orderType === "stock") return tr(lang, "Stock", "管理订单");
  if (orderType === "prototype") return tr(lang, "Prototype", "试制车");
  return tr(lang, "Customer", "客户订单");
};
