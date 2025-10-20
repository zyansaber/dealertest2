import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, Package, Users } from "lucide-react";
import type { ScheduleItem } from "@/types";
import { motion } from "framer-motion";

interface ModelRangeCardsProps {
  orders: ScheduleItem[];
  onFilterChange: (filters: { modelRange?: string; customerType?: string }) => void;
}

export default function ModelRangeCards({ orders, onFilterChange }: ModelRangeCardsProps) {
  const [selectedRange, setSelectedRange] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);

  // 统计（基于 Chassis 前 3 位）
  const modelRanges = useMemo(() => {
    const map = new Map<string, { total: number; stock: number; customer: number }>();
    for (const o of orders) {
      const chassis = (o?.Chassis ?? "") as string;
      if (!chassis) continue;
      const prefix = chassis.substring(0, 3).toUpperCase();
      const isStock = String(o?.Customer ?? "").toLowerCase().endsWith("stock");
      if (!map.has(prefix)) map.set(prefix, { total: 0, stock: 0, customer: 0 });
      const r = map.get(prefix)!;
      r.total += 1;
      isStock ? (r.stock += 1) : (r.customer += 1);
    }
    return [...map.entries()]
      .map(([prefix, v]) => ({ prefix, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [orders]);

  const handleRangeClick = (prefix: string) => {
    if (selectedRange === prefix) {
      setSelectedRange(null);
      setSelectedType(null);
      onFilterChange({});
    } else {
      setSelectedRange(prefix);
      setSelectedType(null);
      onFilterChange({ modelRange: prefix });
    }
  };

  const handleTypeClick = (type: "stock" | "customer") => {
    if (!selectedRange) return;
    if (selectedType === type) {
      setSelectedType(null);
      onFilterChange({ modelRange: selectedRange });
    } else {
      setSelectedType(type);
      onFilterChange({ modelRange: selectedRange, customerType: type });
    }
  };

  const selectedRangeData = selectedRange
    ? modelRanges.find((r) => r.prefix === selectedRange)
    : null;

  return (
    <div className="space-y-4">
      {/* 顶部：紧凑卡片（自动换行，无横向滚动） */}
      <div>
        <h3 className="text-xs font-medium text-slate-700 mb-2">
          Model Ranges (by Chassis Prefix)
        </h3>

        <div className="flex flex-wrap gap-2">
          {modelRanges.map(({ prefix, total, stock, customer }) => {
            const active = selectedRange === prefix;
            const stockPct = total ? Math.round((stock / total) * 100) : 0;
            const custPct = Math.max(0, 100 - stockPct);

            return (
              <motion.button
                key={prefix}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleRangeClick(prefix)}
                className="rounded-lg"
              >
                <Card
                  className={[
                    "rounded-lg w-[132px] h-[56px] px-2.5 py-2",
                    "flex flex-col justify-between",
                    "bg-white border",
                    active ? "border-blue-500 shadow-[0_4px_12px_-6px_rgba(59,130,246,0.45)]" : "hover:shadow-sm",
                    "transition-all"
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between leading-none">
                    <span className="text-[11px] font-medium text-slate-700">
                      {prefix}
                    </span>
                    {active && <ChevronRight className="w-3 h-3 text-slate-500" />}
                  </div>

                  <div className="flex items-end justify-between">
                    <span className="text-slate-900 font-semibold text-[15px] leading-none">
                      {total}
                    </span>
                    <div className="flex items-center gap-1 text-[10px] text-slate-500">
                      <span>Stk {stock}</span>
                      <span>·</span>
                      <span>Cust {customer}</span>
                    </div>
                  </div>

                  {/* 横向占比条（并排显示） */}
                  <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden flex">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${stockPct}%` }}
                      aria-label={`Stock ${stockPct}%`}
                    />
                    <div
                      className="h-full bg-violet-500"
                      style={{ width: `${custPct}%` }}
                      aria-label={`Customer ${custPct}%`}
                    />
                  </div>
                </Card>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* 二级：更精致的小统计卡（同样小尺寸、可换行） */}
      {selectedRange && selectedRangeData && (
        <div>
          <h3 className="text-xs font-medium text-slate-700 mb-2">
            {selectedRange} Breakdown
          </h3>

          <div className="flex flex-wrap gap-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleTypeClick("stock")}
            >
              <Card
                className={[
                  "rounded-lg w-[150px] h-[56px] px-3 py-2",
                  "flex flex-col justify-between bg-white border",
                  selectedType === "stock" ? "border-emerald-500" : ""
                ].join(" ")}
              >
                <div className="text-[11px] font-medium flex items-center gap-1 leading-none text-emerald-700">
                  <Package className="w-3 h-3" />
                  Stock
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-emerald-600 font-bold text-[15px] leading-none">
                    {selectedRangeData.stock}
                  </div>
                  <Badge variant="outline" className="h-5 text-[11px]">
                    {((selectedRangeData.stock / selectedRangeData.total) * 100).toFixed(1)}%
                  </Badge>
                </div>
              </Card>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleTypeClick("customer")}
            >
              <Card
                className={[
                  "rounded-lg w-[150px] h-[56px] px-3 py-2",
                  "flex flex-col justify-between bg-white border",
                  selectedType === "customer" ? "border-violet-500" : ""
                ].join(" ")}
              >
                <div className="text-[11px] font-medium flex items-center gap-1 leading-none text-violet-700">
                  <Users className="w-3 h-3" />
                  Customer
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-violet-600 font-bold text-[15px] leading-none">
                    {selectedRangeData.customer}
                  </div>
                  <Badge variant="outline" className="h-5 text-[11px]">
                    {((selectedRangeData.customer / selectedRangeData.total) * 100).toFixed(1)}%
                  </Badge>
                </div>
              </Card>
            </motion.button>
          </div>
        </div>
      )}

      {/* 清除筛选（小巧版） */}
      {(selectedRange || selectedType) && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs"
            onClick={() => {
              setSelectedRange(null);
              setSelectedType(null);
              onFilterChange({});
            }}
          >
            Clear Filters
          </Button>
        </div>
      )}
    </div>
  );
}
