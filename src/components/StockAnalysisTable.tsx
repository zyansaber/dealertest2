import React, { useMemo } from "react";

type Row = {
  key: string; // 例如 Model
  stock: number;
  customer: number;
  total: number;
};

type Props = {
  yardList: Array<{ Model?: string; Customer?: string }>;
  onSelect?: (model: string | null) => void; // 点击模型行 → 过滤 Inventory 列表
  activeModel?: string | null;
};

export default function StockAnalysisTable({ yardList, onSelect, activeModel }: Props) {
  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, { stock: number; customer: number }>();
    for (const it of yardList) {
      const model = (it.Model || "Unknown").trim();
      const isStock = String(it.Customer || "").toLowerCase() === "stock";
      const prev = map.get(model) || { stock: 0, customer: 0 };
      if (isStock) prev.stock += 1; else prev.customer += 1;
      map.set(model, prev);
    }
    const out: Row[] = [];
    map.forEach((v, k) => out.push({ key: k, stock: v.stock, customer: v.customer, total: v.stock + v.customer }));
    // 排序：总数降序
    out.sort((a, b) => b.total - a.total);
    return out;
  }, [yardList]);

  return (
    <div className="w-full overflow-auto">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase text-muted-foreground">
          <tr className="[&>th]:py-2 [&>th]:px-2 border-b">
            <th className="text-left">Model</th>
            <th className="text-right">Stock</th>
            <th className="text-right">Customer</th>
            <th className="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const active = activeModel === r.key;
            return (
              <tr
                key={r.key}
                className={`border-b hover:bg-muted/40 cursor-pointer ${active ? "bg-muted" : ""}`}
                onClick={() => onSelect?.(active ? null : r.key)}
                title="Click to filter inventory list by this model"
              >
                <td className="py-2 px-2 font-medium">{r.key}</td>
                <td className="py-2 px-2 text-right">{r.stock}</td>
                <td className="py-2 px-2 text-right">{r.customer}</td>
                <td className="py-2 px-2 text-right">{r.total}</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No data</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
