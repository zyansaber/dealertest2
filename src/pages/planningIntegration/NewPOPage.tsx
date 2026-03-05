import { useMemo, useState } from "react";
import { toast } from "sonner";

import type { Row } from "./types";
import type { PlanningLang } from "./i18n";
import { tr } from "./i18n";
import { parseDateToTimestamp, displayValue } from "./utils";

type ZipInput = { name: string; bytes: Uint8Array };

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (data: Uint8Array) => {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const createZipBlob = (files: ZipInput[]) => {
  const encoder = new TextEncoder();
  const fileRecords: Array<{ local: Uint8Array; central: Uint8Array; size: number }> = [];
  let offset = 0;

  files.forEach(({ name, bytes }) => {
    const fileNameBytes = encoder.encode(name);
    const crc = crc32(bytes);
    const size = bytes.length;

    const localHeader = new Uint8Array(30 + fileNameBytes.length + size);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, size, true);
    localView.setUint32(22, size, true);
    localView.setUint16(26, fileNameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(fileNameBytes, 30);
    localHeader.set(bytes, 30 + fileNameBytes.length);

    const centralHeader = new Uint8Array(46 + fileNameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, size, true);
    centralView.setUint32(24, size, true);
    centralView.setUint16(28, fileNameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(fileNameBytes, 46);

    fileRecords.push({ local: localHeader, central: centralHeader, size: localHeader.length });
    offset += localHeader.length;
  });

  const centralDirSize = fileRecords.reduce((acc, rec) => acc + rec.central.length, 0);
  const centralDirOffset = offset;

  const endHeader = new Uint8Array(22);
  const endView = new DataView(endHeader.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, fileRecords.length, true);
  endView.setUint16(10, fileRecords.length, true);
  endView.setUint32(12, centralDirSize, true);
  endView.setUint32(16, centralDirOffset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...fileRecords.map((r) => r.local), ...fileRecords.map((r) => r.central), endHeader], { type: "application/zip" });
};


const triggerDirectDownload = (url: string) => {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
};

export default function NewPOPage({ rows, specByChassis, planByChassis, lang }: { rows: Row[]; specByChassis: Record<string, string>; planByChassis: Record<string, string>; lang: PlanningLang }) {
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [downloadingAll, setDownloadingAll] = useState(false);

  const data = useMemo(() => {
    const now = Date.now();
    const range = period === "week" ? 7 : 30;
    const from = now - range * 86400000;
    return rows
      .map((r) => {
        const posTs = parseDateToTimestamp((r.schedule as any)?.["Purchase Order Sent"]);
        return { ...r, posTs };
      })
      .filter((r) => r.posTs != null && (r.posTs as number) >= from && (r.posTs as number) <= now)
      .sort((a, b) => Number(b.posTs) - Number(a.posTs));
  }, [rows, period]);

  const openUrl = (url?: string) => {
    if (!url) return;
    window.open(url, "_blank");
  };

  const downloadAll = async () => {
    const files = data
      .flatMap((r) => [
        { chassis: r.chassis, kind: "spec", url: specByChassis[r.chassis] },
        { chassis: r.chassis, kind: "plan", url: planByChassis[r.chassis] },
      ])
      .filter((f) => Boolean(f.url)) as Array<{ chassis: string; kind: string; url: string }>;

    if (!files.length) {
      toast.error(tr(lang, "No spec/plan files found in current filter", "当前筛选范围内没有可下载的 spec/plan 文件"));
      return;
    }

    setDownloadingAll(true);
    try {
      const zipFiles = await Promise.allSettled(
        files.map(async (file) => {
          const resp = await fetch(file.url);
          if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
          }
          const bytes = new Uint8Array(await resp.arrayBuffer());
          const urlPart = file.url.split("?")[0] ?? "";
          const ext = urlPart.includes(".") ? urlPart.split(".").pop() : "bin";
          const safeExt = (ext || "bin").toLowerCase();
          return { name: `${file.chassis}_${file.kind}.${safeExt}`, bytes };
        }),
      );

      const successResults = zipFiles.filter((item): item is PromiseFulfilledResult<ZipInput> => item.status === "fulfilled");
      const failedIndexes = zipFiles
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => item.status === "rejected")
        .map(({ idx }) => idx);

      const validFiles = successResults.map((item) => item.value);

      if (validFiles.length) {
        const zipBlob = createZipBlob(validFiles);
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `new-po-spec-plan-${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }

      if (failedIndexes.length) {
        failedIndexes.forEach((idx) => {
          triggerDirectDownload(files[idx].url);
        });
      }

      if (!validFiles.length && failedIndexes.length) {
        toast.warning(tr(lang, `Zip blocked by CORS, started ${failedIndexes.length} direct downloads`, `压缩下载受 CORS 限制，已改为直接下载 ${failedIndexes.length} 个文件`));
      } else if (failedIndexes.length) {
        toast.warning(tr(lang, `Zip downloaded ${validFiles.length} files; ${failedIndexes.length} files opened directly`, `压缩包已下载 ${validFiles.length} 个文件；另有 ${failedIndexes.length} 个已直接下载`));
      } else {
        toast.success(tr(lang, `Downloaded ${validFiles.length} files`, `已打包下载 ${validFiles.length} 个文件`));
      }
    } catch {
      toast.error(tr(lang, "Failed to generate zip", "压缩包生成失败，请重试"));
    } finally {
      setDownloadingAll(false);
    }
  };

  return (
    <>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold">{tr(lang, "New PO", "新下 PO")}</h2>
          <div className="flex items-center gap-2">
            <select value={period} onChange={(e) => setPeriod(e.target.value as "week" | "month")} className="rounded border px-2 py-1 text-sm">
              <option value="week">{tr(lang, "Within 1 week", "一周内")}</option>
              <option value="month">{tr(lang, "Within 1 month", "一个月内")}</option>
            </select>
            <button type="button" onClick={downloadAll} disabled={downloadingAll} className="rounded-md border border-slate-300 bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60">
              {downloadingAll ? tr(lang, "Preparing zip...", "正在打包...") : tr(lang, "Download all spec & plan (zip)", "批量下载 spec & plan（压缩包）")}
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[1200px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-3 py-3 text-left">{tr(lang, "Chassis", "底盘号")}</th>
              <th className="px-3 py-3 text-left">{tr(lang, "Model", "车型")}</th>
              <th className="px-3 py-3 text-left">{tr(lang, "Purchase Order Sent", "采购单发送")}</th>
              <th className="px-3 py-3 text-left">{tr(lang, "Spec", "Spec")}</th>
              <th className="px-3 py-3 text-left">{tr(lang, "Plan", "Plan")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((r) => (
              <tr key={`newpo-${r.chassis}`}>
                <td className="px-3 py-2.5">{displayValue((r.schedule as any)?.Chassis ?? r.chassis)}</td>
                <td className="px-3 py-2.5">{displayValue((r.schedule as any)?.Model)}</td>
                <td className="px-3 py-2.5">{displayValue((r.schedule as any)?.["Purchase Order Sent"])}</td>
                <td className="px-3 py-2.5"><button type="button" onClick={() => openUrl(specByChassis[r.chassis])} disabled={!specByChassis[r.chassis]} className="rounded border px-2 py-1 disabled:opacity-40">{tr(lang, "Download", "下载")}</button></td>
                <td className="px-3 py-2.5"><button type="button" onClick={() => openUrl(planByChassis[r.chassis])} disabled={!planByChassis[r.chassis]} className="rounded border px-2 py-1 disabled:opacity-40">{tr(lang, "Download", "下载")}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
