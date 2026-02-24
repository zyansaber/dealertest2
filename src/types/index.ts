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

export interface CampervanScheduleItem {
  chassisNumber?: string;
  customer?: string;
  dealer?: string;
  duration?: string;
  eurPartsEta?: string;
  eurPartsOrderDate?: string;
  forecastProductionDate?: string;
  latestEurPartsOrder?: string;
  latestLongtreePartsOrder?: string;
  latestVehicleOrder?: string;
  longtreePartsEta?: string;
  longtreePartsOrderDate?: string;
  model?: string;
  productionPlannedEndDate?: string;
  productionPlannedStartDate?: string;
  regentProduction?: string;
  rowNumber?: number;
  signedOrderReceived?: string;
  vehicle?: string;
  vehicleOrderDate?: string;
  vehiclePlannedEta?: string;
  vinNumber?: string;
  [key: string]: unknown;
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

export interface YardNewVanInvoice {
  id: string;
  chassisNumber: string;
  invoiceDate: string;
  createdOn?: string;
  purchasePrice: number;
  finalSalePrice: number;
  discountAmount: number;
  customer?: string;
  model?: string;
  grSONumber?: string;
  locationName?: string;
  raw?: Record<string, any>;
}

export interface SecondHandSale {
  id: string;
  chassis: string;
  finalInvoicePrice: number;
  invoiceDate: string;
  item: string;
  material: string;
  pgiDate: string;
  grDate?: string;
  poLineNetValue: number;
  so: string;
  updatedAt: string;
  warehouse: string;
  warehouseSlug: string;
}

export interface NewSaleRecord {
  id: string;
  createdOn?: string;
  salesOfficeName?: string;
  materialDesc0010?: string;
  materialDesc?: string;
  modelDesc?: string;
  billToNameFinal?: string;
  customerName?: string;
  customer?: string;
  finalPriceExGst?: number;
  zg00Amount?: number;
  chassisNumber?: string;
  priceSource?: string;
  soNetValue?: number;
}

export interface StockToCustomerRecord {
  id: string;
  salesOrder: string;
  materialCode: string;
  materialDesc: string;
  salesOfficeName: string;
  updateDate: string;
  raw?: Record<string, any>;
}

export interface CustomerBpRecord {
  id: string;
  bpAmountSigned: number;
  businessPartner: string;
  businessPartnerName: string;
  salesOffice: string;
  salesOrder: string;
  chassisNumber: string;
  orderCreatedDate: string;
  orderCurrency: string;
  orderNetValue: number;
  orderNetValueInclGst: number;
  orderType: string;
  raw?: Record<string, any>;
}

// Export dealer types
export * from './dealer';
