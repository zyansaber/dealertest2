import type { ScheduleItem } from "@/types";

export type DateTrackRecord = Record<string, unknown>;
export type Granularity = "week" | "month";

export type Row = {
  chassis: string;
  schedule: ScheduleItem;
  dateTrack?: DateTrackRecord;
};

export type Milestone = { key: string; source: "schedule" | "dateTrack" };
export type Period = { start: number; end: number; label: string };

export const trackedMilestones = [
  "Purchase Order Sent",
  "chassisWelding",
  "assemblyLine",
  "finishGoods",
  "leavingFactory",
  "estLeavngPort",
  "Left Port",
  "melbournePortDate",
] as const;

export const phaseCardMap: Record<string, string> = {
  "Order Received Date": "not confirmed orders",
  "Signed Plans Received": "Waiting for sending",
  "Purchase Order Sent": "Not Start in Longtree",
  chassisWelding: "Chassis welding in Longtree",
  assemblyLine: "Assembly line Longtree",
  finishGoods: "Finishedin Longtree",
  leavingFactory: "Leaving factory from Longtree",
  estLeavngPort: "waiting in port",
  "Left Port": "On the sea",
  melbournePortDate: "Melbourn Port",
  "Received in Melbourne": "Melbourn Factory",
};

export const milestoneSequence: Milestone[] = [
  { key: "Order Received Date", source: "schedule" },
  { key: "Signed Plans Received", source: "schedule" },
  { key: "Purchase Order Sent", source: "schedule" },
  { key: "chassisWelding", source: "dateTrack" },
  { key: "assemblyLine", source: "dateTrack" },
  { key: "finishGoods", source: "dateTrack" },
  { key: "leavingFactory", source: "dateTrack" },
  { key: "estLeavngPort", source: "dateTrack" },
  { key: "Left Port", source: "dateTrack" },
  { key: "melbournePortDate", source: "dateTrack" },
  { key: "Received in Melbourne", source: "dateTrack" },
];
