import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type DealerStateCode = "WA" | "NSW" | "QLD" | "VIC" | "TAS" | "NT" | "SA" | "ACT" | "NZ";
type MetricFilterKey = "orders" | "forecast" | "target";

type DealerRow = {
  slug: string;
  name: string;
  state: DealerStateCode;
  orders: number;
};

type StateMetricRow = {
  orders: number;
  forecast: number;
  target: number;
};

type TimelineFrame = {
  label: string;
  totalsByRange: Record<string, Partial<Record<DealerStateCode, number>>>;
};

type ModelRangeMetric = {
  modelRange: string;
  orders: number;
  forecast: number;
};

type Props = {
  dealers: DealerRow[];
  selectedState: string;
  selectedYear: number;
  onSelectState: (state: string) => void;
  stateMetrics?: Partial<Record<DealerStateCode, StateMetricRow>>;
  timelineFrames?: Partial<Record<"orders" | "forecast", TimelineFrame[]>>;
  modelRangeMetrics?: ModelRangeMetric[];
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
  WA: { x: 8, y: 14 },
  NT: { x: 0, y: 30 },
  QLD: { x: -24, y: 6 },
  SA: { x: 4, y: -8 },
  NSW: { x: -10, y: -8 },
  VIC: { x: 2, y: 12 },
  TAS: { x: 8, y: -2 },
  ACT: { x: 26, y: 14 },
  NZ: { x: 16, y: 6 },
};

const metricLabel: Record<MetricFilterKey, string> = {
  orders: "Order Received",
  forecast: "Forecast Delivery Volume",
  target: "Target",
};

const lerp = (from: number, to: number, ratio: number) => from + (to - from) * ratio;

const colorScale = (value: number, max: number) => {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const r = Math.round(lerp(195, 24, ratio));
  const g = Math.round(lerp(221, 63, ratio));
  const b = Math.round(lerp(244, 172, ratio));
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

const MAP_W = 1180;
const MAP_H = 680;
const RING_RADIUS = 28;

const formatInt = (n: number) => new Intl.NumberFormat("en-AU").format(n);

export default function AustraliaDealerMap({
  dealers,
  selectedState,
  selectedYear,
  onSelectState,
  stateMetrics,
  timelineFrames,
  modelRangeMetrics = [],
}: Props) {
  const [features, setFeatures] = useState<GeoFeature[]>([]);
  const [metricFilter, setMetricFilter] = useState<MetricFilterKey>("orders");
  const [animating, setAnimating] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [selectedModelRanges, setSelectedModelRanges] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;

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
      });

    return () => {
      mounted = false;
    };
  }, []);

  const dealerStateTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    dealers.forEach((dealer) => {
      totals[dealer.state] = (totals[dealer.state] || 0) + dealer.orders;
    });
    return totals;
  }, [dealers]);

  const modelRangeOptions = useMemo(() => {
    return [...modelRangeMetrics]
      .sort((a, b) => (b.orders + b.forecast) - (a.orders + a.forecast))
      .map((item) => item.modelRange);
  }, [modelRangeMetrics]);

  const activeModelRanges = useMemo(() => {
    if (selectedModelRanges.length === 0) return modelRangeOptions;
    return selectedModelRanges;
  }, [modelRangeOptions, selectedModelRanges]);

  const modelRangeSet = useMemo(() => new Set(activeModelRanges), [activeModelRanges]);

  const metricStateTotals = useMemo(() => {
    if (metricFilter === "orders") {
      if (!stateMetrics) return dealerStateTotals;
      return Object.entries(stateMetrics).reduce<Record<string, number>>((acc, [state, row]) => {
        acc[state] = row?.orders || 0;
        return acc;
      }, {});
    }

    if (metricFilter === "forecast") {
      return Object.entries(stateMetrics || {}).reduce<Record<string, number>>((acc, [state, row]) => {
        acc[state] = row?.forecast || 0;
        return acc;
      }, {});
    }

    return Object.entries(stateMetrics || {}).reduce<Record<string, number>>((acc, [state, row]) => {
      acc[state] = row?.target || 0;
      return acc;
    }, {});
  }, [dealerStateTotals, metricFilter, stateMetrics]);

  const activeFrames = useMemo(() => {
    if (metricFilter === "target") return [];
    return timelineFrames?.[metricFilter] || [];
  }, [metricFilter, timelineFrames]);

  const frameRangeForYear = useMemo(() => {
    const frameIndexes = activeFrames
      .map((frame, index) => ({ frame, index }))
      .filter(({ frame }) => frame.label.includes(String(selectedYear)))
      .map(({ index }) => index);

    if (frameIndexes.length === 0) {
      return {
        startIndex: 0,
        endIndex: Math.max(0, activeFrames.length - 1),
      };
    }

    return {
      startIndex: frameIndexes[0],
      endIndex: frameIndexes[frameIndexes.length - 1],
    };
  }, [activeFrames, selectedYear]);

  useEffect(() => {
    setFrameIndex(frameRangeForYear.endIndex);
    setAnimating(false);
    setHasPlayed(false);
  }, [frameRangeForYear.endIndex, metricFilter]);

  useEffect(() => {
    if (!animating || activeFrames.length <= 1) return;
    const timer = window.setInterval(() => {
      setFrameIndex((prev) => {
        if (prev >= activeFrames.length - 1) {
          window.clearInterval(timer);
          return prev;
        }
        return prev + 1;
      });
    }, 450);
    return () => window.clearInterval(timer);
  }, [activeFrames.length, animating]);

  const latestFrameTotals = useMemo(() => {
    if (activeFrames.length === 0) return metricStateTotals;
    const latest = activeFrames[frameRangeForYear.endIndex] || activeFrames[activeFrames.length - 1];
    return Object.entries(latest?.totalsByRange || {}).reduce<Record<string, number>>((acc, [range, totals]) => {
      if (!modelRangeSet.has(range)) return acc;
      Object.entries(totals || {}).forEach(([state, value]) => {
        acc[state] = (acc[state] || 0) + (value || 0);
      });
      return acc;
    }, {});
  }, [activeFrames, frameRangeForYear.endIndex, metricStateTotals, modelRangeSet]);

  const stateTotals = useMemo(() => {
    if (metricFilter === "target") return metricStateTotals;
    if (activeFrames.length === 0) return metricStateTotals;
    if (!animating && !hasPlayed) return latestFrameTotals;

    const frame = activeFrames[Math.min(frameIndex, activeFrames.length - 1)];
    return Object.entries(frame?.totalsByRange || {}).reduce<Record<string, number>>((acc, [range, totals]) => {
      if (!modelRangeSet.has(range)) return acc;
      Object.entries(totals || {}).forEach(([state, value]) => {
        acc[state] = (acc[state] || 0) + (value || 0);
      });
      return acc;
    }, {});
  }, [activeFrames, animating, frameIndex, hasPlayed, latestFrameTotals, metricFilter, metricStateTotals, modelRangeSet]);

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
        const x = ((lon - minLon) / (maxLon - minLon)) * MAP_W;
        const y = ((maxLat - lat) / (maxLat - minLat)) * MAP_H;
        return `${x},${y}`;
      })
      .join(" ");
  };

  const latestFrameLabel = activeFrames[frameRangeForYear.endIndex]?.label;
  const frameLabel = activeFrames[Math.min(frameIndex, Math.max(0, activeFrames.length - 1))]?.label;
  const shownFrameLabel = !animating && !hasPlayed ? latestFrameLabel : frameLabel;
  const modelRangeMetricTotal = useMemo(() => {
    if (metricFilter === "target") return 0;
    return modelRangeMetrics.reduce((sum, row) => sum + (metricFilter === "orders" ? row.orders : row.forecast), 0);
  }, [metricFilter, modelRangeMetrics]);

  return (
    <Card className="mt-6 overflow-hidden border-slate-300 shadow-sm">
      <CardHeader className="bg-white">
        <CardTitle className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-slate-900">Dealer Performance Map</span>
            <Badge variant="secondary" className="border border-slate-300 bg-slate-100 text-slate-700">
              {metricLabel[metricFilter]}
            </Badge>
            {shownFrameLabel ? (
              <Badge variant="secondary" className="border border-indigo-200 bg-indigo-50 text-indigo-700">
                {shownFrameLabel}
              </Badge>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Time Animation:</span>
            <button
              onClick={() => {
                if (activeFrames.length <= 1 || metricFilter === "target") return;
                setFrameIndex(frameRangeForYear.startIndex);
                setHasPlayed(true);
                setAnimating(true);
              }}
              disabled={activeFrames.length <= 1 || metricFilter === "target"}
              className="rounded-lg border border-slate-300 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              Play
            </button>
            <button
              onClick={() => setAnimating(false)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              Pause
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-slate-900 text-white hover:bg-slate-900">Total: {formatInt(totalOrders)}</Badge>
            <Badge variant="secondary" className="border border-slate-300 bg-white text-slate-700">
              Selected: {formatInt(selectedOrders)} ({selectedShare.toFixed(0)}%)
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="p-4">
        <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_250px]">
          <div className="relative h-[680px] overflow-hidden rounded-2xl border border-slate-300 bg-gradient-to-br from-slate-100 via-sky-100 to-indigo-100 shadow-sm pl-6">
            <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="relative z-0 h-full w-full">
              <defs>
                <linearGradient id="ringStroke" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#0f766e" />
                  <stop offset="45%" stopColor="#1d4ed8" />
                  <stop offset="100%" stopColor="#6d28d9" />
                </linearGradient>

                <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.28" />
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

                const labelX = ((centerX - minLon) / (maxLon - minLon)) * MAP_W;
                const labelY = ((maxLat - centerY) / (maxLat - minLat)) * MAP_H;
                const offset = pieLabelOffset[short] || { x: 0, y: 0 };

                const pieX = labelX + offset.x;
                const pieY = labelY + offset.y;

                const share = totalOrders > 0 ? (value / totalOrders) * 100 : 0;
                const clampedShare = Math.max(0, Math.min(100, share));
                const ringR = RING_RADIUS;
                const circumference = 2 * Math.PI * ringR;
                const filled = (clampedShare / 100) * circumference;

                return (
                  <g key={`${fullName}-${idx}`}>
                    {rings.map((ring, ringIdx) => (
                      <polygon
                        key={`${fullName}-${idx}-${ringIdx}`}
                        points={polygonPoints(ring)}
                        fill={isActive ? "#1d4ed8" : colorScale(value, maxOrders)}
                        stroke={isActive ? "#0f172a" : "#ffffff"}
                        strokeWidth={isActive ? 1.8 : 1.15}
                        opacity={isDimmed ? 0.32 : 1}
                        className="cursor-pointer transition-all duration-200 hover:brightness-95"
                        onClick={() => onSelectState(isActive ? "ALL" : short)}
                      >
                        <title>
                          {short} · {metricLabel[metricFilter]}: {formatInt(value)} · Share: {share.toFixed(1)}%
                        </title>
                      </polygon>
                    ))}

                    <g filter="url(#softShadow)" opacity={isDimmed ? 0.35 : 1}>
                      <circle cx={pieX} cy={pieY} r={36} fill="rgba(255,255,255,0.97)" stroke="#94a3b8" strokeWidth={1.4} />
                      <circle cx={pieX} cy={pieY} r={ringR} fill="transparent" stroke="rgba(15,23,42,0.18)" strokeWidth={7} />

                      <circle
                        cx={pieX}
                        cy={pieY}
                        r={ringR}
                        fill="transparent"
                        stroke={isActive ? "#1d4ed8" : "url(#ringStroke)"}
                        strokeWidth={7}
                        strokeLinecap="round"
                        strokeDasharray={`${filled} ${Math.max(0, circumference - filled)}`}
                        transform={`rotate(-90 ${pieX} ${pieY})`}
                      />

                      <circle cx={pieX} cy={pieY} r={14} fill="rgba(255,255,255,0.98)" stroke="#bfdbfe" strokeWidth={1} />
                      <text x={pieX} y={pieY + 3} textAnchor="middle" className="pointer-events-none fill-slate-900 text-[13px] font-bold">
                        {clampedShare.toFixed(0)}%
                      </text>
                      <text x={pieX} y={pieY + 22} textAnchor="middle" className="pointer-events-none fill-slate-600 text-[12px] font-semibold">
                        {formatInt(value)}
                      </text>
                    </g>
                  </g>
                );
              })}
            </svg>
          </div>

          <aside className="flex h-[680px] flex-col rounded-2xl border border-slate-300 bg-white p-3 shadow-sm">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Filter by</p>
              <div className="mt-2 grid gap-2">
                {(
                  [
                    ["orders", "Order Received"],
                    ["forecast", "Forecast Delivery Volume"],
                    ["target", "Target"],
                  ] as const
                ).map(([key, label]) => {
                  const active = metricFilter === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setMetricFilter(key)}
                      className={[
                        "w-full rounded-lg border px-3 py-2 text-left text-sm font-semibold transition",
                        active
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100",
                      ].join(" ")}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-700">Model range</p>
                <button
                  onClick={() => setSelectedModelRanges([])}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  Select all
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {metricFilter === "target" ? "Model range share is available for Order Received and Forecast only." : `Based on ${metricLabel[metricFilter]}`}
              </p>

              <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-auto pr-1">
                <label className="flex cursor-pointer items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedModelRanges.length === 0}
                      onChange={(event) => {
                        if (event.target.checked) {
                          setSelectedModelRanges([]);
                        }
                      }}
                      className="h-3.5 w-3.5 rounded border-slate-300"
                    />
                    <span className="font-semibold text-slate-800">ALL</span>
                  </div>
                  <span className="font-semibold text-indigo-700">100%</span>
                </label>

                {modelRangeMetrics.map((row) => {
                  const metricValue = metricFilter === "orders" ? row.orders : metricFilter === "forecast" ? row.forecast : 0;
                  const pct = modelRangeMetricTotal > 0 ? (metricValue / modelRangeMetricTotal) * 100 : 0;
                  const checked = selectedModelRanges.length === 0 || selectedModelRanges.includes(row.modelRange);
                  return (
                    <label
                      key={row.modelRange}
                      className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const enabled = event.target.checked;
                            setSelectedModelRanges((prev) => {
                              if (enabled) {
                                if (prev.length === 0) {
                                  return [row.modelRange];
                                }
                                if (prev.includes(row.modelRange)) return prev;
                                return [...prev, row.modelRange];
                              }
                              const base = prev.length === 0 ? [...modelRangeOptions] : [...prev];
                              const next = base.filter((range) => range !== row.modelRange);
                              return next.length === 0 ? [] : next;
                            });
                          }}
                          className="h-3.5 w-3.5 rounded border-slate-300"
                        />
                        <span className="font-semibold text-slate-800">{row.modelRange}</span>
                      </div>
                      <span className="font-semibold text-slate-600">{pct.toFixed(1)}%</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      </CardContent>
    </Card>
  );
}
