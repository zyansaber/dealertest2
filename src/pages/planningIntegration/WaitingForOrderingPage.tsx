import { useMemo, useState } from "react";
import { toast } from "sonner";

import { displayValue, parseDateToTimestamp } from "./utils";
import { phaseCardMap } from "./types";
import type { Row } from "./types";
import type { PlanningLang } from "./i18n";
import { tr } from "./i18n";

type DownloadFile = { chassis: string; kind: "spec" | "plan"; url: string };
type ZipInput = { name: string; bytes: Uint8Array };
type SavePickerWindow = Window & { showSaveFilePicker?: (opts?: Record<string, unknown>) => Promise<any> };

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

const createZipBlob = (files: ZipInput[]) => {
  const encoder = new TextEncoder();
  let offset = 0;
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];

  files.forEach((file) => {
    const fileNameBytes = encoder.encode(file.name);
    let crc = 0xffffffff;
    for (let i = 0; i < file.bytes.length; i += 1) crc = crcTable[(crc ^ file.bytes[i]) & 0xff] ^ (crc >>> 8);
    crc = (crc ^ 0xffffffff) >>> 0;

    const l = new Uint8Array(30 + fileNameBytes.length + file.bytes.length);
    const lv = new DataView(l.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, file.bytes.length, true);
    lv.setUint32(22, file.bytes.length, true);
    lv.setUint16(26, fileNameBytes.length, true);
    l.set(fileNameBytes, 30);
    l.set(file.bytes, 30 + fileNameBytes.length);

    const c = new Uint8Array(46 + fileNameBytes.length);
    const cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, file.bytes.length, true);
    cv.setUint32(24, file.bytes.length, true);
    cv.setUint16(28, fileNameBytes.length, true);
    cv.setUint32(42, offset, true);
    c.set(fileNameBytes, 46);

    local.push(l);
    central.push(c);
    offset += l.length;
  });

  const centralDirSize = central.reduce((acc, x) => acc + x.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, offset, true);
  return new Blob([...local, ...central, end], { type: "application/zip" });
};

const saveBlob = async (blob: Blob, fileName: string) => {
  const picker = (window as SavePickerWindow).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({ suggestedName: fileName });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch {
      // fallback below
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
};

const triggerDirectDownload = (url: string) => {
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.src = url;
  document.body.appendChild(iframe);
  window.setTimeout(() => iframe.remove(), 60000);
};

export default function WaitingForOrderingPage({ withStatus, waitingOrderPrices, saveWaitingPrice, specByChassis, planByChassis, lang }: {
  withStatus: Array<Row & { status: string }>;
  waitingOrderPrices: Record<string, number>;
  saveWaitingPrice: (chassis: string, value: number) => Promise<void>;
  specByChassis: Record<string, string>;
  planByChassis: Record<string, string>;
  lang: PlanningLang;
}) {
  const [selectedChassis, setSelectedChassis] = useState<Record<string, boolean>>({});
  const [downloadingAll, setDownloadingAll] = useState(false);

  const waitingForSending = useMemo(() => {
    const now = Date.now();
    return withStatus.filter((r) => (phaseCardMap[r.status] ?? r.status) === "Waiting for sending").map((r) => {
      const forecastTs = parseDateToTimestamp((r.schedule as any)?.["Forecast Production Date"]);
      const daysToForecast = forecastTs == null ? null : Math.floor((forecastTs - now) / 86400000);
      return { ...r, daysToForecast, canSend: daysToForecast != null && daysToForecast <= 180 };
    }).sort((a, b) => (a.daysToForecast ?? 9999) - (b.daysToForecast ?? 9999));
  }, [withStatus]);

  const selectedRows = useMemo(() => waitingForSending.filter((r) => selectedChassis[r.chassis]), [waitingForSending, selectedChassis]);
  const allChecked = waitingForSending.length > 0 && selectedRows.length === waitingForSending.length;

  const downloadExcel = () => {
    const header = [tr(lang, "Chassis Number", "底盘号"), tr(lang, "Model", "车型"), tr(lang, "Forecast Production Date", "预测生产日期"), tr(lang, "Forecast - Today (days)", "Forecast-今天（天）"), tr(lang, "Status", "状态"), tr(lang, "Price", "价格"), tr(lang, "Spec", "Spec"), tr(lang, "Plan", "Plan")];
    const lines = waitingForSending.map((r) => {
      const row = [displayValue(r.dateTrack?.["Chassis Number"] ?? r.chassis), displayValue((r.schedule as any)?.Model), displayValue((r.schedule as any)?.["Forecast Production Date"]), r.daysToForecast == null ? "-" : String(r.daysToForecast), r.canSend ? tr(lang, "can send", "可发送") : "-", waitingOrderPrices[r.chassis] ?? "", specByChassis[r.chassis] ?? "", planByChassis[r.chassis] ?? ""];
      return row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",");
    });
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
    saveBlob(blob, `waiting-for-po-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const downloadSelectedSpecPlan = async () => {
    if (!selectedRows.length) {
      toast.error(tr(lang, "Please select at least one row", "请先至少选择一行"));
      return;
    }

    const files = selectedRows.flatMap((r) => [
      { chassis: r.chassis, kind: "spec" as const, url: specByChassis[r.chassis] },
      { chassis: r.chassis, kind: "plan" as const, url: planByChassis[r.chassis] },
    ]).filter((f) => Boolean(f.url)) as DownloadFile[];

    if (!files.length) {
      toast.error(tr(lang, "No spec/plan links found in selected rows", "所选行没有可下载的 spec/plan 链接"));
      return;
    }

    setDownloadingAll(true);
    try {
      const sameOrigin: DownloadFile[] = [];
      const directUrls: string[] = [];
      files.forEach((file) => {
        try {
          if (new URL(file.url, window.location.href).origin === window.location.origin) sameOrigin.push(file);
          else directUrls.push(file.url);
        } catch {
          directUrls.push(file.url);
        }
      });

      if (sameOrigin.length) {
        const fetched = await Promise.allSettled(sameOrigin.map(async (file) => {
          const resp = await fetch(file.url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const bytes = new Uint8Array(await resp.arrayBuffer());
          const ext = (file.url.split("?")[0] ?? "").split(".").pop() ?? "bin";
          return { name: `${file.chassis}_${file.kind}.${ext.toLowerCase()}`, bytes };
        }));
        const success = fetched.filter((x): x is PromiseFulfilledResult<ZipInput> => x.status === "fulfilled").map((x) => x.value);
        fetched.forEach((x, idx) => {
          if (x.status === "rejected") directUrls.push(sameOrigin[idx].url);
        });
        if (success.length) {
          const zipBlob = createZipBlob(success);
          await saveBlob(zipBlob, `waiting-for-po-spec-plan-${new Date().toISOString().slice(0, 10)}.zip`);
        }
      }

      directUrls.forEach((url) => triggerDirectDownload(url));
      toast.success(tr(lang, `Download started for ${files.length} files`, `已开始下载 ${files.length} 个文件`));
    } finally {
      setDownloadingAll(false);
    }
  };

  const openUrl = (url?: string) => {
    if (!url) return;
    window.open(url, "_blank");
  };

  return <>
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">{tr(lang, "waiting for PO", "待下 PO")}</h2>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setSelectedChassis(Object.fromEntries(waitingForSending.map((r) => [r.chassis, true])))} className="rounded border px-3 py-2 text-sm">{tr(lang, "Select all", "全选")}</button>
          <button type="button" onClick={downloadSelectedSpecPlan} disabled={downloadingAll} className="rounded-md border border-slate-300 bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">{tr(lang, "Download selected spec & plan", "下载所选 spec & plan")}</button>
          <button type="button" onClick={downloadExcel} className="rounded-md border border-slate-300 bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">{tr(lang, "Download Excel", "下载 Excel")}</button>
        </div>
      </div>
    </div>

    <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-[1200px] divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-100"><tr>
          <th className="px-3 py-3 text-left"><input type="checkbox" checked={allChecked} onChange={(e) => setSelectedChassis(e.target.checked ? Object.fromEntries(waitingForSending.map((r) => [r.chassis, true])) : {})} /></th>
          <th className="px-3 py-3 text-left">{tr(lang, "Chassis Number", "底盘号")}</th><th className="px-3 py-3 text-left">{tr(lang, "Model", "车型")}</th><th className="px-3 py-3 text-left">{tr(lang, "Forecast Production Date", "预测生产日期")}</th><th className="px-3 py-3 text-left">{tr(lang, "Forecast - Today (days)", "Forecast-今天（天）")}</th><th className="px-3 py-3 text-left">{tr(lang, "Status", "状态")}</th><th className="px-3 py-3 text-left">{tr(lang, "Price", "价格")}</th><th className="px-3 py-3 text-left">{tr(lang, "Spec", "Spec")}</th><th className="px-3 py-3 text-left">{tr(lang, "Plan", "Plan")}</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-100">
          {waitingForSending.map((r) => (
            <tr key={`wfs-${r.chassis}`}>
              <td className="px-3 py-2.5"><input type="checkbox" checked={Boolean(selectedChassis[r.chassis])} onChange={(e) => setSelectedChassis((prev) => ({ ...prev, [r.chassis]: e.target.checked }))} /></td>
              <td className="px-3 py-2.5">{displayValue(r.dateTrack?.["Chassis Number"] ?? r.chassis)}</td>
              <td className="px-3 py-2.5">{displayValue((r.schedule as any)?.Model)}</td>
              <td className="px-3 py-2.5">{displayValue((r.schedule as any)?.["Forecast Production Date"])}</td>
              <td className="px-3 py-2.5">{r.daysToForecast == null ? "-" : r.daysToForecast}</td>
              <td className={`px-3 py-2.5 font-medium ${r.canSend ? "text-emerald-700" : "text-slate-500"}`}>{r.canSend ? tr(lang, "can send", "可发送") : "-"}</td>
              <td className="px-3 py-2.5"><input type="number" className="w-28 rounded border px-2 py-1" value={waitingOrderPrices[r.chassis] ?? ""} onChange={(e) => saveWaitingPrice(r.chassis, Number(e.target.value || 0))} /></td>
              <td className="px-3 py-2.5"><button type="button" onClick={() => openUrl(specByChassis[r.chassis])} disabled={!specByChassis[r.chassis]} className="rounded border px-2 py-1 disabled:opacity-40">{tr(lang, "Download", "下载")}</button></td>
              <td className="px-3 py-2.5"><button type="button" onClick={() => openUrl(planByChassis[r.chassis])} disabled={!planByChassis[r.chassis]} className="rounded border px-2 py-1 disabled:opacity-40">{tr(lang, "Download", "下载")}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>;
}
