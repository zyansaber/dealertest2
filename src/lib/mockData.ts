import type { ScheduleItem, SpecPlan, DateTrack } from "@/types";

export const mockScheduleData: ScheduleItem[] = [
  {
    Chassis: "LRX123456",
    Customer: "ABC Motors Ltd",
    Dealer: "Premium Auto Group",
    Model: "Land Rover Defender",
    "Model Year": "2024",
    "Order Received Date": "15/01/2024",
    "Plans Sent to Dealer": "20/01/2024",
    "Signed Plans Received": "25/01/2024",
    "Order Sent to Longtree": "30/01/2024",
    "Purchase Order Sent": "05/02/2024",
    "Price Date": "10/02/2024",
    "Forecast Production Date": "15/03/2024",
    "Regent Production": "Production Commenced Longtree",
    Shipment: "2024/03/20 - Ship No. 001",
    Index1: "001",
    Rank1: "A",
    Rank2: "1"
  },
  {
    Chassis: "LRX789012",
    Customer: "City Fleet Services",
    Dealer: "Urban Vehicle Solutions",
    Model: "Land Rover Discovery",
    "Model Year": "2024",
    "Order Received Date": "20/01/2024",
    "Plans Sent to Dealer": "25/01/2024",
    "Signed Plans Received": null,
    "Order Sent to Longtree": null,
    "Purchase Order Sent": "No",
    "Price Date": null,
    "Forecast Production Date": "20/04/2024",
    "Regent Production": "Van on the sea",
    Shipment: "0Received",
    Index1: "002",
    Rank1: "A",
    Rank2: "2"
  },
  {
    Chassis: "LRX345678",
    Customer: "Mountain Adventures Co",
    Dealer: "Adventure Auto",
    Model: "Land Rover Range Rover",
    "Model Year": "2025",
    "Order Received Date": "10/02/2024",
    "Plans Sent to Dealer": "15/02/2024",
    "Signed Plans Received": "20/02/2024",
    "Order Sent to Longtree": "25/02/2024",
    "Purchase Order Sent": "01/03/2024",
    "Price Date": "05/03/2024",
    "Forecast Production Date": "10/05/2024",
    "Regent Production": "Ready for Dispatch",
    Shipment: "2024/05/15 - Ship No. 003",
    Index1: "003",
    Rank1: "B",
    Rank2: "1"
  }
];

export const mockSpecPlan: SpecPlan = {
  "LRX123456": {
    plan: "https://example.com/plans/LRX123456_plan.pdf",
    spec: "https://example.com/specs/LRX123456_spec.pdf"
  },
  "LRX789012": {
    plan: "https://example.com/plans/LRX789012_plan.pdf"
  },
  "LRX345678": {
    plan: "https://example.com/plans/LRX345678_plan.pdf",
    spec: "https://example.com/specs/LRX345678_spec.pdf"
  }
};

export const mockDateTrack: DateTrack = {
  "LRX123456": {
    "Chassis Number": "LRX123456",
    Customer: "ABC Motors Ltd",
    Dealer: "Premium Auto Group",
    GRPURCHASEORDER: "PO-2024-001",
    Model: "Land Rover Defender",
    "Purchasing Order": "05/02/2024",
    "Received in Melbourne": "25/03/2024",
    "Left Port": "20/03/2024",
    "Dispatched from Factory": "15/03/2024",
    "Special Request Date": null,
    Status: "In Transit"
  },
  "LRX789012": {
    "Chassis Number": "LRX789012",
    Customer: "City Fleet Services",
    Dealer: "Urban Vehicle Solutions",
    GRPURCHASEORDER: "PO-2024-002",
    Model: "Land Rover Discovery",
    "Purchasing Order": "10/02/2024",
    "Received in Melbourne": null,
    "Left Port": "01/04/2024",
    "Dispatched from Factory": "28/03/2024",
    "Special Request Date": null,
    Status: "Shipped"
  },
  "LRX345678": {
    "Chassis Number": "LRX345678",
    Customer: "Mountain Adventures Co",
    Dealer: "Adventure Auto",
    GRPURCHASEORDER: "PO-2024-003",
    Model: "Land Rover Range Rover",
    "Purchasing Order": "01/03/2024",
    "Received in Melbourne": "20/05/2024",
    "Left Port": "15/05/2024",
    "Dispatched from Factory": "10/05/2024",
    "Special Request Date": "05/03/2024",
    Status: "Delivered"
  }
};