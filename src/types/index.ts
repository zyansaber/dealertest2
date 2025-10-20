export interface ScheduleItem {
  Chassis: string;
  Customer: string;
  Dealer?: string;
  Model: string;
  "Model Year": string;
  "Forecast Production Date": string;
  "Regent Production": string;
  "Request Delivery Date"?: string;
  Shipment?: string;
  "Price Date"?: string;
  "Order Received Date"?: string;
  "Signed Plans Received"?: string;
  "Purchase Order Sent"?: string;
  Index1: string;
  Rank1: string;
  Rank2: string;
}

export interface SpecPlan {
  [chassisNumber: string]: {
    "Plan File": string;
    "Spec File": string;
  };
}

export interface SpecPlanItem {
  plan?: string;
  spec?: string;
}

export interface DateTrackItem {
  "Chassis Number": string;
  "Material Received": string;
  "Production Start": string;
  "Quality Check": string;
  "Delivery Ready": string;
  "Left Port"?: string;
  "Received in Melbourne"?: string;
  "Dispatched from Factory"?: string;
  "GRPURCHASEORDER"?: string;
}

export interface DateTrack {
  [key: string]: DateTrackItem;
}

export interface FilterOptions {
  model: string;
  modelYear: string;
  regentProduction: string;
  customerType: string; // 新增：stock 或 customer 筛选
  dateRange: {
    start: string;
    end: string;
  };
  searchTerm: string;
}

export interface DealerInfo {
  name: string;
  orderCount: number;
  activeOrders: number;
}

export interface TimelineStage {
  name: string;
  date: string | null;
  status: "completed" | "in-progress" | "pending";
  grpo?: string;
}

export interface SubscriptionData {
  chassis: string;
  email: string;
  status: string;
  subscribedAt: string;
}

// Export dealer types
export * from './dealer';
