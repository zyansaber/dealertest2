import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type DealerStateCode = "WA" | "NSW" | "QLD" | "VIC" | "TAS" | "NT" | "SA" | "ACT" | "NZ";

type DealerRow = {
  slug: string;
  name: string;
  state: DealerStateCode;
  orders: number;
};

type Props = {
  dealers: DealerRow[];
  selectedState: string;
  onSelectState: (state: string) => void;
  modelRangeFilter?: string;
};

type GeoFeature = {
  properties?: { name?: string; STATE_NAME?: string };
  geometry?: {
    type?: string;
    coordinates?: number[][][] | number[][][][];
  };
};

const stateMap: Record<string, DealerStateCode> = {
  "Western Australia": "WA",
  "New South Wales": "NSW",
  Queensland: "QLD",
  Victoria: "VIC",
  Tasmania: "TAS",
  "Northern Territory": "NT",
  "South Australia": "SA",
  "Australian Capital Territory": "ACT",
  "New Zealand": "NZ",
};

const pieLabelOffset: Partial<Record<DealerStateCode, { x: number; y: number }>> = {
  WA: { x: 4, y: 12 },
  NT: { x: 0, y: 10 },
  QLD: { x: -14, y: 4 },
  SA: { x: 2, y: 6 },
  NSW: { x: -2, y: 2 },
  VIC: { x: -2, y: 6 },
  TAS: { x: 4, y: -4 },
  ACT: { x: 20, y: 10 },
  NZ: { x: 10, y: 2 },
};

const lerp = (from: number, to: number, ratio: number) => from + (to - from) * ratio;

const colorScale = (value: number, max: number) => {
  // Soft professional ramp: very light -> stronger (but not neon)
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const r = Math.round(lerp(236, 37, ratio));
  const g = Math.round(lerp(245, 99, ratio));
  const b = Math.round(lerp(255, 235, ratio));
  return `rgb(${r}, ${g}, ${b})`;
};

const extractRings = (feature: GeoFeature): number[][][] => {
  const geometryType = feature?.geometry?.type;
  const coordinates = feature?.geometry?.coordinates;
  if (!coordinates) return [];

  if (geometryType === "Polygon") {
    return coordinates as number[][][];
  }

  if (geometryType === "MultiPolygon") {
    return (coordinates as number[][][][]).flat();
  }

  return [];
};

const describePie = (cx: number, cy: number, radius: number, percent: number) => {
  const clamped = Math.max(0, Math.min(100, percent));
  if (clamped <= 0) return "";
  if (clamped >= 100) {
    return [
      `M ${cx} ${cy - radius}`,
      `A ${radius} ${radius} 0 1 1 ${cx - 0.01} ${cy - radius}`,
      `A ${radius} ${radius} 0 1 1 ${cx} ${cy - radius}`,
      "Z",
    ].join(" ");
  }

  const angle = (clamped / 100) * Math.PI * 2;
  const endAngle = -Math.PI / 2 + angle;
  const x = cx + radius * Math.cos(endAngle);
  const y = cy + radius * Math.sin(endAngle);
  const largeArc = clamped > 50 ? 1 : 0;

  return [`M ${cx} ${cy}`, `L ${cx} ${cy - radius}`, `A ${radius} ${radius} 0 ${largeArc} 1 ${x} ${y}`, "Z"].join(" ");
};

const formatInt = (n: number) => new Intl.NumberFormat("en-AU").format(n);

export default function AustraliaDealerMap({
  dealers,
  selectedState,
  onSelectState,
  modelRangeFilter = "ALL",
}: Props) {
  const [features, setFeatures] = useState<GeoFeature[]>([]);
  const [loadingMap, setLoadingMap] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoadingMap(true);

    Promise.all([
      fetch("/maps/australia-states.json").then((res) => res.json()),
      fetch("/maps/NZ.json").then((res) => res.json()),
    ])
      .then(([auJson, nzJson]) => {
        if (!mounted) return;
        const auFeatures = Array.isArray(auJson?.features) ? auJson.features : [];
        const nzFeatures = Array.isArray(nzJson?.features) ? nzJson.features : [];
        setFeatures([...auFeatures, ...nzFeatures]);
      })
      .catch(() => {
        if (!mounted) return;
        setFeatures([]);
      })
      .finally(() => {
        if (!mounted) return;
        setLoadingMap(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const stateTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    dealers.forEach((dealer) => {
      totals[dealer.state] = (totals[dealer.state] || 0) + dealer.orders;
    });
    return totals;
  }, [dealers]);

  const totalOrders = useMemo(() => Object.values(stateTotals).reduce((sum, v) => sum + v, 0), [stateTotals]);
  const maxOrders = useMemo(() => Math.max(0, ...Object.values(stateTotals)), [stateTotals]);

  const selectedOrders = useMemo(() => {
    if (!selectedState || selectedState === "ALL") return totalOrders;
    return stateTotals[selectedState] || 0;
  }, [selectedState, stateTotals, totalOrders]);

  const selectedShare = useMemo(() => {
    if (totalOrders <= 0) return 0;
    if (!selectedState || selectedState === "ALL") return 100;
    return ((stateTotals[selectedState] || 0) / totalOrders) * 100;
  }, [selectedState, stateTotals, totalOrders]);

  const stateRows = useMemo(() => {
    const codes = Object.keys(stateTotals) as DealerStateCode[];
    const rows = codes
      .map((code) => ({
        code,
        orders: stateTotals[code] || 0,
        share: totalOrders > 0 ? ((stateTotals[code] || 0) / totalOrders) * 100 : 0,
      }))
      .sort((a, b) => b.orders - a.orders);

    // ensure stable order for missing states if needed (optional)
    return rows;
  }, [stateTotals, totalOrders]);

  const mapBounds = useMemo(() => {
    let minLon = Number.POSITIVE_INFINITY;
    let maxLon = Number.NEGATIVE_INFINITY;
    let minLat = Number.POSITIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;

    features.forEach((feature) => {
      extractRings(feature).forEach((ring) => {
        ring.forEach(([lon, lat]) => {
          minLon = Math.min(minLon, lon);
          maxLon = Math.max(maxLon, lon);
          minLat = Math.min(minLat, lat);
          maxLat = Math.max(maxLat, lat);
        });
      });
    });

    if (!Number.isFinite(minLon) || !Number.isFinite(maxLon) || !Number.isFinite(minLat) || !Number.isFinite(maxLat)) {
      return { minLon: 111, maxLon: 180, minLat: -48, maxLat: -9 };
    }

    return {
      minLon: minLon - 1.5,
      maxLon: maxLon + 1.5,
      minLat: minLat - 1,
      maxLat: maxLat + 1,
    };
  }, [features]);

  const polygonPoints = (coordinates: number[][]) => {
    const { minLon, maxLon, minLat, maxLat } = mapBounds;
    return coordinates
      .map(([lon, lat]) => {
        const x = ((lon - minLon) / (maxLon - minLon)) * 920;
        const y = ((maxLat - lat) / (maxLat - minLat)) * 520;
        return `${x},${y}`;
      })
      .join(" ");
  };

  const headerStateLabel = selectedState && selectedState !== "ALL" ? selectedState : "ALL STATES";

  return (
    <Card className="mt-6 overflow-hidden border-slate-200 shadow-sm">
      <CardHeader className="bg-gradient-to-b from-white to-slate-50/60">
        <CardTitle className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-slate-900">Dealer Performance Map</span>
              <Badge variant="secondary" className="border border-slate-200 bg-white/70 text-slate-700">
                Australia + NZ
              </Badge>
            </div>
            <p className="text-xs text-slate-500">
              Click a state to filter. Current view:{" "}
              <span className="font-semibold text-slate-700">{headerStateLabel}</span>{" "}
              {modelRangeFilter && modelRangeFilter !== "ALL" ? (
                <>
                  · Model Range: <span className="font-semibold text-slate-700">{modelRangeFilter}</span>
                </>
              ) : null}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-slate-900 text-white hover:bg-slate-900">
              Total Orders: {formatInt(totalOrders)}
            </Badge>
            <Badge variant="secondary" className="border border-slate-200 bg-white/70 text-slate-700">
              Selected: {formatInt(selectedOrders)} ({selectedShare.toFixed(0)}%)
            </Badge>
            {selectedState && selectedState !== "ALL" ? (
              <button
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                onClick={() => onSelectState("ALL")}
              >
                Clear
              </button>
            ) : null}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="p-4">
        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          {/* MAP */}
          <div className="relative h-[520px] overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-sky-50 to-indigo-50 shadow-sm">
            {/* subtle grid */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.08]"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgb(15 23 42) 1px, transparent 1px), linear-gradient(to bottom, rgb(15 23 42) 1px, transparent 1px)",
                backgroundSize: "28px 28px",
              }}
            />

            <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
              <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 backdrop-blur">
                Heatmap by orders
              </span>
              {loadingMap ? (
                <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm ring-1 ring-slate-200 backdrop-blur">
                  Loading map…
                </span>
              ) : null}
            </div>

            <svg viewBox="0 0 920 520" className="relative z-0 h-full w-full">
              <defs>
                <linearGradient id="pieFill" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#1d4ed8" />
                  <stop offset="100%" stopColor="#60a5fa" />
                </linearGradient>

                <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#0f172a" floodOpacity="0.18" />
                </filter>
              </defs>

              {features.map((feature, idx) => {
                const fullName = feature?.properties?.name || feature?.properties?.STATE_NAME || "";
                const short = stateMap[fullName];
                if (!short) return null;

                const value = stateTotals[short] || 0;
                const isActive = selectedState === short;
                const isAnySelected = selectedState && selectedState !== "ALL";
                const isDimmed = isAnySelected && !isActive;

                const rings = extractRings(feature);
                const mainlandRing = [...rings].sort((a, b) => b.length - a.length)[0] || [];
                if (!mainlandRing.length) return null;

                const centerX = mainlandRing.reduce((sum, [lon]) => sum + lon, 0) / mainlandRing.length;
                const centerY = mainlandRing.reduce((sum, [, lat]) => sum + lat, 0) / mainlandRing.length;
                const { minLon, maxLon, minLat, maxLat } = mapBounds;

                const labelX = ((centerX - minLon) / (maxLon - minLon)) * 920;
                const labelY = ((maxLat - centerY) / (maxLat - minLat)) * 520;
                const offset = pieLabelOffset[short] || { x: 0, y: 0 };

                const pieX = labelX + offset.x;
                const pieY = labelY + offset.y;

                const share = totalOrders > 0 ? (value / totalOrders) * 100 : 0;
                const piePath = describePie(pieX, pieY, 22, share);

                return (
                  <g key={`${fullName}-${idx}`}>
                    {rings.map((ring, ringIdx) => (
                      <polygon
                        key={`${fullName}-${idx}-${ringIdx}`}
                        points={polygonPoints(ring)}
                        fill={isActive ? "#2563eb" : colorScale(value, maxOrders)}
                        stroke={isActive ? "#0f172a" : "#ffffff"}
                        strokeWidth={isActive ? 1.6 : 1.05}
                        opacity={isDimmed ? 0.35 : 1}
                        className="cursor-pointer transition-all duration-200 hover:brightness-95"
                        onClick={() => onSelectState(isActive ? "ALL" : short)}
                      >
                        <title>
                          {short} · Orders: {formatInt(value)} · Share: {share.toFixed(1)}%
                        </title>
                      </polygon>
                    ))}

                    {/* Pie marker */}
                    <g filter="url(#softShadow)" opacity={isDimmed ? 0.35 : 1}>
                      <circle cx={pieX} cy={pieY} r={24} fill="rgba(15,23,42,0.10)" />
                      <circle cx={pieX} cy={pieY} r={22} fill="rgba(255,255,255,0.92)" stroke="#cbd5e1" strokeWidth={1.2} />
                      {piePath ? <path d={piePath} fill={isActive ? "#1d4ed8" : "url(#pieFill)"} opacity={0.95} /> : null}
                      <circle cx={pieX} cy={pieY} r={10} fill="rgba(255,255,255,0.95)" stroke="#bfdbfe" strokeWidth={1} />
                      <text x={pieX} y={pieY + 2} textAnchor="middle" className="pointer-events-none fill-slate-900 text-[10px] font-semibold">
                        {share.toFixed(0)}%
                      </text>
                    </g>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* RIGHT PANEL */}
          <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            {/* KPI */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Overview</h3>
                <p className="mt-1 text-xs text-slate-500">Orders distribution by state</p>
              </div>

              <Badge variant="secondary" className="border border-slate-200 bg-slate-50 text-slate-700">
                {headerStateLabel}
              </Badge>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-500">Total Orders</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">{formatInt(totalOrders)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-500">Selected</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">{formatInt(selectedOrders)}</p>
                <p className="mt-0.5 text-xs text-slate-500">{selectedShare.toFixed(1)}% of total</p>
              </div>
            </div>

            {/* Legend */}
            <div className="mt-5 rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-700">Legend</p>
                <p className="text-xs text-slate-500">Min → Max</p>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <div className="h-2 flex-1 rounded-full border border-slate-200 bg-gradient-to-r from-slate-100 via-sky-200 to-indigo-500" />
              </div>

              <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                <span>0</span>
                <span>{formatInt(maxOrders)}</span>
              </div>
            </div>

            {/* Ranking list */}
            <div className="mt-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">States</p>
                <p className="text-xs text-slate-500">Click to filter</p>
              </div>

              <div className="mt-3 max-h-[280px] space-y-2 overflow-auto pr-1">
                {stateRows.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    No state totals available.
                  </div>
                ) : (
                  stateRows.map((row) => {
                    const active = selectedState === row.code;
                    const barPct = maxOrders > 0 ? (row.orders / maxOrders) * 100 : 0;

                    return (
                      <button
                        key={row.code}
                        onClick={() => onSelectState(active ? "ALL" : row.code)}
                        className={[
                          "w-full rounded-xl border px-3 py-2 text-left transition",
                          active
                            ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                            : "border-slate-200 bg-white hover:bg-slate-50",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className={["text-sm font-semibold", active ? "text-white" : "text-slate-900"].join(" ")}>
                              {row.code}
                            </span>
                            <span className={["text-xs", active ? "text-white/80" : "text-slate-500"].join(" ")}>
                              {row.share.toFixed(1)}%
                            </span>
                          </div>

                          <span className={["text-sm font-semibold tabular-nums", active ? "text-white" : "text-slate-900"].join(" ")}>
                            {formatInt(row.orders)}
                          </span>
                        </div>

                        <div className={["mt-2 h-2 w-full rounded-full", active ? "bg-white/20" : "bg-slate-100"].join(" ")}>
                          <div
                            className={["h-2 rounded-full", active ? "bg-white/70" : "bg-slate-900"].join(" ")}
                            style={{ width: `${Math.max(2, barPct)}%` }}
                          />
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Context */}
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-700">Context</p>
              <p className="mt-1 text-xs text-slate-600">
                Model Range Filter:{" "}
                <span className="font-semibold text-slate-800">{modelRangeFilter === "ALL" ? "—" : modelRangeFilter}</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Tip: hover on a state for tooltip. Click again to clear.
              </p>
            </div>
          </aside>
        </div>
      </CardContent>
    </Card>
  );
}
