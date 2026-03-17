import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getModelRange } from "@/lib/targetHighlight";
import type { PlanningLang } from "./i18n";
import { tr } from "./i18n";
import { getPlanningOrderType, isPlanningCustomerOrder, planningOrderTypeLabel } from "./orderType";
import { milestoneSequence, phaseCardMap } from "./types";
import { parseDateToTimestamp } from "./utils";
import type { Row } from "./types";

const FACTORY_DEALER_NAMES = ["Frankston", "Launceston", "ST James", "Traralgon", "Geelong"];
const GREEN_RV_NAMES = ["Green Show", "Slacks Creek", "Forest Glen"];
const NEW_ZEALAND_NAMES = ["Christchurch", "CMG Campers", "Marsden Point"];
const JV_NAMES = ["Heatherbrae", "Gympie", "Toowoomba", "Bundaberg", "Townsville"];

const normalize = (v: string) => v.trim().toLowerCase();

const resolveDealerGroup = (dealer: string) => {
  const value = normalize(dealer);
  if (!value) return "EXTERNAL DEALERS";
  if (FACTORY_DEALER_NAMES.some((name) => value.includes(normalize(name)))) return "FACTORY DEALER";
  if (GREEN_RV_NAMES.some((name) => value.includes(normalize(name)))) return "GREEN RV";
  if (NEW_ZEALAND_NAMES.some((name) => value.includes(normalize(name)))) return "NEW ZEALAND";
  if (JV_NAMES.some((name) => value.includes(normalize(name)))) return "JV";
  return "EXTERNAL DEALERS";
};

const groupDisplay = (lang: PlanningLang, group: string) => {
  const map: Record<string, string> = {
    "FACTORY DEALER": "直营店",
    JV: "合资店",
    "GREEN RV": "Green经销商（最大独立经销商）",
    "EXTERNAL DEALERS": "独立经销商",
    "NEW ZEALAND": "新西兰",
  };
  return lang === "zh" ? map[group] ?? group : group;
};

const normalizeModelRange = (model: string, chassis: string) => {
  const m = model.trim().toUpperCase();
  const c = chassis.trim().toUpperCase();
  const base = getModelRange(m, c);

  const startsSRL = ["19", "20", "21", "22", "23"].some((prefix) => m.startsWith(prefix) || c.startsWith(prefix));
  if (startsSRL) return "SRL";

  const startsNG = ["NG1", "NG2", "NGB", "NGC"].some((prefix) => m.startsWith(prefix) || c.startsWith(prefix) || base.startsWith(prefix));
  if (startsNG || base.startsWith("NG")) return "NG";

  return base;
};

type ScopeKey = "melbourneFactory" | "onTransit" | "longtreeNotStarted" | "longtreeWeldingToFinished";

type EnhancedRow = {
  status: string;
  modelRange: string;
  customerTypeLabel: string;
  isCustomerOrder: boolean;
  group: string;
};

const scopeText = (lang: PlanningLang, scope: ScopeKey) => {
  if (scope === "melbourneFactory") return tr(lang, "Melbourne Factory", "墨尔本工厂");
  if (scope === "onTransit") return tr(lang, "In Transit", "在途运输");
  if (scope === "longtreeNotStarted") return tr(lang, "Longtree Factory (Not Started)", "Longtree 工厂（未生产）");
  return tr(lang, "Longtree chassis welding → finished", "Longtree 底盘焊接 → 已完工");
};

function ratioRows(values: string[]) {
  const countMap = values.reduce<Record<string, number>>((acc, key) => {
    const cleaned = key.trim() || "(blank)";
    acc[cleaned] = (acc[cleaned] ?? 0) + 1;
    return acc;
  }, {});

  const total = values.length;
  return Object.entries(countMap)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, count]) => ({
      label,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    }));
}

function groupRatioRows(rows: EnhancedRow[], lang: PlanningLang) {
  const total = rows.length;
  const bucket = new Map<string, { count: number; customerCount: number }>();

  rows.forEach((row) => {
    if (!bucket.has(row.group)) bucket.set(row.group, { count: 0, customerCount: 0 });
    const entry = bucket.get(row.group)!;
    entry.count += 1;
    if (row.isCustomerOrder) entry.customerCount += 1;
  });

  return Array.from(bucket.entries())
    .map(([group, entry]) => ({
      label: groupDisplay(lang, group),
      count: entry.count,
      percentage: total > 0 ? (entry.count / total) * 100 : 0,
      customerPercentage: entry.count > 0 ? (entry.customerCount / entry.count) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function RatioTable({
  title,
  rows,
  lang,
}: {
  title: string;
  rows: Array<{ label: string; count: number; percentage: number }>;
  lang: PlanningLang;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 text-sm font-semibold text-slate-700">{title}</div>
      {rows.length === 0 ? (
        <div className="text-sm text-slate-500">{tr(lang, "No records", "暂无数据")}</div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.label} className="grid grid-cols-[1fr_72px_80px] items-center gap-3 text-sm">
              <div className="truncate font-medium text-slate-700" title={row.label}>{row.label}</div>
              <div className="text-right tabular-nums text-slate-600">{row.count}</div>
              <div className="text-right tabular-nums font-semibold text-slate-900">{row.percentage.toFixed(1)}%</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GroupRatioTable({
  title,
  rows,
  lang,
}: {
  title: string;
  rows: Array<{ label: string; count: number; percentage: number; customerPercentage: number }>;
  lang: PlanningLang;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 text-sm font-semibold text-slate-700">{title}</div>
      {rows.length === 0 ? (
        <div className="text-sm text-slate-500">{tr(lang, "No records", "暂无数据")}</div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.label} className="grid grid-cols-[1fr_64px_72px_100px] items-center gap-2 text-sm">
              <div className="truncate font-medium text-slate-700" title={row.label}>{row.label}</div>
              <div className="text-right tabular-nums text-slate-600">{row.count}</div>
              <div className="text-right tabular-nums font-semibold text-slate-900">{row.percentage.toFixed(1)}%</div>
              <div className="text-right tabular-nums text-indigo-700">{row.customerPercentage.toFixed(1)}%</div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">
        {tr(lang, "Last column = customer-order ratio inside each dealer company.", "最后一列=该经销商公司内部的客户订单占比。")}
      </p>
    </div>
  );
}

export default function SmartSchedulingPage({ rows, lang }: { rows: Row[]; lang: PlanningLang }) {
  const nonFinishedRows = useMemo(() => {
    return rows.filter((r) => {
      const rp = String(r.schedule?.["Regent Production"] ?? "").trim().toLowerCase();
      return rp !== "finished" && rp !== "finish";
    });
  }, [rows]);

  const enhancedRows = useMemo<EnhancedRow[]>(() => {
    return nonFinishedRows.map((r) => {
      let last = "";
      milestoneSequence.forEach((m) => {
        const ts = parseDateToTimestamp(m.source === "schedule" ? (r.schedule as any)?.[m.key] : r.dateTrack?.[m.key]);
        if (ts != null) last = m.key;
      });

      const status = (phaseCardMap[last] ?? last) || "-";
      const model = String((r.schedule as any)?.Model ?? "").trim();
      const chassis = String((r.schedule as any)?.Chassis ?? "").trim();
      const customer = String((r.schedule as any)?.Customer ?? "").trim();
      const dealer = String((r.schedule as any)?.Dealer ?? "").trim();
      const orderType = getPlanningOrderType(customer);

      return {
        status,
        modelRange: normalizeModelRange(model, chassis),
        customerTypeLabel: planningOrderTypeLabel(lang, orderType),
        isCustomerOrder: isPlanningCustomerOrder(orderType),
        group: resolveDealerGroup(dealer),
      };
    });
  }, [nonFinishedRows, lang]);

  const scopedRows = useMemo(() => {
    const melbourneFactoryStatuses = new Set(["Melbourn Factory"]);
    const onTransitStatuses = new Set(["Leaving factory from Longtree", "waiting in port", "On the sea", "Melbourn Port"]);

    const longtreeFactoryStatuses = new Set([
      "Not Start in Longtree",
      "Chassis welding in Longtree",
      "Assembly line Longtree",
      "Finishedin Longtree",
    ]);

    const longtreeWeldingToFinishedStatuses = new Set([
      "Chassis welding in Longtree",
      "Assembly line Longtree",
      "Finishedin Longtree",
    ]);

    const longtreeFactoryRows = enhancedRows.filter((r) => longtreeFactoryStatuses.has(r.status));

    return {
      melbourneFactory: enhancedRows.filter((r) => melbourneFactoryStatuses.has(r.status)),
      onTransit: enhancedRows.filter((r) => onTransitStatuses.has(r.status)),
      longtreeNotStarted: longtreeFactoryRows.filter((r) => !longtreeWeldingToFinishedStatuses.has(r.status)),
      longtreeWeldingToFinished: enhancedRows.filter((r) => longtreeWeldingToFinishedStatuses.has(r.status)),
    };
  }, [enhancedRows]);

  const sections: ScopeKey[] = ["melbourneFactory", "onTransit", "longtreeNotStarted", "longtreeWeldingToFinished"];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{tr(lang, "Intelligent Scheduling", "智能排产")}</CardTitle>
          <p className="text-sm text-slate-600">
            {tr(
              lang,
              "Percentages follow overall-dashboard/overview dimensions and exclude finished Regent Production rows like the schedule page.",
              "百分比维度按 overall-dashboard/overview 展示，且按排产表规则排除 Regent Production=finished/finish。"
            )}
          </p>
        </CardHeader>
      </Card>

      {sections.map((scope) => {
        const rowsInScope = scopedRows[scope];
        return (
          <Card key={scope}>
            <CardHeader>
              <CardTitle className="text-lg">{scopeText(lang, scope)}</CardTitle>
              <p className="text-sm text-slate-600">
                {tr(lang, "Total units", "总数量")}: <span className="font-semibold text-slate-900">{rowsInScope.length}</span>
              </p>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-3">
              <RatioTable title={tr(lang, "Model Range %", "型号占比")} rows={ratioRows(rowsInScope.map((r) => r.modelRange))} lang={lang} />
              <RatioTable title={tr(lang, "Customer %", "客户订单占比")} rows={ratioRows(rowsInScope.map((r) => r.customerTypeLabel))} lang={lang} />
              <GroupRatioTable title={tr(lang, "By Group %", "经销商公司占比")} rows={groupRatioRows(rowsInScope, lang)} lang={lang} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
