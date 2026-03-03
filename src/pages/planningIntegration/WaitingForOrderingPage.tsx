import { useMemo } from "react";

import { displayValue, parseDateToTimestamp } from "./utils";
import { phaseCardMap } from "./types";
import type { Row } from "./types";

export default function WaitingForOrderingPage({
  withStatus,
  waitingOrderPrices,
  saveWaitingPrice,
}: {
  withStatus: Array<Row & { status: string }>;
  waitingOrderPrices: Record<string, number>;
  saveWaitingPrice: (chassis: string, value: number) => Promise<void>;
}) {
  const waitingForSending = useMemo(() => {
    const now = Date.now();
    const in180 = now + 180 * 24 * 60 * 60 * 1000;
    return withStatus
      .filter((r) => (phaseCardMap[r.status] ?? r.status) === "Waiting for sending")
      .map((r) => {
        const forecastTs = parseDateToTimestamp((r.schedule as any)?.["Forecast Production Date"]);
        const hasPrice = Number.isFinite(Number(waitingOrderPrices[r.chassis])) && Number(waitingOrderPrices[r.chassis]) > 0;
        const daysToForecast = forecastTs == null ? null : Math.floor((forecastTs - now) / 86400000);
        const canOrder = hasPrice && daysToForecast != null && daysToForecast >= 0 && daysToForecast <= 180;
        return { ...r, forecastTs, hasPrice, canOrder, daysToForecast };
      })
      .sort((a, b) => (a.daysToForecast ?? 9999) - (b.daysToForecast ?? 9999));
  }, [withStatus, waitingOrderPrices]);

  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-semibold">Waiting for ordering</h2>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-auto">
        <table className="min-w-[1200px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-3 py-3 text-left">Chassis Number</th>
              <th className="px-3 py-3 text-left">Model</th>
              <th className="px-3 py-3 text-left">Forecast Production Date</th>
              <th className="px-3 py-3 text-left">Forecast - Today (days)</th>
              <th className="px-3 py-3 text-left">Can Order (&lt;= 180 days + price)</th>
              <th className="px-3 py-3 text-left">Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {waitingForSending.map((r) => (
              <tr key={`wfs-${r.chassis}`} className={r.canOrder ? "bg-emerald-50" : ""}>
                <td className="px-3 py-2.5">{displayValue(r.dateTrack?.["Chassis Number"] ?? r.chassis)}</td>
                <td className="px-3 py-2.5">{displayValue((r.schedule as any)?.Model)}</td>
                <td className="px-3 py-2.5">{displayValue((r.schedule as any)?.["Forecast Production Date"])}</td>
                <td className="px-3 py-2.5">{r.daysToForecast == null ? "-" : r.daysToForecast}</td>
                <td className="px-3 py-2.5">{r.canOrder ? "可以发订单" : "-"}</td>
                <td className="px-3 py-2.5">
                  <input
                    type="number"
                    className="w-32 rounded border px-2 py-1"
                    value={waitingOrderPrices[r.chassis] ?? ""}
                    onChange={(e) => saveWaitingPrice(r.chassis, Number(e.target.value || 0))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
