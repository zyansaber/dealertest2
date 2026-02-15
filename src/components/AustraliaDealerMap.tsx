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

export default function AustraliaDealerMap({ dealers, selectedState, onSelectState }: Props) {
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

  const filteredDealers = useMemo(() => {
    if (!selectedState || selectedState === "ALL") return [];
    return dealers
      .filter((dealer) => dealer.state === selectedState)
      .sort((a, b) => b.orders - a.orders || a.name.localeCompare(b.name));
  }, [dealers, selectedState]);

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
          <Badge variant="secondary">Click state to filter</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-6">
          <div className="h-[520px] w-2/3 overflow-hidden rounded-xl border bg-gradient-to-br from-sky-50 to-indigo-100 p-2">
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
                    <text
                      x={short === "ACT" ? labelX + 24 : labelX}
                      y={short === "ACT" ? labelY + 10 : labelY}
                      textAnchor="middle"
                      className="pointer-events-none fill-slate-800 text-[13px] font-semibold"
                    >
                      {short}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="w-1/3 border-l pl-6">
            {(!selectedState || selectedState === "ALL") && (
              <p className="text-sm text-muted-foreground">Click a state to view dealer rankings and orders.</p>
            )}

            {selectedState && selectedState !== "ALL" && (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{selectedState}</h3>
                  <Badge>{filteredDealers.length} Dealers</Badge>
                </div>

                <div className="space-y-2">
                  {filteredDealers.map((dealer) => (
                    <div
                      key={dealer.slug}
                      className="rounded-lg border bg-slate-50 p-3 transition hover:bg-slate-100"
                    >
                      <div className="font-medium">{dealer.name}</div>
                      <div className="text-sm text-muted-foreground">{dealer.orders} Orders</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
