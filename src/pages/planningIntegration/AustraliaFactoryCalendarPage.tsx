import type { PlanningLang } from "./i18n";

const CALENDAR_YEAR = 2026;

const breakDayList = [
  "2026-01-01","2026-01-02","2026-01-05","2026-01-06","2026-01-07","2026-01-08","2026-01-09","2026-01-26",
  "2026-02-16","2026-03-09","2026-03-10","2026-04-03","2026-04-06","2026-04-07","2026-04-08","2026-04-09",
  "2026-04-10","2026-04-13","2026-05-18","2026-06-08","2026-06-09","2026-07-20","2026-08-24","2026-09-18",
  "2026-09-21","2026-09-22","2026-09-23","2026-09-24","2026-09-25","2026-10-19","2026-11-02","2026-11-03",
  "2026-11-16","2026-12-24","2026-12-25","2026-12-28","2026-12-29","2026-12-30","2026-12-31",
] as const;

const breakDaySet = new Set(breakDayList);

export default function AustraliaFactoryCalendarPage({ lang }: { lang: PlanningLang }) {
  const todayText = new Date().toISOString().slice(0, 10);

  const months = Array.from({ length: 12 }, (_, month) => {
    const first = new Date(CALENDAR_YEAR, month, 1);
    const daysInMonth = new Date(CALENDAR_YEAR, month + 1, 0).getDate();
    const startWeekday = first.getDay();
    const cells: Array<{ dateText: string; day: number; isWeekend: boolean; isBreakDay: boolean; isToday: boolean } | null> = [];
    for (let i = 0; i < startWeekday; i += 1) cells.push(null);

    for (let d = 1; d <= daysInMonth; d += 1) {
      const date = new Date(CALENDAR_YEAR, month, d);
      const dateText = `${CALENDAR_YEAR}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const weekday = date.getDay();
      cells.push({
        dateText,
        day: d,
        isWeekend: weekday === 0 || weekday === 6,
        isBreakDay: breakDaySet.has(dateText as any),
        isToday: dateText === todayText,
      });
    }
    while (cells.length % 7 !== 0) cells.push(null);

    return {
      month,
      monthLabel: new Date(CALENDAR_YEAR, month, 1).toLocaleString(lang === "zh" ? "zh-CN" : "en-AU", { month: "long", year: "numeric" }),
      isCurrentMonth: new Date().getFullYear() === CALENDAR_YEAR && new Date().getMonth() === month,
      cells,
    };
  });

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-sm">
        <div className="mb-2 text-base font-semibold">{lang === "zh" ? "澳洲工厂日历（2026）" : "Australia Factory Calendar (2026)"}</div>
        <div className="flex flex-wrap gap-4 text-xs">
          <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded bg-red-100" /> Break Day</span>
          <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded bg-slate-100" /> Weekend</span>
          <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded border border-slate-300 bg-white" /> Working Day</span>
          <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded border-2 border-blue-600 bg-blue-100" /> {lang === "zh" ? "今天" : "Today"}</span>
          <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded border-2 border-emerald-600 bg-emerald-100" /> {lang === "zh" ? "当前月份" : "Current Month"}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {months.map((m) => (
          <div key={m.month} className={`rounded-2xl border bg-white p-3 shadow-sm ${m.isCurrentMonth ? "border-emerald-500 ring-1 ring-emerald-200" : "border-slate-200"}`}>
            <div className="mb-2 text-sm font-semibold">{m.monthLabel}</div>
            <div className="mb-1 grid grid-cols-7 text-center text-[10px] text-slate-500">
              {lang === "zh" ? ["日", "一", "二", "三", "四", "五", "六"].map((d) => <div key={`${m.month}-${d}`}>{d}</div>) : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={`${m.month}-${d}`}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {m.cells.map((cell, idx) => {
                if (!cell) return <div key={`${m.month}-blank-${idx}`} className="h-8" />;
                const bg = cell.isBreakDay ? "bg-red-100" : cell.isWeekend ? "bg-slate-100" : "bg-white";
                const ring = cell.isToday ? "border-2 border-blue-600" : "border border-slate-200";
                return (
                  <div key={cell.dateText} className={`flex h-8 items-center justify-center rounded text-xs ${bg} ${ring}`}>
                    {cell.day}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
