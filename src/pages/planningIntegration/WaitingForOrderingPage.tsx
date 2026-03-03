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
    return withStatus
      .filter((r) => (phaseCardMap[r.status] ?? r.status) === "Waiting for sending")
      .map((r) => {
        const forecastTs = parseDateToTimestamp((r.schedule as any)?.["Forecast Production Date"]);
        const daysToForecast = forecastTs == null ? null : Math.floor((forecastTs - now) / 86400000);
        const canSend = daysToForecast != null && daysToForecast <= 180;
        return { ...r, daysToForecast, canSend };
      })
      .sort((a, b) => (a.daysToForecast ?? 9999) - (b.daysToForecast ?? 9999));
  }, [withStatus]);

  const downloadExcel = () => {
    const header = ["Chassis Number", "Model", "Forecast Production Date", "Forecast - Today (days)", "Status", "Price"];
    const lines = waitingForSending.map((r) => {
      const chassis = displayValue(r.dateTrack?.["Chassis Number"] ?? r.chassis);
      const model = displayValue((r.schedule as any)?.Model);
      const forecast = displayValue((r.schedule as any)?.["Forecast Production Date"]);
      const days = r.daysToForecast == null ? "-" : String(r.daysToForecast);
      const status = r.canSend ? "can send" : "-";
      const price = waitingOrderPrices[r.chassis] ?? "";
      return [chassis, model, forecast, days, status, price].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",");
    });

    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `waiting-for-po-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold">waiting for PO</h2>
          <button type="button" onClick={downloadExcel} className="rounded-md border border-slate-300 bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
            Download Excel
          </button>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[1000px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-3 py-3 text-left">Chassis Number</th>
              <th className="px-3 py-3 text-left">Model</th>
              <th className="px-3 py-3 text-left">Forecast Production Date</th>
              <th className="px-3 py-3 text-left">Forecast - Today (days)</th>
              <th className="px-3 py-3 text-left">Status</th>
              <th className="px-3 py-3 text-left">Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {waitingForSending.map((r) => (
              <tr key={`wfs-${r.chassis}`}>
                <td className="px-3 py-2.5">{displayValue(r.dateTrack?.["Chassis Number"] ?? r.chassis)}</td>
                <td className="px-3 py-2.5">{displayValue((r.schedule as any)?.Model)}</td>
                <td className="px-3 py-2.5">{displayValue((r.schedule as any)?.["Forecast Production Date"])}</td>
                <td className="px-3 py-2.5">{r.daysToForecast == null ? "-" : r.daysToForecast}</td>
                <td className={`px-3 py-2.5 font-medium ${r.canSend ? "text-emerald-700" : "text-slate-500"}`}>{r.canSend ? "can send" : "-"}</td>
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
