import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getModelRange } from "@/lib/targetHighlight";
import type { PlanningLang } from "./i18n";
import { tr } from "./i18n";
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

export default function SmartSchedulingPage({ rows, lang }: { rows: Row[]; lang: PlanningLang }) {
  const nonFinishedRows = useMemo(() => {
    return rows.filter((r) => {
      const rp = String(r.schedule?.["Regent Production"] ?? "").trim().toLowerCase();
      return rp !== "finished" && rp !== "finish";
    });
  }, [rows]);

  const enhancedRows = useMemo(() => {
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

      return {
        status,
        modelRange: normalizeModelRange(model, chassis),
        customerType: customer.toLowerCase().endsWith("stock") ? tr(lang, "Stock", "库存") : tr(lang, "Customer", "客户"),
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
    const longtreeWeldingToFinishedRows = enhancedRows.filter((r) => longtreeWeldingToFinishedStatuses.has(r.status));

    const longtreeFactoryNotStartedRows = longtreeFactoryRows.filter((r) => !longtreeWeldingToFinishedStatuses.has(r.status));

    return {
      melbourneFactory: enhancedRows.filter((r) => melbourneFactoryStatuses.has(r.status)),
      onTransit: enhancedRows.filter((r) => onTransitStatuses.has(r.status)),
      longtreeNotStarted: longtreeFactoryNotStartedRows,
      longtreeWeldingToFinished: longtreeWeldingToFinishedRows,
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
              "Percentages follow overall-dashboard/overview dimensions (model range, customer type, by group) and exclude finished Regent Production rows like the schedule page.",
              "百分比维度与 overall-dashboard/overview 一致（Model Range、Customer、By Group），且按排产表规则排除 Regent Production=finished/finish。"
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
              <RatioTable title={tr(lang, "Model Range %", "Model Range 占比")} rows={ratioRows(rowsInScope.map((r) => r.modelRange))} lang={lang} />
              <RatioTable title={tr(lang, "Customer %", "Customer 占比")} rows={ratioRows(rowsInScope.map((r) => r.customerType))} lang={lang} />
              <RatioTable title={tr(lang, "By Group %", "By Group 占比")} rows={ratioRows(rowsInScope.map((r) => r.group))} lang={lang} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
