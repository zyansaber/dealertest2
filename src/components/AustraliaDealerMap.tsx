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
    fetch("/maps/australia-states.json")
      .then((res) => res.json())
      .then((json) => setFeatures(Array.isArray(json?.features) ? json.features : []))
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

  const polygonPoints = (coordinates: number[][]) => {
    const minLon = 111;
    const maxLon = 155;
    const minLat = -44;
    const maxLat = -10;
    return coordinates
      .map(([lon, lat]) => {
        const x = ((lon - minLon) / (maxLon - minLon)) * 720;
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
          <Badge variant="secondary">Click state to filter · Model Range: {modelRangeFilter}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[520px] overflow-hidden rounded-xl border bg-gradient-to-br from-sky-50 to-indigo-100 p-2">
            <svg viewBox="0 0 720 520" className="h-full w-full">
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
                const labelX = ((centerX - 111) / (155 - 111)) * 720;
                const labelY = ((-10 - centerY) / (-10 + 44)) * 520;
                const pieX = short === "ACT" ? labelX + 24 : labelX;
                const pieY = short === "ACT" ? labelY + 10 : labelY;
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
                    <circle cx={pieX} cy={pieY} r={22} fill="rgba(255,255,255,0.9)" stroke="#cbd5e1" strokeWidth={1.2} />
                    {piePath ? <path d={piePath} fill={isActive ? "#1d4ed8" : "#2563eb"} opacity={0.9} /> : null}
                    <text x={pieX} y={pieY + 2} textAnchor="middle" className="pointer-events-none fill-slate-900 text-[10px] font-semibold">
                      {share.toFixed(0)}%
                    </text>
                  </g>
                );
              })}
            </svg>
        </div>
      </CardContent>
    </Card>
  );
}
