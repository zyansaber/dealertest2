import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { subscribeToSchedule } from "@/lib/firebase";
import { parseFlexibleDateToDate } from "@/lib/showDatabase";
import type { ScheduleItem } from "@/types";

const targetYears = [2025, 2026] as const;

const OrderReceivedSummary = () => {
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const unsub = subscribeToSchedule(
      (data) => {
        setSchedule(data);
        setLoaded(true);
      },
      { includeNoChassis: true, includeNoCustomer: true, includeFinished: true }
    );

    return () => unsub?.();
  }, []);

  const counts = useMemo(() => {
    const totals: Record<number, number> = { 2025: 0, 2026: 0 };
    let totalWithDate = 0;

    schedule.forEach((item) => {
      const parsed = parseFlexibleDateToDate(item["Order Received Date"] ?? undefined);
      if (!parsed) return;
      totalWithDate += 1;
      const year = parsed.getFullYear();
      if (year === 2025 || year === 2026) {
        totals[year] += 1;
      }
    });

    return {
      totalWithDate,
      byYear: totals,
    };
  }, [schedule]);

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Order Received Date Summary</h1>
          <p className="mt-2 text-sm text-slate-600">
            Special view for counting schedule records where Order Received Date falls in 2025 or 2026.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {targetYears.map((year) => (
            <Card key={year}>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-slate-500">{year}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold text-slate-900">{counts.byYear[year]}</div>
                <p className="mt-2 text-sm text-slate-500">Records with Order Received Date in {year}.</p>
              </CardContent>
            </Card>
          ))}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-slate-500">Total with Date</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold text-slate-900">{counts.totalWithDate}</div>
              <p className="mt-2 text-sm text-slate-500">All schedule rows that include Order Received Date.</p>
            </CardContent>
          </Card>
        </div>

        {!loaded && (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-500">
            Loading schedule data...
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderReceivedSummary;
