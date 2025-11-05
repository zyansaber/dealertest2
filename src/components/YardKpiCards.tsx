import React from "react";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Factory, Truck, Handshake, Boxes } from "lucide-react";

type YardKpiCardsProps = {
  startDate: string; // yyyy-mm-dd
  endDate: string;   // yyyy-mm-dd
  onChange: (next: { startDate: string; endDate: string }) => void;

  counts: {
    pgiToDealer: number;
    received: number;
    handover: number;
    yardNow: { stock: number; customer: number }; // 当前在场
  };
};

export default function YardKpiCards({
  startDate,
  endDate,
  onChange,
  counts,
}: YardKpiCardsProps) {
  return (
    <div className="space-y-4">
      {/* Date range controls */}
      <div className="flex flex-col md:flex-row md:items-end gap-3">
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-muted-foreground mb-1">From</label>
            <input
              type="date"
              className="w-full border rounded-lg px-3 py-2"
              value={startDate}
              onChange={(e) => onChange({ startDate: e.target.value, endDate })}
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1">To</label>
            <input
              type="date"
              className="w-full border rounded-lg px-3 py-2"
              value={endDate}
              onChange={(e) => onChange({ startDate, endDate: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Factory PGI → Dealer</CardTitle>
            <Factory className="h-5 w-5 opacity-70" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{counts.pgiToDealer}</div>
            <p className="text-xs text-muted-foreground mt-1">PGI records within range</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Received Vans</CardTitle>
            <Truck className="h-5 w-5 opacity-70" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{counts.received}</div>
            <p className="text-xs text-muted-foreground mt-1">Yard receivedAt within range</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Handover</CardTitle>
            <Handshake className="h-5 w-5 opacity-70" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{counts.handover}</div>
            <p className="text-xs text-muted-foreground mt-1">Handovers within range</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Yard Stock (Now)</CardTitle>
            <Boxes className="h-5 w-5 opacity-70" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-3">
              <div className="text-3xl font-bold">{counts.yardNow.stock + counts.yardNow.customer}</div>
              <div className="text-sm text-muted-foreground">
                <span className="mr-2">Stock: <span className="font-semibold">{counts.yardNow.stock}</span></span>
                <span>Customer: <span className="font-semibold">{counts.yardNow.customer}</span></span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Current entries in /yardstock</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
