import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildScheduleLookupByChassis,
  saveProductionPlanningUpload,
  type ProductionPlanningRow,
} from "@/lib/firebase";

type RawExcelRow = Record<string, unknown>;

const normalizeKey = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[_-]/g, "");

const normalizeChassis = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const pickValue = (row: RawExcelRow, aliases: string[]) => {
  const entries = Object.entries(row);
  for (const [key, value] of entries) {
    const normalized = normalizeKey(key);
    if (aliases.includes(normalized)) {
      return String(value ?? "").trim();
    }
  }
  return "";
};

const readExcelRows = async (file: File) => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return [] as RawExcelRow[];
  const worksheet = workbook.Sheets[firstSheet];
  return XLSX.utils.sheet_to_json<RawExcelRow>(worksheet, { defval: "" });
};

const UploadProductionPlanning = () => {
  const [selectedMonth, setSelectedMonth] = useState("");
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [mergedRows, setMergedRows] = useState<ProductionPlanningRow[]>([]);
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => Boolean(selectedMonth && fileA && fileB), [selectedMonth, fileA, fileB]);

  const parseAndMerge = async () => {
    if (!selectedMonth || !fileA || !fileB) {
      toast.error("请选择月份并上传两个 Excel 文件。");
      return;
    }

    setLoading(true);
    try {
      const scheduleByChassis = await buildScheduleLookupByChassis();
      const [rowsA, rowsB] = await Promise.all([readExcelRows(fileA), readExcelRows(fileB)]);

      const toRows = (rows: RawExcelRow[], sourceFile: string) =>
        rows
          .map((row) => {
            const chassis = normalizeChassis(
              pickValue(row, ["chassis", "车架号", "chassisno", "chassisnumber"]),
            );
            if (!chassis) return null;

            const scheduleItem = scheduleByChassis[chassis];
            return {
              chassis,
              plannedChassisWelding: pickValue(row, [
                "plannedchassiswelding",
                "plannedchasiswelding",
              ]),
              plannedFinishgoods: pickValue(row, ["plannedfinishgoods"]),
              forecastProductionDate: String(scheduleItem?.["Forecast Production Date"] ?? ""),
              requestDeliveryDate: String(scheduleItem?.["Request Delivery Date"] ?? ""),
              customer: String(scheduleItem?.Customer ?? ""),
              dealer: String(scheduleItem?.Dealer ?? ""),
              model: String(scheduleItem?.Model ?? ""),
              orderReceivedDate: String(scheduleItem?.["Order Received Date"] ?? ""),
              sourceFile,
            } satisfies ProductionPlanningRow;
          })
          .filter((item): item is ProductionPlanningRow => Boolean(item));

      const mergedMap: Record<string, ProductionPlanningRow> = {};
      [...toRows(rowsA, fileA.name), ...toRows(rowsB, fileB.name)].forEach((row) => {
        const existing = mergedMap[row.chassis];
        if (!existing) {
          mergedMap[row.chassis] = row;
          return;
        }
        mergedMap[row.chassis] = {
          ...existing,
          plannedChassisWelding: row.plannedChassisWelding || existing.plannedChassisWelding,
          plannedFinishgoods: row.plannedFinishgoods || existing.plannedFinishgoods,
          forecastProductionDate: row.forecastProductionDate || existing.forecastProductionDate,
          requestDeliveryDate: row.requestDeliveryDate || existing.requestDeliveryDate,
          customer: row.customer || existing.customer,
          dealer: row.dealer || existing.dealer,
          model: row.model || existing.model,
          orderReceivedDate: row.orderReceivedDate || existing.orderReceivedDate,
        };
      });

      const finalRows = Object.values(mergedMap);
      setMergedRows(finalRows);

      await saveProductionPlanningUpload({
        month: selectedMonth,
        rows: finalRows,
        files: [fileA, fileB],
      });

      toast.success(`上传成功，共保存 ${finalRows.length} 条记录。`);
    } catch (error) {
      console.error(error);
      toast.error("上传失败，请检查 Excel 列名是否正确。需要包含 chassis、planned chassisWelding、planned finishgoods。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <h1 className="text-2xl font-semibold text-slate-900">上传排产</h1>

        <div className="grid gap-4 rounded-xl border bg-white p-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">选择月份</label>
            <Input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Excel 文件 1</label>
            <Input type="file" accept=".xlsx,.xls" onChange={(e) => setFileA(e.target.files?.[0] || null)} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Excel 文件 2</label>
            <Input type="file" accept=".xlsx,.xls" onChange={(e) => setFileB(e.target.files?.[0] || null)} />
          </div>
          <div className="md:col-span-3">
            <Button onClick={parseAndMerge} disabled={!canSubmit || loading}>
              {loading ? "上传中..." : "上传并生成排产表"}
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  {[
                    "chassis",
                    "planned chassisWelding",
                    "planned finishgoods",
                    "Forecast Production Date",
                    "Request Delivery Date",
                    "Customer",
                    "Dealer",
                    "Model",
                    "Order Received Date",
                  ].map((header) => (
                    <th key={header} className="px-3 py-2 text-left font-semibold">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mergedRows.map((row) => (
                  <tr key={row.chassis} className="border-t">
                    <td className="px-3 py-2">{row.chassis}</td>
                    <td className="px-3 py-2">{row.plannedChassisWelding}</td>
                    <td className="px-3 py-2">{row.plannedFinishgoods}</td>
                    <td className="px-3 py-2">{row.forecastProductionDate}</td>
                    <td className="px-3 py-2">{row.requestDeliveryDate}</td>
                    <td className="px-3 py-2">{row.customer}</td>
                    <td className="px-3 py-2">{row.dealer}</td>
                    <td className="px-3 py-2">{row.model}</td>
                    <td className="px-3 py-2">{row.orderReceivedDate}</td>
                  </tr>
                ))}
                {mergedRows.length === 0 && (
                  <tr>
                    <td className="px-3 py-5 text-center text-slate-500" colSpan={9}>
                      暂无数据，上传两个 Excel 后会显示排产关联结果。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UploadProductionPlanning;
