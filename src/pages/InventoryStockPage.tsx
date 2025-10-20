// src/pages/InventoryStockPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  subscribeToSpecPlan,
  subscribeToDateTrack,
  subscribeToSchedule,
  subscribeToStock,
  subscribeToReallocation,
  database, // ✅ 引入 Realtime DB 实例
} from "@/lib/firebase";
import type { ScheduleItem } from "@/types";

import Sidebar from "@/components/Sidebar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import emailjs from "emailjs-com";

// ✅ Firebase 写回所需
import { ref, update } from "firebase/database";

type AnyMap = Record<string, any>;
type Row = {
  chassis: string;
  model?: string;
  displayModel?: string;
  regentProduction?: string;
  /** 原始 stockorder 的字段（保持原始 key 命名展示） */
  _raw: Record<string, any>;
};

const productionSortOrder: Record<string, number> = {
  "Ready for Dispatch": 1,
  "Production Commenced Regent": 2,
  "Van Arrived": 3,
  "Van on the sea": 4,
  "Production Commenced Longtree": 5,
  "Not Started": 6,
  "": 7,
};

// stockorder 中不展示/不参与动态列的字段
const EXCLUDE_KEYS = new Set([
  "ordered", "order", "orderdate", "orderDate", "orderby", "orderBy",
  "orderedat", "orderedAt", "orderedby", "orderedBy",
  "chassisno", "ChassisNo", "chassisNo", "ChassisNO",
  "colour theme", "decals", "exterior colour", // 这些字段用作过滤器
]);

/** 将 URL 中的 dealerId 还原为真实的 slug（去掉随机后缀 -xxxxxx） */
function normalizeDealerSlug(raw?: string): string {
  const slug = (raw || "").toLowerCase();
  const m = slug.match(/^(.*?)-([a-z0-9]{6})$/); // 末尾一段随机码
  return m ? m[1] : slug;
}

/** 和首页一致的 slug 规则（把 Dealer 文本转为 slug，用于比较） */
function slugifyDealerName(name?: string): string {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** 将 slug 转成人看得懂的 Dealer 名称（基础美化） */
function prettifyDealerName(slug: string): string {
  const s = slug.replace(/-/g, " ").trim();
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function InventoryStockPage() {
  const { dealerSlug: rawDealerSlug = "" } = useParams<{ dealerSlug: string }>();
  
  // 标准化dealer slug
  const dealerSlug = useMemo(() => normalizeDealerSlug(rawDealerSlug), [rawDealerSlug]);

  // Sidebar 所需（统计、筛选） - 只显示当前dealer的订单
  const [allOrders, setAllOrders] = useState<ScheduleItem[]>([]);
  const [dealerOrders, setDealerOrders] = useState<ScheduleItem[]>([]);
  const [selectedModelRange, setSelectedModelRange] = useState<string>("all");

  // 页面主体
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [dynamicCols, setDynamicCols] = useState<string[]>([]); // ← 使用"原始字段名"作为表头

  // 过滤（本页固定在当前 dealer 上下文，只提供 model/status/search）
  const [q, setQ] = useState("");
  const [model, setModel] = useState("all");
  const [status, setStatus] = useState("all");
  
  // 新增：颜色主题、贴花、外观颜色过滤
  const [colourTheme, setColourTheme] = useState("all");
  const [decals, setDecals] = useState("all");
  const [exteriorColour, setExteriorColour] = useState("all");

  // Spec/Plan 链接映射
  const [specByChassis, setSpecByChassis] = useState<Record<string, string>>({});
  const [planByChassis, setPlanByChassis] = useState<Record<string, string>>({});

  // EmailJS配置（维持你的写法）
  const EMAIL_SERVICE = import.meta.env.VITE_EMAILJS_SERVICE_ID || "";
  const EMAIL_TEMPLATE = "template_zg5akbj"; // 指定的template
  const EMAIL_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || "";

  // 获取当前dealer的显示名称
  const dealerDisplayName = useMemo(() => {
    const fromOrder = dealerOrders[0]?.Dealer;
    return fromOrder && fromOrder.trim().length > 0
      ? fromOrder
      : prettifyDealerName(dealerSlug);
  }, [dealerOrders, dealerSlug]);

  useEffect(() => {
    setLoading(true);

    // 1) schedule：Sidebar 统计 & Regent Production & dealer过滤
    const unsubSchedule = subscribeToSchedule((list) => {
      const arr = Array.isArray(list) ? list.filter(Boolean) : Object.values(list || {});
      setAllOrders(arr as ScheduleItem[]);
      
      // 过滤当前dealer的订单
      if (dealerSlug) {
        const filtered = (arr as ScheduleItem[]).filter(
          (o) => slugifyDealerName(o.Dealer) === dealerSlug
        );
        setDealerOrders(filtered);
      } else {
        setDealerOrders(arr as ScheduleItem[]);
      }
    });

    // 2) Spec/Plan：spec_plan数据结构修复
    const unsubSpecPlan = subscribeToSpecPlan((data: any) => {
      // 处理spec_plan数据，按你提供的结构
      const specMap: Record<string, string> = {};
      const planMap: Record<string, string> = {};
      
      if (data && typeof data === 'object') {
        Object.keys(data).forEach(chassisKey => {
          const chassisData = data[chassisKey];
          if (chassisData && typeof chassisData === 'object') {
            if (chassisData.spec && typeof chassisData.spec === 'string') {
              specMap[chassisKey] = chassisData.spec;
            }
            if (chassisData.plan && typeof chassisData.plan === 'string') {
              planMap[chassisKey] = chassisData.plan;
            }
          }
        });
      }
      
      setSpecByChassis(specMap);
      setPlanByChassis(planMap);
    });

    // 3) stock + reallocation：构表
    let latestStock: AnyMap = {};
    let latestRealloc: AnyMap = {};
    let latestSchedule: ScheduleItem[] = [];

    const rebuild = () => {
      try {
        const scheduleList = latestSchedule || [];

        const processed: Row[] = [];
        const allCols = new Set<string>();

        for (const [chassis, detailsRaw] of Object.entries(latestStock || {})) {
          const details = (detailsRaw || {}) as AnyMap;

          // ✅ 已下单 & SRM 过滤（保留你原逻辑）
          if (String(details?.ordered).toLowerCase() === "true") continue;
          if (typeof chassis === "string" && chassis.startsWith("SRM")) continue;

          // ✅ 新增：只要存在 orderedBy/orderedby，也视为已下单，隐藏在库存表
          const hasOrderedBy =
            (details?.orderedBy != null && String(details.orderedBy) !== "") ||
            (details?.orderedby != null && String(details.orderedby) !== "");
          if (hasOrderedBy) continue;

          // reallocation：仅 Snowy Stock
          const realloc = latestRealloc?.[chassis];
          if (realloc && typeof realloc === "object") {
            const entries = Object.values(realloc);
            const latest = entries[entries.length - 1] as AnyMap | undefined;
            const dest = String(latest?.reallocatedTo || "");
            if (dest && dest !== "Snowy Stock") continue;
          }

          // 记录动态列（使用"原始字段名"）
          for (const key of Object.keys(details)) {
            const lower = key.toLowerCase();
            if (EXCLUDE_KEYS.has(key) || EXCLUDE_KEYS.has(lower)) continue;
            allCols.add(key); // 保留原样 key 作为表头
          }

          // Model / Display Model
          const modelValue = typeof chassis === "string" ? chassis.substring(0, 3) : "";
          const displayModel = modelValue.startsWith("NG") && modelValue.length > 2 ? modelValue.substring(0, 2) : modelValue;

          // Regent Production（匹配 schedule）
          let regentProductionValue: string = "Not Started";
          for (const s of scheduleList) {
            if (String((s as AnyMap)?.Chassis || "") === chassis && (s as AnyMap)["Regent Production"]) {
              regentProductionValue = String((s as AnyMap)["Regent Production"]);
              break;
            }
          }

          // Finished 不展示
          if (regentProductionValue.toLowerCase() === "finished" || regentProductionValue.toLowerCase() === "finish") {
            continue;
          }

          processed.push({
            chassis: String(chassis),
            model: modelValue,
            displayModel,
            regentProduction: regentProductionValue,
            _raw: details, // 保留原始字段和值
          });
        }

        // 排序
        processed.sort((a, b) => {
          const A = productionSortOrder[a.regentProduction || ""] || 999;
          const B = productionSortOrder[b.regentProduction || ""] || 999;
          return A - B;
        });

        // 过滤掉一些常见的"非展示字段"
        ["materialdescription", "chassis", "chassisno"].forEach((k) => {
          if (allCols.has(k)) allCols.delete(k);
        });

        setRows(processed);
        setDynamicCols(Array.from(allCols).sort());
      } catch (err) {
        console.error(err);
        toast.error("Failed to build stock table");
      } finally {
        setLoading(false);
      }
    };

    const unsubStock = subscribeToStock((data: AnyMap) => {
      latestStock = data || {};
      rebuild();
    });
    const unsubRealloc = subscribeToReallocation((data: AnyMap) => {
      latestRealloc = data || {};
      rebuild();
    });
    const unsubScheduleForTable = subscribeToSchedule((list) => {
      latestSchedule = Array.isArray(list) ? list.filter(Boolean) : Object.values(list || {});
      rebuild();
    });

    return () => {
      unsubSchedule?.();
      unsubSpecPlan?.();
      unsubScheduleForTable?.();
      unsubStock?.();
      unsubRealloc?.();
    };
  }, [dealerSlug]);

  // 按Model Range统计
  const modelRangeStats = useMemo(() => {
    const stats = new Map<string, number>();
    rows.forEach(row => {
      const modelRange = row.chassis.substring(0, 3);
      stats.set(modelRange, (stats.get(modelRange) || 0) + 1);
    });
    return Array.from(stats.entries())
      .map(([range, count]) => ({ range, count }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  // 获取所有可能的颜色主题、贴花、外观颜色选项
  const filterOptions = useMemo(() => {
    const colourThemes = new Set<string>();
    const decalsOptions = new Set<string>();
    const exteriorColours = new Set<string>();

    rows.forEach(row => {
      const raw = row._raw || {};
      if (raw["colour theme"]) colourThemes.add(String(raw["colour theme"]));
      if (raw["decals"]) decalsOptions.add(String(raw["decals"]));
      if (raw["exterior colour"]) exteriorColours.add(String(raw["exterior colour"]));
    });

    return {
      colourThemes: Array.from(colourThemes).sort(),
      decals: Array.from(decalsOptions).sort(),
      exteriorColours: Array.from(exteriorColours).sort(),
    };
  }, [rows]);

  // —— 过滤：固定在当前 dealerSlug 上（按 dealer 名 slug 前缀对齐） —— //
  const filtered = useMemo(() => {
    return rows
      .filter((r) => selectedModelRange === "all" ? true : r.chassis.substring(0, 3) === selectedModelRange)
      .filter((r) => (model === "all" ? true : String(r.displayModel || r.model || "") === model))
      .filter((r) => (status === "all" ? true : String(r.regentProduction || "") === status))
      .filter((r) => (colourTheme === "all" ? true : String(r._raw?.["colour theme"] || "") === colourTheme))
      .filter((r) => (decals === "all" ? true : String(r._raw?.["decals"] || "") === decals))
      .filter((r) => (exteriorColour === "all" ? true : String(r._raw?.["exterior colour"] || "") === exteriorColour))
      .filter((r) => {
        if (!q) return true;
        const s = `${r.displayModel ?? r.model ?? ""} ${r.chassis ?? ""} ${r.regentProduction ?? ""} ${Object.values(r._raw || {}).join(" ")}`.toLowerCase();
        return s.includes(q.toLowerCase());
      });
  }, [rows, selectedModelRange, model, status, colourTheme, decals, exteriorColour, q]);

  // —— CSV 导出 —— //
  const exportCSV = () => {
    const header = ["Model","Chassis","Regent Production", ...dynamicCols, "SpecLink","PlanLink"];
    const csv = [
      header.join(","),
      ...filtered.map((r) => {
        const specUrl = specByChassis[r.chassis] ?? "";
        const planUrl = planByChassis[r.chassis] ?? "";
        const line = [
          r.displayModel ?? r.model ?? "",
          r.chassis ?? "",
          r.regentProduction ?? "",
          ...dynamicCols.map((col) => stringify(r._raw?.[col])),
          stringify(specUrl),
          stringify(planUrl),
        ];
        return line.map((x) => `"${String(x).replaceAll('"','""')}"`).join(",");
      }),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `inventory_stock_${dealerDisplayName}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // —— Spec / Plan 直接打开链接 —— //
  const handleViewSpec = (chassis: string) => {
    const specUrl = specByChassis[chassis];
    if (specUrl) {
      window.open(specUrl, '_blank');
    } else {
      toast.error("No spec document available for this chassis");
    }
  };

  const handleViewPlan = (chassis: string) => {
    const planUrl = planByChassis[chassis];
    if (planUrl) {
      window.open(planUrl, '_blank');
    } else {
      toast.error("No plan document available for this chassis");
    }
  };

  // —— Order（下单邮件）使用指定的template + ✅ 成功后写回 Firebase —— //
  async function handleOrder(row: Row) {
    if (!EMAIL_SERVICE || !EMAIL_PUBLIC_KEY) {
      toast.error("EmailJS configuration missing. Cannot send order email.");
      return;
    }
    
    try {
      // 构建详细信息字符串
      const detailsArray: string[] = [];
      detailsArray.push(`Model: ${row.displayModel || row.model || "N/A"}`);
      detailsArray.push(`Regent Production: ${row.regentProduction || "Not Started"}`);
      
      // 添加动态字段信息
      dynamicCols.forEach(col => {
        const value = row._raw?.[col];
        if (value !== null && value !== undefined && value !== "") {
          detailsArray.push(`${col}: ${stringify(value)}`);
        }
      });
      
      const currentTime = new Date().toLocaleString();
      
      await emailjs.send(
        EMAIL_SERVICE,
        EMAIL_TEMPLATE,
        {
          chassis: row.chassis,           // {{chassis}}
          ordered_by: dealerDisplayName,  // {{ordered_by}}
          order_time: currentTime,        // {{order_time}}
          details: detailsArray.join("\n")// {{details}}
        },
        EMAIL_PUBLIC_KEY
      );

      // ✅ 邮件成功 → 立刻写回 stockorder/<chassis>
      try {
        await update(ref(database, `stockorder/${row.chassis}`), {
          ordered: true,
          orderedBy: dealerDisplayName,
          orderedAt: currentTime,
        });
      } catch (e) {
        console.error("Failed to update stockorder in Firebase:", e);
        toast.error("Order sent, but failed to update stock status in Firebase.");
      }
      
      toast.success(`Order email sent successfully for chassis ${row.chassis}`);
      
    } catch (e) {
      console.error("EmailJS error:", e);
      toast.error("Failed to send order email. Please try again.");
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        orders={dealerOrders}
        selectedDealer="locked"
        onDealerSelect={() => {}}
        hideOtherDealers={true}
        currentDealerName={dealerDisplayName}
        showStats={false}
      />

      <div className="flex-1 overflow-auto">
        <div className="p-4 md:p-6 lg:p-8 space-y-4">

          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Factory Inventory</h2>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={exportCSV}>Export CSV</Button>
            </div>
          </div>

          {/* Model Range Filter Cards - 小卡片一行显示 */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm font-medium text-slate-700 mr-2">Filter by Model Range:</span>
            
            <Button
              variant={selectedModelRange === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedModelRange("all")}
              className="h-8"
            >
              All ({rows.length})
            </Button>
            
            {modelRangeStats.map(({ range, count }) => (
              <Button
                key={range}
                variant={selectedModelRange === range ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedModelRange(range)}
                className="h-8 flex items-center gap-1"
              >
                <span className="font-medium">{range}</span>
                <span className="text-xs bg-white/20 px-1 rounded">{count}</span>
              </Button>
            ))}
          </div>

          {/* 颜色过滤器 - 改为下拉菜单样式 */}
          <div className="flex flex-wrap gap-3 items-center p-4 bg-white rounded-lg border">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700">Colour Theme:</label>
              <Select value={colourTheme} onValueChange={setColourTheme}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {filterOptions.colourThemes.map((theme) => (
                    <SelectItem key={theme} value={theme}>{theme}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700">Decals:</label>
              <Select value={decals} onValueChange={setDecals}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {filterOptions.decals.map((decal) => (
                    <SelectItem key={decal} value={decal}>{decal}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700">Exterior Colour:</label>
              <Select value={exteriorColour} onValueChange={setExteriorColour}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {filterOptions.exteriorColours.map((colour) => (
                    <SelectItem key={colour} value={colour}>{colour}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Other Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <Input
              placeholder="Search model / chassis / any field..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-64"
            />
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Model" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All models</SelectItem>
                {[...new Set(rows.map((r) => r.displayModel || r.model || ""))]
                  .filter(Boolean)
                  .sort()
                  .map((m) => <SelectItem key={m} value={String(m)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                {[...new Set(rows.map((r) => r.regentProduction || ""))]
                  .filter(Boolean)
                  .sort()
                  .map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* 表格：动态列 = stockorder 的"原始字段名" */}
          <div className="rounded-xl border bg-white overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chassis</TableHead>
                  <TableHead>Regent Production</TableHead>
                  <TableHead>Model</TableHead>
                  {dynamicCols.map((col) => (
                    <TableHead key={col}>{col}</TableHead>
                  ))}
                  <TableHead>Spec</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Order</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={dynamicCols.length + 6}>
                      <div className="p-8 text-center text-muted-foreground">Loading...</div>
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={dynamicCols.length + 6}>
                      <div className="p-8 text-center text-muted-foreground">No matching records</div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => {
                    const hasSpec = !!specByChassis[r.chassis];
                    const hasPlan = !!planByChassis[r.chassis];
                    return (
                      <TableRow key={r.chassis}>
                        <TableCell className="font-medium">{r.chassis}</TableCell>
                        <TableCell>{r.regentProduction || "Not Started"}</TableCell>
                        <TableCell>{r.displayModel || r.model || ""}</TableCell>
                        {dynamicCols.map((col) => (
                          <TableCell key={`${r.chassis}-${col}`}>
                            {stringify(r._raw?.[col])}
                          </TableCell>
                        ))}
                        <TableCell>
                          <Button 
                            size="sm" 
                            variant={hasSpec ? "outline" : "ghost"} 
                            disabled={!hasSpec}
                            onClick={() => handleViewSpec(r.chassis)}
                          >
                            Spec
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Button 
                            size="sm" 
                            variant={hasPlan ? "outline" : "ghost"} 
                            disabled={!hasPlan}
                            onClick={() => handleViewPlan(r.chassis)}
                          >
                            Plan
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Button size="sm" onClick={() => handleOrder(r)}>Order</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}

function stringify(v: any) {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join("; ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
