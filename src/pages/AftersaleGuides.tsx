import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const guideGroups = [
  {
    title: "Delivery & Handover",
    items: ["Pre-delivery checklist", "Warranty activation", "Owner walkthrough"],
  },
  {
    title: "Maintenance",
    items: ["First 90 days care", "Seasonal storage", "Cleaning tips"],
  },
  {
    title: "Support",
    items: ["Service booking", "Parts replacement", "Emergency contacts"],
  },
];

export default function AftersaleGuides() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">Aftersale Guides</p>
            <h1 className="text-3xl font-semibold text-slate-900">Aftercare knowledge base</h1>
          </div>
          <div className="w-full max-w-sm">
            <label className="text-sm font-medium text-slate-600" htmlFor="guide-search">
              seacrh
            </label>
            <Input
              id="guide-search"
              placeholder="seacrh"
              className="mt-2 bg-white"
            />
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-lg">Guide categories</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {guideGroups.map((group) => (
                <div key={group.title} className="space-y-2">
                  <p className="text-sm font-semibold text-slate-700">{group.title}</p>
                  <ul className="space-y-1 text-sm text-slate-600">
                    {group.items.map((item) => (
                      <li key={item} className="rounded-md border border-transparent px-2 py-1 hover:border-slate-200 hover:bg-slate-50">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-6">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="text-lg">Guide details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-6 text-sm text-slate-600">
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                  <p className="font-semibold text-slate-700">Pre-delivery checklist</p>
                  <p className="mt-2 text-sm text-slate-600">
                    Prepare delivery-ready steps, documents, and customer instructions in a clean, easy-to-scan format.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-slate-100 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Priority</p>
                    <p className="mt-1 text-base font-semibold text-slate-700">High-impact</p>
                  </div>
                  <div className="rounded-lg border border-slate-100 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Last updated</p>
                    <p className="mt-1 text-base font-semibold text-slate-700">Today</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="text-lg">Quick actions</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 pt-6 text-sm text-slate-600 sm:grid-cols-2">
                {[
                  "Add new guide",
                  "Assign owner",
                  "Publish update",
                  "Share with dealers",
                ].map((label) => (
                  <div key={label} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                    <p className="font-semibold text-slate-700">{label}</p>
                    <p className="mt-1 text-xs text-slate-500">Keep guidance consistent across teams.</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
