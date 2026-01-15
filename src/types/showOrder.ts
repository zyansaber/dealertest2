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
  approvedBy?: string;
  cancelledBy?: string;
  contractNumber?: string;
  contractValue?: number;
  handoverDealer?: string;
  salespersonOrderComments?: string;
  orderAttachments?: Array<{
    name?: string;
    path?: string;
    uploadedAt?: string;
    url?: string;
  }>;
};
