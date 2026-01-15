// src/types/showOrder.ts
export type ShowOrder = {
  orderId: string;
  id?: string;
  showId: string;
  date?: string;
  model?: string;
  orderType?: string;
  status?: string;
  salesperson?: string;
  customerName?: string;
  chassisNumber?: string;
  dealerConfirm?: boolean;
  dealerConfirmAt?: string;
};
