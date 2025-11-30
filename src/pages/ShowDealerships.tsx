import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { subscribeAllDealerConfigs } from "@/lib/firebase";
import { formatShowDate, subscribeToShows } from "@/lib/showDatabase";
import type { ShowRecord } from "@/types/show";
import type { DealerConfigs } from "@/types/dealer";

const ShowDealerships = () => {
  const [shows, setShows] = useState<ShowRecord[]>([]);
  const [selectedDealership, setSelectedDealership] = useState<string>("");
  const [selectedDealerSlug, setSelectedDealerSlug] = useState<string>("");
  const [dealerConfigs, setDealerConfigs] = useState<DealerConfigs>({});
  const [loadingShows, setLoadingShows] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToShows((data) => {
      setShows(data);
      setLoadingShows(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeAllDealerConfigs((data) => setDealerConfigs(data || {}));
    return unsubscribe;
  }, []);

  const dealerships = useMemo(() => {
    const names = Array.from(new Set(shows.map((show) => show.dealership).filter(Boolean)));
    return names.sort((a, b) => a.localeCompare(b));
  }, [shows]);

  useEffect(() => {
    if (!selectedDealership && dealerships.length > 0) {
      setSelectedDealership(dealerships[0]);
    }
  }, [dealerships, selectedDealership]);

  const dealerOptions = useMemo(
    () =>
      Object.values(dealerConfigs)
        .map((config) => ({
          slug: config.slug,
          name: config.name,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [dealerConfigs]
  );

  const showsForDealership = useMemo(
    () => shows.filter((show) => (selectedDealership ? show.dealership === selectedDealership : true)),
    [shows, selectedDealership]
  );

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">Show Dealerships</h1>
          <p className="text-sm text-slate-600">
            从 Snowy River 的 Realtime Database 读取 <code>shows</code> 数据，选择数据集里的 dealership 并与当前系统中的 dealer slug 配对，方便后续处理
            show 的起止日期和名称。
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Dealership 总览</span>
              <span className="text-sm text-slate-500">
                共 {dealerships.length} 家 dealership，{shows.length} 个 show 记录
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dealerships.length === 0 ? (
              <p className="text-sm text-slate-600">正在加载 dealership 数据...</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {dealerships.map((name) => {
                  const count = shows.filter((show) => show.dealership === name).length;
                  return (
                    <Badge key={name} variant="secondary" className="px-3 py-1">
                      {name}
                      <span className="ml-2 text-slate-500">({count})</span>
                    </Badge>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>选择并配对 dealership</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="dealership-select">来自 Snowy River 的 dealership</Label>
              <Select
                value={selectedDealership}
                onValueChange={(value) => setSelectedDealership(value)}
                disabled={dealerships.length === 0}
              >
                <SelectTrigger id="dealership-select">
                  <SelectValue placeholder="选择 dealership" />
                </SelectTrigger>
                <SelectContent>
                  {dealerships.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dealer-slug-select">匹配现有 dealer（slug）</Label>
              <Select
                value={selectedDealerSlug}
                onValueChange={(value) => setSelectedDealerSlug(value)}
                disabled={dealerOptions.length === 0}
              >
                <SelectTrigger id="dealer-slug-select">
                  <SelectValue placeholder="选择现有 dealer" />
                </SelectTrigger>
                <SelectContent>
                  {dealerOptions.map((dealer) => (
                    <SelectItem key={dealer.slug} value={dealer.slug}>
                      {dealer.name} ({dealer.slug})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                仅用于页面内配对展示，不会写回数据库。
              </p>
            </div>

            {selectedDealerSlug && (
              <div className="space-y-2">
                <Label>当前匹配</Label>
                <div className="rounded-lg border bg-white p-3 text-sm text-slate-700">
                  <div className="font-medium">{selectedDealership || "未选择 dealership"}</div>
                  <div className="text-slate-600">匹配到：{selectedDealerSlug}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {selectedDealership ? `"${selectedDealership}" 的 show 列表` : "选择一个 dealership 查看 shows"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingShows ? (
              <p className="text-sm text-slate-600">正在加载 show 数据...</p>
            ) : showsForDealership.length === 0 ? (
              <p className="text-sm text-slate-600">暂无对应的 show 记录。</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Show 名称</TableHead>
                      <TableHead>开始日期</TableHead>
                      <TableHead>结束日期</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {showsForDealership.map((show) => (
                      <TableRow key={show.id}>
                        <TableCell className="font-medium">{show.name || "未命名 show"}</TableCell>
                        <TableCell>{formatShowDate(show.startDate)}</TableCell>
                        <TableCell>{formatShowDate(show.finishDate)}</TableCell>
                        <TableCell>{show.status || "Not set"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ShowDealerships;
