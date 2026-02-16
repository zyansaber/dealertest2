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
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const r = Math.round(lerp(224, 30, ratio));
  const g = Math.round(lerp(242, 58, ratio));
  const b = Math.round(lerp(254, 138, ratio));
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

export default function AustraliaDealerMap({ dealers, selectedState, onSelectState, modelRangeFilter = "ALL" }: Props) {
  const [features, setFeatures] = useState<GeoFeature[]>([]);

  useEffect(() => {
    Promise.all([fetch("/maps/australia-states.json").then((res) => res.json()), fetch("/maps/NZ.json").then((res) => res.json())])
      .then(([auJson, nzJson]) => {
        const auFeatures = Array.isArray(auJson?.features) ? auJson.features : [];
        const nzFeatures = Array.isArray(nzJson?.features) ? nzJson.features : [];
        setFeatures([...auFeatures, ...nzFeatures]);
      })
      .catch(() => setFeatures([]));
  }, []);

  const stateTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    dealers.forEach((dealer) => {
      totals[dealer.state] = (totals[dealer.state] || 0) + dealer.orders;
    });
    return totals;
  }, [dealers]);

  const maxOrders = useMemo(() => Math.max(0, ...Object.values(stateTotals)), [stateTotals]);
  const totalOrders = useMemo(() => Object.values(stateTotals).reduce((sum, value) => sum + value, 0), [stateTotals]);

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

  return (
    <Card className="mt-6 border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Australia Dealer Performance Map</span>
          <Badge variant="secondary">Click state to filter · Model Range: {modelRangeFilter === "ALL" ? "—" : modelRangeFilter}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
          <div className="h-[520px] overflow-hidden rounded-xl border bg-gradient-to-br from-sky-50 via-cyan-50 to-indigo-100 p-2">
            <svg viewBox="0 0 920 520" className="h-full w-full">
              <defs>
                <linearGradient id="pieFill" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#1d4ed8" />
                  <stop offset="100%" stopColor="#60a5fa" />
                </linearGradient>
              </defs>
              {features.map((feature, idx) => {
                const fullName = feature?.properties?.name || feature?.properties?.STATE_NAME || "";
                const short = stateMap[fullName];
                if (!short) return null;
                const value = stateTotals[short] || 0;
                const isActive = selectedState === short;
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
                        stroke="#ffffff"
                        strokeWidth={1.1}
                        className="cursor-pointer transition-all duration-200 hover:brightness-95"
                        onClick={() => onSelectState(isActive ? "ALL" : short)}
                      />
                    ))}
                    <circle cx={pieX} cy={pieY} r={24} fill="rgba(15,23,42,0.12)" />
                    <circle cx={pieX} cy={pieY} r={22} fill="rgba(255,255,255,0.92)" stroke="#cbd5e1" strokeWidth={1.2} />
                    {piePath ? <path d={piePath} fill={isActive ? "#1d4ed8" : "url(#pieFill)"} opacity={0.95} /> : null}
                    <circle cx={pieX} cy={pieY} r={10} fill="rgba(255,255,255,0.95)" stroke="#bfdbfe" strokeWidth={1} />
                    <text x={pieX} y={pieY + 2} textAnchor="middle" className="pointer-events-none fill-slate-900 text-[10px] font-semibold">
                      {share.toFixed(0)}%
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Filter</h3>
            <div className="mt-3 space-y-2">
              {["Model range filter", "Ordering filter", "Forecast production filter", "Target filter", "Stock level filter"].map((item) => (
                <div key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                  {item}
                </div>
              ))}
            </div>
          </section>
        </div>
      </CardContent>
    </Card>
  );
}
