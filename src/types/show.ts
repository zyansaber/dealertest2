// src/types/show.ts
export type ShowRecord = {
  id: string;
  name: string;
  dealership: string;
  handoverDealer?: string;
  siteLocation?: string;
  layoutAddress?: string;
  standSize?: string;
  eventOrganiser?: string;
  startDate?: string;
  finishDate?: string;
  showDuration?: number;
  caravansOnDisplay?: number;
  sales2024?: number;
  sales2025?: number;
  sales2026?: number;
  target2024?: number;
  target2025?: number;
  target2026?: number;
  status?: string;
};
